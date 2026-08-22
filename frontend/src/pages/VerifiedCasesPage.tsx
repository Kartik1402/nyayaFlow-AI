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

const SORT_OPTIONS = [
  { value: 'deadline', label: 'Deadline' },
  { value: 'priority', label: 'Priority' },
  { value: 'case_number', label: 'Case ID' },
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

function normalizePriority(priority?: string) {
  if (!priority) return 'Low'
  const value = priority.trim().toLowerCase()
  if (value === 'high') return 'High'
  if (value === 'medium') return 'Medium'
  if (value === 'low') return 'Low'
  return 'Low'
}

function getPriorityStatus(priority?: string) {
  if (priority === 'High') return 'Urgent'
  if (priority === 'Medium') return 'Medium'
  return 'Low'
}

function getSearchablePartyNames(parties: CaseResponse['extraction'] extends { parties?: infer P } ? P : unknown) {
  if (!parties) return ''
  if (Array.isArray(parties)) {
    return parties
      .map((item) => (typeof item === 'string' ? item : item.name || item.role || ''))
      .filter(Boolean)
      .join(' ')
  }
  return String(parties)
}

function priorityStyles(priority?: string) {
  switch (priority) {
    case 'High':
      return 'border-red-500/20 bg-red-500/10 text-red-400'
    case 'Medium':
      return 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400'
    default:
      return 'border-slateface bg-slateface text-slate-300'
  }
}

function deadlineStyles(deadline?: string | null) {
  if (!deadline) return 'border-slateface bg-slateface text-slate-400'
  return isUrgent(deadline)
    ? 'border-red-500/20 bg-red-500/10 text-red-400'
    : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400 shadow-sm'
}

export default function VerifiedCasesPage() {
  const [cases, setCases] = useState<CaseResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [authorityFilter, setAuthorityFilter] = useState('')
  const [deadlineFilter, setDeadlineFilter] = useState('')
  const [sortBy, setSortBy] = useState('deadline')
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
      if (priority.toLowerCase() === 'high') highPriority += 1
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
      .map((item) => ({
        ...item,
        normalizedPriority: normalizePriority(item.reasoning?.priority || item.action_plan?.priority),
        searchableParties: getSearchablePartyNames(item.extraction?.parties),
        deadlineValue: item.extraction?.deadlines?.[0] ?? item.reasoning?.deadline ?? item.action_plan?.overall_deadline ?? '',
      }))
      .filter((item) => {
        const priority = item.normalizedPriority
        const authority = item.reasoning?.responsible_authority || item.action_plan?.department || ''
        const deadline = item.deadlineValue

        const matchesPriority = priorityFilter ? priority === priorityFilter : true
        const matchesAuthority = authorityFilter ? authority === authorityFilter : true
        const normalized = searchTerm.trim().toLowerCase()
        const matchesSearch = normalized
          ? [
            item.extraction?.case_number || '',
            getCaseTitle(item),
            item.extraction?.court_name || '',
            authority,
            item.searchableParties || '',
            priority,
            deadline || '',
          ]
            .join(' ')
            .toLowerCase()
            .includes(normalized)
          : true

        let matchesDeadline = true
        if (deadlineFilter === 'next_72h') {
          const target = new Date(deadline).getTime()
          matchesDeadline = !!deadline && target > Date.now() && target <= Date.now() + 72 * 60 * 60 * 1000
        }
        if (deadlineFilter === 'next_7d') {
          const target = new Date(deadline).getTime()
          matchesDeadline = !!deadline && target > Date.now() && target <= Date.now() + 7 * 24 * 60 * 60 * 1000
        }
        if (deadlineFilter === 'overdue') {
          const target = new Date(deadline).getTime()
          matchesDeadline = !!deadline && target <= Date.now()
        }

        return matchesPriority && matchesAuthority && matchesSearch && matchesDeadline
      })
      .sort((a, b) => {
        if (sortBy === 'deadline') {
          const aDeadline = new Date(a.deadlineValue).getTime() || 0
          const bDeadline = new Date(b.deadlineValue).getTime() || 0
          return aDeadline - bDeadline
        }
        if (sortBy === 'priority') {
          const order = { High: 0, Medium: 1, Low: 2 }
          return (order[a.normalizedPriority as keyof typeof order] ?? 2) -
            (order[b.normalizedPriority as keyof typeof order] ?? 2)
        }
        if (sortBy === 'case_number') {
          const aCase = a.extraction?.formatted_case_number || a.extraction?.case_number || String(a.id)
          const bCase = b.extraction?.formatted_case_number || b.extraction?.case_number || String(b.id)
          return aCase.localeCompare(bCase, undefined, { numeric: true, sensitivity: 'base' })
        }
        return 0
      })
  }, [cases, priorityFilter, authorityFilter, deadlineFilter, searchTerm, sortBy])

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
    <div className="min-h-screen bg-darkbg text-slate-100">
      <div className="flex min-h-screen">
        <Sidebar onAddCase={() => setUploadOpen(true)} />
        <div className="flex-1 p-6 lg:p-8">
          <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onUpload={handleUpload} />

          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between border-b border-slateface pb-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 font-display">Intelligence Dashboard</p>
              <h1 className="mt-2 text-2xl font-bold font-display text-white">Verified Action Plans</h1>
              <p className="mt-2.5 max-w-2xl text-xs text-slate-400">
                Monitor approved legal cases with associated directives, roadmap tasks, and organizational deadlines.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              disabled={uploadInProgress}
              className="inline-flex items-center justify-center rounded-lg bg-limeaccent px-5 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-limehover shadow-lime disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Ingest Judgment
            </button>
          </div>

          <div className="grid gap-4 xl:grid-cols-4">
            <div className="rounded-xl border border-slateface bg-graphite p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Verified Dossiers</p>
              <p className="mt-3.5 text-3xl font-bold text-white font-display">{summary.total}</p>
            </div>
            <div className="rounded-xl border border-slateface bg-graphite p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Critical Priority</p>
              <p className="mt-3.5 text-3xl font-bold text-red-400 font-display">{summary.highPriority}</p>
            </div>
            <div className="rounded-xl border border-slateface bg-graphite p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Pending Limit (&lt;72h)</p>
              <p className="mt-3.5 text-3xl font-bold text-cyan-400 font-display">{summary.upcoming}</p>
            </div>
            <div className="rounded-xl border border-slateface bg-graphite p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Overdue / Immediate</p>
              <p className="mt-3.5 text-3xl font-bold text-limeaccent font-display shadow-lime">{summary.immediate}</p>
            </div>
          </div>

          <div className="mt-8 rounded-xl border border-slateface bg-graphite p-6 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5 flex-1">
                <div className="min-w-0">
                  <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Priority</label>
                  <select
                    value={priorityFilter}
                    onChange={(event) => setPriorityFilter(event.target.value)}
                    className="mt-2.5 w-full rounded-lg border border-slateface bg-darkbg px-3 py-2 text-xs text-slate-200 outline-none focus:border-limeaccent/30"
                  >
                    {PRIORITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-0">
                  <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Agency / Dept</label>
                  <select
                    value={authorityFilter}
                    onChange={(event) => setAuthorityFilter(event.target.value)}
                    className="mt-2.5 w-full rounded-lg border border-slateface bg-darkbg px-3 py-2 text-xs text-slate-200 outline-none focus:border-limeaccent/30"
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
                  <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Deadline Range</label>
                  <select
                    value={deadlineFilter}
                    onChange={(event) => setDeadlineFilter(event.target.value)}
                    className="mt-2.5 w-full rounded-lg border border-slateface bg-darkbg px-3 py-2 text-xs text-slate-200 outline-none focus:border-limeaccent/30"
                  >
                    {DEADLINE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-0">
                  <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Sort By</label>
                  <select
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value)}
                    className="mt-2.5 w-full rounded-lg border border-slateface bg-darkbg px-3 py-2 text-xs text-slate-200 outline-none focus:border-limeaccent/30"
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Group By</label>
                  <select
                    value={groupBy}
                    onChange={(event) => setGroupBy(event.target.value)}
                    className="mt-2.5 w-full rounded-lg border border-slateface bg-darkbg px-3 py-2 text-xs text-slate-200 outline-none focus:border-limeaccent/30"
                  >
                    {GROUP_BY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3 xl:pl-4">
                <div className="min-w-0">
                  <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2.5">Text filter</label>
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search litigants, numbers..."
                    className="w-full rounded-lg border border-slateface bg-darkbg px-4 py-2 text-xs text-slate-200 outline-none focus:border-limeaccent/30 xl:w-[280px]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPriorityFilter('')
                    setAuthorityFilter('')
                    setDeadlineFilter('')
                    setGroupBy('')
                    setSearchTerm('')
                  }}
                  className="rounded-lg border border-slateface bg-darkbg px-4 py-2 text-xs font-bold text-slate-400 transition hover:bg-slateface"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 space-y-10">
            {Object.entries(groupedCases).map(([groupLabel, groupItems]) => (
              <div key={groupLabel}>
                {groupBy === 'authority' ? (
                  <div className="mb-6 flex items-center justify-between rounded-xl border border-slateface bg-graphite px-6 py-4.5">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">Authority Domain</p>
                      <p className="mt-1 text-base font-bold font-display text-white">{groupLabel}</p>
                    </div>
                    <p className="text-xs text-slate-400">{groupItems.length} active dossier{groupItems.length === 1 ? '' : 's'}</p>
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
                        className="group cursor-pointer rounded-xl border border-slateface bg-graphite p-6 shadow-sm transition hover:border-limeaccent/35 hover:-translate-y-0.5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slateface/60 pb-4">
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">Dossier Ident</p>
                            <p className="mt-1 text-xs font-semibold text-slate-200">
                              {caseItem.extraction?.formatted_case_number || caseItem.extraction?.case_number || `#${caseItem.id}`}
                            </p>
                          </div>
                          <span className="rounded-md border border-limeaccent/20 bg-limeaccent/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.15em] text-limeaccent shadow-lime">
                            VERIFIED
                          </span>
                        </div>

                        <div className="mt-5">
                          <h2 className="text-base font-bold font-display text-white leading-relaxed">{subtitle || headerLabel}</h2>
                          {subtitle ? (
                            <p className="mt-1 text-xs text-slate-400">{headerLabel}</p>
                          ) : null}
                          <p className="mt-2 text-xs text-slate-400">{courtName}</p>
                          <p className="mt-1 text-xs text-slate-400 font-semibold text-slate-300">{authority}</p>
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-3">
                          <div className="rounded-lg border border-slateface bg-darkbg p-3">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Action Type</p>
                            <p className="mt-1.5 text-xs font-semibold text-slate-300">{actionType}</p>
                          </div>
                          <div className={`rounded-lg border p-3 text-xs font-semibold transition ${deadlineStyles(deadline)}`}>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Limit Target</p>
                            <p className="mt-1.5 text-xs font-semibold">{deadline ? formatDate(deadline) : 'TBD'}</p>
                          </div>
                          <div className={`rounded-lg border p-3 text-xs font-semibold transition ${priorityStyles(caseItem.reasoning?.priority || caseItem.action_plan?.priority)}`}>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Priority</p>
                            <p className="mt-1.5 text-xs font-semibold">{caseItem.reasoning?.priority || caseItem.action_plan?.priority || 'Low'}</p>
                          </div>
                        </div>

                        <div className="mt-5">
                          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-3">Key Roadmap Items</p>
                          <div className="space-y-2">
                            {taskItems.length > 0 ? (
                              taskItems.map((task, index) => (
                                <div key={`${caseItem.id}-${index}`} className="flex items-start gap-3 rounded-lg border border-slateface bg-darkbg px-4 py-3">
                                  <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-lg bg-limeaccent/10 border border-limeaccent/20 text-[9px] font-bold text-limeaccent shadow-lime">✓</span>
                                  <div>
                                    <p className="text-xs font-medium text-slate-300">{task.task}</p>
                                    {task.deadline ? <p className="text-[10px] text-slate-500 mt-1 font-semibold">Due {formatDate(task.deadline)}</p> : null}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-slate-500">No roadmap actions defined.</p>
                            )}
                          </div>
                        </div>

                        <div className="mt-6 flex flex-wrap gap-3 border-t border-slateface/40 pt-4">
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
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {!loading && filteredCases.length === 0 ? (
            <div className="mt-10 rounded-xl border border-slateface bg-graphite p-10 text-center text-slate-400 shadow-sm">
              <p className="text-sm font-semibold text-slate-200">No verified cases match your filters</p>
              <p className="mt-1.5 text-xs text-slate-500">Adjust the filters or add a new case to start tracking verified outcomes.</p>
            </div>
          ) : null}

          {loading ? (
            <div className="mt-10 rounded-xl border border-slateface bg-graphite p-10 text-center text-slate-400 shadow-sm">
              Loading verified records...
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
