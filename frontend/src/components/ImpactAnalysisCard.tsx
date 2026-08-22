interface ImpactAnalysisProps {
  analysis: {
    riskLevel: string
    legalImpact: string
    workflowType: string
    department: string
    requiresCoordination: boolean
    finalDeadline: string
  }
}

export default function ImpactAnalysisCard({ analysis }: ImpactAnalysisProps) {
  const isHighRisk = analysis.riskLevel.toLowerCase() === 'high' || analysis.riskLevel.toLowerCase() === 'critical'

  return (
    <section className="rounded-2xl border border-slateface bg-graphite p-6 shadow-sm">
      <div className="border-b border-slateface pb-5 mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 font-display">Operational Impact</p>
        <h2 className="mt-1 text-xl font-bold font-display text-white">Strategic Snapshot</h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slateface bg-darkbg p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Risk Profile</p>
          <p className={`mt-2 text-sm font-semibold font-display ${
            isHighRisk ? 'text-red-400' : 'text-slate-200'
          }`}>{analysis.riskLevel}</p>
        </div>

        <div className="rounded-xl border border-slateface bg-darkbg p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Legal Precedent Impact</p>
          <p className="mt-2 text-sm font-semibold text-slate-200 font-display">{analysis.legalImpact}</p>
        </div>

        <div className="rounded-xl border border-slateface bg-darkbg p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Workflow Routing</p>
          <p className="mt-2 text-sm font-semibold text-slate-200 font-display">{analysis.workflowType}</p>
        </div>

        <div className="rounded-xl border border-slateface bg-darkbg p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Assigned Agency</p>
          <p className="mt-2 text-sm font-semibold text-slate-200 font-display">{analysis.department}</p>
        </div>

        <div className="rounded-xl border border-slateface bg-darkbg p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Coordination Required</p>
          <p className="mt-2 text-sm font-semibold text-slate-200 font-display">
            {analysis.requiresCoordination ? 'Yes' : 'No'}
          </p>
        </div>

        <div className="rounded-xl border border-slateface bg-darkbg p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Final Action Limit</p>
          <p className="mt-2 text-sm font-semibold text-slate-200 font-display">{analysis.finalDeadline}</p>
        </div>
      </div>
    </section>
  )
}
