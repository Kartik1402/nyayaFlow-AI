import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import CaseSummaryCard from '../components/CaseSummaryCard'
import ActionPlanTable from '../components/ActionPlanTable'
import AIRecommendationCard from '../components/AIRecommendationCard'
import ImpactAnalysisCard from '../components/ImpactAnalysisCard'
import ReviewControls from '../components/ReviewControls'
import RejectModal from '../components/RejectModal'
import { approveCase, fetchCase, submitFinalEdit, submitReprocess } from '../api'
import { CaseResponse, FinalReviewRequest } from '../types'

const DEFAULT_STAGES = ['extractor', 'reasoning', 'action_plan'] as const

type ExtractionParties = CaseResponse['extraction'] extends { parties?: infer P } ? P : unknown

type ExtractionPartyRole = 'petitioner' | 'respondent' | 'applicant' | 'unknown'

function formatParties(parties: ExtractionParties) {
  if (!parties) return 'Unknown parties'
  if (Array.isArray(parties)) {
    return parties
      .map((item) => (typeof item === 'string' ? item : item.name || item.role || 'Unknown'))
      .join(' • ')
  }
  return String(parties)
}

function findPartyName(parties: ExtractionParties, role: ExtractionPartyRole) {
  if (!parties || !Array.isArray(parties)) return ''
  const party = parties.find(
    (item) => typeof item !== 'string' && item.role?.toLowerCase() === role,
  ) as { name?: string } | undefined
  return party?.name || ''
}

function selectDeadline(caseData: CaseResponse | null) {
  if (!caseData) return 'TBD'
  const deadline = caseData.extraction?.deadlines?.[0]
  if (deadline) return deadline
  return caseData.reasoning?.deadline || caseData.action_plan?.overall_deadline || 'TBD'
}

