interface HeaderProps {
  caseId: string
  version: string
  status: string
  pipeline: string[]
}

export default function Header({ caseId, version, status, pipeline }: HeaderProps) {
  const isApproved = status.toLowerCase() === 'approved' || status.toLowerCase() === 'verified'
  const isEditing = status.toLowerCase() === 'editing'
  const isReady = status.toLowerCase().includes('review')

  return (
    <div className="rounded-2xl border border-slateface bg-graphite p-6 shadow-glow">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500 font-semibold font-display">Intelligence Workflow System</p>
          <h1 className="mt-2 text-2xl font-bold font-display text-white">Case {caseId}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-lg bg-slateface px-3.5 py-1.5 text-xs font-bold tracking-wider text-slate-300 border border-slateface">
            {version}
          </span>
          <span className={`rounded-lg border px-3.5 py-1.5 text-xs font-bold tracking-wider uppercase ${
            isApproved 
              ? 'border-limeaccent/30 bg-limeaccent/10 text-limeaccent shadow-lime' 
              : isEditing 
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' 
                : isReady 
                  ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400' 
                  : 'border-slate-500/30 bg-slate-500/10 text-slate-400'
          }`}>
            {status}
          </span>
        </div>
      </div>

      <div className="mt-8 grid gap-4 text-sm sm:grid-cols-3">
        {pipeline.map((step, idx) => (
          <div
            key={step}
            className="flex items-center gap-3.5 rounded-xl border border-slateface bg-darkbg px-4 py-3"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-limeaccent/10 border border-limeaccent/20 text-limeaccent text-sm shadow-lime">
              ✓
            </div>
            <div>
              <p className="text-slate-300 font-semibold text-xs tracking-wide">{step}</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Pipeline Stage Complete</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
