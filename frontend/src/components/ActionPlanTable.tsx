interface ActionPlanItem {
  step: number
  task: string
  assigned_to: string
  deadline?: string | null
  status: string
}

interface ActionPlanTableProps {
  actionPlan: ActionPlanItem[]
  editable: boolean
  onTaskChange: (index: number, field: 'task' | 'assigned_to' | 'deadline' | 'status', value: string) => void
  onAddStep: () => void
}

export default function ActionPlanTable({
  actionPlan,
  editable,
  onTaskChange,
  onAddStep,
}: ActionPlanTableProps) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Action Plan</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Task roadmap</h2>
        </div>
        <button
          onClick={onAddStep}
          className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          + Add Step
        </button>
      </div>

      <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-4">Step</th>
              <th className="px-4 py-4">Task Description</th>
              <th className="px-4 py-4">Assigned To</th>
              <th className="px-4 py-4">Deadline</th>
              <th className="px-4 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {actionPlan.map((item, index) => (
              <tr key={item.step} className="hover:bg-slate-50">
                <td className="px-4 py-4 font-semibold text-slate-900">{item.step}</td>
                <td className="px-4 py-4 align-top">
                  {editable ? (
                    <textarea
                      value={item.task}
                      onChange={(event) => onTaskChange(index, 'task', event.target.value)}
                      rows={2}
                      className="min-h-[72px] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                    />
                  ) : (
                    <span className="whitespace-normal break-words text-sm text-slate-900">{item.task}</span>
                  )}
                </td>
                <td className="px-4 py-4">
                  {editable ? (
                    <input
                      value={item.assigned_to}
                      onChange={(event) => onTaskChange(index, 'assigned_to', event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                    />
                  ) : (
                    <span>{item.assigned_to}</span>
                  )}
                </td>
                <td className="px-4 py-4">
                  {editable ? (
                    <input
                      value={item.deadline ?? ''}
                      onChange={(event) => onTaskChange(index, 'deadline', event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                    />
                  ) : (
                    <span className="text-slate-600">{item.deadline}</span>
                  )}
                </td>
                <td className="px-4 py-4">
                  {editable ? (
                    <select
                      value={item.status}
                      onChange={(event) => onTaskChange(index, 'status', event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                    >
                      <option>Pending</option>
                      <option>In Progress</option>
                      <option>Complete</option>
                    </select>
                  ) : (
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        item.status === 'Complete'
                          ? 'bg-emerald-100 text-emerald-700'
                          : item.status === 'In Progress'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {item.status}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
