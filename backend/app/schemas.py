from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class CaseStatus(str, Enum):
    draft = "draft"
    processed = "processed"
    pending_review = "pending_review"
    approved = "approved"
    rejected = "rejected"
    needs_manual_review = "needs_manual_review"


class BaseCase(BaseModel):
    title: str
    raw_text: Optional[str] = None
    chunks: Optional[List[Dict[str, Any]]] = None
    extraction: Optional[Dict[str, Any]] = None
    reasoning: Optional[Dict[str, Any]] = None
    action_plan: Optional[Dict[str, Any]] = None
    explanation: Optional[Dict[str, Any]] = None
    review: Optional[Dict[str, Any]] = None
    status: CaseStatus = CaseStatus.draft
    version: int = 1
    run_history: Optional[List[Dict[str, Any]]] = None

    class Config:
        orm_mode = True


class CaseCreate(BaseCase):
    title: str


class CaseReviewRequest(BaseModel):
    action: str = Field(..., pattern="^(approve|reject|edit)$")
    reviewer_comment: Optional[str] = None
    rejection_type: Optional[str] = Field(None, pattern="^(extraction|reasoning|action_plan)$")
    edited_payload: Optional[Dict[str, Any]] = None


class ReviewActionRequest(BaseModel):
    case_id: int
    reviewer_comment: Optional[str] = None
    rejection_type: Optional[str] = Field(None, pattern="^(extraction|reasoning|action_plan)$")
    edited_payload: Optional[Dict[str, Any]] = None


class ReprocessRequest(FinalReviewRequest):
    case_id: int


class CaseResponse(BaseCase):
    id: int
    created_at: datetime
    updated_at: datetime


class Chunk(BaseModel):
    chunk_id: str
    chunk_index: int
    page_number: int
    char_start: int
    char_end: int
    text: str


class UploadResponse(BaseModel):
    case_id: int
    raw_text: str
    chunks: list[Chunk]
    status: str


class ExtractionParty(BaseModel):
    name: str
    role: str


class ExtractionDirective(BaseModel):
    directive_text: str
    deadline_text: str | None = None
    priority: str = "medium"


class ExtractionStatute(BaseModel):
    type: str
    value: str
    act: str | None = None


class DecisionActionItem(BaseModel):
    task: str
    assigned_to: str
    deadline: str | None = None


class DecisionOutput(BaseModel):
    action_type: str
    compliance_required: bool
    appeal_recommended: bool
    priority: str
    responsible_authority: str
    deadline: str | None = None
    action_items: list[DecisionActionItem]
    risk_level: str
    legal_impact: str
    confidence_score: float
    requires_human_review: bool
    reasoning: str


class ActionPlanTask(BaseModel):
    step: int
    task: str
    assigned_to: str
    deadline: str | None = None
    status: str = "pending"


class ActionPlanOutput(BaseModel):
    department: str
    workflow_type: str
    tasks: list[ActionPlanTask]
    overall_deadline: str | None = None
    priority: str
    requires_coordination: bool


class ActionPlanReprocessRequest(BaseModel):
    repair_instruction: str


class FinalReviewRequest(BaseModel):
    action: Literal["edit", "reject"]
    feedback: str
    reprocess_stages: Optional[List[Literal["extractor", "reasoning", "action_plan"]]] = None
    edited_payload: Optional[Dict[str, Any]] = None


class FinalReviewResponse(BaseModel):
    case_id: int
    status: Literal["reprocessed", "edited", "error"]
    version: str
    data: Dict[str, Any]
    error: Optional[str] = None


class HumanReviewRequest(BaseModel):
    stage: Literal["extractor", "reasoning", "action_plan"]
    feedback: str
    type: Literal["edit", "reject"]


class ExtractionResultResponse(BaseModel):
    case_type: str | None = None
    case_number: str | None = None
    filing_year: str | None = None
    formatted_case_number: str | None = None
    court_name: str | None = None
    judgment_date: str | None = None
    parties: list[ExtractionParty] = []
    directives: list[ExtractionDirective] = []
    deadlines: list[str] = []
    cited_statutes: list[ExtractionStatute] = []
    summary: str | None = None
    confidence: dict[str, str] = {}
