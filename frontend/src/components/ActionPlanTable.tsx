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
    <section className="rounded-2xl border border-slateface bg-graphite p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slateface pb-5 mb-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 font-display">Operational Tasks</p>
          <h2 className="mt-1 text-xl font-bold font-display text-white">Execution Roadmap</h2>
        </div>
        <button
          onClick={onAddStep}
          className="rounded-lg bg-limeaccent px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-limehover shadow-lime"
        >
          + Add Step
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slateface bg-darkbg">
        <table className="min-w-full divide-y divide-slateface text-left text-xs">
          <thead className="bg-graphite text-slate-400 font-display font-semibold uppercase tracking-wider">
            <tr>
              <th className="px-5 py-4 w-16">Step</th>
              <th className="px-5 py-4 w-1/2">Task Description</th>
              <th className="px-5 py-4">Assigned Department / Agent</th>
              <th className="px-5 py-4 w-32">Target Deadline</th>
              <th className="px-5 py-4 w-28">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slateface bg-darkbg">
            {actionPlan.map((item, index) => (
              <tr key={item.step} className="hover:bg-graphite/40 transition">
                <td className="px-5 py-4 font-bold text-slate-400 font-display">{item.step}</td>
                <td className="px-5 py-4 align-top">
                  {editable ? (
                    <textarea
                      value={item.task}
                      onChange={(event) => onTaskChange(index, 'task', event.target.value)}
                      rows={2}
                      className="min-h-[72px] w-full resize-none rounded-lg border border-slateface bg-graphite px-3 py-2 text-xs text-slate-200 outline-none focus:border-limeaccent/30"
                    />
                  ) : (
                    <span className="whitespace-normal break-words text-slate-200 leading-relaxed font-medium">{item.task}</span>
                  )}
                </td>
                <td className="px-5 py-4 align-middle">
                  {editable ? (
                    <input
                      value={item.assigned_to}
                      onChange={(event) => onTaskChange(index, 'assigned_to', event.target.value)}
                      className="w-full rounded-lg border border-slateface bg-graphite px-3 py-2 text-xs text-slate-200 outline-none focus:border-limeaccent/30"
                    />
                  ) : (
                    <span className="text-slate-300 font-semibold">{item.assigned_to}</span>
                  )}
                </td>
                <td className="px-5 py-4 align-middle">
                  {editable ? (
                    <input
                      value={item.deadline ?? ''}
                      onChange={(event) => onTaskChange(index, 'deadline', event.target.value)}
                      className="w-full rounded-lg border border-slateface bg-graphite px-3 py-2 text-xs text-slate-200 outline-none focus:border-limeaccent/30"
                    />
                  ) : (
                    <span className="text-slate-400 font-medium">{item.deadline || 'None'}</span>
                  )}
                </td>
                <td className="px-5 py-4 align-middle">
                  {editable ? (
                    <select
                      value={item.status}
                      onChange={(event) => onTaskChange(index, 'status', event.target.value)}
                      className="w-full rounded-lg border border-slateface bg-graphite px-3 py-2 text-xs text-slate-200 outline-none focus:border-limeaccent/30"
                    >
                      <option>Pending</option>
                      <option>In Progress</option>
                      <option>Complete</option>
                    </select>
                  ) : (
                    <span
                      className={`inline-flex rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                        item.status === 'Complete'
                          ? 'border-limeaccent/20 bg-limeaccent/10 text-limeaccent shadow-lime'
                          : item.status === 'In Progress'
                          ? 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                          : 'border-slate-500/20 bg-slateface text-slate-400'
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
