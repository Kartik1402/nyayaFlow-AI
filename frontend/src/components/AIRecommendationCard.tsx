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
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">AI Recommendation</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Recommended Action</h2>
        </div>
        <span className="rounded-2xl bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-700">
          {recommendation.priority}
        </span>
      </div>

      <div className="mt-6 space-y-5">
        <div className="rounded-3xl bg-slate-50 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Action Type</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{recommendation.actionType}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl bg-slate-50 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Authority</p>
            {editable ? (
              <input
                value={recommendation.authority}
                onChange={(event) => onChange('responsible_authority', event.target.value)}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              />
            ) : (
              <p className="mt-3 text-base font-semibold text-slate-950">{recommendation.authority}</p>
            )}
          </div>

          <div className="rounded-3xl bg-slate-50 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Deadline</p>
            {editable ? (
              <input
                value={recommendation.deadline}
                onChange={(event) => onChange('deadline', event.target.value)}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              />
            ) : (
              <p className="mt-3 text-base font-semibold text-slate-950">{recommendation.deadline}</p>
            )}
          </div>
        </div>

        <div className="rounded-3xl bg-slate-50 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-2 text-xs font-semibold ${
                recommendation.complianceRequired
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {recommendation.complianceRequired ? 'Compliance Required' : 'Compliance OK'}
            </span>
            <span
              className={`rounded-full px-3 py-2 text-xs font-semibold ${
                recommendation.appealRecommended
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {recommendation.appealRecommended ? 'Appeal Recommended' : 'No Appeal'}
            </span>
          </div>
        </div>

        <div className="rounded-3xl bg-slate-50 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Confidence Score</p>
          <p className="mt-3 text-sm font-semibold text-slate-900">
            {recommendation.confidence.toFixed(2)}
          </p>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${Math.min(Math.max(recommendation.confidence * 100, 0), 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-3xl bg-slate-50 p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Reasoning Summary</p>
        <p className="mt-3 text-sm leading-7 text-slate-700">{recommendation.reasoningText}</p>
      </div>
    </section>
  )
}
