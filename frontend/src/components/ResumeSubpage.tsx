import { useState, useRef } from 'react'
import { useApplicationDocuments, useUploadDocument } from '@/hooks/useDocuments'
import { DocRow } from '@/components/DocRow'

interface ResumeSubpageProps {
  applicationId: number
  typstAvailable: boolean
}

export function ResumeSubpage({ applicationId, typstAvailable }: ResumeSubpageProps): React.JSX.Element {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: documents = [], isLoading: docsLoading } = useApplicationDocuments(applicationId)
  const upload = useUploadDocument(applicationId)

  const resumeDocs = documents.filter((d) => d.type_value === 'resume')

  async function handleUpload(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (!selectedFile) return
    setUploadError('')
    try {
      await upload.mutateAsync({ file: selectedFile, doc_type: 'resume' })
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setUploadError((err as Error).message)
    }
  }

  return (
    <div className="space-y-6">
      {!typstAvailable && (
        <div className="flex items-start gap-3 bg-surface2 border border-surface2 rounded-lg px-4 py-3">
          <span className="text-accent shrink-0 mt-0.5">⚠</span>
          <div className="space-y-1">
            <p className="text-sm font-sans text-text">Typst not found — compilation disabled.</p>
            <p className="text-xs font-mono text-muted">
              Install:{' '}
              <span className="text-text">brew install typst</span> (macOS) ·{' '}
              <span className="text-text">snap install typst</span> (Linux)
            </p>
            <p className="text-xs font-mono text-muted">Restart the server after installing.</p>
          </div>
        </div>
      )}

      <div>
        <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-2">Upload</p>
        <form onSubmit={(e) => void handleUpload(e)}>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept=".typ,.pdf"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              className="text-sm font-mono text-muted file:mr-2 file:px-3 file:py-1 file:rounded file:border-0 file:bg-surface2 file:text-muted file:text-xs file:font-mono hover:file:text-text file:cursor-pointer"
            />
            <button
              type="submit"
              disabled={!selectedFile || upload.isPending}
              className="px-3 py-1.5 text-sm bg-accent text-bg rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {upload.isPending ? 'Uploading…' : 'Upload'}
            </button>
          </div>
          {uploadError && <p className="text-xs font-mono text-red mt-2">{uploadError}</p>}
        </form>
      </div>

      <div>
        <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-2">Documents</p>
        {docsLoading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : resumeDocs.length === 0 ? (
          <p className="text-sm text-muted italic">No resume documents yet. Upload a file above.</p>
        ) : (
          <div>
            {resumeDocs.map((doc) => (
              <DocRow
                key={doc.id}
                doc={doc}
                applicationId={applicationId}
                typstAvailable={typstAvailable}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
