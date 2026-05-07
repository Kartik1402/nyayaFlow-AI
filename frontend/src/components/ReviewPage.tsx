import { useEffect, useState } from 'react'
import { CaseResponse, ReviewRequest } from '../types'

interface ReviewPageProps {
  cases: CaseResponse[]
  selectedCase: CaseResponse | null
  onSelectCase: (caseId: number) => Promise<void>
  onSubmit: (caseId: number, request: ReviewRequest) => Promise<void>
}

export default function ReviewPage({ cases, selectedCase, onSelectCase, onSubmit }: ReviewPageProps) {
  const [selection, setSelection] = useState<number | null>(selectedCase?.id ?? null)
  const [comment, setComment] = useState('')
  const [rejectionType, setRejectionType] = useState<'extraction' | 'reasoning' | 'action_plan'>('extraction')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (selectedCase) {
      setSelection(selectedCase.id)
    }
  }, [selectedCase])

  const activeCase = cases.find((item) => item.id === selection) || selectedCase

  const submitAction = async (action: ReviewRequest['action']) => {
    if (!activeCase) return
    const payload: ReviewRequest = { action }
    if (action === 'reject') {
      payload.rejection_type = rejectionType
      payload.reviewer_comment = comment
    }
    if (action === 'edit') {
      payload.reviewer_comment = comment
      payload.edited_payload = {
        extraction: activeCase.extraction,
        reasoning: activeCase.reasoning,
        action_plan: activeCase.action_plan,
        explanation: activeCase.explanation,
      }
    }
    setMessage('Submitting review...')
    try {
      await onSubmit(activeCase.id, payload)
      setMessage('Review submitted successfully.')
    } catch (error: any) {
      setMessage(`Review failed: ${error.message}`)
    }
  }

  return (
    <section>
      <h2>Review pending cases</h2>
      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ flex: 1 }}>
          <h3>Pending list</h3>
          {cases.length === 0 ? (
            <p>No cases awaiting review.</p>
          ) : (
            <ul>
              {cases.map((item) => (
                <li key={item.id}>
                  <button onClick={() => { setSelection(item.id); onSelectCase(item.id) }}>
                    {item.title} ({item.extraction?.case_number || item.id})
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ flex: 2 }}>
          {activeCase ? (
            <>
              <h3>{activeCase.title}</h3>
              <div style={{ marginBottom: 12 }}>
                <strong>Version:</strong> {activeCase.version}
              </div>
              <div style={{ marginBottom: 12 }}>
                <strong>Extraction</strong>
                <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(activeCase.extraction, null, 2)}</pre>
              </div>
              <div style={{ marginBottom: 12 }}>
                <strong>Reasoning</strong>
                <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(activeCase.reasoning, null, 2)}</pre>
              </div>
              <div style={{ marginBottom: 12 }}>
                <strong>Action Plan</strong>
                <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(activeCase.action_plan, null, 2)}</pre>
              </div>
              <div style={{ marginBottom: 12 }}>
                <strong>Explanation</strong>
                <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(activeCase.explanation, null, 2)}</pre>
              </div>
              <div>
                <label>
                  Reviewer comment:
                  <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} style={{ width: '100%' }} />
                </label>
              </div>
              <div style={{ marginTop: 12 }}>
                <label>
                  Reject reason:
                  <select value={rejectionType} onChange={(e) => setRejectionType(e.target.value as any)}>
                    <option value="extraction">Extraction</option>
                    <option value="reasoning">Reasoning</option>
                    <option value="action_plan">Action Plan</option>
                  </select>
                </label>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button onClick={() => submitAction('approve')}>Approve</button>
                <button onClick={() => submitAction('edit')}>Edit & Approve</button>
                <button onClick={() => submitAction('reject')}>Reject</button>
              </div>
              {message && <p>{message}</p>}
            </>
          ) : (
            <p>Select a pending case to review.</p>
          )}
        </div>
      </div>
    </section>
  )
}
