import httpx
import json
import re
from collections import Counter
from datetime import date, datetime
from statistics import mean
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session

from app import crud
from app.legal_extractor import _clean_case_number, _parse_case_metadata
from app.llm_client import call_llm

EXTRACTION_CHUNK_PROMPT = """
You are a highly strict legal information extraction AI.
You will receive a chunk of court judgment text.
Your task is to extract ONLY the most relevant and accurate legal information.

CRITICAL RULES (MANDATORY):
* Return ONLY valid JSON
* Do NOT hallucinate
* Do NOT guess
* If not clearly present → return null or empty list
* IGNORE irrelevant content
* DO NOT extract everything — be selective

OUTPUT FORMAT:
{
  "case_type": <string or null>,
  "case_number": <string or null>,
  "filing_year": <string or null>,
  "formatted_case_number": <string or null>,
  "court_name": <string or null>,
  "judgment_date": <string or null>,

  "parties": [
    {
      "name": <string>,
      "role": "petitioner" | "respondent" | "appellant" | "unknown"
    }
  ],

  "directives": [
    {
      "directive_text": <string>,
      "deadline_text": <string or null>,
      "priority": "high" | "medium" | "low"
    }
  ],

  "deadlines": [<string>],

  "cited_statutes": [
    {
      "type": <string>,
      "value": <string>,
      "act": <string or null>
    }
  ],

  "summary": <string or null>,

  "confidence": {
    "case_number": "high" | "medium" | "low" | "none",
    "court_name": "high" | "medium" | "low" | "none",
    "judgment_date": "high" | "medium" | "low" | "none",
    "parties": "high" | "medium" | "low" | "none",
    "directives": "high" | "medium" | "low" | "none",
    "deadlines": "high" | "medium" | "low" | "none",
    "statutes": "high" | "medium" | "low" | "none"
  }
}

STRICT EXTRACTION RULES:
1. CASE NUMBER (VERY STRICT)
Extract ONLY if pattern like:
* "No."
* "Appeal No."
* "Writ Petition No."
* "Case Number:"
* "Case No:"
* "WP/1234/2024"
Also extract structured metadata when available: case_type, case_number, filing_year, and formatted_case_number.
Always return ONLY the case identifier itself, not the surrounding text.
If the label is followed by extra narrative, stop at the first clear separator such as a comma, semicolon, bullet, or newline.
IGNORE:
* SCC citations
* SCR references
* page numbers
* anything that is not the canonical court case ID

2. PARTIES (CRITICAL FILTER)
Extract ONLY PRIMARY parties from case title.
* Extract only 2–3 parties MAX
* Assign roles properly
IGNORE:
* cited case names
* lawyers, judges
* institutions like "High Court"
* generic terms like "appellant", "respondent"
* duplicate names

3. DIRECTIVES (ULTRA STRICT)
Extract ONLY FINAL COURT DIRECTIONS.
Focus ONLY on text near phrases like:
* "ORDER"
* "FINAL ORDER"
* "In view of the above"
* "Accordingly"
* "Thus"
* "Hence"
* "We direct"
* "It is ordered"
If such a section exists, extract ONLY from that region.
If not clearly present, extract ONLY the LAST actionable directions in the document.

VALID DIRECTIVE CONDITIONS (ALL MUST PASS):
1. It is issued by the Court.
2. It contains strong directive language:
   * "Let ..."
   * "shall ..."
   * "is directed to ..."
   * "ordered that ..."
3. It refers to an ACTION in THIS case.
4. It is NOT explaining law or policy.

STRICT REJECTION RULES (VERY IMPORTANT):
Ignore any sentence that:
* describes legal principles
* mentions duties of citizens/vendors
* explains statutes or schemes
* refers to other cases
* uses weak words like "should", "may", "expected to"
* talks about general governance

If a sentence applies generally, ignore it.
If it applies specifically to this case, keep it.

LIMIT OUTPUT:
* Extract MAX 3–4 directives
* Remove duplicates
* Keep only the most relevant

DEADLINE LINKING:
If directive contains a deadline phrase such as "within X days" or a specific date, attach it as deadline_text.

FINAL CLEANING:
Each directive must be:
* short
* actionable
* specific
* free of legal explanation

GOOD EXAMPLES:
* "Let an affidavit be filed within two weeks"
* "The respondent shall submit report within 30 days"

BAD EXAMPLES (DO NOT EXTRACT):
* "Vendors should maintain hygiene"
* "Authorities are required to ensure cleanliness"
* "As held in Olga Tellis case..."

FINAL RULE:
If unsure → DO NOT extract.
Better to return fewer directives than wrong ones.

Return ONLY valid JSON.
"""


