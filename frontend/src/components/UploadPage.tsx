import { FormEvent, useState } from 'react'

interface UploadPageProps {
  onUpload: (file: File) => Promise<void>
}

export default function UploadPage({ onUpload }: UploadPageProps) {
  const [file, setFile] = useState<File | null>(null)
  const [message, setMessage] = useState('')

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!file) return
    setMessage('Uploading...')
    try {
      await onUpload(file)
      setMessage('Upload complete. Please review the new case.')
    } catch (error: any) {
      setMessage(`Upload failed: ${error.message}`)
    }
  }

  return (
    <section>
      <h2>Upload judgment PDF</h2>
      <form onSubmit={handleSubmit}>
        <input type="file" accept="application/pdf,text/plain" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button type="submit" disabled={!file}>Upload</button>
      </form>
      {message && <p>{message}</p>}
    </section>
  )
}