export default function ReviewerDashboard() {
  const { id } = useParams<{ id: string }>()
  const caseId = Number(id)
  const navigate = useNavigate()
  const [selectedCase, setSelectedCase] = useState<CaseResponse | null>(null)
  const [draftCase, setDraftCase] = useState<CaseResponse | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [reprocessStages, setReprocessStages] = useState<Array<'extractor' | 'reasoning' | 'action_plan'>>([
    ...DEFAULT_STAGES,
  ])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const [approveLoading, setApproveLoading] = useState(false)
  const [rejectLoading, setRejectLoading] = useState(false)

  const mainStatus = useMemo(
    () => (editMode ? 'Editing' : selectedCase?.status || 'Loading'),
    [editMode, selectedCase],
  )

  const isApproved = selectedCase?.status === 'approved'

  useEffect(() => {
    if (!Number.isFinite(caseId) || caseId <= 0) {
      setError('Invalid case ID.')
      setLoading(false)
      return
    }

    setLoading(true)
    fetchCase(caseId)
      .then((data) => {
        setSelectedCase(data)
        setDraftCase(data)
      })
      .catch((err) => setError(err.message || 'Failed to load case.'))
      .finally(() => setLoading(false))
  }, [caseId])

  const getRecommendation = () => {
    const reasoning = draftCase?.reasoning || selectedCase?.reasoning
    return {
      actionType: reasoning?.action_type || 'Compliance',
      priority: reasoning?.priority || 'Medium',
      authority: reasoning?.responsible_authority || 'Court Registrar',
      deadline: reasoning?.deadline || selectDeadline(selectedCase),
      confidence: reasoning?.confidence_score ?? 0,
      complianceRequired: reasoning?.compliance_required ?? false,
      appealRecommended: reasoning?.appeal_recommended ?? false,
      reasoningText: reasoning?.reasoning || 'No reasoning summary available.',
    }
  }

  const getImpactData = () => {
    const reasoning = selectedCase?.reasoning
    return {
      riskLevel: reasoning?.risk_level || 'Medium',
      legalImpact: reasoning?.legal_impact || 'Moderate',
      workflowType: selectedCase?.action_plan?.workflow_type || 'Standard',
      department: selectedCase?.action_plan?.department || 'Operations',
      requiresCoordination: selectedCase?.action_plan?.requires_coordination ?? false,
      finalDeadline: selectedCase?.action_plan?.overall_deadline || selectDeadline(selectedCase),
    }
  }

  const handleStartEdit = () => {
    if (selectedCase) {
      setDraftCase(selectedCase)
      setEditMode(true)
    }
  }

  const handleSaveChanges = async () => {
    if (!selectedCase || !draftCase) return
    setSaveLoading(true)

    const editedPayload: FinalReviewRequest = {
      action: 'edit',
      feedback: 'Manual UI edit',
      edited_payload: {
        reasoning: {
          ...selectedCase.reasoning,
          responsible_authority: draftCase.reasoning?.responsible_authority,
          deadline: draftCase.reasoning?.deadline,
          priority: draftCase.reasoning?.priority,
        },
        action_plan: {
          ...selectedCase.action_plan,
          tasks: draftCase.action_plan?.tasks,
        },
      },
    }

    try {
      await submitFinalEdit(selectedCase.id, editedPayload)
      const refreshed = await fetchCase(selectedCase.id)
      setSelectedCase(refreshed)
      setDraftCase(refreshed)
      setEditMode(false)
    } catch (err: any) {
      setError(err?.message || 'Failed to save changes.')
    } finally {
      setSaveLoading(false)
    }
  }

  const handleApprove = async () => {
    if (!selectedCase) return
    if (!window.confirm('Are you sure you want to approve this case? This action cannot be undone.')) {
      return
    }
    setApproveLoading(true)
    try {
      await approveCase(selectedCase.id)
      const refreshed = await fetchCase(selectedCase.id)
      setSelectedCase(refreshed)
      setEditMode(false)
    } catch (err: any) {
      setError(err?.message || 'Failed to approve case.')
    } finally {
      setApproveLoading(false)
    }
  }

  const handleReject = () => {
    setRejectOpen(true)
  }

  const handleSubmitReject = async () => {
    if (!selectedCase) return
    setRejectLoading(true)
    const payload: FinalReviewRequest = {
      action: 'reject',
      feedback,
      reprocess_stages: reprocessStages,
    }
    try {
      await submitReprocess(selectedCase.id, payload)
      const refreshed = await fetchCase(selectedCase.id)
      setSelectedCase(refreshed)
      setRejectOpen(false)
      setFeedback('')
    } catch (err: any) {
      setError(err?.message || 'Failed to reject/reprocess case.')
    } finally {
      setRejectLoading(false)
    }
  }

  const handleDraftChange = (
    field: 'responsible_authority' | 'deadline' | 'priority',
    value: string,
  ) => {
    setDraftCase((prev) => {
      if (!prev || !prev.reasoning) return prev
      return {
        ...prev,
        reasoning: {
          ...prev.reasoning,
          [field]: value,
        },
      }
    })
  }

  const handleTaskUpdate = (
    index: number,
    field: 'task' | 'assigned_to' | 'deadline' | 'status',
    value: string,
  ) => {
    setDraftCase((prev) => {
      if (!prev || !prev.action_plan?.tasks) return prev
      const tasks = prev.action_plan.tasks.map((item, taskIndex) =>
        taskIndex === index ? { ...item, [field]: value } : item,
      )
      return {
        ...prev,
        action_plan: {
          ...prev.action_plan,
          tasks,
        },
      }
    })
  }

  const handleAddStep = () => {
    setDraftCase((prev) => {
      if (!prev) return prev
      const tasks = prev.action_plan?.tasks || []
      return {
        ...prev,
        action_plan: {
          ...prev.action_plan,
          tasks: [
            ...tasks,
            {
              step: tasks.length + 1,
              task: 'New action step',
              assigned_to: 'Unassigned',
              deadline: 'TBD',
              status: 'Pending',
            },
          ],
        },
      }
    })
  }

  const actionPlan = editMode ? draftCase?.action_plan?.tasks || [] : selectedCase?.action_plan?.tasks || []
  const recommendation = getRecommendation()
  const impactData = getImpactData()

  if (loading) {
    return (
      <div className="min-h-screen bg-surface text-slate-900">
        <div className="flex min-h-screen">
          <Sidebar onAddCase={() => navigate('/cases')} />
          <div className="flex-1 p-6 lg:p-8">
            <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">Loading case details...</div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !selectedCase) {
    return (
      <div className="min-h-screen bg-surface text-slate-900">
        <div className="flex min-h-screen">
          <Sidebar onAddCase={() => navigate('/cases')} />
          <div className="flex-1 p-6 lg:p-8">
            <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
              <p className="text-red-600">{error || 'Case not found.'}</p>
              <button
                type="button"
                onClick={() => navigate('/cases')}
                className="mt-4 rounded-3xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Back to All Cases
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar onAddCase={() => navigate('/cases')} />
        <div className="flex-1 p-6 lg:p-8">
          <Header
            caseId={selectedCase.extraction?.formatted_case_number || selectedCase.extraction?.case_number || `#${selectedCase.id}`}
            version={`V${selectedCase.version}`}
            status={mainStatus}
            pipeline={['Extractor', 'Reasoning', 'Action Plan']}
          />

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_0.95fr]">
            <div className="space-y-6">
              <CaseSummaryCard
                caseNumber={
                  selectedCase.extraction?.case_number && selectedCase.extraction?.filing_year
                    ? `${selectedCase.extraction.case_number}/${selectedCase.extraction.filing_year}`
                    : selectedCase.extraction?.case_number || `#${selectedCase.id}`
                }
                caseType={selectedCase.extraction?.case_type}
                formattedCaseNumber={selectedCase.extraction?.formatted_case_number}
                courtName={selectedCase.extraction?.court_name || selectedCase.title || 'Unknown'}
                judgmentDate={selectedCase.extraction?.judgment_date || 'Unknown date'}
                petitioner={findPartyName(selectedCase.extraction?.parties, 'petitioner')}
                respondent={findPartyName(selectedCase.extraction?.parties, 'respondent')}
                parties={formatParties(selectedCase.extraction?.parties)}
                summary={selectedCase.extraction?.summary || 'No judgment summary available.'}
                criticalDeadline={selectDeadline(selectedCase)}
                directives={selectedCase.extraction?.directives || []}
                citedStatutes={selectedCase.extraction?.cited_statutes || []}
              />

              <ActionPlanTable
                actionPlan={actionPlan}
                editable={editMode}
                onTaskChange={handleTaskUpdate}
                onAddStep={handleAddStep}
              />
            </div>

            <div className="space-y-6">
              <AIRecommendationCard
                recommendation={recommendation}
                editable={editMode}
                onChange={handleDraftChange}
              />
              <ImpactAnalysisCard analysis={impactData} />
            </div>
          </div>
        </div>
      </div>

      {isApproved ? null : (
        <ReviewControls
          editMode={editMode}
          onEdit={handleStartEdit}
          onSave={handleSaveChanges}
          onApprove={handleApprove}
          onReject={handleReject}
          saveLoading={saveLoading}
          approveLoading={approveLoading}
          rejectLoading={rejectLoading}
        />
      )}

      <RejectModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        stages={reprocessStages}
        feedback={feedback}
        onStageChange={setReprocessStages}
        onFeedbackChange={setFeedback}
        onSubmit={handleSubmitReject}
        submitting={rejectLoading}
      />
    </div>
  )
}