def build_extractor_prompt(chunk_text: str, chunk_index: int, repair_instruction: Optional[str] = None) -> str:
    prompt = (
        EXTRACTION_CHUNK_PROMPT
        + "\nchunk_index: "
        + str(chunk_index)
        + "\nchunk_text:\n"
        + chunk_text
    )
    if repair_instruction:
        prompt += "\n\nRepair instruction:\n" + repair_instruction
    prompt += "\n\nReturn only valid JSON."
    return prompt


def _normalize_confidence_hint(value: Any) -> Dict[str, str]:
    allowed = {"high", "medium", "low", "none"}
    normalized: Dict[str, str] = {
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

    if isinstance(value, dict):
        for key in normalized.keys():
            raw = value.get(key)
            qualitative = _to_qualitative(raw)
            if qualitative:
                normalized[key] = qualitative
    return normalized


def safe_parse_json(response_text: str) -> Dict[str, Any]:
    try:
        return json.loads(response_text)
    except ValueError:
        match = re.search(r"\{.*\}", response_text, re.DOTALL)
        if match:
            return json.loads(match.group())
        raise ValueError("Invalid JSON from LLM")


def call_llm_extractor(chunk_text: str, chunk_index: int, repair_instruction: Optional[str] = None) -> str:
    prompt = build_extractor_prompt(chunk_text, chunk_index, repair_instruction)
    try:
        return call_llm(prompt, temperature=0.0, max_tokens=800)
    except httpx.HTTPError as exc:
        raise RuntimeError(f"LLM request failed: {exc}") from exc
    except Exception as exc:
        raise RuntimeError(f"LLM extraction failed: {exc}") from exc


class CaseDetails(BaseModel):
    case_type: Optional[str] = None
    case_number: Optional[str] = None
    filing_year: Optional[str] = None
    formatted_case_number: Optional[str] = None
    court_name: Optional[str] = None
    judgment_date: Optional[str] = None
    matter_type: Optional[str] = None


class ExtractionParty(BaseModel):
    name: str
    role: Literal["petitioner", "respondent", "applicant", "unknown"]


class ExtractionDirective(BaseModel):
    directive_text: str
    deadline_text: Optional[str] = None
    priority: Literal["high", "medium", "low"] = "medium"


class ExtractionStatute(BaseModel):
    type: str
    value: str
    act: Optional[str] = None


class EvidenceMap(BaseModel):
    case_number: List[str] = Field(default_factory=list)
    court_name: List[str] = Field(default_factory=list)
    judgment_date: List[str] = Field(default_factory=list)
    parties: List[str] = Field(default_factory=list)
    directives: List[str] = Field(default_factory=list)
    deadlines: List[str] = Field(default_factory=list)
    statutes: List[str] = Field(default_factory=list)


class ConfidenceHint(BaseModel):
    case_number: Literal["high", "medium", "low", "none"] = "none"
    court_name: Literal["high", "medium", "low", "none"] = "none"
    judgment_date: Literal["high", "medium", "low", "none"] = "none"
    parties: Literal["high", "medium", "low", "none"] = "none"
    directives: Literal["high", "medium", "low", "none"] = "none"
    deadlines: Literal["high", "medium", "low", "none"] = "none"
    statutes: Literal["high", "medium", "low", "none"] = "none"


class ExtractionChunkOutput(BaseModel):
    chunk_index: int
    case_details: CaseDetails
    parties: List[ExtractionParty] = Field(default_factory=list)
    directives: List[ExtractionDirective] = Field(default_factory=list)
    deadlines: List[str] = Field(default_factory=list)
    cited_statutes: List[ExtractionStatute] = Field(default_factory=list)
    summary: Optional[str] = None
    evidence: EvidenceMap = Field(default_factory=EvidenceMap)
    confidence_hint: ConfidenceHint = Field(default_factory=ConfidenceHint)


def _parse_date(value: Optional[str]) -> Optional[date]:
    if not value or not isinstance(value, str):
        return None
    value = value.strip()
    patterns = ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d %B %Y", "%B %d, %Y"]
    for pattern in patterns:
        try:
            return datetime.strptime(value, pattern).date()
        except ValueError:
            continue
    return None


def _normalize_text_list(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if item is not None and str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _clean_party_name(name: str) -> str:
    cleaned = re.sub(r"\s+", " ", name.strip())
    cleaned = re.sub(r"\b(And|Others|Ors?\.?|&|and)\b", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"[,;:]$", "", cleaned).strip()
    return cleaned


def _normalize_party_name(name: str) -> str:
    normalized = _clean_party_name(name)
    parts = []
    for part in normalized.split():
        if part.isupper() and len(part) > 1:
            parts.append(part)
        else:
            parts.append(part.capitalize())
    return " ".join(parts)


def _is_valid_party_name(name: str) -> bool:
    name_lower = name.lower()
    invalid_tokens = [
        "petitioner", "respondent", "appellant", "applicant", "advocate", "senior advocate",
        "judge", "authority", "contractor", "department", "government", "minister",
        "rfc", "gkp", "others", "ors", "and", "vs", "v.", "versus",
    ]
    if len(name_lower) < 3:
        return False
    for token in invalid_tokens:
        if token in name_lower:
            return False
    if re.fullmatch(r"\d+", name_lower):
        return False
    return True


def _normalize_party_list(value: Any) -> List[Dict[str, Any]]:
    allowed_roles = {"petitioner", "respondent", "applicant", "unknown"}
    parties: List[Dict[str, Any]] = []
    if isinstance(value, list):
        for item in value:
            if isinstance(item, dict):
                name = item.get("name") or item.get("party") or item.get("person")
                raw_role = item.get("role")
                if isinstance(raw_role, str):
                    role = raw_role.strip().lower()
                    if role not in allowed_roles:
                        role = "unknown"
                else:
                    role = "unknown"
                if isinstance(name, str) and name.strip():
                    normalized_name = _normalize_party_name(name)
                    if _is_valid_party_name(normalized_name):
                        parties.append({"name": normalized_name, "role": role})
            elif isinstance(item, str) and item.strip():
                normalized_name = _normalize_party_name(item)
                if _is_valid_party_name(normalized_name):
                    parties.append({"name": normalized_name, "role": "unknown"})
    elif isinstance(value, str) and value.strip():
        normalized_name = _normalize_party_name(value)
        if _is_valid_party_name(normalized_name):
            parties.append({"name": normalized_name, "role": "unknown"})

    deduped: List[Dict[str, Any]] = []
    seen = set()
    explicit_roles = [p for p in parties if p["role"] in {"petitioner", "respondent", "applicant"}]
    for party in parties:
        key = (party["name"].lower(), party["role"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(party)

    if explicit_roles:
        deduped = [p for p in deduped if p["role"] in {"petitioner", "respondent", "applicant"}]

    return deduped[:3]


def _is_strict_directive_text(text: str) -> bool:
    normalized = text.strip()
    if not normalized:
        return False

    lowered = normalized.lower()
    weak_terms = [" should ", " may ", " expected to ", " ought to ", " might "]
    if any(term in lowered for term in weak_terms):
        return False

    strong_patterns = [
        r"\blet\b.*\bbe\b",
        r"\bshall\b",
        r"\bis directed to\b",
        r"\bordered that\b",
        r"\bit is ordered\b",
        r"\bwe direct\b",
    ]
    if not any(re.search(pattern, lowered) for pattern in strong_patterns):
        return False

    rejection_phrases = [
        "legal principles",
        "in view of",
        "in accordance with",
        "under the provisions",
        "as per",
        "in terms of",
        "statute",
        "scheme",
        "case law",
        "other cases",
        "vendors",
        "citizens",
        "authority",
        "governance",
    ]
    if any(phrase in lowered for phrase in rejection_phrases):
        return False

    return True


def _normalize_directive_list(value: Any) -> List[Dict[str, Any]]:
    directives: List[Dict[str, Any]] = []
    if isinstance(value, list):
        for item in value:
            if isinstance(item, dict):
                text = item.get("directive_text") or item.get("text") or item.get("directive")
                deadline_text = item.get("deadline_text") if isinstance(item.get("deadline_text"), str) else None
                if isinstance(text, str) and text.strip():
                    cleaned_text = _clean_directive_text(text)
                    if not deadline_text:
                        deadline_text = _extract_directive_deadline(cleaned_text)
                    directives.append({
                        "directive_text": cleaned_text,
                        "deadline_text": deadline_text,
                        "priority": "medium",
                    })
            elif isinstance(item, str) and item.strip():
                cleaned_text = _clean_directive_text(item)
                directives.append({
                    "directive_text": cleaned_text,
                    "deadline_text": _extract_directive_deadline(cleaned_text),
                    "priority": "medium",
                })
    elif isinstance(value, str) and value.strip():
        cleaned_text = _clean_directive_text(value)
        directives.append({
            "directive_text": cleaned_text,
            "deadline_text": _extract_directive_deadline(cleaned_text),
            "priority": "medium",
        })

    filtered: List[Dict[str, Any]] = []
    seen = set()
    for directive in directives:
        text = directive["directive_text"].strip()
        if not _is_strict_directive_text(text):
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        filtered.append(directive)
        if len(filtered) >= 4:
            break

    return filtered


def _extract_directive_deadline(text: str) -> Optional[str]:
    if not isinstance(text, str):
        return None
    for pattern in [
        r"\bwithin\s+\d+\s+days\b",
        r"\bwithin\s+\d+\s+months\b",
        r"\bwithin\s+one\s+month\b",
        r"\bwithin\s+thirty\s+days\b",
        r"\bby\s+[0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4}\b",
    ]:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(0).strip()
    return None


def _clean_directive_text(text: str) -> str:
    cleaned = text.strip()
    cleaned = re.sub(r"\s*[—–-]\s*(within\s+\d+\s+days.*)$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*[—–-]\s*(by\s+[0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4}.*)$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*\(\s*within\s+\d+\s+days.*\)\s*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*\(\s*by\s+[0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4}.*\)\s*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*\bwithin\s+\d+\s+days\b.*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*\bby\s+[0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4}\b.*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def _normalize_statute_text(value: str) -> Dict[str, Optional[str]]:
    cleaned = re.sub(r"\s+", " ", value.strip())
    pattern = re.compile(
        r"^(Section|Article|Rule|IPC)\s+([A-Za-z0-9\(\)\.\-]+)(?:\s+of\s+the\s+(.+))?$",
        re.IGNORECASE,
    )
    match = pattern.match(cleaned)
    if match:
        return {
            "type": match.group(1).title(),
            "value": match.group(2),
            "act": match.group(3).strip() if match.group(3) else None,
        }

    pattern_act = re.compile(r"^(.*?Act)$", re.IGNORECASE)
    match_act = pattern_act.match(cleaned)
    if match_act:
        return {
            "type": "Act",
            "value": match_act.group(1).strip(),
            "act": None,
        }

    return {
        "type": "Act",
        "value": cleaned,
        "act": None,
    }


def _normalize_statute_list(value: Any) -> List[Dict[str, Optional[str]]]:
    statutes: List[Dict[str, Optional[str]]] = []
    if isinstance(value, list):
        for item in value:
            if isinstance(item, dict):
                statute_text = item.get("value") or item.get("statute") or item.get("text")
                if isinstance(statute_text, str) and statute_text.strip():
                    statutes.append(_normalize_statute_text(statute_text))
            elif isinstance(item, str) and item.strip():
                statutes.append(_normalize_statute_text(item))
    elif isinstance(value, str) and value.strip():
        statutes.append(_normalize_statute_text(value))
    return statutes


def _normalize_evidence_map(value: Any) -> Dict[str, List[str]]:
    evidence: Dict[str, List[str]] = {
        "case_number": [],
        "court_name": [],
        "judgment_date": [],
        "parties": [],
        "directives": [],
        "deadlines": [],
        "statutes": [],
    }
    if isinstance(value, dict):
        for key in evidence.keys():
            source = value.get(key)
            if isinstance(source, list):
                evidence[key] = [str(item).strip() for item in source if isinstance(item, str) and item.strip()]
    return evidence


def _normalize_confidence_hint(value: Any) -> Dict[str, str]:
    allowed = {"high", "medium", "low", "none"}
    normalized: Dict[str, str] = {
        "case_number": "none",
        "court_name": "none",
        "judgment_date": "none",
        "parties": "none",
        "directives": "none",
        "deadlines": "none",
        "statutes": "none",
    }
    if isinstance(value, dict):
        for key in normalized.keys():
            raw = value.get(key)
            if isinstance(raw, str) and raw.strip().lower() in allowed:
                normalized[key] = raw.strip().lower()
    return normalized


def _repair_chunk_output(raw: Any) -> ExtractionChunkOutput:
    if not isinstance(raw, dict):
        raw = {}

    case_details_raw = raw.get("case_details", {}) if isinstance(raw.get("case_details", {}), dict) else {}
    raw_case_text = (
        case_details_raw.get("formatted_case_number") if isinstance(case_details_raw.get("formatted_case_number"), str)
        else case_details_raw.get("case_number") if isinstance(case_details_raw.get("case_number"), str)
        else raw.get("formatted_case_number") if isinstance(raw.get("formatted_case_number"), str)
        else raw.get("case_number") if isinstance(raw.get("case_number"), str)
        else None
    )
    parsed_case_metadata = _parse_case_metadata(raw_case_text) if raw_case_text else {
        "case_type": None,
        "case_number": None,
        "filing_year": None,
        "formatted_case_number": None,
    }
    explicit_case_type = case_details_raw.get("case_type") if isinstance(case_details_raw.get("case_type"), str) else raw.get("case_type") if isinstance(raw.get("case_type"), str) else None
    explicit_filing_year = case_details_raw.get("filing_year") if isinstance(case_details_raw.get("filing_year"), str) else raw.get("filing_year") if isinstance(raw.get("filing_year"), str) else None
    explicit_formatted = case_details_raw.get("formatted_case_number") if isinstance(case_details_raw.get("formatted_case_number"), str) else raw.get("formatted_case_number") if isinstance(raw.get("formatted_case_number"), str) else None
    normalized_case_type = explicit_case_type or parsed_case_metadata.get("case_type")
    normalized_case_number = parsed_case_metadata.get("case_number")
    normalized_filing_year = explicit_filing_year or parsed_case_metadata.get("filing_year")
    normalized_formatted = explicit_formatted or parsed_case_metadata.get("formatted_case_number")
    if not normalized_formatted and normalized_case_number and normalized_filing_year:
        if normalized_case_type:
            normalized_formatted = f"{normalized_case_type} No. {normalized_case_number} of {normalized_filing_year}"
        else:
            normalized_formatted = f"{normalized_case_number}/{normalized_filing_year}"
    normalized = {
        "chunk_index": raw.get("chunk_index") if isinstance(raw.get("chunk_index"), int) else 0,
        "case_details": {
            "case_type": normalized_case_type,
            "case_number": normalized_case_number,
            "filing_year": normalized_filing_year,
            "formatted_case_number": normalized_formatted,
            "court_name": (
                case_details_raw.get("court_name") if isinstance(case_details_raw.get("court_name"), str)
                else raw.get("court_name") if isinstance(raw.get("court_name"), str)
                else None
            ),
            "judgment_date": (
                case_details_raw.get("judgment_date") if isinstance(case_details_raw.get("judgment_date"), str)
                else raw.get("judgment_date") if isinstance(raw.get("judgment_date"), str)
                else None
            ),
            "matter_type": (
                case_details_raw.get("matter_type") if isinstance(case_details_raw.get("matter_type"), str)
                else raw.get("matter_type") if isinstance(raw.get("matter_type"), str)
                else None
            ),
        },
        "parties": _normalize_party_list(raw.get("parties") or case_details_raw.get("parties") or raw.get("parties_list")),
        "directives": _normalize_directive_list(raw.get("directives") or raw.get("orders") or raw.get("instructions")),
        "deadlines": _normalize_text_list(raw.get("deadlines") or raw.get("timeline") or raw.get("timeline_text")),
        "cited_statutes": _normalize_statute_list(raw.get("cited_statutes") or raw.get("statutes") or raw.get("cited_laws")),
        "summary": raw.get("summary") if isinstance(raw.get("summary"), str) else None,
        "evidence": _normalize_evidence_map(raw.get("evidence") or raw.get("evidence_map") or raw.get("evidence_text")),
        "confidence_hint": _normalize_confidence_hint(raw.get("confidence_hint") or raw.get("confidence_scores") or raw.get("confidence")),
    }

    try:
        return ExtractionChunkOutput.model_validate(normalized)
    except ValidationError:
        return ExtractionChunkOutput(**normalized)


def _validate_chunk_output(raw: Any) -> ExtractionChunkOutput:
    if not isinstance(raw, dict):
        raw = {}
    try:
        return ExtractionChunkOutput.model_validate(raw)
    except ValidationError:
        return _repair_chunk_output(raw)


def _call_chunk_extraction(chunk_text: str, chunk_index: int) -> ExtractionChunkOutput:
    raw_response = call_llm_extractor(chunk_text, chunk_index)
    parsed = safe_parse_json(raw_response)
    return _validate_chunk_output(parsed)


def _dedupe_list_of_dicts(items: List[Any], key_fields: List[str]) -> List[Any]:
    seen = set()
    unique: List[Any] = []
    for item in items:
        if hasattr(item, "model_dump"):
            item_dict = item.model_dump()
        elif isinstance(item, dict):
            item_dict = item
        else:
            item_dict = {field: getattr(item, field, None) for field in key_fields}

        key = tuple(str(item_dict.get(field, "")).strip().lower() for field in key_fields)
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


def _combine_unique_strings(*lists: List[str]) -> List[str]:
    seen = set()
    combined: List[str] = []
    for source in lists:
        for item in source:
            normalized = str(item).strip()
            if normalized and normalized not in seen:
                seen.add(normalized)
                combined.append(normalized)
    return combined


def _merge_chunk_outputs(chunks: List[ExtractionChunkOutput]) -> Dict[str, Any]:
    case_number = next(
        (chunk.case_details.case_number for chunk in chunks if chunk.case_details and chunk.case_details.case_number),
        None,
    )
    case_type = next(
        (chunk.case_details.case_type for chunk in chunks if chunk.case_details and chunk.case_details.case_type),
        None,
    )
    filing_year = next(
        (chunk.case_details.filing_year for chunk in chunks if chunk.case_details and chunk.case_details.filing_year),
        None,
    )
    formatted_case_number = next(
        (chunk.case_details.formatted_case_number for chunk in chunks if chunk.case_details and chunk.case_details.formatted_case_number),
        None,
    )
    court_names = [
        chunk.case_details.court_name for chunk in chunks if chunk.case_details and chunk.case_details.court_name
    ]
    court_name = None
    if court_names:
        court_name = Counter(court_names).most_common(1)[0][0]

    matter_type = next(
        (chunk.case_details.matter_type for chunk in chunks if chunk.case_details and chunk.case_details.matter_type),
        None,
    )

    parties: List[Dict[str, Any]] = []
    for chunk in chunks:
        parties.extend(chunk.parties or [])
    parties = _dedupe_list_of_dicts(parties, ["name", "role"])

    directives: List[Dict[str, Any]] = []
    for chunk in chunks:
        directives.extend(chunk.directives or [])
    directives = _dedupe_list_of_dicts(directives, ["directive_text"])

    deadlines = _combine_unique_strings(*(chunk.deadlines or [] for chunk in chunks))
    cited_statutes: List[Dict[str, Any]] = []
    for chunk in chunks:
        cited_statutes.extend(chunk.cited_statutes or [])
    cited_statutes = _dedupe_list_of_dicts(cited_statutes, ["type", "value", "act"])

    summaries = [chunk.summary for chunk in chunks if chunk.summary]
    summary = None
    if summaries:
        summary = max(summaries, key=len)

    judgment_date = next(
        (chunk.case_details.judgment_date for chunk in chunks if chunk.case_details and chunk.case_details.judgment_date),
        None,
    )
    if judgment_date:
        parsed_date = _parse_date(judgment_date)
        judgment_date = parsed_date.isoformat() if parsed_date else judgment_date

    merged_evidence: Dict[str, List[str]] = {
        "case_number": [],
        "court_name": [],
        "judgment_date": [],
        "parties": [],
        "directives": [],
        "deadlines": [],
        "statutes": [],
    }
    for chunk in chunks:
        if chunk.evidence:
            evidence_map = chunk.evidence.model_dump() if hasattr(chunk.evidence, "model_dump") else chunk.evidence
            for key, values in evidence_map.items():
                if isinstance(values, list):
                    for value in values:
                        normalized = str(value).strip()
                        if normalized and normalized not in merged_evidence[key]:
                            merged_evidence[key].append(normalized)

    def _merge_confidence_hints(chunks: List[ExtractionChunkOutput]) -> Dict[str, str]:
        ratings = {"none": 0, "low": 1, "medium": 2, "high": 3}
        merged = {
            "case_number": "none",
            "court_name": "none",
            "judgment_date": "none",
            "parties": "none",
            "directives": "none",
            "deadlines": "none",
            "statutes": "none",
        }
        for chunk in chunks:
            if chunk.confidence_hint:
                confidence_map = chunk.confidence_hint.model_dump() if hasattr(chunk.confidence_hint, "model_dump") else chunk.confidence_hint
                for key, value in confidence_map.items():
                    if value in ratings and ratings[value] < ratings[merged[key]]:
                        merged[key] = value
        return merged

    def _infer_confidence(value: Any, evidence: List[str]) -> str:
        if not value:
            return "none"
        if evidence:
            return "high"
        return "medium"

    explicit_confidence = _merge_confidence_hints(chunks)
    final_confidence: Dict[str, str] = {}
    for key, field_value, field_evidence in [
        ("case_number", case_number, merged_evidence["case_number"]),
        ("court_name", court_name, merged_evidence["court_name"]),
        ("judgment_date", judgment_date, merged_evidence["judgment_date"]),
        ("parties", parties, merged_evidence["parties"]),
        ("directives", directives, merged_evidence["directives"]),
        ("deadlines", deadlines, merged_evidence["deadlines"]),
        ("statutes", cited_statutes, merged_evidence["statutes"]),
    ]:
        if explicit_confidence.get(key) != "none":
            final_confidence[key] = explicit_confidence[key]
        else:
            final_confidence[key] = _infer_confidence(field_value, field_evidence)

    if not formatted_case_number and case_number and filing_year:
        if case_type:
            formatted_case_number = f"{case_type} No. {case_number} of {filing_year}"
        else:
            formatted_case_number = f"{case_number}/{filing_year}"

    return {
        "case_type": case_type,
        "case_number": case_number,
        "filing_year": filing_year,
        "formatted_case_number": formatted_case_number,
        "court_name": court_name,
        "judgment_date": judgment_date,
        "matter_type": matter_type,
        "parties": parties,
        "directives": directives,
        "deadlines": deadlines,
        "cited_statutes": cited_statutes,
        "summary": summary,
        "evidence": merged_evidence,
        "confidence_hint": final_confidence,
    }


def _serialize_jsonable(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return _serialize_jsonable(value.model_dump())
    if isinstance(value, dict):
        return {k: _serialize_jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_serialize_jsonable(v) for v in value]
    return value


def run_extraction(case_id: int, db: Session, repair_instruction: Optional[str] = None) -> Dict[str, Any]:
    case = crud.get_case(db, case_id)
    if not case:
        raise ValueError("Case not found")

    chunks = case.chunks or []
    if not chunks:
        raise ValueError("No document chunks available for extraction")

    outputs: List[ExtractionChunkOutput] = []
    for chunk in chunks:
        chunk_index = chunk.get("chunk_index", 0)
        chunk_text = chunk.get("text", "")
        raw_response = call_llm_extractor(chunk_text, chunk_index, repair_instruction)
        parsed = safe_parse_json(raw_response)
        chunk_output = _validate_chunk_output(parsed)

        crud.save_extraction_chunk_debug(
            db,
            case_id,
            chunk_index,
            {
                "chunk_text": chunk_text,
                "llm_output": raw_response,
                "parsed_json": parsed,
                "validated": chunk_output.model_dump(),
            },
        )
        outputs.append(chunk_output)

    merged = _merge_chunk_outputs(outputs)
    merged_parties = _serialize_jsonable(merged.get("parties", []))
    merged_directives = _serialize_jsonable(merged.get("directives", []))
    merged_evidence = _serialize_jsonable(merged.get("evidence", {}))
    merged_confidence = _serialize_jsonable(merged.get("confidence_hint", {}))

    judgment_date = None
    if merged.get("judgment_date"):
        judgment_date = _parse_date(merged.get("judgment_date"))

    crud.create_extraction_result(
        db=db,
        case_id=case_id,
        case_number=merged.get("case_number"),
        court_name=merged.get("court_name"),
        judgment_date=judgment_date,
        matter_type=merged.get("matter_type"),
        parties=merged_parties,
        directives=merged_directives,
        deadlines=_serialize_jsonable(merged.get("deadlines", [])),
        cited_statutes=_serialize_jsonable(merged.get("cited_statutes", [])),
        summary=merged.get("summary"),
        confidence=merged_confidence,
        evidence={"items": merged_evidence},
    )
    return merged
