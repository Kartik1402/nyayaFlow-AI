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
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Impact Analysis</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">Strategic Snapshot</h2>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl bg-slate-50 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Risk Level</p>
          <p className="mt-3 text-base font-semibold text-slate-950">{analysis.riskLevel}</p>
        </div>

        <div className="rounded-3xl bg-slate-50 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Legal Impact</p>
          <p className="mt-3 text-base font-semibold text-slate-950">{analysis.legalImpact}</p>
        </div>

        <div className="rounded-3xl bg-slate-50 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Workflow Type</p>
          <p className="mt-3 text-base font-semibold text-slate-950">{analysis.workflowType}</p>
        </div>

        <div className="rounded-3xl bg-slate-50 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Department</p>
          <p className="mt-3 text-base font-semibold text-slate-950">{analysis.department}</p>
        </div>

        <div className="rounded-3xl bg-slate-50 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Coordination Required</p>
          <p className="mt-3 text-base font-semibold text-slate-950">
            {analysis.requiresCoordination ? 'Yes' : 'No'}
          </p>
        </div>

        <div className="rounded-3xl bg-slate-50 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Final Deadline</p>
          <p className="mt-3 text-base font-semibold text-slate-950">{analysis.finalDeadline}</p>
        </div>
      </div>
    </section>
  )
}
