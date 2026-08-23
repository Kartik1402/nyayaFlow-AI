export interface CaseResponse {
  id: number
  title: string
  status: string
  version: number
  created_at: string
  updated_at: string
  raw_text?: string
  chunks?: Array<{ chunk_id?: string; chunk_index?: number; page_number?: number; char_start?: number; char_end?: number; text?: string }>
  extraction?: ExtractionResult
  reasoning?: DecisionOutput
  action_plan?: ActionPlanOutput
  explanation?: Record<string, any>
  review?: Record<string, any>
  run_history?: Array<Record<string, any>>
}

export interface ExtractionDirective {
  directive_text?: string
  text?: string
  deadline_text?: string | null
  priority?: string
}

export interface ExtractionStatute {
  type?: string
  value?: string
  act?: string | null
}

export type StatuteItem = string | ExtractionStatute

export interface ExtractionResult {
  case_type?: string
  case_number?: string
  filing_year?: string
  formatted_case_number?: string
  court_name?: string
  judgment_date?: string
  parties?: Array<string | { name?: string; role?: string }>
  directives?: ExtractionDirective[]
  deadlines?: string[]
  cited_statutes?: StatuteItem[]
  summary?: string
  confidence?: Record<string, string>
  confidence_scores?: Record<string, string>
}

export interface DecisionActionItem {
  step?: number
  task: string
  assigned_to: string
  deadline?: string | null
  status: string
}

export interface DecisionOutput {
  action_type: string
  compliance_required: boolean
  appeal_recommended: boolean
  priority: string
  responsible_authority: string
  deadline?: string | null
  action_items: DecisionActionItem[]
  risk_level: string
  legal_impact: string
  confidence_score: number
  requires_human_review: boolean
  reasoning: string
}

export interface ActionPlanTask {
  step: number
  task: string
  assigned_to: string
  deadline?: string | null
  status: string
}

export interface ActionPlanOutput {
  department?: string
  workflow_type?: string
  tasks: ActionPlanTask[]
  overall_deadline?: string | null
  priority?: string
  requires_coordination?: boolean
}

export interface ReviewRequest {
  action: 'approve' | 'reject' | 'edit'
  reviewer_comment?: string
  rejection_type?: 'extraction' | 'reasoning' | 'action_plan'
  edited_payload?: Record<string, any>
}

export interface FinalReviewRequest {
  action: 'edit' | 'reject'
  feedback: string
  reprocess_stages?: Array<'extractor' | 'reasoning' | 'action_plan'>
  edited_payload?: Record<string, any>
}

export interface FinalReviewResponse {
  case_id: number
  status: 'reprocessed' | 'edited' | 'error'
  version: string
  data: Record<string, any>
  error?: string | null
}

export interface BulkPreviewRequest {
  action: 'approve'
  case_ids: number[]
}

export interface BulkPreviewItem {
  case_id: number
  case_number?: string | null
  title: string
}

export interface BulkPreviewIneligibleItem {
  case_id: number
  case_number?: string | null
  title: string
  reason: string
}

export interface BulkPreviewResponse {
  action: string
  total_selected: number
  eligible_count: number
  ineligible_count: number
  eligible: BulkPreviewItem[]
  ineligible: BulkPreviewIneligibleItem[]
}

export interface BulkExecuteRequest {
  action: 'approve'
  case_ids: number[]
}

export interface BulkExecuteItem {
  case_id: number
  case_number?: string | null
  title: string
  status: string
  success: boolean
  reason?: string | null
}

export interface BulkExecuteResponse {
  action: string
  total_requested: number
  successful_count: number
  skipped_count: number
  failed_count: number
  results: BulkExecuteItem[]
}


