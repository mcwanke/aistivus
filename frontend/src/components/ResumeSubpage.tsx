import { useState, useRef } from 'react'
import { useApplicationDocuments, useUploadDocument, useLatestResumeEvaluation } from '@/hooks/useDocuments'
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
        <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-2">Evaluation Scores</p>
        <EvaluationScoresTable documents={resumeDocs} />
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

interface EvaluationScoresTableProps {
  documents: Array<{ id: number; filename: string }>
}

function EvaluationScoresTable({ documents }: EvaluationScoresTableProps): React.JSX.Element {
  const typDocs = documents.filter((d) => d.filename.endsWith('.typ'))

  if (typDocs.length === 0) {
    return <p className="text-sm text-muted italic">No .typ documents yet.</p>
  }

  return (
    <div className="overflow-x-auto border border-surface2 rounded">
      <table className="w-full text-xs font-mono">
        <thead className="bg-surface2 border-b border-surface2">
          <tr>
            <th className="text-left px-3 py-2 text-muted">Document</th>
            <th className="text-center px-2 py-2 text-muted">Holistic</th>
            <th className="text-center px-2 py-2 text-muted">ATS</th>
            <th className="text-center px-2 py-2 text-muted">Rec Fast</th>
            <th className="text-center px-2 py-2 text-muted">Rec Deep</th>
            <th className="text-center px-2 py-2 text-muted">HM Fast</th>
            <th className="text-center px-2 py-2 text-muted">HM Deep</th>
            <th className="text-center px-2 py-2 text-muted">Fit</th>
            <th className="text-center px-2 py-2 text-muted">Seniority</th>
            <th className="text-center px-2 py-2 text-muted">Voice</th>
            <th className="text-center px-2 py-2 text-muted">Tailor</th>
            <th className="text-center px-2 py-2 text-muted">Gaps</th>
            <th className="text-center px-2 py-2 text-muted">Agg</th>
            <th className="text-left px-3 py-2 text-muted">Rec</th>
            <th className="text-left px-3 py-2 text-muted">Date</th>
          </tr>
        </thead>
        <tbody>
          {typDocs.map((doc) => (
            <EvaluationScoresRow key={doc.id} docId={doc.id} filename={doc.filename} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface EvaluationScoresRowProps {
  docId: number
  filename: string
}

function EvaluationScoresRow({ docId, filename }: EvaluationScoresRowProps): React.JSX.Element {
  const { data: evaluation } = useLatestResumeEvaluation(docId)

  if (!evaluation) {
    return (
      <tr className="border-b border-surface2/50 hover:bg-surface2/30">
        <td className="px-3 py-2 text-text truncate">{filename}</td>
        <td colSpan={13} className="px-3 py-2 text-muted italic text-center">
          No evaluation
        </td>
      </tr>
    )
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return '<1m'
    if (diffMins < 60) return `${diffMins}m`
    if (diffHours < 24) return `${diffHours}h`
    return `${diffDays}d`
  }

  return (
    <tr className="border-b border-surface2/50 hover:bg-surface2/30">
      <td className="px-3 py-2 text-text truncate max-w-xs">{filename}</td>
      <td className="px-2 py-2 text-center text-text">{evaluation.holistic_assessment}</td>
      <td className="px-2 py-2 text-center text-text">{evaluation.score_ats}</td>
      <td className="px-2 py-2 text-center text-text">{evaluation.score_recruiter_fast}</td>
      <td className="px-2 py-2 text-center text-text">{evaluation.score_recruiter_deep}</td>
      <td className="px-2 py-2 text-center text-text">{evaluation.score_hiringmanager_fast}</td>
      <td className="px-2 py-2 text-center text-text">{evaluation.score_hiringmanager_deep}</td>
      <td className="px-2 py-2 text-center text-text">{evaluation.score_candidate_fit}</td>
      <td className="px-2 py-2 text-center text-text">{evaluation.score_seniority_signal}</td>
      <td className="px-2 py-2 text-center text-text">{evaluation.score_voice_agency}</td>
      <td className="px-2 py-2 text-center text-text">{evaluation.score_tailoring}</td>
      <td className="px-2 py-2 text-center text-text">{evaluation.score_gap_flags}</td>
      <td className="px-2 py-2 text-center text-text">{evaluation.lenses_aggregate?.toFixed(1)}</td>
      <td className="px-3 py-2 text-left text-text">{evaluation.recommendation}</td>
      <td className="px-3 py-2 text-left text-muted/70">{formatDate(evaluation.created_at)}</td>
    </tr>
  )
}
