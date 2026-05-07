import { useEffect, useState } from 'react'
import { CaseResponse } from '../types'
import { fetchCases } from '../api'

interface DashboardProps {
  onLoad: () => Promise<void>
}

export default function Dashboard({ onLoad }: DashboardProps) {
  const [cases, setCases] = useState<CaseResponse[]>([])

  useEffect(() => {
    refreshApproved()
  }, [])

  const refreshApproved = async () => {
    const approved = await fetchCases('approved')
    setCases(approved)
    await onLoad()
  }

  return (
    <section>
      <h2>Approved action plans</h2>
      {cases.length === 0 ? (
        <p>No approved cases yet.</p>
      ) : (
        <ul>
          {cases.map((item) => (
            <li key={item.id} style={{ marginBottom: 18 }}>
              <strong>{item.title}</strong> (v{item.version})
              <div>Status: {item.status}</div>
              <details>
                <summary>View verified output</summary>
                <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(item, null, 2)}</pre>
              </details>
            </li>
          ))}
        </ul>
      )}
      <button onClick={refreshApproved}>Refresh</button>
    </section>
  )
}
