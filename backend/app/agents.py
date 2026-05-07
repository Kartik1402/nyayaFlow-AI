import json
import re
from typing import Any, Dict, List, Optional

from pydantic import ValidationError

from app.llm_client import call_llm, call_mistral
from app.schemas import ActionPlanOutput


EXTRACTION_PROMPT = """
You are given chunks of court judgment text. Extract only factual data from the provided text. Do not hallucinate. Return valid JSON with the following keys:
- case_number
- court_name
- judgment_date
- parties
- directives
- deadlines
- cited_statutes
- summary
- evidence
- confidence_scores

Directives should be returned as JSON objects with keys directive_text, deadline_text, and priority.
Cited statutes should be returned as JSON objects with keys type, value, and act.
Evidence should be a list of text snippets and references to the chunk index.
Confidence scores should be an object with fields for each extracted key.
If no data is present, return empty strings/lists and confidence 0.0.
"""

REASONING_PROMPT = """
You are a senior legal reasoning analyst. You will receive extracted judgment data from a court case.
Use the provided directives, parties, deadlines, and summary to understand the legal context and determine the correct administrative decision.
Do not hallucinate. Do not invent facts. Use only the information provided.

Output ONLY valid JSON with the exact fields:
- action_type: compliance | appeal_review | no_action
- compliance_required: true | false
- appeal_recommended: true | false
- priority: high | medium | low
- responsible_authority: <string>
- deadline: <string or null>
- action_items: [
    {"step": <int>, "task": <string>, "assigned_to": <string>, "deadline": <string or null>, "status": <string>}
  ]
- risk_level: high | medium | low
- legal_impact: <string>
- confidence_score: <float>
- requires_human_review: true
- reasoning: <string>

Rules:
- Differentiate between compliance orders, procedural orders, and appeal scenarios.
- Use directives as the primary source of the decision.
- If directives are mandatory and court-ordered, classify as compliance.
- If directives are ambiguous or procedural, classify as appeal_review.
- If no clear directive exists, classify as no_action.
- Do not rely on simple keyword matching alone.
- If repair_instruction is provided, apply it to adjust the output.

Return ONLY valid JSON.
"""

ACTION_PLAN_PROMPT = """
You are given structured extraction and reasoning output. Create an administrative action plan with realistic, step-by-step tasks. Output valid JSON with:
- department
- tasks
- workflow_type
- deadlines
"""

EXPLANATION_PROMPT = """
You are given extraction and reasoning results for a court judgment. Explain why the decision was made. Output valid JSON with:
- justification
- source_reference
- confidence_score
"""


def parse_json_response(raw: str) -> Dict[str, Any]:
    try:
        return json.loads(raw)
    except ValueError:
        try:
            start = raw.index("{")
            end = raw.rindex("}")
            return json.loads(raw[start:end + 1])
        except Exception:
            return {"raw_text": raw}


def run_extraction_agent(chunks: List[Dict[str, Any]], repair_instruction: Optional[str] = None) -> Dict[str, Any]:
    if not chunks:
        return {
            "case_number": "",
            "court_name": "",
            "judgment_date": "",
            "parties": [],
            "directives": [],
            "deadlines": [],
            "cited_statutes": [],
            "summary": "",
            "evidence": [],
            "confidence_scores": {},
        }

    prompt = EXTRACTION_PROMPT + "\n\n" + "\n\n".join([
        f"Chunk {chunk['index']}: {chunk['text']}" for chunk in chunks
    ])
    if repair_instruction:
        prompt += "\n\nRepair instruction:\n" + repair_instruction
    raw = call_llm(prompt)
    response = parse_json_response(raw)
    return response


def build_reasoning_prompt(extraction: Dict[str, Any], repair_instruction: Optional[str] = None) -> str:
    prompt = REASONING_PROMPT + "\n\nExtraction data:\n" + json.dumps(extraction, indent=2)
    if repair_instruction:
        prompt += "\n\nRepair instruction:\n" + repair_instruction
    return prompt


