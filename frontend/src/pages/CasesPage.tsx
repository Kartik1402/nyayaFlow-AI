import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import UploadModal from '../components/UploadModal'
import { CaseResponse } from '../types'
import { deleteCase, fetchCases, uploadAndProcessCase, previewBulkApprove, executeBulkApprove } from '../api'

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'Processing', label: 'Processing' },
  { value: 'Ready for Review', label: 'Ready for Review' },
  { value: 'Verified', label: 'Verified' },
  { value: 'Reprocessed', label: 'Reprocessed' },
]

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priority' },
  { value: 'High', label: 'High' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Low', label: 'Low' },
]

const SORT_OPTIONS = [
  { value: 'deadline', label: 'Deadline' },
  { value: 'priority', label: 'Priority' },
  { value: 'case_number', label: 'Case ID' },
]

const PAGE_SIZE = 6

type ExtractionParties = CaseResponse['extraction'] extends { parties?: infer P } ? P : unknown

function formatParties(parties: ExtractionParties) {
  if (!parties) return 'Unknown parties'
  if (Array.isArray(parties)) {
    return parties
      .map((item) => (typeof item === 'string' ? item : item.name || item.role || 'Unknown'))
      .join(' • ')
  }
  return String(parties)
}

function selectDeadline(caseData: CaseResponse) {
  const deadline = caseData.extraction?.deadlines?.[0]
  if (deadline) return deadline
  return caseData.reasoning?.deadline || caseData.action_plan?.overall_deadline || ''
}

function getMappedCaseStatus(rawStatus?: string) {
  const status = rawStatus?.toLowerCase().trim()
  if (!status) return undefined
  if (status === 'processing' || status === 'pending' || status === 'draft') return 'Processing'
  if (['pending_review', 'processed', 'needs_manual_review', 'ready_for_review', 'ready for review'].includes(status)) return 'Ready for Review'
  if (status === 'approved' || status === 'verified') return 'Verified'
  if (['rejected', 'reprocessed'].includes(status)) return 'Reprocessed'
  return undefined
}

function normalizePriority(priority?: string) {
  if (!priority) return 'Medium'
  const value = priority.trim().toLowerCase()
  if (value === 'high') return 'High'
  if (value === 'low') return 'Low'
  return 'Medium'
}

function getSearchablePartyNames(parties: ExtractionParties) {
  if (!parties) return ''
  if (Array.isArray(parties)) {
    return parties
      .map((item) => (typeof item === 'string' ? item : item.name || item.role || ''))
      .filter(Boolean)
      .join(' ')
  }
  return String(parties)
}

function getStatusTagStyles(status: string) {
  switch (status) {
    case 'Processing':
      return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
    case 'Ready for Review':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    case 'Verified':
      return 'bg-limeaccent/10 text-limeaccent border-limeaccent/20 shadow-lime'
    case 'Reprocessed':
      return 'bg-red-500/10 text-red-400 border-red-500/20'
    default:
      return 'bg-slateface text-slate-300 border-slateface'
  }
}

function isLegalCaseHeading(title: string) {
  const normalized = title.toLowerCase()
  const headingKeywords = ['writ', 'civil', 'criminal', 'no.', 'no -', 'no -', 'no', 'case', 'petition', 'appellate']
  const hasHeading = headingKeywords.some((keyword) => normalized.includes(keyword))
  const hasNumber = /\d{3,}/.test(title)
  return hasHeading && hasNumber
}

function getDisplayTitle(caseData: CaseResponse) {
  const caseNumber = caseData.extraction?.case_number
  const title = caseData.title?.trim() || ''
  if (caseNumber && isLegalCaseHeading(title)) {
    return `Case ${caseNumber}`
  }
  if (!title || title.match(/\.(pdf|docx?|txt)$/i)) {
    return caseNumber ? `Case ${caseNumber}` : `Case #${caseData.id}`
  }
  return title
}

function getPriorityLabel(priority?: string) {
  if (!priority) return 'Medium'
  return priority
}

function priorityTagStyles(priority?: string) {
  switch (priority) {
    case 'High':
      return 'bg-red-500/10 text-red-400 border-red-500/20'
    case 'Medium':
      return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
    case 'Low':
      return 'bg-slateface text-slate-300 border-slateface'
    default:
      return 'bg-slateface text-slate-400 border-slateface'
  }
}

