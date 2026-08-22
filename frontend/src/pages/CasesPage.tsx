import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import UploadModal from '../components/UploadModal'
import { CaseResponse } from '../types'
import { deleteCase, fetchCases, uploadAndProcessCase } from '../api'

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
  const navigate = useNavigate()

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
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 font-display">
                          {caseItem.extraction?.case_number ? `No. ${caseItem.extraction.case_number}` : `Case #${caseItem.id}`}
                        </span>
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
