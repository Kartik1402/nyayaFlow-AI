interface DirectiveItem {
  directive_text?: string
  text?: string
  deadline_text?: string | null
  priority?: string
}

interface StatuteItem {
  type?: string
  value?: string
  act?: string | null
}

type StatutePayload = string | StatuteItem

interface CaseSummaryCardProps {
  caseNumber: string
  caseType?: string
  formattedCaseNumber?: string
  courtName: string
  judgmentDate: string
  petitioner?: string
  respondent?: string
  parties: string
  summary: string
  criticalDeadline: string
  directives: DirectiveItem[]
  citedStatutes: StatutePayload[]
}

export default function CaseSummaryCard({
  caseNumber,
  caseType,
  formattedCaseNumber,
  courtName,
  judgmentDate,
  petitioner,
  respondent,
  parties,
  summary,
  criticalDeadline,
  directives,
  citedStatutes,
}: CaseSummaryCardProps) {
  const validDirectives = directives
    .map((directive) => ({
      directive_text: directive.directive_text || directive.text || '',
      deadline_text: directive.deadline_text || null,
      priority: directive.priority,
    }))
    .filter((directive) => directive.directive_text && directive.directive_text.trim())

  const hasPartyDetails = Boolean(petitioner || respondent || (parties && parties !== 'Unknown parties'))

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Case Summary</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Judgment Overview</h2>
          <div className="mt-3 text-sm text-slate-600">
            <span className="font-semibold text-slate-900">Case Number:</span> {caseNumber}
            {formattedCaseNumber ? (
              <span className="ml-2 text-slate-500">({formattedCaseNumber})</span>
            ) : null}
            <span className="mx-2">•</span>
            <span className="font-semibold text-slate-900">Date:</span> {judgmentDate}
          </div>
          {caseType ? (
            <div className="mt-2 text-sm text-slate-600">
              <span className="font-semibold text-slate-900">Case Type:</span> {caseType}
            </div>
          ) : null}
        </div>
        <div className="rounded-3xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          Critical Deadline
          <div className="mt-1 text-base">{criticalDeadline}</div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div className="rounded-3xl bg-slate-50 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Court Name</p>
          <p className="mt-3 text-base font-semibold text-slate-900">{courtName}</p>
        </div>
        <div className="rounded-3xl bg-slate-50 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Party Details</p>
          {petitioner || respondent ? (
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              {petitioner ? (
                <div>
                  <span className="font-semibold text-slate-900">Petitioner:</span> {petitioner}
                </div>
              ) : null}
              {respondent ? (
                <div>
                  <span className="font-semibold text-slate-900">Respondent:</span> {respondent}
                </div>
              ) : null}
            </div>
          ) : hasPartyDetails ? (
            <p className="mt-3 text-base font-semibold text-slate-900">{parties}</p>
          ) : (
            <p className="mt-3 text-sm text-slate-600">No party details extracted.</p>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div className="rounded-3xl bg-slate-50 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Directives</p>
          {validDirectives.length > 0 ? (
            <div className="mt-3 space-y-3 text-sm text-slate-700">
              {validDirectives.map((directive, index) => (
                <div key={index} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="font-semibold text-slate-900">{directive.directive_text}</p>
                  {directive.deadline_text ? (
                    <p className="mt-1 text-xs uppercase tracking-[0.24em] text-slate-500">
                      Deadline: {directive.deadline_text}
                    </p>
                  ) : null}
                  {directive.priority ? (
                    <div className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
                      {directive.priority}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">No directives identified.</p>
          )}
        </div>
        <div className="rounded-3xl bg-slate-50 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Cited Statutes</p>
          {citedStatutes.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-700">
              {citedStatutes.map((statute, index) => {
                const label = typeof statute === 'string'
                  ? statute
                  : statute.type
                    ? `${statute.type} ${statute.value || ''}`.trim()
                    : statute.value || 'Statute'
                const actLabel = typeof statute === 'string' ? undefined : statute.act
                return (
                  <div
                    key={index}
                    className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
                  >
                    {label}
                    {actLabel ? ` · ${actLabel}` : ''}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">No cited statutes available.</p>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-3xl bg-slate-50 p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Judgment Summary</p>
        <p className="mt-3 text-sm leading-7 text-slate-700">{summary}</p>
      </div>
    </section>
  )
}
