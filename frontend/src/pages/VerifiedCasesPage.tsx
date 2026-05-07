import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import UploadModal from '../components/UploadModal'
import { CaseResponse } from '../types'
import { fetchCases, uploadAndProcessCase } from '../api'

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'High', label: 'High' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Low', label: 'Low' },
]

const DEADLINE_OPTIONS = [
  { value: '', label: 'Any Deadline' },
  { value: 'next_72h', label: 'Next 72 hours' },
  { value: 'next_7d', label: 'Next 7 days' },
  { value: 'overdue', label: 'Overdue' },
]

const GROUP_BY_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'authority', label: 'Authority' },
]

function formatDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function isUrgent(deadline?: string) {
  if (!deadline) return false
  const target = new Date(deadline).getTime()
  if (Number.isNaN(target)) return false
  const now = Date.now()
  return target <= now + 24 * 60 * 60 * 1000
}

function getCaseTitle(caseData: CaseResponse) {
  const caseNumber = caseData.extraction?.case_number
  const header = caseNumber ? `Case ${caseNumber}` : `Case #${caseData.id}`
  const title = caseData.title?.trim()
  if (!title || title === header) return header
  const normalized = title.toLowerCase()
  if (normalized.includes('writ') || normalized.includes('case') || normalized.includes('no.')) {
    return header
  }
  return title
}

function getPriorityStatus(priority?: string) {
  if (priority === 'High') return 'Urgent'
  if (priority === 'Medium') return 'Medium'
  return 'Low'
}

function priorityStyles(priority?: string) {
  switch (priority) {
    case 'High':
      return 'bg-rose-100 text-rose-700 border-rose-200'
    case 'Medium':
      return 'bg-sky-100 text-sky-700 border-sky-200'
    default:
      return 'bg-blue-100 text-blue-700 border-blue-200'
  }
}

function deadlineStyles(deadline?: string | null) {
  if (!deadline) return 'bg-slate-100 text-slate-700 border-slate-200'
  return isUrgent(deadline)
    ? 'bg-rose-100 text-rose-700 border-rose-200'
    : 'bg-cyan-100 text-cyan-700 border-cyan-200'
}

