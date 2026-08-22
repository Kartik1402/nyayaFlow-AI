interface ReviewControlsProps {
  editMode: boolean
  onEdit: () => void
  onSave: () => void
  onApprove: () => void
  onReject: () => void
  saveLoading?: boolean
  approveLoading?: boolean
  rejectLoading?: boolean
}

export default function ReviewControls({
  editMode,
  onEdit,
  onSave,
  onApprove,
  onReject,
  saveLoading = false,
  approveLoading = false,
  rejectLoading = false,
}: ReviewControlsProps) {
  return (
    <div className="sticky bottom-0 z-20 border-t border-slateface bg-graphite/95 px-6 py-4.5 backdrop-blur-lg lg:px-8 shadow-glow">
      <div className="mx-auto flex max-w-7xl flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-end">
        {editMode ? (
          <button
            onClick={onSave}
            disabled={saveLoading || approveLoading || rejectLoading}
            className="inline-flex items-center justify-center rounded-lg bg-limeaccent px-5 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-limehover shadow-lime disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saveLoading ? 'Saving...' : 'Save Findings'}
          </button>
        ) : (
          <button
            onClick={onEdit}
            disabled={saveLoading || approveLoading || rejectLoading}
            className="inline-flex items-center justify-center rounded-lg border border-slateface bg-darkbg px-5 py-2.5 text-xs font-bold text-slate-300 transition hover:bg-slateface disabled:cursor-not-allowed disabled:opacity-60"
          >
            ✏️ Edit Draft
          </button>
        )}
        <button
          onClick={onApprove}
          disabled={saveLoading || approveLoading || rejectLoading}
          className="inline-flex items-center justify-center rounded-lg bg-limeaccent px-5 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-limehover shadow-lime disabled:cursor-not-allowed disabled:opacity-60"
        >
          {approveLoading ? 'Approving...' : 'Publish verified dossier'}
        </button>
        <button
          onClick={onReject}
          disabled={saveLoading || approveLoading || rejectLoading}
          className="inline-flex items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 px-5 py-2.5 text-xs font-bold text-red-400 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {rejectLoading ? 'Processing...' : 'Reject & feedback'}
        </button>
      </div>
    </div>
  )
}