export default function CasesPage() {
  const [cases, setCases] = useState<CaseResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [sortBy, setSortBy] = useState('deadline')
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [deletingCaseId, setDeletingCaseId] = useState<number | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadInProgress, setUploadInProgress] = useState(false)
  
  // Bulk Action States
  const [selectedCaseIds, setSelectedCaseIds] = useState<number[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewResponse, setPreviewResponse] = useState<import('../types').BulkPreviewResponse | null>(null)
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  
  const [executeLoading, setExecuteLoading] = useState(false)
  const [executeResponse, setExecuteResponse] = useState<import('../types').BulkExecuteResponse | null>(null)
  const [executeError, setExecuteError] = useState<string | null>(null)
  const [showResultState, setShowResultState] = useState(false)

  const navigate = useNavigate()

  const toggleSelectCase = (caseId: number) => {
    setSelectedCaseIds((prev) =>
      prev.includes(caseId) ? prev.filter((id) => id !== caseId) : [...prev, caseId]
    )
  }

  const handleApproveSelected = async () => {
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const response = await previewBulkApprove(selectedCaseIds)
      setPreviewResponse(response)
      setConfirmModalOpen(true)
    } catch (err: any) {
      const errMsg = err?.message || 'Unable to check the selected cases. Please try again.'
      setPreviewError(errMsg)
      window.alert(errMsg)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleConfirmApprove = async () => {
    if (!previewResponse || executeLoading) return
    setExecuteLoading(true)
    setExecuteError(null)
    try {
      const response = await executeBulkApprove(selectedCaseIds)
      setExecuteResponse(response)
      setShowResultState(true)
      
      const successfulIds = response.results.filter(r => r.success).map(r => r.case_id)
      setSelectedCaseIds(prev => prev.filter(id => !successfulIds.includes(id)))
      
      const freshCases = await fetchCases()
      setCases(freshCases)
    } catch (err: any) {
      setExecuteError(err?.message || 'Bulk approval could not be completed. Please try again.')
    } finally {
      setExecuteLoading(false)
    }
  }


  useEffect(() => {
    fetchCases()
      .then((data) => setCases(data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filteredCases = useMemo(() => {
    return cases
      .map((item) => ({
        ...item,
        mappedStatus: getMappedCaseStatus(item.status),
        normalizedPriority: normalizePriority(item.reasoning?.priority || item.action_plan?.priority),
        searchableParties: getSearchablePartyNames(item.extraction?.parties),
      }))
      .filter((item) => {
        if (!item.mappedStatus) return false

        const matchesStatus = filterStatus ? item.mappedStatus === filterStatus : true
        const matchesPriority = filterPriority ? item.normalizedPriority === filterPriority : true
        const normalizedSearch = searchTerm.trim().toLowerCase()
        const matchesSearch = normalizedSearch
          ? [
              getDisplayTitle(item),
              item.extraction?.case_number || '',
              item.extraction?.court_name || '',
              item.searchableParties || '',
            ]
              .join(' ')
              .toLowerCase()
              .includes(normalizedSearch)
          : true
        return matchesStatus && matchesPriority && matchesSearch
      })
      .sort((a, b) => {
        if (sortBy === 'deadline') {
          const dateA = new Date(selectDeadline(a)).getTime() || 0
          const dateB = new Date(selectDeadline(b)).getTime() || 0
          return dateA - dateB
        }
        if (sortBy === 'priority') {
          const priorityOrder = { High: 0, Medium: 1, Low: 2 }
          const priorityA = a.normalizedPriority
          const priorityB = b.normalizedPriority
          return (priorityOrder[priorityA as keyof typeof priorityOrder] ?? 1) -
            (priorityOrder[priorityB as keyof typeof priorityOrder] ?? 1)
        }
        if (sortBy === 'case_number') {
          const caseA = a.extraction?.formatted_case_number || a.extraction?.case_number || String(a.id)
          const caseB = b.extraction?.formatted_case_number || b.extraction?.case_number || String(b.id)
          return caseA.localeCompare(caseB, undefined, { numeric: true, sensitivity: 'base' })
        }
        return 0
      })
  }, [cases, filterStatus, filterPriority, searchTerm, sortBy])

  const pageCount = Math.max(1, Math.ceil(filteredCases.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount)
    }
  }, [page, pageCount])

  const visibleCases = filteredCases.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const visibleCaseIds = visibleCases.map((c) => c.id)


  async function handleUpload(file: File) {
    setUploadError('')
    setUploadInProgress(true)
    try {
      const processedCase = await uploadAndProcessCase(file)
      setUploadOpen(false)
      navigate(`/cases/${processedCase.id}`)
    } catch (error: any) {
      setUploadError(error?.message || 'Processing failed. Please try again.')
      throw error
    } finally {
      setUploadInProgress(false)
    }
  }

  async function handleDelete(caseId: number) {
    const confirmed = window.confirm('Remove this case from the system? This action cannot be undone.')
    if (!confirmed) return
    setDeletingCaseId(caseId)
    try {
      await deleteCase(caseId)
      setCases((prev) => prev.filter((item) => item.id !== caseId))
    } catch (error) {
      console.error('Failed to delete case', error)
      window.alert('Unable to remove the case right now. Please try again.')
    } finally {
      setDeletingCaseId(null)
    }
  }

  return (
    <div className="min-h-screen bg-darkbg text-slate-100">
      <div className="flex min-h-screen">
        <Sidebar onAddCase={() => setUploadOpen(true)} />
        <div className="flex-1 p-6 lg:p-8">
          <div className="mt-6 rounded-2xl border border-slateface bg-graphite p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8 border-b border-slateface pb-6">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 font-display">Intelligence Queue</p>
                <h1 className="mt-2 text-2xl font-bold font-display text-white">All Intake Cases</h1>
                <p className="mt-2.5 max-w-2xl text-xs text-slate-400">
                  Review and manage AI-processed legal cases and verify actions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUploadOpen(true)}
                className="inline-flex items-center justify-center rounded-lg bg-limeaccent px-5 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-limehover shadow-lime"
              >
                Add Case Files
              </button>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-[1.8fr_1fr]">
              <div className="rounded-xl border border-slateface bg-darkbg px-4 py-3.5">
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 block mb-2">Search case file or party</label>
                <input
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value)
                    setPage(1)
                  }}
                  placeholder="Search case title, number, or litigants..."
                  className="w-full rounded-lg border border-slateface bg-graphite px-4 py-2.5 text-xs text-slate-200 outline-none focus:border-limeaccent/30"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="min-w-0 rounded-xl border border-slateface bg-darkbg px-4 py-3.5">
                  <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 block mb-2">Status</label>
                  <select
                    value={filterStatus}
                    onChange={(event) => {
                      setFilterStatus(event.target.value)
                      setPage(1)
                    }}
                    className="w-full rounded-lg border border-slateface bg-graphite px-3 py-2.5 text-xs text-slate-200 outline-none focus:border-limeaccent/30"
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0 rounded-xl border border-slateface bg-darkbg px-4 py-3.5">
                  <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 block mb-2">Priority</label>
                  <select
                    value={filterPriority}
                    onChange={(event) => {
                      setFilterPriority(event.target.value)
                      setPage(1)
                    }}
                    className="w-full rounded-lg border border-slateface bg-graphite px-3 py-2.5 text-xs text-slate-200 outline-none focus:border-limeaccent/30"
                  >
                    {PRIORITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0 rounded-xl border border-slateface bg-darkbg px-4 py-3.5">
                  <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 block mb-2">Sort by</label>
                  <select
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value)}
                    className="w-full rounded-lg border border-slateface bg-graphite px-3 py-2.5 text-xs text-slate-200 outline-none focus:border-limeaccent/30"
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <UploadModal
            open={uploadOpen}
            onClose={() => setUploadOpen(false)}
            onUpload={handleUpload}
          />

          {/* Select All Visible toggle bar */}
          {!loading && visibleCases.length > 0 && (
            <div className="mt-6 flex items-center justify-between bg-darkbg border border-slateface rounded-xl px-4 py-3 shadow-sm">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={visibleCaseIds.length > 0 && visibleCaseIds.every((id) => selectedCaseIds.includes(id))}
                  onChange={() => {
                    const allSel = visibleCaseIds.length > 0 && visibleCaseIds.every((id) => selectedCaseIds.includes(id));
                    if (allSel) {
                      setSelectedCaseIds((prev) => prev.filter((id) => !visibleCaseIds.includes(id)));
                    } else {
                      setSelectedCaseIds((prev) => Array.from(new Set([...prev, ...visibleCaseIds])));
                    }
                  }}
                  className="h-4 w-4 rounded border-slate-700 bg-darkbg text-limeaccent focus:ring-limeaccent/30 outline-none cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-300">Select All Visible ({visibleCases.length})</span>
              </label>
              {selectedCaseIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedCaseIds([])}
                  className="text-xs font-bold text-red-400 hover:text-red-300 transition"
                >
                  Clear All ({selectedCaseIds.length})
                </button>
              )}
            </div>
          )}

          {/* Bulk Action Toolbar */}
          {selectedCaseIds.length > 0 && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 flex items-center justify-between gap-6 rounded-2xl border border-limeaccent/30 bg-graphite/95 backdrop-blur px-6 py-4 shadow-2xl animate-fade-in-up">
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-limeaccent animate-pulse" />
                <span className="text-sm font-semibold text-slate-200 font-display">
                  {selectedCaseIds.length} {selectedCaseIds.length === 1 ? 'case' : 'cases'} selected
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedCaseIds([])}
                  className="rounded-lg border border-slateface bg-darkbg px-4 py-2 text-xs font-bold text-slate-400 transition hover:bg-slateface hover:text-slate-200"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleApproveSelected}
                  disabled={previewLoading}
                  className="inline-flex items-center justify-center rounded-lg bg-limeaccent px-5 py-2 text-xs font-bold text-slate-950 transition hover:bg-limehover shadow-lime disabled:opacity-50"
                >
                  {previewLoading ? 'Checking...' : 'Approve Selected'}
                </button>
              </div>
            </div>
          )}

          {/* Confirmation / Execution Result Modal */}
          {confirmModalOpen && (previewResponse || executeLoading || executeError || showResultState) && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
              <div className="relative w-full max-w-2xl rounded-2xl border border-slateface bg-graphite p-6 shadow-2xl flex flex-col max-h-[85vh] animate-scale-up">
                
                {/* 1. Loading State */}
                {executeLoading && (
                  <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border-4 border-slateface border-t-limeaccent animate-spin" />
                    <p className="text-sm font-semibold text-slate-200">Approving selected cases...</p>
                    <p className="text-xs text-slate-400">Please do not close this window or refresh the page.</p>
                  </div>
                )}

                {/* 2. Execute Error State */}
                {!executeLoading && executeError && (
                  <div className="flex flex-col space-y-4">
                    <div className="border-b border-slateface pb-4">
                      <h2 className="text-xl font-bold font-display text-red-400">Bulk Execution Failed</h2>
                    </div>
                    <div className="py-4 text-sm text-slate-300">
                      {executeError}
                    </div>
                    <div className="border-t border-slateface pt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmModalOpen(false);
                          setExecuteError(null);
                        }}
                        className="rounded-lg bg-slate-700 px-5 py-2.5 text-xs font-bold text-slate-300 transition hover:bg-slate-600"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. Result Summary State */}
                {!executeLoading && !executeError && showResultState && executeResponse && (
                  <div className="flex flex-col flex-1 overflow-hidden">
                    {/* Header */}
                    <div className="border-b border-slateface pb-4">
                      <h2 className="text-xl font-bold font-display text-white">Bulk Approval Completed</h2>
                      <p className="mt-1 text-xs text-slate-400">
                        Batch operations have finished execution. Here is the summary:
                      </p>
                    </div>

                    {/* Stats */}
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-darkbg p-3 border border-limeaccent/10 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Approved</p>
                        <p className="mt-1 text-lg font-bold text-limeaccent">{executeResponse.successful_count}</p>
                      </div>
                      <div className="rounded-lg bg-darkbg p-3 border border-red-500/10 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Skipped / Failed</p>
                        <p className="mt-1 text-lg font-bold text-red-400">{executeResponse.skipped_count + executeResponse.failed_count}</p>
                      </div>
                    </div>

                    {/* Scrollable Lists */}
                    <div className="mt-6 flex-1 overflow-y-auto space-y-6 pr-2">
                      {executeResponse.successful_count > 0 && (
                        <div>
                          <h3 className="text-xs font-bold uppercase tracking-wider text-limeaccent mb-2">Approved Cases</h3>
                          <ul className="space-y-2">
                            {executeResponse.results.filter(r => r.success).map((item) => (
                              <li key={item.case_id} className="flex items-start gap-2 text-xs text-slate-300 bg-darkbg/40 p-2 rounded border border-slateface/40">
                                <span className="text-limeaccent font-bold">✓</span>
                                <div>
                                  <span className="font-semibold text-slate-200">
                                    {item.case_number || `Case #${item.case_id}`}
                                  </span>
                                  {item.title && item.title !== item.case_number && (
                                    <span className="ml-2 text-slate-400">({item.title})</span>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {(executeResponse.skipped_count > 0 || executeResponse.failed_count > 0) && (
                        <div>
                          <h3 className="text-xs font-bold uppercase tracking-wider text-red-400 mb-2">Skipped / Failed</h3>
                          <ul className="space-y-2">
                            {executeResponse.results.filter(r => !r.success).map((item) => (
                              <li key={item.case_id} className="flex items-start gap-2 text-xs text-slate-300 bg-darkbg/40 p-2 rounded border border-red-500/10">
                                <span className="text-red-400 font-bold">⚠</span>
                                <div className="flex-1">
                                  <div>
                                    <span className="font-semibold text-slate-200">
                                      {item.case_number || `Case #${item.case_id}`}
                                    </span>
                                    {item.title && item.title !== item.case_number && (
                                      <span className="ml-2 text-slate-400">({item.title})</span>
                                    )}
                                  </div>
                                  <p className="mt-1 text-[11px] font-medium text-red-400">{item.reason}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="mt-6 border-t border-slateface pt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmModalOpen(false);
                          setShowResultState(false);
                          setExecuteResponse(null);
                        }}
                        className="rounded-lg bg-limeaccent px-5 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-limehover shadow-lime"
                      >
                        Return to Cases
                      </button>
                    </div>
                  </div>
                )}

                {/* 4. Normal Confirmation Mode */}
                {!executeLoading && !executeError && !showResultState && previewResponse && (
                  <div className="flex flex-col flex-1 overflow-hidden">
                    {/* Header */}
                    <div className="border-b border-slateface pb-4">
                      <h2 className="text-xl font-bold font-display text-white">Confirm Bulk Approval</h2>
                      <p className="mt-1 text-xs text-slate-400">
                        Review case eligibility check from the security validator.
                      </p>
                    </div>

                    {/* Stats Summary */}
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <div className="rounded-lg bg-darkbg p-3 border border-slateface text-center">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Selected</p>
                        <p className="mt-1 text-lg font-bold text-slate-200">{previewResponse.total_selected}</p>
                      </div>
                      <div className="rounded-lg bg-darkbg p-3 border border-limeaccent/10 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-limeaccent/60">Eligible</p>
                        <p className="mt-1 text-lg font-bold text-limeaccent">{previewResponse.eligible_count}</p>
                      </div>
                      <div className="rounded-lg bg-darkbg p-3 border border-red-500/10 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-red-400/60">Skipped</p>
                        <p className="mt-1 text-lg font-bold text-red-400">{previewResponse.ineligible_count}</p>
                      </div>
                    </div>

                    {/* Content Lists */}
                    <div className="mt-6 flex-1 overflow-y-auto space-y-6 pr-2">
                      {previewResponse.eligible_count > 0 && (
                        <div>
                          <h3 className="text-xs font-bold uppercase tracking-wider text-limeaccent mb-2">Eligible for Approval</h3>
                          <ul className="space-y-2">
                            {previewResponse.eligible.map((item) => (
                              <li key={item.case_id} className="flex items-start gap-2 text-xs text-slate-300 bg-darkbg/40 p-2 rounded border border-slateface/40">
                                <span className="text-limeaccent font-bold">✓</span>
                                <div>
                                  <span className="font-semibold text-slate-200">
                                    {item.case_number || `Case #${item.case_id}`}
                                  </span>
                                  {item.title && item.title !== item.case_number && (
                                    <span className="ml-2 text-slate-400">({item.title})</span>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {previewResponse.ineligible_count > 0 && (
                        <div>
                          <h3 className="text-xs font-bold uppercase tracking-wider text-red-400 mb-2">Will be Skipped</h3>
                          <ul className="space-y-2">
                            {previewResponse.ineligible.map((item) => (
                              <li key={item.case_id} className="flex items-start gap-2 text-xs text-slate-300 bg-darkbg/40 p-2 rounded border border-red-500/10">
                                <span className="text-red-400 font-bold">⚠</span>
                                <div className="flex-1">
                                  <div>
                                    <span className="font-semibold text-slate-200">
                                      {item.case_number || `Case #${item.case_id}`}
                                    </span>
                                    {item.title && item.title !== item.case_number && (
                                      <span className="ml-2 text-slate-400">({item.title})</span>
                                    )}
                                  </div>
                                  <p className="mt-1 text-[11px] font-medium text-red-400">{item.reason}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Footer / Buttons */}
                    <div className="mt-6 border-t border-slateface pt-4 flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setConfirmModalOpen(false)}
                        className="rounded-lg border border-slateface bg-darkbg px-5 py-2.5 text-xs font-bold text-slate-300 transition hover:bg-slateface"
                      >
                        Cancel
                      </button>
                      {previewResponse.eligible_count > 0 ? (
                        <button
                          type="button"
                          onClick={handleConfirmApprove}
                          className="rounded-lg bg-limeaccent px-5 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-limehover shadow-lime"
                        >
                          Approve {previewResponse.eligible_count} {previewResponse.eligible_count === 1 ? 'Case' : 'Cases'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="rounded-lg bg-slate-700 px-5 py-2.5 text-xs font-bold text-slate-500 cursor-not-allowed"
                        >
                          Approve 0 Cases
                        </button>
                      )}
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            {loading ? (
              <div className="col-span-full rounded-2xl border border-slateface bg-graphite p-8 text-center text-slate-400 shadow-sm">
                Loading database logs...
              </div>
            ) : (
              visibleCases.map((caseItem) => {
                const mappedStatus = getMappedCaseStatus(caseItem.status) || 'Processing'
                const isProcessing = mappedStatus === 'Processing'
                const priority = normalizePriority(caseItem.reasoning?.priority || caseItem.action_plan?.priority)
                const normalizedCaseNumber = caseItem.extraction?.formatted_case_number || (caseItem.extraction?.case_number && caseItem.extraction?.filing_year ? `${caseItem.extraction.case_number}/${caseItem.extraction.filing_year}` : caseItem.extraction?.case_number)
                const headerTitle = normalizedCaseNumber ? `Case ${normalizedCaseNumber}` : `Case #${caseItem.id}`
                const titleText = getDisplayTitle(caseItem)
                const showSubtitle = titleText !== headerTitle && titleText !== `Case #${caseItem.id}` && !!caseItem.title
                const courtName = caseItem.extraction?.court_name
                const summary = caseItem.extraction?.summary
                const deadlineText = selectDeadline(caseItem)
                const confidenceScore = caseItem.reasoning?.confidence_score
                const hasDeadline = Boolean(deadlineText)
                const hasConfidence = confidenceScore != null && confidenceScore > 0

                return (
                  <div
                    key={caseItem.id}
                    className="group rounded-2xl border border-slateface bg-graphite p-5 shadow-sm transition hover:border-limeaccent/35 hover:-translate-y-0.5 cursor-pointer flex flex-col justify-between"
                    onClick={() => navigate(`/cases/${caseItem.id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        navigate(`/cases/${caseItem.id}`)
                      }
                    }}
                  >
                    <div>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slateface/60 pb-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedCaseIds.includes(caseItem.id)}
                            onChange={(e) => {
                              e.stopPropagation()
                              toggleSelectCase(caseItem.id)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 rounded border-slate-700 bg-darkbg text-limeaccent focus:ring-limeaccent/30 outline-none cursor-pointer"
                          />
                          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 font-display">
                            {caseItem.extraction?.case_number ? `No. ${caseItem.extraction.case_number}` : `Case #${caseItem.id}`}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${getStatusTagStyles(mappedStatus)}`}>
                            {mappedStatus}
                          </span>
                          <span className={`rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${priorityTagStyles(priority)}`}>
                            {getPriorityLabel(priority)}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 flex items-start justify-between gap-4">
                        <div>
                          <h2 className="text-base font-bold font-display text-white">{headerTitle}</h2>
                          {showSubtitle ? (
                            <p className="mt-1.5 text-xs text-slate-400 line-clamp-2 leading-relaxed">{caseItem.title}</p>
                          ) : courtName ? (
                            <p className="mt-1.5 text-xs text-slate-400 line-clamp-2 leading-relaxed">{courtName}</p>
                          ) : null}
                        </div>
                      </div>

                      {isProcessing ? (
                        <div className="mt-5 rounded-lg border border-slateface bg-darkbg p-4 flex items-center justify-center gap-3 text-xs text-slate-400">
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border-2 border-slateface border-t-limeaccent animate-spin" />
                          Running analysis agents...
                        </div>
                      ) : (
                        <>
                          {summary ? (
                            <p className="mt-4 line-clamp-3 text-xs leading-relaxed text-slate-400">{summary}</p>
                          ) : null}

                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {hasDeadline ? (
                              <div className="rounded-lg bg-darkbg p-3 border border-slateface">
                                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Action Deadline</p>
                                <p className="mt-1 text-xs font-semibold text-slate-300">{deadlineText}</p>
                              </div>
                            ) : null}
                            {hasConfidence ? (
                              <div className="rounded-lg bg-darkbg p-3 border border-slateface">
                                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">AI Confidence</p>
                                <p className="mt-1 text-xs font-semibold text-slate-300">{(confidenceScore * 100).toFixed(0)}% Match</p>
                              </div>
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slateface/40 pt-4">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          navigate(`/cases/${caseItem.id}`)
                        }}
                        className="inline-flex rounded-lg bg-limeaccent px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-limehover shadow-lime"
                      >
                        Open Case
                      </button>
                      <button
                        type="button"
                        disabled={
                          deletingCaseId === caseItem.id || caseItem.status === 'approved'
                        }
                        onClick={(event) => {
                          event.stopPropagation()
                          handleDelete(caseItem.id)
                        }}
                        className={`inline-flex rounded-lg border px-4 py-2 text-xs font-bold transition ${
                          caseItem.status === 'approved'
                            ? 'border-slateface bg-darkbg text-slate-600 cursor-not-allowed'
                            : 'border-red-500/25 bg-darkbg text-red-400 hover:bg-red-500/10'
                        }`}
                      >
                        {caseItem.status === 'approved'
                          ? 'Verified'
                          : deletingCaseId === caseItem.id
                          ? 'Removing...'
                          : 'Remove'}
                      </button>
                    </div>
                  </div>
                )
              })
            )}

            {!loading && visibleCases.length < PAGE_SIZE ? (
              <div className="rounded-2xl border-dashed border border-slateface bg-darkbg p-8 text-center text-slate-500 shadow-sm flex flex-col items-center justify-center min-h-[300px]">
                <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-lg border border-slateface bg-graphite text-white font-bold text-lg shadow-sm">
                  +
                </div>
                <p className="mt-4 text-sm font-semibold text-slate-300">Import New Dataset</p>
                <p className="mt-2 text-xs leading-5 text-slate-500 max-w-xs">
                  Upload court filings or discovery batches to populate new cases.
                </p>
                <button
                  type="button"
                  onClick={() => setUploadOpen(true)}
                  className="mt-5 rounded-lg border border-slateface bg-graphite px-5 py-2.5 text-xs font-bold text-slate-300 transition hover:bg-slateface"
                >
                  Upload Dataset
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slateface bg-graphite p-4.5 shadow-sm">
            <div className="text-xs text-slate-400">Showing {filteredCases.length} active records</div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-slateface bg-darkbg px-4 py-2 text-xs font-bold text-slate-400 transition hover:bg-slateface disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
                disabled={currentPage === pageCount}
                className="rounded-lg border border-slateface bg-darkbg px-4 py-2 text-xs font-bold text-slate-400 transition hover:bg-slateface disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
