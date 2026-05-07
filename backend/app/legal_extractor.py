import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional


CASE_NUMBER_PATTERNS = [
    r"\bCase\s*[:-]+\s*([A-Za-z0-9][A-Za-z0-9\s\-\(\)\./]+?\d{4})",
    r"\bCriminal Appeal\s*(?:No\.?|No)\s*[-:\s]*\d+\s*(?:of|/)\s*\d{4}",
    r"\bCivil Appeal\s*(?:No\.?|No)\s*[-:\s]*\d+\s*(?:of|/)\s*\d{4}",
    r"\bWRIT\s*-\s*C\s*(?:No\.?|No)\s*[-:\s]*\d+\s*(?:of|/)\s*\d{4}",
    r"\bSLP\s*\(C\)\s*(?:No\.?|No)\s*[-:\s]*\d+[/\-]\d{4}",
    r"\bCRL\.?A\.?\s*\d+[/\-]\d{4}\b",
    r"\bWP/\d{1,}/\d{4}\b",
    r"\bCRLWP/\d{1,}/\d{4}\b",
]

COURT_NAME_PATTERNS = [
    r"\bIN\s+THE\s+HIGH\s+COURT\s+OF\s+[A-Z][A-Za-z\s]+\b",
    r"\bHIGH\s+COURT\s+OF\s+[A-Z][A-Za-z\s]+\b",
    r"\bSUPREME\s+COURT\b",
    r"\bDISTRICT\s+COURT\b",
]

DATE_PATTERNS = [
    r"\bDate\s+of\s+Judgment\s*[:\-]\s*([^\n,;]+)",
    r"\bJudgment\s+Date\s*[:\-]\s*([^\n,;]+)",
    r"\bdated\s+([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})\b",
]

MATTER_TYPE_PATTERNS = [
    r"\bwrit petition\b",
    r"\bcivil appeal\b",
    r"\bcriminal appeal\b",
    r"\bpetition\b",
    r"\bappeal\b",
]

PARTY_LABEL_PATTERNS = [
    (r"(?:^|[\.\?!]\s+)([A-Z][a-zA-Z\.\-&']+(?:\s+[A-Z][a-zA-Z\.\-&']+)*)\s*\(Petitioner\)", "petitioner"),
    (r"(?:^|[\.\?!]\s+)([A-Z][a-zA-Z\.\-&']+(?:\s+[A-Z][a-zA-Z\.\-&']+)*)\s*\(Respondent\)", "respondent"),
    (r"(?:^|[\.\?!]\s+)([A-Z][a-zA-Z\.\-&']+(?:\s+[A-Z][a-zA-Z\.\-&']+)*)\s*\(Applicant\)", "applicant"),
    (r"(?:^|[\.\?!]\s+)([A-Z][a-zA-Z\.\-&']+(?:\s+[A-Z][a-zA-Z\.\-&']+)*)\s*\(Opposite Party\)", "respondent"),
]

TITLE_PARTY_PATTERN = r"([A-Z][A-Za-z\s\.\-&']{2,})\s+(?:v\.?s?\.?|versus|\bv\b)\s+([A-Z][A-Za-z\s\.\-&']{2,})"

DIRECTIVE_KEYWORDS = ["shall", "is directed", "ordered", "must"]
DEADLINE_PATTERNS = [
    r"\bwithin\s+\d+\s+days\b",
    r"\bwithin\s+\d+\s+months\b",
    r"\bwithin\s+one\s+month\b",
    r"\bwithin\s+thirty\s+days\b",
    r"\bby\s+[0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4}\b",
]

STATUTE_PATTERNS = [
    r"\bSection\s+\d+[A-Za-z0-9\(\)]*\b",
    r"\bArticle\s+\d+[A-Za-z0-9\(\)]*\b",
]


def _normalize_text(text: str) -> str:
    return re.sub(r"[ \t]+", " ", text.replace("\r\n", "\n").replace("\r", "\n")).strip()


def _parse_date(value: Optional[str]) -> Optional[date]:
    if not value or not isinstance(value, str):
        return None
    text = value.strip()
    date_match = re.search(r"(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})", text)
    if date_match:
        text = date_match.group(1)
    patterns = ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y/%m/%d", "%d %B %Y", "%B %d, %Y"]
    for pattern in patterns:
        try:
            return datetime.strptime(text, pattern).date()
        except ValueError:
            continue
    return None


