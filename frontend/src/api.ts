import { CaseResponse, FinalReviewRequest, FinalReviewResponse, ReviewRequest } from './types'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

async function handleResponse(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail || response.statusText)
  }
  return response.json()
}

export async function fetchCases(status?: string): Promise<CaseResponse[]> {
  const url = status ? `${BASE_URL}/cases?status=${status}` : `${BASE_URL}/cases`
  return fetch(url).then(handleResponse)
}

export async function fetchCase(caseId: number): Promise<CaseResponse> {
  return fetch(`${BASE_URL}/cases/${caseId}`).then(handleResponse)
}

export async function approveCase(caseId: number): Promise<CaseResponse> {
  return fetch(`${BASE_URL}/cases/${caseId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'approve' }),
  }).then(handleResponse)
}

export async function submitFinalEdit(caseId: number, payload: FinalReviewRequest): Promise<FinalReviewResponse> {
  return fetch(`${BASE_URL}/cases/${caseId}/reprocess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(handleResponse)
}

export async function submitReprocess(caseId: number, payload: FinalReviewRequest): Promise<FinalReviewResponse> {
  return fetch(`${BASE_URL}/cases/${caseId}/reprocess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(handleResponse)
}

export async function uploadCase(file: File): Promise<{ case_id: number }> {
  const formData = new FormData()
  formData.append('file', file)

  return fetch(`${BASE_URL}/upload-case`, {
    method: 'POST',
    body: formData,
  }).then(handleResponse)
}

export async function processCase(caseId: number): Promise<CaseResponse> {
  return fetch(`${BASE_URL}/cases/${caseId}/process`, {
    method: 'POST',
  }).then(handleResponse)
}

export async function uploadAndProcessCase(file: File): Promise<CaseResponse> {
  const uploadResponse = await uploadCase(file)
  return processCase(uploadResponse.case_id)
}

export async function deleteCase(caseId: number): Promise<CaseResponse> {
  return fetch(`${BASE_URL}/cases/${caseId}`, {
    method: 'DELETE',
  }).then(handleResponse) }
