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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-darkbg/85 backdrop-blur-sm px-4 py-6">
      <div className="w-full max-w-2xl rounded-2xl border border-slateface bg-graphite p-8 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slateface pb-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 font-display">Ingestion Pipeline</p>
            <h2 className="mt-1.5 text-2xl font-bold font-display text-white">Upload Judgment</h2>
            <p className="mt-2 text-xs leading-5 text-slate-400">Upload a PDF file and let the AI analyze the judgment before it appears in the case list.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-darkbg border border-slateface p-2 text-slate-400 transition hover:bg-slateface"
          >
            ×
          </button>
        </div>

        {status === 'processing' ? (
          <div className="mt-8 rounded-xl border border-slateface bg-darkbg p-8 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-limeaccent/10 border border-limeaccent/20 text-limeaccent shadow-lime animate-pulse">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-limeaccent border-t-transparent" />
            </div>
            <h3 className="mt-6 text-xl font-bold font-display text-white">AI is analyzing your document...</h3>
            <p className="mt-2.5 text-xs text-slate-400">The system is reading the PDF, extracting key information, and generating the action plan.</p>
            <div className="mt-8 space-y-3.5 text-left">
              {steps.map((step, index) => (
                <div key={step} className="flex items-center gap-3.5 rounded-lg border border-slateface bg-graphite p-4">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    index <= stepIndex 
                      ? 'bg-limeaccent/10 border border-limeaccent/25 text-limeaccent shadow-lime' 
                      : 'bg-slateface text-slate-500'
                  }`}>
                    {index <= stepIndex ? '✔' : index + 1}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-200">{step}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">{
                      index < stepIndex ? 'Completed' : index === stepIndex ? 'In progress' : 'Pending'
                    }</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <label
              className={`cursor-pointer block rounded-xl border border-dashed p-10 text-center transition ${
                dragOver 
                  ? 'border-limeaccent bg-limeaccent/5' 
                  : 'border-slateface bg-darkbg hover:border-slateface/80'
              }`}
              onDragOver={(event) => {
                event.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Drag & Drop</p>
              <p className="mt-2.5 text-xs text-slate-300">Drop your PDF file here or click to select.</p>
              <p className="mt-2 text-[10px] text-slate-500">Only PDF files are accepted.</p>
              <input
                type="file"
                accept="application/pdf"
                onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
                className="sr-only"
              />
            </label>

            <div className="rounded-xl border border-slateface bg-darkbg px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Selected file</p>
              <p className="mt-1.5 text-xs font-semibold text-slate-200">{file ? file.name : 'No file selected'}</p>
            </div>

            {error ? <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs text-red-400 font-medium">{error}</p> : null}

            <div className="flex flex-wrap items-center gap-3 border-t border-slateface pt-6">
              <button
                type="submit"
                disabled={!file}
                className="inline-flex items-center justify-center rounded-lg bg-limeaccent px-6 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-limehover shadow-lime disabled:cursor-not-allowed disabled:opacity-50"
              >
                Upload and Process
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-lg border border-slateface bg-darkbg px-6 py-2.5 text-xs font-bold text-slate-400 transition hover:bg-slateface"
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