def run_reasoning_llm(extraction: Dict[str, Any], repair_instruction: Optional[str] = None) -> str:
    prompt = build_reasoning_prompt(extraction, repair_instruction)
    mistral_client = MistralClient()
    response_text = mistral_client.chat(
        model="mistral-small",
        messages=[{"role": "user", "content": prompt}],
    )
    return response_text


def _is_generic_authority(authority: str) -> bool:
    lowered = authority.strip().lower()
    generic_terms = ["authority", "department", "office", "unit", "agency", "authority", "bureau"]
    return any(term == lowered or term in lowered for term in generic_terms)


def _normalize_priority(value: Any) -> str:
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"high", "medium", "low"}:
            return normalized
    return "medium"


def _normalize_confidence_score(value: Any) -> float:
    try:
        score = float(value)
    except (TypeError, ValueError):
        return 0.5
    if score < 0:
        return 0.0
    if score > 1:
        return 1.0
    return score


def _normalize_boolean(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "yes", "1"}:
            return True
        if lowered in {"false", "no", "0"}:
            return False
    return default


def _normalize_reasoning_action_items(items: Any, default_action_type: str, default_deadline: str | None) -> List[Dict[str, Any]]:
    if isinstance(items, list) and items:
        normalized: List[Dict[str, Any]] = []
        for index, item in enumerate(items, start=1):
            if not isinstance(item, dict):
                continue
            task = str(item.get("task") or item.get("action") or "").strip()
            assigned_to = str(item.get("assigned_to") or item.get("assigned") or "").strip()
            deadline = item.get("deadline") if isinstance(item.get("deadline"), str) and item.get("deadline").strip() else default_deadline
            status = str(item.get("status") or "pending").strip()
            if not task or not assigned_to:
                continue
            normalized.append({
                "step": index,
                "task": task,
                "assigned_to": assigned_to,
                "deadline": deadline,
                "status": status,
            })
        if normalized:
            return normalized

    if default_action_type == "compliance":
        return [
            {"step": 1, "task": "Review the court directive and confirm compliance requirements.", "assigned_to": "Court Registrar", "deadline": default_deadline, "status": "pending"},
            {"step": 2, "task": "Prepare required compliance documentation.", "assigned_to": "Court Registrar", "deadline": default_deadline, "status": "pending"},
        ]
    if default_action_type == "appeal_review":
        return [
            {"step": 1, "task": "Review the judgment and identify grounds for appeal.", "assigned_to": "Court Registrar", "deadline": default_deadline, "status": "pending"},
            {"step": 2, "task": "Prepare an appeal assessment memorandum.", "assigned_to": "Court Registrar", "deadline": default_deadline, "status": "pending"},
        ]
    return [
        {"step": 1, "task": "Monitor the judgment and document any future legal obligations.", "assigned_to": "Court Registrar", "deadline": None, "status": "pending"},
    ]


