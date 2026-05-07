import io
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import Depends, FastAPI, Body, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.agents import run_action_plan_agent, run_decision_agent, run_extraction_agent, run_reasoning_agent
from app.config import settings
from app.database import Base, engine, get_db
from app.document_processing import process_document
from app.extraction_service import run_extraction

from app.utils import normalize_title

logging.basicConfig(level=logging.INFO)
app = FastAPI(title="Court Judgment Verified Action Plans")


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _is_pdf_upload(file: UploadFile) -> bool:
    content_type = (file.content_type or "").lower()
    if content_type == "application/pdf":
        return True
    if file.filename.lower().endswith(".pdf"):
        return content_type in {"application/octet-stream", "application/x-pdf", "", None}
    return False


def _is_text_upload(file: UploadFile) -> bool:
    content_type = (file.content_type or "").lower()
    if content_type == "text/plain":
        return True
    if file.filename.lower().endswith(".txt"):
        return True
    return False


def _save_uploaded_file(file: UploadFile) -> str:
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / Path(file.filename).name
    with file_path.open("wb") as dst:
        dst.write(file.file.read())
    return str(file_path)


@app.post("/cases/upload", response_model=schemas.UploadResponse)
def upload_case(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not (_is_pdf_upload(file) or _is_text_upload(file)):
        raise HTTPException(status_code=400, detail="Upload PDF or plain text only.")

    _save_uploaded_file(file)
    file.file.seek(0)
    raw_bytes = file.file.read()
    document = process_document(
        raw_bytes=raw_bytes,
        filename=normalize_title(file.filename),
        content_type=file.content_type or "",
        use_cleaning=False,
    )

    case = crud.create_case(
        db,
        title=document["title"],
        raw_text=document["raw_text"],
        chunks=document["chunks"],
    )

    chunks_with_ids = []
    for chunk in document["chunks"]:
        chunk_id = f"case_{case.id}_chunk_{chunk['chunk_index']}"
        chunk_with_id = {**chunk, "chunk_id": chunk_id}
        chunks_with_ids.append(chunk_with_id)

    case = crud.update_case_chunks(db, case, chunks_with_ids)

    return schemas.UploadResponse(
        case_id=case.id,
        raw_text=document["raw_text"],
        chunks=chunks_with_ids,
        status="processed",
    )


@app.post("/upload-case", response_model=schemas.UploadResponse)
def upload_case_alias(file: UploadFile = File(...), db: Session = Depends(get_db)):
    return upload_case(file, db)


@app.post("/review/approve", response_model=schemas.CaseResponse)
def review_approve(request: schemas.ReviewActionRequest, db: Session = Depends(get_db)):
    case = crud.get_case(db, request.case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    review_request = schemas.CaseReviewRequest(action="approve", reviewer_comment=request.reviewer_comment)
    response = review_case(case.id, review_request, db)
    return response


@app.post("/review/reject", response_model=schemas.CaseResponse)
def review_reject(request: schemas.ReviewActionRequest, db: Session = Depends(get_db)):
    case = crud.get_case(db, request.case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if not request.rejection_type:
        raise HTTPException(status_code=400, detail="rejection_type is required for reject action")
    review_request = schemas.CaseReviewRequest(
        action="reject",
        reviewer_comment=request.reviewer_comment,
        rejection_type=request.rejection_type,
        edited_payload=request.edited_payload,
    )
    response = review_case(case.id, review_request, db)
    return response


@app.post("/reprocess", response_model=schemas.FinalReviewResponse)
def reprocess_alias(request: schemas.ReprocessRequest, db: Session = Depends(get_db)):
    return reprocess_case(request.case_id, request, db)


@app.post("/cases/{case_id}/extract")
def extract_case(case_id: int, db: Session = Depends(get_db)):
    try:
        merged = run_extraction(case_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    case = crud.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    case.extraction = _to_json_safe(merged)
    case.status = "processed"
    db.commit()
    db.refresh(case)
    return {"status": "extraction_completed"}


def _prepare_agent_chunks(raw_chunks: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_chunks, list):
        return []
    chunks: list[dict[str, Any]] = []
    for index, chunk in enumerate(raw_chunks):
        if not isinstance(chunk, dict):
            continue
        text = chunk.get("text")
        if not isinstance(text, str) or not text.strip():
            continue
        chunks.append({
            "index": chunk.get("chunk_index", index),
            "text": text.strip(),
        })
    return chunks


def _to_json_safe(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(k): _to_json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_json_safe(v) for v in value]
    if hasattr(value, "model_dump"):
        return _to_json_safe(value.model_dump())
    if hasattr(value, "dict"):
        try:
            return _to_json_safe(value.dict())
        except Exception:
            pass
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _get_stage_version(case: models.Case, stage: str) -> str:
    review = case.review or {}
    version_keys = [key for key in review.keys() if key.startswith(f"{stage}_v")]
    return f"v{len(version_keys) or 1}"


def _store_stage_version(case: models.Case, stage: str, payload: Any, feedback: str, db: Session) -> str:
    review = case.review or {}
    version_keys = [key for key in review.keys() if key.startswith(f"{stage}_v")]
    version_number = len(version_keys) + 1
    review[f"{stage}_v{version_number}"] = {
        "output": _to_json_safe(payload),
        "feedback": feedback,
        "created_at": datetime.utcnow().isoformat(),
    }
    case.review = review
    db.commit()
    db.refresh(case)
    return f"v{version_number}"


def _validate_extraction_output(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False
    required = {
        "case_number",
        "court_name",
        "judgment_date",
        "parties",
        "directives",
        "deadlines",
        "cited_statutes",
        "summary",
    }
    if not required.issubset(payload.keys()):
        return False
    if not isinstance(payload.get("parties"), list):
        return False
    if not isinstance(payload.get("directives"), list):
        return False
    if not isinstance(payload.get("deadlines"), list):
        return False
    if "confidence_scores" in payload:
        confidence = payload.get("confidence_scores")
    elif "confidence" in payload:
        confidence = payload.get("confidence")
    else:
        confidence = payload.get("confidence_hint")
    if not isinstance(confidence, dict):
        return False
    return True


def _validate_decision_output(payload: Any) -> bool:
    try:
        schemas.DecisionOutput.model_validate(payload)
        return True
    except Exception:
        return False


def _validate_action_plan_output(payload: Any) -> bool:
    try:
        schemas.ActionPlanOutput.model_validate(payload)
        return True
    except Exception:
        return False


def _store_review_version(case: models.Case, stage: str, payload: Any, feedback: str, db: Session) -> str:
    return _store_stage_version(case, stage, payload, feedback, db)


def _combine_final_output(case: models.Case) -> dict[str, Any]:
    return {
        "extraction": _to_json_safe(case.extraction or {}),
        "reasoning": _to_json_safe(case.reasoning or {}),
        "action_plan": _to_json_safe(case.action_plan or {}),
    }


def _get_final_output_version(case: models.Case) -> str:
    review = case.review or {}
    version_keys = [key for key in review.keys() if key.startswith("final_output_v")]
    return f"v{len(version_keys) or 1}"


def _store_final_output_version(case: models.Case, payload: Any, feedback: str, db: Session) -> str:
    review = case.review or {}
    version_keys = [key for key in review.keys() if key.startswith("final_output_v")]
    version_number = len(version_keys) + 1
    review[f"final_output_v{version_number}"] = {
        "output": _to_json_safe(payload),
        "feedback": feedback,
        "created_at": datetime.utcnow().isoformat(),
    }
    case.review = review
    db.commit()
    db.refresh(case)
    return f"v{version_number}"


def _has_generic_authority(reasoning: Any) -> bool:
    if not isinstance(reasoning, dict):
        return True
    authority = str(reasoning.get("responsible_authority") or "").strip().lower()
    generic_terms = ["authority", "department", "office", "unit", "agency", "bureau", "authority"]
    return any(term in authority for term in generic_terms)


def _validate_deadline_fields(payload: dict[str, Any]) -> bool:
    action_plan = payload.get("action_plan")
    if not isinstance(action_plan, dict):
        return False
    tasks = action_plan.get("tasks")
    if not isinstance(tasks, list):
        return False
    for task in tasks:
        if not isinstance(task, dict):
            return False
        deadline = task.get("deadline")
        if deadline is not None and not isinstance(deadline, str):
            return False
    reasoning = payload.get("reasoning")
    if isinstance(reasoning, dict):
        deadline = reasoning.get("deadline")
        if deadline is not None and not isinstance(deadline, str):
            return False
    return True


def _validate_final_output(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False
    if not _validate_extraction_output(payload.get("extraction")):
        return False
    if not _validate_decision_output(payload.get("reasoning")):
        return False
    if not _validate_action_plan_output(payload.get("action_plan")):
        return False
    if _has_generic_authority(payload.get("reasoning")):
        return False
    if not _validate_deadline_fields(payload):
        return False
    return True


def _run_reasoning_for_extraction(case: models.Case) -> None:
    if not case.extraction:
        raise ValueError("Extraction output is required to run reasoning.")
    reasoning = run_reasoning_agent(case.extraction)
    case.reasoning = _to_json_safe(reasoning)
    case.action_plan = None


def _run_action_plan_for_reasoning(case: models.Case) -> None:
    if not case.extraction:
        raise ValueError("Extraction output is required to run action planning.")
    if not case.reasoning:
        raise ValueError("Reasoning output is required to run action planning.")
    action_plan = run_action_plan_agent(case.extraction, case.reasoning)
    case.action_plan = _to_json_safe(action_plan)


def _reprocess_extractor(case: models.Case, feedback: str, db: Session) -> models.Case:
    new_extraction = run_extraction(case.id, db, repair_instruction=feedback)
    if not _validate_extraction_output(new_extraction):
        raise ValueError("Extractor output validation failed")
    case.extraction = _to_json_safe(new_extraction)
    case.reasoning = None
    case.action_plan = None
    _store_stage_version(case, "extractor", case.extraction, feedback or "reject")
    case.status = "pending_review"
    db.commit()
    db.refresh(case)
    return case


def _reprocess_reasoning(case: models.Case, feedback: str, db: Session) -> models.Case:
    extraction = case.extraction
    if not extraction:
        agent_chunks = _prepare_agent_chunks(case.chunks)
        extraction = run_extraction_agent(agent_chunks)
    new_reasoning = run_reasoning_agent(extraction, repair_instruction=feedback)
    if not _validate_decision_output(new_reasoning):
        raise ValueError("Reasoning output validation failed")
    case.reasoning = _to_json_safe(new_reasoning)
    case.action_plan = None
    _store_stage_version(case, "reasoning", case.reasoning, feedback or "reject")
    case.status = "pending_review"
    db.commit()
    db.refresh(case)
    return case


def _reprocess_action_plan(case: models.Case, feedback: str, db: Session) -> models.Case:
    extraction = case.extraction
    if not extraction:
        agent_chunks = _prepare_agent_chunks(case.chunks)
        extraction = run_extraction_agent(agent_chunks)
    reasoning = case.reasoning
    if not reasoning:
        reasoning = run_reasoning_agent(extraction)
    action_plan = run_action_plan_agent(
        extraction,
        reasoning,
        repair_instruction=feedback,
        existing_action_plan=case.action_plan,
    )
    if not _validate_action_plan_output(action_plan):
        raise ValueError("Action plan output validation failed")
    case.action_plan = _to_json_safe(action_plan)
    _store_stage_version(case, "action_plan", case.action_plan, feedback or "reject")
    case.status = "pending_review"
    db.commit()
    db.refresh(case)
    return case


def _apply_manual_edit(case: models.Case, stage: str, edited_payload: Any, db: Session) -> str:
    if not isinstance(edited_payload, dict):
        raise ValueError("edited_payload must be an object")

    edited = edited_payload.get(stage, edited_payload)
    if stage == "extractor":
        if not _validate_extraction_output(edited):
            raise ValueError("Edited extractor payload failed validation")
        case.extraction = _to_json_safe(edited)
        case.reasoning = None
        case.action_plan = None
        version = _store_stage_version(case, stage, case.extraction, "manual edit")
        _run_reasoning_for_extraction(case)
    elif stage == "reasoning":
        if not _validate_decision_output(edited):
            raise ValueError("Edited reasoning payload failed validation")
        case.reasoning = _to_json_safe(edited)
        case.action_plan = None
        version = _store_stage_version(case, stage, case.reasoning, "manual edit")
        _run_action_plan_for_reasoning(case)
    else:
        if not _validate_action_plan_output(edited):
            raise ValueError("Edited action plan payload failed validation")
        case.action_plan = _to_json_safe(edited)
        version = _store_stage_version(case, stage, case.action_plan, "manual edit")

    case.status = "approved" if stage == "action_plan" else "processed"
    db.commit()
    db.refresh(case)
    return version


def _apply_final_edit(case: models.Case, edited_payload: Any, feedback: str, db: Session) -> tuple[str, dict[str, Any]]:
    if not isinstance(edited_payload, dict):
        raise ValueError("edited_payload must be a JSON object")

    final_output = _combine_final_output(case)
    for section in ["extraction", "reasoning", "action_plan"]:
        if section in edited_payload:
            final_output[section] = _to_json_safe(edited_payload[section])

    if "extraction" in edited_payload and not _validate_extraction_output(final_output["extraction"]):
        raise ValueError("Edited extractor payload failed validation")
    if "reasoning" in edited_payload and not _validate_decision_output(final_output["reasoning"]):
        raise ValueError("Edited reasoning payload failed validation")
    if "action_plan" in edited_payload and not _validate_action_plan_output(final_output["action_plan"]):
        raise ValueError("Edited action plan payload failed validation")
    if _has_generic_authority(final_output.get("reasoning")):
        raise ValueError("Generic authority found in reasoning output")
    if not _validate_deadline_fields(final_output):
        raise ValueError("Invalid deadline format in final output")

    case.extraction = final_output["extraction"]
    case.reasoning = final_output["reasoning"]
    case.action_plan = final_output["action_plan"]
    case.status = "approved"
    version = _store_final_output_version(case, final_output, feedback, db)
    db.commit()
    db.refresh(case)
    return version, final_output


def _run_reprocess_pipeline(case: models.Case, feedback: str, reprocess_stages: Optional[list[str]], db: Session) -> tuple[str, dict[str, Any]]:
    stages = reprocess_stages or ["extractor", "reasoning", "action_plan"]
    valid_stages = ["extractor", "reasoning", "action_plan"]
    if any(stage not in valid_stages for stage in stages):
        raise ValueError("Invalid reprocess_stages values")

    def _build_candidate_output() -> dict[str, Any]:
        extraction = _to_json_safe(case.extraction or {})
        reasoning = _to_json_safe(case.reasoning or {})
        action_plan = _to_json_safe(case.action_plan or {})

        if "extractor" in stages:
            extraction = run_extraction(case.id, db, repair_instruction=feedback)
            if not _validate_extraction_output(extraction):
                raise ValueError("Extractor output validation failed")
            extraction = _to_json_safe(extraction)

        if "reasoning" in stages or "extractor" in stages:
            reasoning = run_reasoning_agent(extraction, repair_instruction=feedback)
            if not _validate_decision_output(reasoning):
                raise ValueError("Reasoning output validation failed")
            if _has_generic_authority(reasoning):
                raise ValueError("Generic authority detected in reasoning output")
            reasoning = _to_json_safe(reasoning)

        if "action_plan" in stages or "reasoning" in stages or "extractor" in stages:
            action_plan = run_action_plan_agent(
                extraction,
                reasoning,
                repair_instruction=feedback,
                existing_action_plan=case.action_plan,
            )
            if not _validate_action_plan_output(action_plan):
                raise ValueError("Action plan output validation failed")
            action_plan = _to_json_safe(action_plan)

        return {
            "extraction": extraction,
            "reasoning": reasoning,
            "action_plan": action_plan,
        }

    last_error = None
    for attempt in range(2):
        try:
            final_output = _build_candidate_output()
            if not _validate_final_output(final_output):
                raise ValueError("Final output validation failed")
            case.extraction = final_output["extraction"]
            case.reasoning = final_output["reasoning"]
            case.action_plan = final_output["action_plan"]
            case.status = "pending_review"
            version = _store_final_output_version(case, final_output, feedback, db)
            db.commit()
            db.refresh(case)
            return version, final_output
        except Exception as exc:
            last_error = exc
            if attempt == 1:
                raise
            logging.warning("Reprocess attempt %s failed, retrying: %s", attempt + 1, exc)

    raise last_error


def _handle_final_review(case: models.Case, request: schemas.FinalReviewRequest, db: Session) -> dict[str, Any]:
    if request.action == "edit":
        if request.edited_payload is None:
            raise HTTPException(status_code=400, detail="edited_payload is required for edit action")
        version, data = _apply_final_edit(case, request.edited_payload, request.feedback, db)
        return {
            "case_id": case.id,
            "status": "edited",
            "version": version,
            "data": data,
        }

    if request.action == "reject":
        try:
            version, data = _run_reprocess_pipeline(case, request.feedback, request.reprocess_stages, db)
            return {
                "case_id": case.id,
                "status": "reprocessed",
                "version": version,
                "data": data,
            }
        except Exception as exc:
            logging.exception("Final output reprocess failed")
            case.status = "needs_manual_review"
            db.commit()
            db.refresh(case)
            return {
                "case_id": case.id,
                "status": "error",
                "version": _get_final_output_version(case),
                "data": _combine_final_output(case),
                "error": str(exc),
            }

    raise HTTPException(status_code=400, detail="Unsupported action")


@app.post("/cases/{case_id}/reprocess", response_model=schemas.FinalReviewResponse)
def reprocess_case(case_id: int, request: schemas.FinalReviewRequest, db: Session = Depends(get_db)):
    case = crud.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    response = _handle_final_review(case, request, db)
    review_payload = {
        "action": request.action,
        "feedback": request.feedback,
        "reprocess_stages": request.reprocess_stages,
    }
    if request.edited_payload is not None:
        review_payload["edited_payload"] = request.edited_payload
    case = crud.mark_case_review(db, case, review_payload)
    return response


@app.post("/cases/{case_id}/decision", response_model=schemas.DecisionOutput)
def decision_case(case_id: int, db: Session = Depends(get_db)):
    case = crud.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    agent_chunks = _prepare_agent_chunks(case.chunks)
    if not agent_chunks:
        raise HTTPException(status_code=400, detail="No valid chunks available for extractor agent")

    extraction = run_extraction_agent(agent_chunks)
    decision = run_decision_agent(extraction)

    case.reasoning = _to_json_safe(decision)
    db.commit()
    db.refresh(case)
    return decision


@app.post("/cases/{case_id}/action-plan", response_model=schemas.ActionPlanOutput)
def action_plan_case(case_id: int, db: Session = Depends(get_db)):
    case = crud.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    agent_chunks = _prepare_agent_chunks(case.chunks)
    if not agent_chunks:
        raise HTTPException(status_code=400, detail="No valid chunks available for extractor agent")

    extraction = run_extraction_agent(agent_chunks)
    decision = run_decision_agent(extraction)
    action_plan = run_action_plan_agent(extraction, decision)

    case.reasoning = _to_json_safe(decision)
    case.action_plan = _to_json_safe(action_plan)
    case.extraction = _to_json_safe(extraction)
    case.status = "processed"
    db.commit()
    db.refresh(case)

    return action_plan


@app.post("/cases/{case_id}/process", response_model=schemas.CaseResponse)
def process_case(case_id: int, db: Session = Depends(get_db)):
    case = crud.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    agent_chunks = _prepare_agent_chunks(case.chunks)
    if not agent_chunks:
        raise HTTPException(status_code=400, detail="No valid chunks available for processing")

    extraction = run_extraction_agent(agent_chunks)
    decision = run_decision_agent(extraction)
    action_plan = run_action_plan_agent(extraction, decision)

    case.extraction = _to_json_safe(extraction)
    case.reasoning = _to_json_safe(decision)
    case.action_plan = _to_json_safe(action_plan)
    case.status = "processed"
    db.commit()
    db.refresh(case)

    return case


def _normalize_extraction_parties(raw_parties: Any) -> list[schemas.ExtractionParty]:
    allowed_roles = {"petitioner", "respondent", "applicant", "unknown"}
    cleaned: list[schemas.ExtractionParty] = []
    if not isinstance(raw_parties, list):
        return []

    for item in raw_parties:
        if isinstance(item, dict):
            name = item.get("name") if isinstance(item.get("name"), str) else None
            raw_role = item.get("role")
            if isinstance(raw_role, str):
                role = raw_role.strip().lower()
                if role not in allowed_roles:
                    role = "unknown"
            else:
                role = "unknown"
            if name and name.strip():
                cleaned.append(schemas.ExtractionParty(name=name.strip(), role=role))
        elif isinstance(item, str) and item.strip():
            cleaned.append(schemas.ExtractionParty(name=item.strip(), role="unknown"))
    return cleaned


def _normalize_extraction_confidence(raw_confidence: Any, extraction_values: dict[str, Any]) -> dict[str, str]:
    allowed = {"high", "medium", "low", "none"}
    normalized: dict[str, str] = {
        "case_number": "none",
        "court_name": "none",
        "judgment_date": "none",
        "parties": "none",
        "directives": "none",
        "deadlines": "none",
        "statutes": "none",
    }

    def _to_qualitative(raw: Any) -> Optional[str]:
        if isinstance(raw, str):
            cleaned = raw.strip().lower()
            if cleaned in allowed:
                return cleaned
            try:
                raw = float(cleaned)
            except ValueError:
                return None
        if isinstance(raw, (int, float)):
            if raw >= 0.75:
                return "high"
            if raw >= 0.4:
                return "medium"
            if raw > 0:
                return "low"
            return "none"
        return None

    def _has_value(value: Any) -> bool:
        if value is None:
            return False
        if isinstance(value, str):
            return bool(value.strip())
        if isinstance(value, list):
            return len(value) > 0
        return True

    def _parse_date(value: str) -> Optional[datetime]:
        if not isinstance(value, str):
            return None
        value = value.strip()
        for pattern in ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d %B %Y", "%B %d, %Y"]:
            try:
                return datetime.strptime(value, pattern)
            except ValueError:
                continue
        return None

    def _infer_confidence(key: str, value: Any) -> str:
        if not _has_value(value):
            return "none"

        if key == "case_number":
            if isinstance(value, str) and re.search(r"\d", value):
                return "high"
            return "medium"

        if key == "court_name":
            if isinstance(value, str) and re.search(r"\bCourt\b", value, re.IGNORECASE):
                return "high"
            return "medium"

        if key == "judgment_date":
            if isinstance(value, str) and _parse_date(value):
                return "high"
            return "medium"

        if key == "parties":
            if isinstance(value, list):
                for item in value:
                    if isinstance(item, dict) and item.get("role") in {"petitioner", "respondent", "applicant"}:
                        return "high"
                if any(isinstance(item, dict) and isinstance(item.get("name"), str) and len(item.get("name").strip()) > 3 for item in value):
                    return "medium"
            return "low"

        if key == "directives":
            if isinstance(value, list):
                for item in value:
                    text = item.get("text") if isinstance(item, dict) else None
                    if isinstance(text, str) and len(text.strip()) > 50:
                        return "high"
                return "medium"
            return "low"

        if key == "deadlines":
            if isinstance(value, list):
                if any(_parse_date(str(item)) for item in value if isinstance(item, str)):
                    return "high"
                return "medium"
            return "low"

        if key == "statutes":
            if isinstance(value, list):
                joined = " ".join(str(item) for item in value if item is not None)
                if re.search(r"\b(Section|Article|Clause|Act|Schedule|U/S|u/s)\b", joined, re.IGNORECASE):
                    return "high"
                if re.search(r"\d{1,3}(?:\.\d+)?", joined):
                    return "medium"
            return "low"

        return "medium"

    if isinstance(raw_confidence, dict):
        for key in normalized.keys():
            if not _has_value(extraction_values.get(key)):
                normalized[key] = "none"
                continue

            inferred = _infer_confidence(key, extraction_values.get(key))
            qualitative = _to_qualitative(raw_confidence.get(key))
            if qualitative and qualitative != "none":
                normalized[key] = qualitative if qualitative == inferred or qualitative == "low" else min(qualitative, inferred, key=lambda v: {"none": 0, "low": 1, "medium": 2, "high": 3}[v])
            else:
                normalized[key] = inferred
    else:
        for key in normalized.keys():
            normalized[key] = _infer_confidence(key, extraction_values.get(key))

    return normalized


@app.get("/cases/{case_id}/extraction", response_model=schemas.ExtractionResultResponse)
def get_extraction(case_id: int, db: Session = Depends(get_db)):
    case = crud.get_case(db, case_id)
    if not case or not case.extraction:
        raise HTTPException(status_code=404, detail="Extraction result not found")

    extraction = case.extraction if isinstance(case.extraction, dict) else {}
    parties = _normalize_extraction_parties(extraction.get("parties"))
    directives = extraction.get("directives") or []
    deadlines = extraction.get("deadlines") or []
    cited_statutes = extraction.get("cited_statutes") or []

    return schemas.ExtractionResultResponse(
        case_type=extraction.get("case_type"),
        case_number=extraction.get("case_number"),
        filing_year=extraction.get("filing_year"),
        formatted_case_number=extraction.get("formatted_case_number"),
        court_name=extraction.get("court_name"),
        judgment_date=extraction.get("judgment_date"),
        parties=parties,
        directives=directives,
        deadlines=deadlines,
        cited_statutes=cited_statutes,
        summary=extraction.get("summary"),
        confidence=_normalize_extraction_confidence(
            extraction.get("confidence") or extraction.get("confidence_hint") or {},
            {
                "case_number": extraction.get("case_number"),
                "court_name": extraction.get("court_name"),
                "judgment_date": extraction.get("judgment_date"),
                "parties": parties,
                "directives": directives,
                "deadlines": deadlines,
                "statutes": cited_statutes,
            },
        ),
    )


@app.get("/cases", response_model=list[schemas.CaseResponse])
def list_cases(status: str | None = None, db: Session = Depends(get_db)):
    return crud.list_cases(db, status=status)


@app.delete("/cases/{case_id}", response_model=schemas.CaseResponse)
def delete_case(case_id: int, db: Session = Depends(get_db)):
    case = crud.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if case.status == schemas.CaseStatus.approved:
        raise HTTPException(status_code=400, detail="Approved cases cannot be deleted")
    return crud.delete_case(db, case)


@app.get("/cases/{case_id}", response_model=schemas.CaseResponse)
def get_case(case_id: int, db: Session = Depends(get_db)):
    case = crud.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@app.post("/cases/{case_id}/review", response_model=schemas.CaseResponse)
def review_case(case_id: int, review_request: schemas.CaseReviewRequest, db: Session = Depends(get_db)):
    case = crud.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    review_payload = review_request.dict(exclude_none=True)
    if review_request.action == "reject" and not review_request.rejection_type:
        raise HTTPException(status_code=400, detail="rejection_type is required for reject action")

    payload_state = {
        "raw_text": case.raw_text,
        "chunks": case.chunks,
        "extraction": case.extraction,
        "reasoning": case.reasoning,
        "action_plan": case.action_plan,
        "explanation": case.explanation,
        "run_history": case.run_history,
    }

    if review_request.action == "reject":
        new_state = reprocess_state(payload_state, review_request.rejection_type, review_request.reviewer_comment)
        case = crud.update_case_state(db, case, new_state, status="pending_review")
        case = crud.mark_case_review(db, case, review_payload)
        return case

    if review_request.action == "edit":
        if review_request.edited_payload:
            edited = review_request.edited_payload
            payload_state.update({k: edited.get(k, payload_state.get(k)) for k in ["extraction", "reasoning", "action_plan", "explanation"] if edited.get(k) is not None})
            case = crud.update_case_state(db, case, payload_state, status="approved")
            review_payload["approved_with_edits"] = True
            case = crud.mark_case_review(db, case, review_payload)
            return case
        raise HTTPException(status_code=400, detail="edited_payload is required for edit action")

    if review_request.action == "approve":
        case.status = "approved"
        case = crud.mark_case_review(db, case, review_payload)
        db.commit()
        db.refresh(case)
        return case

    case = crud.mark_case_review(db, case, review_payload)
    return case


@app.get("/dashboard", response_model=list[schemas.CaseResponse])
def dashboard(db: Session = Depends(get_db)):
    return crud.list_cases(db, status="approved")
