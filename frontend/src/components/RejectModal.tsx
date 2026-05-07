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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 px-4 py-6 sm:items-center sm:px-8">
      <div className="w-full max-w-2xl rounded-[32px] bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Reject & Reprocess</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">Select stages to reprocess</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-slate-100 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-200"
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
                className={`rounded-3xl border px-4 py-4 text-sm font-semibold transition ${
                  stages.includes(stage)
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                {stage.replace('_', ' ')}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700">Feedback</label>
            <textarea
              value={feedback}
              onChange={(event) => onFeedbackChange(event.target.value)}
              placeholder="Describe what is wrong (e.g., wrong authority, incorrect deadline)"
              className="mt-3 h-32 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={submitting}
              className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Processing...' : 'Reprocess Case'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
