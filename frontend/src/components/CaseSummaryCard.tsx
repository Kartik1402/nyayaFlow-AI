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
    <section className="rounded-2xl border border-slateface bg-graphite p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-b border-slateface pb-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 font-display">Primary Dossier</p>
          <h2 className="mt-1.5 text-xl font-bold font-display text-white">Judgment Overview</h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-400">
            <div>
              <span className="text-slate-500 font-semibold">Case Number:</span> <span className="text-slate-200">{caseNumber}</span>
              {formattedCaseNumber ? (
                <span className="ml-1 text-slate-500">({formattedCaseNumber})</span>
              ) : null}
            </div>
            <span className="text-slate-600 hidden sm:inline">•</span>
            <div>
              <span className="text-slate-500 font-semibold">Filing Date:</span> <span className="text-slate-200">{judgmentDate}</span>
            </div>
            {caseType ? (
              <>
                <span className="text-slate-600 hidden sm:inline">•</span>
                <div>
                  <span className="text-slate-500 font-semibold">Classification:</span> <span className="text-slate-200">{caseType}</span>
                </div>
              </>
            ) : null}
          </div>
        </div>
        
        {criticalDeadline && criticalDeadline !== 'TBD' ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-400 shadow-sm max-w-[220px]">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-red-500/70">Critical Action Limit</p>
            <p className="mt-1 text-sm font-bold text-red-400 font-display">{criticalDeadline}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl border border-slateface bg-darkbg p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Issuing Authority</p>
          <p className="mt-2.5 text-sm font-semibold text-slate-200 font-display leading-relaxed">{courtName}</p>
        </div>

        <div className="rounded-xl border border-slateface bg-darkbg p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Parties of Record</p>
          {petitioner || respondent ? (
            <div className="mt-2.5 space-y-1.5 text-xs text-slate-300">
              {petitioner ? (
                <div>
                  <span className="text-slate-500 font-medium">Petitioner:</span> <span className="text-slate-200">{petitioner}</span>
                </div>
              ) : null}
              {respondent ? (
                <div>
                  <span className="text-slate-500 font-medium">Respondent:</span> <span className="text-slate-200">{respondent}</span>
                </div>
              ) : null}
            </div>
          ) : hasPartyDetails ? (
            <p className="mt-2.5 text-sm font-semibold text-slate-200">{parties}</p>
          ) : (
            <p className="mt-2.5 text-xs text-slate-500">No party details extracted.</p>
          )}
        </div>
      </div>

      {/* Main Text Content sections without heavy card frames */}
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl border border-slateface bg-darkbg p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 mb-3">Identified Directives</p>
          {validDirectives.length > 0 ? (
            <div className="space-y-3.5">
              {validDirectives.map((directive, index) => (
                <div key={index} className="rounded-lg border border-slateface bg-graphite p-3.5">
                  <p className="text-xs text-slate-300 leading-relaxed font-semibold">{directive.directive_text}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slateface/50 pt-2.5">
                    {directive.deadline_text ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Due: {directive.deadline_text}
                      </span>
                    ) : (
                      <span />
                    )}
                    {directive.priority ? (
                      <span className={`rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                        directive.priority.toLowerCase() === 'high' 
                          ? 'border-red-500/30 bg-red-500/10 text-red-400' 
                          : 'border-slate-500/30 bg-slateface text-slate-400'
                      }`}>
                        {directive.priority}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No directives identified.</p>
          )}
        </div>

        <div className="rounded-xl border border-slateface bg-darkbg p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 mb-3">Cited Statutes</p>
          {citedStatutes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
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
                    className="rounded-lg border border-slateface bg-graphite px-3 py-1.5 text-xs font-semibold text-slate-300 font-display transition hover:border-limeaccent/30 hover:text-white"
                  >
                    {label}
                    {actLabel ? <span className="text-slate-500 ml-1">({actLabel})</span> : ''}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No cited statutes available.</p>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slateface bg-darkbg p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Judgment Summary</p>
        <p className="mt-3 text-xs leading-relaxed text-slate-400">{summary}</p>
      </div>
    </section>
  )
}
