import { useState, type DragEvent, type FormEvent } from 'react'

interface UploadModalProps {
  open: boolean
  onClose: () => void
  onUpload: (file: File) => Promise<void>
}

const steps = [
  'Reading PDF',
  'Extracting key information',
  'Generating action plan',
]

export default function UploadModal({ open, onClose, onUpload }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing'>('idle')
  const [stepIndex, setStepIndex] = useState(0)

  if (!open) return null

  const handleFile = (selectedFile: File | null) => {
    setError('')
    if (selectedFile && selectedFile.type !== 'application/pdf') {
      setError('Please upload a PDF file.')
      setFile(null)
      return
    }
    setFile(selectedFile)
  }

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setDragOver(false)
    const droppedFile = event.dataTransfer.files?.[0]
    handleFile(droppedFile ?? null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!file) {
      setError('Please select a PDF file to upload.')
      return
    }

    setError('')
    setStatus('processing')
    setStepIndex(0)

    try {
      await onUpload(file)
    } catch (uploadError: any) {
      setError(uploadError?.message || 'Processing failed. Please try again.')
      setStatus('idle')
      return
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4 py-6">
      <div className="w-full max-w-2xl rounded-[32px] bg-white p-8 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Upload Judgment</p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-950">Upload Judgment</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Upload a PDF file and let the AI analyze the judgment before it appears in the case list.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 p-3 text-slate-600 transition hover:bg-slate-200"
          >
            ×
          </button>
        </div>

        {status === 'processing' ? (
          <div className="mt-10 rounded-[28px] border border-slate-200 bg-slate-50 p-8 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-slate-900 text-white">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-white border-t-transparent" />
            </div>
            <h3 className="mt-6 text-2xl font-semibold text-slate-950">AI is analyzing your document...</h3>
            <p className="mt-3 text-sm text-slate-600">The system is reading the PDF, extracting key information, and generating the action plan.</p>
            <div className="mt-8 space-y-3 text-left">
              {steps.map((step, index) => (
                <div key={step} className="flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-full ${index <= stepIndex ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    {index <= stepIndex ? '✔' : index + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{step}</p>
                    <p className="text-sm text-slate-500">{index < stepIndex ? 'Completed' : index === stepIndex ? 'In progress' : 'Pending'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-10 space-y-6">
            <label
              className={`cursor-pointer rounded-[32px] border-2 border-dashed px-6 py-12 text-center transition ${dragOver ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-slate-50'}`}
              onDragOver={(event) => {
                event.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Drag & Drop</p>
              <p className="mt-3 text-sm text-slate-700">Drop your PDF file here or click to select.</p>
              <p className="mt-3 text-sm text-slate-500">Only PDF files are accepted.</p>
              <input
                type="file"
                accept="application/pdf"
                onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
                className="sr-only"
              />
            </label>

            <div className="rounded-[28px] border border-slate-200 bg-slate-50 px-6 py-4">
              <p className="text-sm text-slate-600">Selected file</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{file ? file.name : 'No file selected'}</p>
            </div>

            {error ? <p className="rounded-3xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={!file}
                className="inline-flex items-center justify-center rounded-3xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Upload and Process
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-3xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
