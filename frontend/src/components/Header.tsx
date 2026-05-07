interface HeaderProps {
  caseId: string
  version: string
  status: string
  pipeline: string[]
}

export default function Header({ caseId, version, status, pipeline }: HeaderProps) {
  return (
    <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-glow">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Legal AI Reviewer</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">Case {caseId}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
            {version}
          </span>
          <span className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
            {status}
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
        {pipeline.map((step, idx) => (
          <div
            key={step}
            className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white">
              ✓
            </div>
            <div>
              <p className="text-slate-600">{step}</p>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Complete</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
