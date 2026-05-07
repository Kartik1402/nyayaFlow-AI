from datetime import date
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app import models, schemas


def create_case(db: Session, title: str, raw_text: str, chunks: List[Dict[str, Any]]) -> models.Case:
    case = models.Case(
        title=title,
        raw_text=raw_text,
        chunks=chunks,
        extraction=None,
        reasoning=None,
        action_plan=None,
        explanation=None,
        status="processed",
        version=1,
        run_history=[],
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


def update_case_chunks(db: Session, case: models.Case, chunks: List[Dict[str, Any]]) -> models.Case:
    case.chunks = chunks
    db.commit()
    db.refresh(case)
    return case


def create_extraction_result(
    db: Session,
    case_id: int,
    case_number: Optional[str],
    court_name: Optional[str],
    judgment_date: Optional[date],
    matter_type: Optional[str],
    parties: List[Dict[str, Any]],
    directives: List[Dict[str, Any]],
    deadlines: List[str],
    cited_statutes: List[Dict[str, Any]],
    summary: Optional[str],
    confidence: Dict[str, Any],
    evidence: Dict[str, Any],
) -> models.ExtractionResult:
    extraction_result = models.ExtractionResult(
        case_id=case_id,
        case_number=case_number,
        court_name=court_name,
        judgment_date=judgment_date,
        matter_type=matter_type,
        parties=parties,
        directives=directives,
        deadlines=deadlines,
        cited_statutes=cited_statutes,
        summary=summary,
        confidence=confidence,
        evidence=evidence,
        version=1,
    )
    db.add(extraction_result)
    db.commit()
    db.refresh(extraction_result)
    return extraction_result


def get_extraction_result(db: Session, case_id: int) -> Optional[models.ExtractionResult]:
    return db.query(models.ExtractionResult).filter(models.ExtractionResult.case_id == case_id).order_by(models.ExtractionResult.created_at.desc()).first()


def save_extraction_chunk_debug(db: Session, case_id: int, chunk_index: int, raw_output: Dict[str, Any]) -> models.ExtractionChunk:
    debug_chunk = models.ExtractionChunk(
        case_id=case_id,
        chunk_index=chunk_index,
        raw_output=raw_output,
    )
    db.add(debug_chunk)
    db.commit()
    db.refresh(debug_chunk)
    return debug_chunk


def get_case(db: Session, case_id: int) -> Optional[models.Case]:
    return db.query(models.Case).filter(models.Case.id == case_id).first()


def list_cases(db: Session, status: Optional[str] = None) -> List[models.Case]:
    query = db.query(models.Case)
    if status:
        query = query.filter(models.Case.status == status)
    return query.order_by(models.Case.created_at.desc()).all()


def delete_case(db: Session, case: models.Case) -> models.Case:
    db.query(models.ExtractionResult).filter(models.ExtractionResult.case_id == case.id).delete(synchronize_session='fetch')
    db.query(models.ExtractionChunk).filter(models.ExtractionChunk.case_id == case.id).delete(synchronize_session='fetch')
    db.delete(case)
    db.commit()
    return case


def update_case_state(db: Session, case: models.Case, state: Dict[str, Any], status: str) -> models.Case:
    case.raw_text = state.get("raw_text")
    case.chunks = state.get("chunks")
    case.extraction = state.get("extraction")
    case.reasoning = state.get("reasoning")
    case.action_plan = state.get("action_plan")
    case.explanation = state.get("explanation")
    case.run_history = state.get("run_history")
    case.version = case.version + 1
    case.status = status
    db.commit()
    db.refresh(case)
    return case


def mark_case_review(db: Session, case: models.Case, review_payload: Dict[str, Any]) -> models.Case:
    review = case.review or {}
    review.update(review_payload)
    case.review = review
    db.commit()
    db.refresh(case)
    return case