def _validate_reasoning_output(raw: Any, extraction: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        raw = {}

    action_type = str(raw.get("action_type") or "").strip().lower()
    if action_type not in {"compliance", "appeal_review", "no_action"}:
        action_type = "no_action"

    compliance_required = _normalize_boolean(raw.get("compliance_required"), action_type == "compliance")
    appeal_recommended = _normalize_boolean(raw.get("appeal_recommended"), action_type == "appeal_review")
    priority = _normalize_priority(raw.get("priority"))
    if priority == "high" and action_type == "no_action":
        priority = "medium"

    responsible_authority = str(raw.get("responsible_authority") or "").strip()
    if not responsible_authority or _is_generic_authority(responsible_authority):
        responsible_authority = _infer_responsible_authority(extraction.get("parties", []), _normalize_text_list(extraction.get("directives", [])))
        if not responsible_authority:
            responsible_authority = "Court Registrar"

    deadline = str(raw.get("deadline") or "").strip() or None
    if deadline is not None and not _extract_deadline_from_texts([deadline]):
        deadline = None
    if deadline is None and action_type == "compliance":
        deadline = _extract_deadline_from_texts(_normalize_text_list(extraction.get("deadlines", []) or extraction.get("directives", [])))

    action_items = _normalize_reasoning_action_items(raw.get("action_items"), action_type, deadline)
    risk_level = str(raw.get("risk_level") or "").strip().lower()
    if risk_level not in {"high", "medium", "low"}:
        risk_level = "high" if action_type == "compliance" and deadline else ("medium" if action_type != "no_action" else "low")

    legal_impact = str(raw.get("legal_impact") or "").strip()
    if not legal_impact:
        if action_type == "compliance":
            legal_impact = "Court directive requires compliance and may trigger enforcement if not followed."
        elif action_type == "appeal_review":
            legal_impact = "The judgment should be reviewed for potential appeal or further legal action."
        else:
            legal_impact = "No immediate legal action is required, but the judgment should be monitored."

    confidence_score = _normalize_confidence_score(raw.get("confidence_score"))
    requires_human_review = _normalize_boolean(raw.get("requires_human_review"), True)
    reasoning = str(raw.get("reasoning") or "").strip()
    if not reasoning:
        reasoning = "LLM reasoning result was not provided. Human review is required."

    return {
        "action_type": action_type,
        "compliance_required": compliance_required,
        "appeal_recommended": appeal_recommended,
        "priority": priority,
        "responsible_authority": responsible_authority,
        "deadline": deadline,
        "action_items": action_items,
        "risk_level": risk_level,
        "legal_impact": legal_impact,
        "confidence_score": confidence_score,
        "requires_human_review": requires_human_review,
        "reasoning": reasoning,
    }


def run_reasoning_agent(extraction: Dict[str, Any], repair_instruction: Optional[str] = None) -> Dict[str, Any]:
    raw_text = run_reasoning_llm(extraction, repair_instruction)
    parsed = parse_json_response(raw_text)
    return _validate_reasoning_output(parsed, extraction)


def run_decision_agent(extraction: Dict[str, Any], repair_instruction: Optional[str] = None) -> Dict[str, Any]:
    return run_reasoning_agent(extraction, repair_instruction)


def _normalize_text_list(value: Any) -> List[str]:
    if isinstance(value, list):
        normalized: List[str] = []
        for item in value:
            if isinstance(item, dict):
                text = (
                    item.get("directive_text")
                    or item.get("text")
                    or item.get("directive")
                    or item.get("deadline_text")
                    or item.get("name")
                    or item.get("party")
                )
                if isinstance(text, str) and text.strip():
                    normalized.append(text.strip())
            elif isinstance(item, str) and item.strip():
                normalized.append(item.strip())
        return normalized
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _extract_deadline_from_texts(texts: List[str]) -> str | None:
    duration_patterns = [
        r"\bwithin\s+\d+\s+days\b",
        r"\bwithin\s+\d+\s+weeks\b",
        r"\bwithin\s+\d+\s+months\b",
        r"\bwithin\s+one\s+month\b",
        r"\bwithin\s+two\s+months\b",
        r"\b\d+\s+days\b",
        r"\b\d+\s+weeks\b",
        r"\b\d+\s+months\b",
        r"\bone\s+month\b",
        r"\btwo\s+months\b",
        r"\bwithin\s+30\s+days\b",
        r"\bwithin\s+15\s+days\b",
    ]

    def _normalize_duration(raw: str) -> str:
        normalized = raw.lower().strip()
        normalized = re.sub(r"\bfrom the date.*$", "", normalized)
        normalized = re.sub(r"\bby\s+the\s+end\s+of\b", "within", normalized)
        normalized = re.sub(r"\bno\s+later\s+than\b", "within", normalized)
        normalized = re.sub(r"\bon\s+or\s+before\b", "within", normalized)
        normalized = re.sub(r"\s+from.*$", "", normalized)
        normalized = re.sub(r"\s*\.\s*$", "", normalized)
        normalized = re.sub(r"\s+date.*$", "", normalized)
        normalized = normalized.strip()
        if re.fullmatch(r"one\s+month", normalized):
            return "within one month"
        if re.fullmatch(r"two\s+months", normalized):
            return "within two months"
        return normalized

    for text in texts:
        normalized_text = text.lower()
        for pattern in duration_patterns:
            match = re.search(pattern, normalized_text, re.IGNORECASE)
            if match:
                return _normalize_duration(match.group(0))
    return None


def _infer_responsible_authority(parties: Any, directive_texts: List[str]) -> str:
    def _get_name(item: Any) -> str:
        if isinstance(item, dict):
            return str(item.get("name") or item.get("party") or item.get("person") or "").strip()
        if isinstance(item, str):
            return item.strip()
        return ""

    def _map_special_authority(text: str) -> str | None:
        lowered = text.lower()
        if "rfc, gkp" in lowered:
            return "Regional Food Controller, Gorakhpur"
        if "regional food controller" in lowered and "gorakhpur" in lowered:
            return "Regional Food Controller, Gorakhpur"
        if "regional food controller" in lowered:
            return "Regional Food Controller"
        if "food controller" in lowered:
            return "Regional Food Controller"
        return None

    def _extract_named_authority(text: str) -> str | None:
        patterns = [
            r"([A-Z][A-Za-z ]+(?:Department|Authority|Commissioner|Corporation|Registrar|Office|Cell)(?: of [A-Z][A-Za-z ]+)?)",
            r"(Regional Food Controller,? [A-Za-z ]+)"
        ]
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                candidate = match.group(1).strip()
                if candidate.lower() not in {"department", "authority", "office", "cell"}:
                    return candidate
        return None

    def _extract_state_authority(text: str) -> str | None:
        match = re.search(r"(?:State of|Government of)\s+([A-Za-z ]+?)(?:\b|$)", text, re.IGNORECASE)
        if match:
            return f"Department of Law, Government of {match.group(1).strip()}"
        return None

    names = [_get_name(item) for item in parties if _get_name(item)]
    for name in names:
        special = _map_special_authority(name)
        if special:
            return special
        authority = _extract_named_authority(name)
        if authority:
            return authority
        state_authority = _extract_state_authority(name)
        if state_authority:
            return state_authority

    for text in directive_texts:
        special = _map_special_authority(text)
        if special:
            return special
        authority = _extract_named_authority(text)
        if authority:
            return authority
        state_authority = _extract_state_authority(text)
        if state_authority:
            return state_authority

    return "Court Registrar"


def build_action_plan_prompt(input_data: Dict[str, Any], repair_instruction: Optional[str] = None) -> str:
    extraction = input_data.get("extraction", {})
    reasoning = input_data.get("reasoning", {})
    existing_plan = input_data.get("existing_action_plan")
    directives = extraction.get("directives", [])
    deadlines = extraction.get("deadlines", [])
    responsible_authority = reasoning.get("responsible_authority", "")
    action_type = reasoning.get("action_type", "")
    priority = reasoning.get("priority", "")

    prompt = (
        "You are a government administrative action planning assistant. "
        "Use only the provided extraction and reasoning data. Do not hallucinate. "
        "Generate a realistic, actionable plan suitable for a government workflow.\n\n"
        "Output only valid JSON with the exact fields: department, workflow_type, tasks, overall_deadline, priority, requires_coordination.\n\n"
        "Rules:\n"
        "- Do not use generic values such as 'authority', 'department', or 'office'.\n"
        "- Use real-world government role names where possible.\n"
        "- All tasks must be actionable, specific, and aligned to the case directive.\n"
        "- Use the provided deadlines exactly.\n"
        "- If repair_instruction is provided, update and improve the existing plan.\n\n"
    )
    prompt += f"Responsible authority: {responsible_authority}\n"
    prompt += f"Action type: {action_type}\n"
    prompt += f"Priority: {priority}\n\n"
    prompt += "Extraction data:\n" + json.dumps(extraction, indent=2) + "\n\n"
    prompt += "Reasoning output:\n" + json.dumps(reasoning, indent=2) + "\n\n"
    prompt += "Directives:\n" + json.dumps(directives, indent=2) + "\n\n"
    prompt += "Deadlines:\n" + json.dumps(deadlines, indent=2) + "\n\n"
    if existing_plan is not None:
        prompt += "Existing action plan:\n" + json.dumps(existing_plan, indent=2) + "\n\n"
    if repair_instruction:
        prompt += "Repair instruction:\n" + repair_instruction + "\n\n"
    prompt += (
        "Return only valid JSON with the exact fields: department, workflow_type, tasks, overall_deadline, priority, requires_coordination. "
        "Each task object must include step, task, assigned_to, deadline, and status. "
        "If a deadline is not available for a task, set deadline to null. "
        "Do not include any explanation, notes, or markdown. "
        "Use deadlines in tasks and overall_deadline exactly as given."
    )
    return prompt


class MistralClient:
    def chat(self, model: str, messages: List[Dict[str, str]]) -> str:
        if not messages or not isinstance(messages[0], dict):
            raise ValueError("Messages must be a list of dictionaries with role and content.")
        return call_mistral(messages[0]["content"])


def _repair_action_plan_parsed(parsed: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(parsed, dict):
        return parsed

    overall_deadline = parsed.get("overall_deadline")
    tasks = parsed.get("tasks")
    if isinstance(tasks, list):
        repaired_tasks: List[Dict[str, Any]] = []
        for index, task in enumerate(tasks):
            if not isinstance(task, dict):
                continue
            if "step" not in task:
                task["step"] = index + 1
            if "status" not in task:
                task["status"] = "pending"
            if "deadline" not in task:
                task["deadline"] = overall_deadline
            repaired_tasks.append(task)
        parsed["tasks"] = repaired_tasks

    if "overall_deadline" not in parsed:
        parsed["overall_deadline"] = overall_deadline if overall_deadline is not None else None

    return parsed


def validate_action_plan_output(raw_text: str) -> Dict[str, Any]:
    parsed = parse_json_response(raw_text)
    repaired = _repair_action_plan_parsed(parsed)
    try:
        validated = ActionPlanOutput.model_validate(repaired)
    except ValidationError as exc:
        raise ValueError(f"Invalid action plan output: {exc}") from exc
    return validated.model_dump()


def run_action_plan_llm(input_data: Dict[str, Any], repair_instruction: Optional[str] = None) -> Dict[str, Any]:
    prompt = build_action_plan_prompt(input_data, repair_instruction)
    mistral_client = MistralClient()
    response_text = mistral_client.chat(
        model="mistral-small",
        messages=[{"role": "user", "content": prompt}],
    )
    return validate_action_plan_output(response_text)


def run_action_plan_agent(
    extraction: Dict[str, Any],
    reasoning: Dict[str, Any],
    repair_instruction: Optional[str] = None,
    existing_action_plan: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    input_data = {
        "extraction": extraction,
        "reasoning": reasoning,
    }
    if existing_action_plan is not None:
        input_data["existing_action_plan"] = existing_action_plan

    return run_action_plan_llm(
        input_data,
        repair_instruction=repair_instruction,
    )


def run_explanation_agent(extraction: Dict[str, Any], reasoning: Dict[str, Any]) -> Dict[str, Any]:
    prompt = EXPLANATION_PROMPT + "\n\nExtraction:\n" + json.dumps(extraction, indent=2) + "\n\nReasoning:\n" + json.dumps(reasoning, indent=2)
    raw = call_llm(prompt)
    response = parse_json_response(raw)
    return response
