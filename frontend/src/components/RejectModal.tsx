interface RejectModalProps {
  open: boolean
  onClose: () => void
  stages: Array<'extractor' | 'reasoning' | 'action_plan'>
  feedback: string
  onStageChange: (stages: Array<'extractor' | 'reasoning' | 'action_plan'>) => void
  onFeedbackChange: (value: string) => void
  onSubmit: () => void
  submitting?: boolean
}

const stageOptions = ['extractor', 'reasoning', 'action_plan'] as const

export default function RejectModal({
  open,
  onClose,
  stages,
  feedback,
  onStageChange,
  onFeedbackChange,
  onSubmit,
  submitting = false,
}: RejectModalProps) {
  if (!open) return null

  const toggleStage = (stage: (typeof stageOptions)[number]) => {
    const next = stages.includes(stage)
      ? stages.filter((item) => item !== stage)
      : [...stages, stage]
    onStageChange(next)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-darkbg/80 backdrop-blur-sm px-4 py-6 sm:items-center sm:px-8">
      <div className="w-full max-w-2xl rounded-2xl border border-slateface bg-graphite p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4 border-b border-slateface pb-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 font-display">Intelligence Loop</p>
            <h2 className="mt-1 text-xl font-bold font-display text-white">Select stages to reprocess</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-darkbg border border-slateface px-3.5 py-1.5 text-xs text-slate-400 transition hover:bg-slateface"
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {stageOptions.map((stage) => (
              <button
                key={stage}
                type="button"
                onClick={() => toggleStage(stage)}
                className={`rounded-lg border px-4 py-3.5 text-xs font-bold uppercase tracking-wider transition ${
                  stages.includes(stage)
                    ? 'border-limeaccent/30 bg-limeaccent/10 text-limeaccent shadow-lime'
                    : 'border-slateface bg-darkbg text-slate-400'
                }`}
              >
                {stage.replace('_', ' ')}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Feedback Details</label>
            <textarea
              value={feedback}
              onChange={(event) => onFeedbackChange(event.target.value)}
              placeholder="Describe what is wrong (e.g., wrong authority, incorrect deadline)"
              className="mt-3 h-32 w-full rounded-lg border border-slateface bg-darkbg px-4 py-3 text-xs text-slate-200 outline-none focus:border-limeaccent/30"
            />
          </div>
          <div className="flex justify-end gap-3 border-t border-slateface pt-5">
            <button
              onClick={onClose}
              className="rounded-lg border border-slateface bg-darkbg px-5 py-2.5 text-xs font-bold text-slate-400 transition hover:bg-slateface"
            >
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={submitting}
              className="rounded-lg bg-red-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Processing...' : 'Reprocess Case'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
