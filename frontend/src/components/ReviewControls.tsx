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
    <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-slate-50/95 px-6 py-4 backdrop-blur-lg lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        {editMode ? (
          <button
            onClick={onSave}
            disabled={saveLoading || approveLoading || rejectLoading}
            className="inline-flex items-center justify-center rounded-2xl bg-amber-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saveLoading ? 'Saving...' : 'Save Changes'}
          </button>
        ) : (
          <button
            onClick={onEdit}
            disabled={saveLoading || approveLoading || rejectLoading}
            className="inline-flex items-center justify-center rounded-2xl bg-amber-200 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            ✏️ Edit Findings
          </button>
        )}
        <button
          onClick={onApprove}
          disabled={saveLoading || approveLoading || rejectLoading}
          className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {approveLoading ? 'Approving...' : '✅ Approve Case'}
        </button>
        <button
          onClick={onReject}
          disabled={saveLoading || approveLoading || rejectLoading}
          className="inline-flex items-center justify-center rounded-2xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {rejectLoading ? 'Processing...' : '❌ Reject / Feedback'}
        </button>
      </div>
    </div>
  )
}