export default function VerifiedCasesPage() {
  const [cases, setCases] = useState<CaseResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [authorityFilter, setAuthorityFilter] = useState('')
  const [deadlineFilter, setDeadlineFilter] = useState('')
  const [groupBy, setGroupBy] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadInProgress, setUploadInProgress] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    setLoading(true)
    fetchCases('approved')
      .then((data) =>
        setCases(
          data.filter(
            (item) =>
              item.extraction &&
              item.reasoning &&
              item.action_plan &&
              item.extraction.case_number &&
              item.extraction.court_name,
          ),
        ),
      )
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const authorityOptions = useMemo(() => {
    const values = new Set<string>()
    cases.forEach((item) => {
      const authority = item.reasoning?.responsible_authority || item.action_plan?.department
      if (authority) values.add(authority)
    })
    return Array.from(values).sort()
  }, [cases])

  const summary = useMemo(() => {
    const now = Date.now()
    const in72h = now + 72 * 60 * 60 * 1000
    const in24h = now + 24 * 60 * 60 * 1000

    let total = 0
    let highPriority = 0
    let upcoming = 0
    let immediate = 0

    cases.forEach((item) => {
      total += 1
      const priority = item.reasoning?.priority || item.action_plan?.priority || 'Low'
      if (priority === 'High') highPriority += 1
      const deadline = item.extraction?.deadlines?.[0] || item.reasoning?.deadline || item.action_plan?.overall_deadline
      if (deadline) {
        const deadlineTime = new Date(deadline).getTime()
        if (!Number.isNaN(deadlineTime)) {
          if (deadlineTime <= in72h) upcoming += 1
          if (deadlineTime <= in24h) immediate += 1
        }
      }
    })

    return { total, highPriority, upcoming, immediate }
  }, [cases])

  const filteredCases = useMemo(() => {
    return cases
      .filter((item) => {
        const priority = item.reasoning?.priority || item.action_plan?.priority || 'Low'
        const authority = item.reasoning?.responsible_authority || item.action_plan?.department || ''
        const deadline = item.extraction?.deadlines?.[0] || item.reasoning?.deadline || item.action_plan?.overall_deadline

        const matchesPriority = priorityFilter ? priority === priorityFilter : true
        const matchesAuthority = authorityFilter ? authority === authorityFilter : true
        const normalized = searchTerm.trim().toLowerCase()
        const matchesSearch = normalized
          ? [
              item.extraction?.case_number || '',
              getCaseTitle(item),
              item.extraction?.court_name || '',
              authority,
            ]
              .join(' ')
              .toLowerCase()
              .includes(normalized)
          : true

        let matchesDeadline = true
        if (deadlineFilter === 'next_72h' && deadline) {
          const target = new Date(deadline).getTime()
          matchesDeadline = target > Date.now() && target <= Date.now() + 72 * 60 * 60 * 1000
        }
        if (deadlineFilter === 'next_7d' && deadline) {
          const target = new Date(deadline).getTime()
          matchesDeadline = target > Date.now() && target <= Date.now() + 7 * 24 * 60 * 60 * 1000
        }
        if (deadlineFilter === 'overdue' && deadline) {
          const target = new Date(deadline).getTime()
          matchesDeadline = target <= Date.now()
        }
        if (deadlineFilter && !deadline) {
          matchesDeadline = false
        }

        return matchesPriority && matchesAuthority && matchesSearch && matchesDeadline
      })
      .sort((a, b) => {
        const aDeadlineString = a.extraction?.deadlines?.[0] ?? a.reasoning?.deadline ?? a.action_plan?.overall_deadline ?? ''
        const bDeadlineString = b.extraction?.deadlines?.[0] ?? b.reasoning?.deadline ?? b.action_plan?.overall_deadline ?? ''
        const aDeadline = new Date(aDeadlineString).getTime() || 0
        const bDeadline = new Date(bDeadlineString).getTime() || 0
        return aDeadline - bDeadline
      })
  }, [cases, priorityFilter, authorityFilter, deadlineFilter, searchTerm])

  const groupedCases = useMemo(() => {
    if (groupBy !== 'authority') return { All: filteredCases }
    return filteredCases.reduce<Record<string, CaseResponse[]>>((acc, item) => {
      const authority = item.reasoning?.responsible_authority || item.action_plan?.department || 'Other'
      acc[authority] = acc[authority] || []
      acc[authority].push(item)
      return acc
    }, {})
  }, [filteredCases, groupBy])

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar onAddCase={() => setUploadOpen(true)} />
        <div className="flex-1 p-6 lg:p-8">
          <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onUpload={handleUpload} />

          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Verified Cases Dashboard</p>
              <h1 className="mt-3 text-4xl font-semibold text-slate-950">Verified cases for execution</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                View approved legal cases with action plans, deadlines, and execution tasks. This page shows only verified cases.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              disabled={uploadInProgress}
              className="inline-flex items-center justify-center rounded-3xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Add New Case
            </button>
          </div>

          <div className="grid gap-4 xl:grid-cols-4">
            <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-sky-50 to-white p-6 shadow-sm shadow-sky-200/20">
              <p className="text-sm uppercase tracking-[0.28em] text-slate-500">Total Verified Cases</p>
              <p className="mt-5 text-4xl font-semibold text-slate-950">{summary.total}</p>
            </div>
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm uppercase tracking-[0.28em] text-slate-500">High Priority Cases</p>
              <p className="mt-5 text-4xl font-semibold text-slate-950">{summary.highPriority}</p>
            </div>
            <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-cyan-50 to-white p-6 shadow-sm shadow-cyan-200/20">
              <p className="text-sm uppercase tracking-[0.28em] text-slate-500">Upcoming Deadlines</p>
              <p className="mt-5 text-4xl font-semibold text-slate-950">{summary.upcoming}</p>
            </div>
            <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-rose-50 to-white p-6 shadow-sm shadow-rose-200/20">
              <p className="text-sm uppercase tracking-[0.28em] text-slate-500">Immediate action required</p>
              <p className="mt-5 text-4xl font-semibold text-slate-950">{summary.immediate}</p>
              <p className="mt-2 text-sm text-slate-600">cases require immediate action</p>
            </div>
          </div>

          <div className="mt-8 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="min-w-0">
                  <label className="block text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Priority</label>
                  <select
                    value={priorityFilter}
                    onChange={(event) => setPriorityFilter(event.target.value)}
                    className="mt-3 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
                  >
                    {PRIORITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-0">
                  <label className="block text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Authority</label>
                  <select
                    value={authorityFilter}
                    onChange={(event) => setAuthorityFilter(event.target.value)}
                    className="mt-3 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
                  >
                    <option value="">All Authorities</option>
                    {authorityOptions.map((authority) => (
                      <option key={authority} value={authority}>
                        {authority}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-0">
                  <label className="block text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Deadline range</label>
                  <select
                    value={deadlineFilter}
                    onChange={(event) => setDeadlineFilter(event.target.value)}
                    className="mt-3 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
                  >
                    {DEADLINE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-0">
                  <label className="block text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Group by</label>
                  <select
                    value={groupBy}
                    onChange={(event) => setGroupBy(event.target.value)}
                    className="mt-3 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
                  >
                    {GROUP_BY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search cases, IDs, or authorities..."
                  className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 xl:w-[360px]"
                />
                <button
                  type="button"
                  onClick={() => {
                    setPriorityFilter('')
                    setAuthorityFilter('')
                    setDeadlineFilter('')
                    setGroupBy('')
                    setSearchTerm('')
                  }}
                  className="rounded-3xl border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-semibold text-sky-900 transition hover:bg-sky-100"
                >
                  Clear filters
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 space-y-10">
            {Object.entries(groupedCases).map(([groupLabel, groupItems]) => (
              <div key={groupLabel}>
                {groupBy === 'authority' ? (
                  <div className="mb-6 flex items-center justify-between rounded-3xl bg-slate-100 px-6 py-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Authority</p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">{groupLabel}</p>
                    </div>
                    <p className="text-sm text-slate-600">{groupItems.length} verified case{groupItems.length === 1 ? '' : 's'}</p>
                  </div>
                ) : null}

                <div className="grid gap-6 xl:grid-cols-2">
                  {groupItems.map((caseItem) => {
                    const headerLabel = caseItem.extraction?.case_number ? `Case ${caseItem.extraction.case_number}` : `Case #${caseItem.id}`
                    const title = getCaseTitle(caseItem)
                    const subtitle = title !== headerLabel ? title : undefined
                    const courtName = caseItem.extraction?.court_name || 'Unknown court'
                    const authority = caseItem.reasoning?.responsible_authority || caseItem.action_plan?.department || 'Unknown authority'
                    const actionType = caseItem.reasoning?.action_type || 'Action'
                    const deadline = caseItem.extraction?.deadlines?.[0] || caseItem.reasoning?.deadline || caseItem.action_plan?.overall_deadline
                    const taskItems = caseItem.action_plan?.tasks?.slice(0, 2) || []

                    return (
                      <div
                        key={caseItem.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/cases/${caseItem.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            navigate(`/cases/${caseItem.id}`)
                          }
                        }}
                        className="group cursor-pointer rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Case ID</p>
                            <p className="mt-2 text-sm font-semibold text-slate-950">
                              {caseItem.extraction?.formatted_case_number || caseItem.extraction?.case_number || `#${caseItem.id}`}
                            </p>
                          </div>
                          <span className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                            VERIFIED
                          </span>
                        </div>

                        <div className="mt-6">
                          <h2 className="text-xl font-semibold text-slate-950">{subtitle || headerLabel}</h2>
                          {subtitle ? (
                            <p className="mt-2 text-sm text-slate-500">{headerLabel}</p>
                          ) : null}
                          <p className="mt-3 text-sm text-slate-500">{courtName}</p>
                          <p className="mt-2 text-sm text-slate-500">{authority}</p>
                        </div>

                        <div className="mt-6 grid gap-3 sm:grid-cols-3">
                          <div className="rounded-3xl bg-slate-50 p-4">
                            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Action type</p>
                            <p className="mt-2 text-sm font-semibold text-slate-950">{actionType}</p>
                          </div>
                          <div className={`rounded-3xl border px-4 py-4 text-sm font-semibold transition ${deadlineStyles(deadline)}`}>
                            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Deadline</p>
                            <p className="mt-2 text-sm">{deadline ? formatDate(deadline) : 'TBD'}</p>
                          </div>
                          <div className={`rounded-3xl border px-4 py-4 text-sm font-semibold transition ${priorityStyles(caseItem.reasoning?.priority || caseItem.action_plan?.priority)}`}>
                            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Priority</p>
                            <p className="mt-2 text-sm">{caseItem.reasoning?.priority || caseItem.action_plan?.priority || 'Low'}</p>
                          </div>
                        </div>

                        <div className="mt-6">
                          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Key actions</p>
                          <div className="mt-3 space-y-2">
                            {taskItems.length > 0 ? (
                              taskItems.map((task, index) => (
                                <div key={`${caseItem.id}-${index}`} className="flex items-start gap-3 rounded-3xl bg-slate-50 px-4 py-3">
                                  <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-semibold text-white">✓</span>
                                  <div>
                                    <p className="text-sm font-semibold text-slate-950">{task.task}</p>
                                    {task.deadline ? <p className="text-xs text-slate-500">Due {formatDate(task.deadline)}</p> : null}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="rounded-3xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No key actions available</p>
                            )}
                          </div>
                        </div>

                        <div className="mt-6 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              navigate(`/cases/${caseItem.id}`)
                            }}
                            className="inline-flex rounded-3xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200/30 transition hover:bg-blue-600"
                          >
                            Open Case
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              navigate(`/cases/${caseItem.id}`)
                            }}
                            className="inline-flex rounded-3xl border border-blue-200 bg-white px-5 py-3 text-sm font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-sky-50"
                          >
                            View Files
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {!loading && filteredCases.length === 0 ? (
            <div className="mt-10 rounded-[28px] border border-slate-200 bg-white p-10 text-center text-slate-600 shadow-sm">
              <p className="text-lg font-semibold text-slate-950">No verified cases match your filters</p>
              <p className="mt-3 text-sm">Adjust the filters or add a new case to start tracking verified outcomes.</p>
            </div>
          ) : null}

          {loading ? (
            <div className="mt-10 rounded-[28px] border border-slate-200 bg-white p-10 text-center text-slate-600 shadow-sm">
              Loading verified cases...
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
