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
  if (['pending_review', 'processed', 'needs_manual_review', 'ready_for_review'].includes(status)) return 'Ready for Review'
  if (status === 'approved') return 'Verified'
  if (['rejected', 'reprocessed'].includes(status)) return 'Reprocessed'
  return undefined
}

function getStatusTagStyles(status: string) {
  switch (status) {
    case 'Processing':
      return 'bg-sky-100 text-sky-700 border-sky-200'
    case 'Ready for Review':
      return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'Verified':
      return 'bg-sky-100 text-sky-700 border-sky-200'
    case 'Reprocessed':
      return 'bg-rose-100 text-rose-700 border-rose-200'
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200'
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
      return 'bg-rose-100 text-rose-700 border-rose-200'
    case 'Medium':
      return 'bg-sky-100 text-sky-700 border-sky-200'
    case 'Low':
      return 'bg-amber-100 text-amber-700 border-amber-200'
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200'
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
      }))
      .filter((item) => {
        if (!item.mappedStatus) return false

        const matchesStatus = filterStatus ? item.mappedStatus === filterStatus : true
        const priority = item.reasoning?.priority || item.action_plan?.priority || 'Medium'
        const matchesPriority = filterPriority ? priority === filterPriority : true
        const normalizedSearch = searchTerm.trim().toLowerCase()
        const matchesSearch = normalizedSearch
          ? [
              getDisplayTitle(item),
              item.extraction?.case_number || '',
              item.extraction?.court_name || '',
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
          const priorityA = a.reasoning?.priority || a.action_plan?.priority || 'Medium'
          const priorityB = b.reasoning?.priority || b.action_plan?.priority || 'Medium'
          return (priorityOrder[priorityA as keyof typeof priorityOrder] ?? 1) -
            (priorityOrder[priorityB as keyof typeof priorityOrder] ?? 1)
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
    <div className="min-h-screen bg-surface text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar onAddCase={() => setUploadOpen(true)} />
        <div className="flex-1 p-6 lg:p-8">
          <div className="mt-6 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
              <div className="min-w-0">
                <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Case management</p>
                <h1 className="mt-3 text-3xl font-semibold text-slate-950">All Cases</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Review and manage AI-processed legal cases clearly and efficiently.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUploadOpen(true)}
                className="inline-flex items-center justify-center rounded-3xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-500"
              >
                Add Cases
              </button>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-[1.8fr_1fr]">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm">
                <label className="text-sm font-semibold text-slate-700">Search by Case ID or party name</label>
                <input
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value)
                    setPage(1)
                  }}
                  placeholder="Search by Case ID or party name..."
                  className="mt-3 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="min-w-0 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <label className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Status</label>
                  <select
                    value={filterStatus}
                    onChange={(event) => {
                      setFilterStatus(event.target.value)
                      setPage(1)
                    }}
                    className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <label className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Priority</label>
                  <select
                    value={filterPriority}
                    onChange={(event) => {
                      setFilterPriority(event.target.value)
                      setPage(1)
                    }}
                    className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
                  >
                    {PRIORITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <label className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Sort by</label>
                  <select
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value)}
                    className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
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
              <div className="col-span-full rounded-[28px] border border-slate-200 bg-white p-8 text-slate-600 shadow-sm">
                Loading cases...
              </div>
            ) : (
              visibleCases.map((caseItem) => {
                const mappedStatus = getMappedCaseStatus(caseItem.status) || 'Processing'
                const isProcessing = mappedStatus === 'Processing'
                const priority = caseItem.reasoning?.priority || caseItem.action_plan?.priority || 'Medium'
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
                    className="group rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-900 hover:shadow-lg"
                    onClick={() => navigate(`/cases/${caseItem.id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        navigate(`/cases/${caseItem.id}`)
                      }
                    }}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <span className="rounded-2xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-slate-700">
                        {caseItem.extraction?.case_number ? `Case ${caseItem.extraction.case_number}` : `Case #${caseItem.id}`}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-2xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em] ${getStatusTagStyles(mappedStatus)}`}>
                          {mappedStatus}
                        </span>
                        <span className={`rounded-2xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em] ${priorityTagStyles(priority)}`}>
                          {getPriorityLabel(priority)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-semibold text-slate-950">{headerTitle}</h2>
                        {showSubtitle ? (
                          <p className="mt-2 text-sm text-slate-500">{caseItem.title}</p>
                        ) : courtName ? (
                          <p className="mt-2 text-sm text-slate-500">{courtName}</p>
                        ) : null}
                      </div>
                      {isProcessing ? (
                        <div className="flex items-center gap-3 rounded-3xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-300 border-t-slate-900 animate-spin" />
                          Processing
                        </div>
                      ) : null}
                    </div>

                    {isProcessing ? (
                      <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                        AI is processing this case...
                      </div>
                    ) : (
                      <>
                        {summary ? (
                          <p className="mt-5 line-clamp-3 text-sm leading-6 text-slate-600">{summary}</p>
                        ) : null}

                        <div className="mt-6 grid gap-3 sm:grid-cols-2">
                          {hasDeadline ? (
                            <div className="rounded-3xl bg-sky-50 p-4">
                              <p className="text-xs uppercase tracking-[0.24em] text-sky-600">Deadline</p>
                              <p className="mt-2 text-sm font-semibold text-slate-950">{deadlineText}</p>
                            </div>
                          ) : null}
                          {hasConfidence ? (
                            <div className="rounded-3xl bg-slate-50 p-4">
                              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">AI Confidence</p>
                              <p className="mt-2 text-sm font-semibold text-slate-950">{confidenceScore.toFixed(2)}</p>
                            </div>
                          ) : null}
                        </div>
                      </>
                    )}

                    <div className="mt-6 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          navigate(`/cases/${caseItem.id}`)
                        }}
                        className="inline-flex rounded-3xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-500"
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
                        className={`inline-flex rounded-3xl border px-5 py-3 text-sm font-semibold transition ${
                          caseItem.status === 'approved'
                            ? 'border-slate-300 bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50'
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
              <div className="rounded-[28px] border-dashed border border-slate-300 bg-slate-50 p-8 text-center text-slate-500 shadow-sm">
                <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-3xl border border-slate-200 bg-white text-slate-700">
                  +
                </div>
                <p className="mt-4 text-lg font-semibold text-slate-950">Import New Dataset</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Upload court filings or discovery batches to populate new cases.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/cases')}
                  className="mt-5 rounded-3xl border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-semibold text-sky-900 transition hover:bg-sky-100"
                >
                  Upload Dataset
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-600">Showing {filteredCases.length} cases</div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="rounded-3xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
                disabled={currentPage === pageCount}
                className="rounded-3xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
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
