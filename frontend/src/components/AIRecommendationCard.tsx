interface Recommendation {
  actionType: string
  priority: string
  authority: string
  deadline: string
  confidence: number
  complianceRequired: boolean
  appealRecommended: boolean
  reasoningText: string
}

interface Props {
  recommendation: Recommendation
  editable: boolean
  onChange: (field: 'responsible_authority' | 'deadline' | 'priority', value: string) => void
}

export default function AIRecommendationCard({ recommendation, editable, onChange }: Props) {
  const isHigh = recommendation.priority.toLowerCase() === 'high'

  return (
    <section className="rounded-2xl border border-slateface bg-graphite p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slateface pb-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 font-display">AI Directives</p>
          <h2 className="mt-1 text-xl font-bold font-display text-white">Recommended Action</h2>
        </div>
        <span className={`rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${
          isHigh 
            ? 'border-red-500/30 bg-red-500/10 text-red-400' 
            : 'border-slate-500/30 bg-slateface text-slate-400'
        }`}>
          {recommendation.priority} Priority
        </span>
      </div>

      <div className="mt-6 space-y-4">
        <div className="rounded-xl border border-slateface bg-darkbg p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Action Classification</p>
          <p className="mt-1.5 text-base font-bold text-white font-display">{recommendation.actionType}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slateface bg-darkbg p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Authority</p>
            {editable ? (
              <input
                value={recommendation.authority}
                onChange={(event) => onChange('responsible_authority', event.target.value)}
                className="mt-2.5 w-full rounded-lg border border-slateface bg-graphite px-3 py-2 text-xs text-slate-200 outline-none focus:border-limeaccent/30"
              />
            ) : (
              <p className="mt-2.5 text-sm font-semibold text-slate-300">{recommendation.authority}</p>
            )}
          </div>

          <div className="rounded-xl border border-slateface bg-darkbg p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Deadline</p>
            {editable ? (
              <input
                value={recommendation.deadline}
                onChange={(event) => onChange('deadline', event.target.value)}
                className="mt-2.5 w-full rounded-lg border border-slateface bg-graphite px-3 py-2 text-xs text-slate-200 outline-none focus:border-limeaccent/30"
              />
            ) : (
              <p className="mt-2.5 text-sm font-semibold text-slate-300">{recommendation.deadline}</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slateface bg-darkbg p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                recommendation.complianceRequired
                  ? 'border-red-500/20 bg-red-500/10 text-red-400'
                  : 'border-limeaccent/20 bg-limeaccent/10 text-limeaccent shadow-lime'
              }`}
            >
              {recommendation.complianceRequired ? 'Compliance Mandated' : 'No compliance required'}
            </span>
            <span
              className={`rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                recommendation.appealRecommended
                  ? 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                  : 'border-slate-500/20 bg-slateface text-slate-400'
              }`}
            >
              {recommendation.appealRecommended ? 'Appeal Recommended' : 'No Appeal Action'}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slateface bg-darkbg p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Confidence Score</p>
          <div className="mt-2 flex items-center justify-between gap-4">
            <p className="text-sm font-bold text-white font-display">
              {(recommendation.confidence * 100).toFixed(0)}% Match
            </p>
            <div className="h-2 w-32 overflow-hidden rounded-full bg-slateface">
              <div
                className="h-full rounded-full bg-limeaccent shadow-lime"
                style={{ width: `${Math.min(Math.max(recommendation.confidence * 100, 0), 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slateface bg-darkbg p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Reasoning Summary</p>
        <p className="mt-2.5 text-xs leading-relaxed text-slate-400">{recommendation.reasoningText}</p>
      </div>
    </section>
  )
}