def _clean_case_number(case_number: str) -> str:
    cleaned = case_number.strip()
    cleaned = re.sub(r'^(case\s+(?:number|no)\.?\s*[:\-]?\s*)', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.split(r'[\t\r\n•\|,;]+', cleaned)[0].strip()
    match = re.search(r'[A-Za-z0-9]+(?:[\/\-\.][A-Za-z0-9]+)+', cleaned)
    return match.group(0).strip() if match else cleaned


def _clean_case_number_text(raw: str) -> str:
    cleaned = raw.strip()
    cleaned = re.sub(r"[\r\n\t]+", " ", cleaned)
    cleaned = re.sub(r"\s*[-–—]+\s*", " - ", cleaned)
    cleaned = re.sub(r"\s*No\.?\s*[-–—]+\s*", " No. ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*of\s*", " of ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*\/\s*", "/", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    cleaned = re.sub(r"[,;]+", "", cleaned)
    return cleaned.strip(" .,:;")


CASE_NUMBER_METADATA_PATTERNS = [
    re.compile(r"^(?P<type>WRIT\s*-\s*C)\s*(?:No\.?|No)\s*[-:\s]*\s*(?P<number>\d+)\s*(?:of|/)\s*(?P<year>\d{4})$", re.IGNORECASE),
    re.compile(r"^(?P<type>Criminal Appeal)\s*(?:No\.?|No)\s*[-:\s]*\s*(?P<number>\d+)\s*(?:of|/)\s*(?P<year>\d{4})$", re.IGNORECASE),
    re.compile(r"^(?P<type>Civil Appeal)\s*(?:No\.?|No)\s*[-:\s]*\s*(?P<number>\d+)\s*(?:of|/)\s*(?P<year>\d{4})$", re.IGNORECASE),
    re.compile(r"^(?P<type>CRL\.?A\.?)\s*(?P<number>\d+)[/\-](?P<year>\d{4})$", re.IGNORECASE),
    re.compile(r"^(?P<type>SLP\s*\(C\))\s*(?:No\.?|No)\s*[-:\s]*\s*(?P<number>\d+)[/\-](?P<year>\d{4})$", re.IGNORECASE),
    re.compile(r"^(?P<type>SLP)\s*(?:No\.?|No)\s*[-:\s]*\s*(?P<number>\d+)[/\-](?P<year>\d{4})$", re.IGNORECASE),
]


def _normalize_case_type(case_type: str) -> str:
    cleaned = re.sub(r"\s+", " ", case_type.strip())
    cleaned = re.sub(r"\s*[:-]+\s*", " - ", cleaned)
    return cleaned.upper()


def _normalize_party_name(name: str) -> str:
    cleaned = re.sub(r"\s+", " ", name.strip())
    cleaned = re.sub(r"[,:;]+$", "", cleaned)
    parts = []
    for word in cleaned.split():
        if word.isupper() and len(word) > 1:
            parts.append(word)
        else:
            parts.append(word.capitalize())
    return " ".join(parts)


def _is_directive_sentence(sentence: str) -> bool:
    lowered = sentence.lower()
    if any(weak in lowered for weak in ["should", "may", "expected to", "ought to", "might"]):
        return False
    strong_patterns = [
        r"\bshall\b",
        r"\bis directed to\b",
        r"\bmust\b",
        r"\bshall comply\b",
        r"\bis ordered to\b",
        r"\bordered that\b",
        r"\blet\b",
        r"\bwe direct\b",
    ]
    return any(re.search(pattern, lowered) for pattern in strong_patterns)


def _clean_directive_sentence(text: str) -> str:
    cleaned = text.strip()
    cleaned = re.sub(r"^directive\s*[:\-]?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*[—–-]\s*(within\s+\d+\s+days.*)$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*[—–-]\s*(by\s+[0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4}.*)$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*\(\s*within\s+\d+\s+days.*\)\s*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*\(\s*by\s+[0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4}.*\)\s*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*\bwithin\s+\d+\s+days\b.*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*\bby\s+[0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4}\b.*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def _parse_case_metadata(raw_case_number: str) -> Dict[str, Optional[str]]:
    if not raw_case_number or not isinstance(raw_case_number, str):
        return {
            "case_type": None,
            "case_number": None,
            "filing_year": None,
            "formatted_case_number": None,
        }

    cleaned = _clean_case_number_text(raw_case_number)
    for pattern in CASE_NUMBER_METADATA_PATTERNS:
        match = pattern.search(cleaned)
        if match:
            case_type = _normalize_case_type(match.group("type"))
            number = match.group("number").strip()
            year = match.group("year").strip()
            if case_type and number and year:
                formatted = f"{case_type} No. {number} of {year}" if " of " in cleaned.lower() or case_type.upper().startswith("WRIT") else f"{case_type} {number}/{year}"
                return {
                    "case_type": case_type,
                    "case_number": number,
                    "filing_year": year,
                    "formatted_case_number": formatted,
                }

    fallback_match = re.search(r"(?P<number>\d+)[/\-](?P<year>\d{4})", cleaned)
    if fallback_match:
        return {
            "case_type": None,
            "case_number": fallback_match.group("number").strip(),
            "filing_year": fallback_match.group("year").strip(),
            "formatted_case_number": cleaned,
        }

    return {
        "case_type": None,
        "case_number": None,
        "filing_year": None,
        "formatted_case_number": cleaned,
    }


def _split_sentences(text: str) -> List[str]:
    parts = re.split(r'(?<=[.!?])\s+', text.strip())
    return [p.strip() for p in parts if p.strip()]


def _find_first(patterns: List[str], text: str) -> Optional[str]:
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip() if match.groups() else match.group(0).strip()
    return None


def _find_all(patterns: List[str], text: str) -> List[str]:
    found: List[str] = []
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            value = match.group(0).strip()
            if value and value not in found:
                found.append(value)
    return found


def _extract_case_details(chunk_text: str) -> Dict[str, Optional[str]]:
    raw_case_number = _find_first(CASE_NUMBER_PATTERNS, chunk_text)
    case_metadata = _parse_case_metadata(raw_case_number) if raw_case_number else {
        "case_type": None,
        "case_number": None,
        "filing_year": None,
        "formatted_case_number": None,
    }
    judgment_date_raw = _find_first(DATE_PATTERNS, chunk_text)
    judgment_date = None
    if judgment_date_raw:
        parsed_date = _parse_date(judgment_date_raw)
        judgment_date = parsed_date.isoformat() if parsed_date else judgment_date_raw.strip()

    return {
        "case_type": case_metadata.get("case_type"),
        "case_number": case_metadata.get("case_number"),
        "filing_year": case_metadata.get("filing_year"),
        "formatted_case_number": case_metadata.get("formatted_case_number"),
        "court_name": _find_first(COURT_NAME_PATTERNS, chunk_text) or None,
        "judgment_date": judgment_date,
        "matter_type": _find_first(MATTER_TYPE_PATTERNS, chunk_text) or None,
    }


def _extract_parties(chunk_text: str) -> List[Dict[str, str]]:
    parties: List[Dict[str, str]] = []

    for pattern, role in PARTY_LABEL_PATTERNS:
        for match in re.finditer(pattern, chunk_text, re.IGNORECASE):
            name = match.group(1).strip()
            if name and name.lower() not in {"petitioner", "respondent", "applicant"}:
                parties.append({"name": name, "role": role})

    if not parties:
        title_match = re.search(TITLE_PARTY_PATTERN, chunk_text, re.IGNORECASE)
        if title_match:
            petitioner = _normalize_party_name(title_match.group(1).strip())
            respondent = _normalize_party_name(title_match.group(2).strip())
            if petitioner and respondent and _is_valid_party_name(petitioner) and _is_valid_party_name(respondent):
                parties.append({"name": petitioner, "role": "petitioner"})
                parties.append({"name": respondent, "role": "respondent"})

    unique: List[Dict[str, str]] = []
    seen = set()
    for party in parties:
        party_name = _normalize_party_name(party["name"])
        if not _is_valid_party_name(party_name):
            continue
        key = (party_name.lower(), party["role"])
        if key not in seen:
            seen.add(key)
            unique.append({"name": party_name, "role": party["role"]})
    return unique


def _extract_directives(chunk_text: str) -> List[Dict[str, Optional[str]]]:
    directives: List[Dict[str, Optional[str]]] = []
    for sentence in _split_sentences(chunk_text):
        if not _is_directive_sentence(sentence):
            continue
        cleaned = _clean_directive_sentence(sentence)
        if not cleaned:
            continue
        deadline_text = _extract_directive_deadline(cleaned)
        if deadline_text:
            cleaned = _clean_directive_sentence(re.sub(re.escape(deadline_text), "", cleaned, flags=re.IGNORECASE))
        if not cleaned:
            continue
        priority = "high" if deadline_text or re.search(r"\b(immediately|within\s+\d+\s+days|expeditiously)\b", sentence, re.IGNORECASE) else "medium"
        directives.append({
            "directive_text": cleaned,
            "deadline_text": deadline_text,
            "priority": priority,
        })
    unique: List[Dict[str, Optional[str]]] = []
    seen = set()
    for directive in directives:
        directive_text = directive["directive_text"] or ""
        if not directive_text.strip():
            continue
        key = directive_text.strip().lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(directive)
        if len(unique) >= 4:
            break
    return unique


def _extract_deadlines(chunk_text: str) -> List[str]:
    return _find_all(DEADLINE_PATTERNS, chunk_text)


def _extract_cited_statutes(chunk_text: str) -> List[str]:
    statutes = []
    for pattern in STATUTE_PATTERNS:
        for match in re.finditer(pattern, chunk_text, re.IGNORECASE):
            statute = match.group(0).strip()
            if statute not in statutes:
                statutes.append(statute)
    return statutes


def _extract_summary(chunk_text: str) -> Optional[str]:
    sentences = _split_sentences(chunk_text)
    if not sentences:
        return None
    if len(sentences) == 1:
        return sentences[0]
    return " ".join(sentences[:2])


def _build_evidence(
    case_number: Optional[str],
    court_name: Optional[str],
    judgment_date: Optional[str],
    parties: List[Dict[str, str]],
    directives: List[Dict[str, Optional[str]]],
    deadlines: List[str],
    statutes: List[str],
) -> Dict[str, List[str]]:
    evidence: Dict[str, List[str]] = {
        "case_number": [],
        "court_name": [],
        "judgment_date": [],
        "parties": [],
        "directives": [],
        "deadlines": [],
        "statutes": [],
    }
    if case_number:
        evidence["case_number"].append(case_number)
    if court_name:
        evidence["court_name"].append(court_name)
    if judgment_date:
        evidence["judgment_date"].append(judgment_date)
    for party in parties:
        evidence["parties"].append(party["name"])
    for directive in directives:
        evidence["directives"].append(directive["text"])
        if directive["deadline_text"]:
            evidence["deadlines"].append(directive["deadline_text"])
    evidence["deadlines"].extend(deadlines)
    for statute in statutes:
        evidence["statutes"].append(statute)
    return evidence


def _confidence_label(found: bool) -> str:
    return "high" if found else "none"


def extract_legal_information(
    chunk_text: str,
    chunk_index: int,
    repair_instruction: Optional[str] = None,
) -> Dict[str, Any]:
    text = _normalize_text(chunk_text)
    if repair_instruction:
        text = text.strip()

    case_details = _extract_case_details(text)
    parties = _extract_parties(text)
    directives = _extract_directives(text)
    deadlines = _extract_deadlines(text)
    statutes = _extract_cited_statutes(text)
    summary = _extract_summary(text)

    evidence = _build_evidence(
        case_number=case_details.get("case_number"),
        court_name=case_details.get("court_name"),
        judgment_date=case_details.get("judgment_date"),
        parties=parties,
        directives=directives,
        deadlines=deadlines,
        statutes=statutes,
    )

    return {
        "chunk_index": chunk_index,
        "case_details": {
            "case_number": case_details.get("case_number"),
            "court_name": case_details.get("court_name"),
            "judgment_date": case_details.get("judgment_date"),
            "matter_type": case_details.get("matter_type"),
        },
        "parties": parties,
        "directives": directives,
        "deadlines": deadlines,
        "cited_statutes": statutes,
        "summary": summary,
        "evidence": evidence,
        "confidence_hint": {
            "case_number": _confidence_label(bool(case_details.get("case_number"))),
            "court_name": _confidence_label(bool(case_details.get("court_name"))),
            "judgment_date": _confidence_label(bool(case_details.get("judgment_date"))),
            "parties": _confidence_label(bool(parties)),
            "directives": _confidence_label(bool(directives)),
            "deadlines": _confidence_label(bool(deadlines)),
            "statutes": _confidence_label(bool(statutes)),
        },
    }
