import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useUploadDocument } from '@/hooks/useDocuments'
import { useGeneratePrompt } from '@/hooks/useApplications'
import type { EvalWithMeta } from '@/types/api'

// ─── Local prompt modal ───────────────────────────────────────────────────────

function PromptModal({ prompt, title, onClose }: { prompt: string; title: string; onClose: () => void }): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  function handleCopy(): void {
    void navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="fixed inset-0 bg-bg/80 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded p-6 w-full max-w-2xl flex flex-col gap-4 max-h-[80vh]">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-accent text-lg">{title}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="text-xs px-3 py-1.5 bg-accent text-bg rounded hover:bg-accent/90 transition-colors font-mono"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={onClose}
              className="text-xs px-3 py-1.5 text-muted hover:text-text transition-colors"
            >
              Close
            </button>
          </div>
        </div>
        <pre className="flex-1 overflow-y-auto text-xs font-mono text-text bg-surface2 rounded p-4 whitespace-pre-wrap break-words leading-relaxed">
          {prompt}
        </pre>
      </div>
    </div>
  )
}

// ─── ApplyWorkflow ────────────────────────────────────────────────────────────

interface ApplyWorkflowProps {
  jobId: number
  applicationId: number
  evaluations: EvalWithMeta[]
  typstAvailable: boolean
  onImportEval: () => void
  onNavigateToEvals: () => void
  onNavigateToResume: () => void
}

export function ApplyWorkflow({
  jobId,
  applicationId,
  evaluations,
  typstAvailable,
  onImportEval,
  onNavigateToEvals,
  onNavigateToResume,
}: ApplyWorkflowProps): React.JSX.Element {
  const [evalPromptText, setEvalPromptText] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const generatePrompt = useGeneratePrompt()
  const upload = useUploadDocument(applicationId)

  async function handleGenerateEvalPrompt(): Promise<void> {
    const result = await generatePrompt.mutateAsync(applicationId)
    setEvalPromptText(result.prompt)
  }

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

      {/* ── EVALUATIONS block ─────────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-3">Evaluations</p>

        {/* Summary row */}
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Count</span>
            <span className="text-sm font-mono text-text">
              {evaluations.length > 0 ? `${evaluations.length}` : '—'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Screenability</span>
            <span className="text-sm font-mono text-muted">—</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Company Fit</span>
            <span className="text-sm font-mono text-muted">—</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Candidate Fit</span>
            <span className="text-sm font-mono text-muted">—</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap mb-3">
          <Link
            to={`/evaluate`}
            className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors"
          >
            Re-Run Internal Eval
          </Link>
          <button
            onClick={() => void handleGenerateEvalPrompt()}
            disabled={generatePrompt.isPending}
            className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50"
          >
            {generatePrompt.isPending ? 'Generating…' : 'Generate External Eval'}
          </button>
          <button
            onClick={onImportEval}
            className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors"
          >
            Import External Eval
          </button>
        </div>
        {generatePrompt.isError && (
          <p className="text-xs font-mono text-red mb-2">{generatePrompt.error.message}</p>
        )}

        <button
          onClick={onNavigateToEvals}
          className="text-xs font-mono text-accent hover:underline"
        >
          Review Evaluations →
        </button>
      </div>

      <hr className="border-surface2" />

      {/* ── RESUME GENERATION block ───────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-4">Resume Generation</p>

        {/* Pass 1 */}
        <div className="space-y-2 mb-5">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-muted w-12 shrink-0">Pass 1</span>
            <button
              disabled
              className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded opacity-40 cursor-not-allowed"
            >
              Generate First Pass .typ Prompt
            </button>
          </div>

          <form onSubmit={(e) => void handleUpload(e)} className="flex items-center gap-3 flex-wrap ml-16">
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest w-12 shrink-0">Upload</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".typ"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              className="text-xs font-mono text-muted file:mr-2 file:px-2 file:py-0.5 file:rounded file:border-0 file:bg-surface2 file:text-muted file:text-xs file:font-mono hover:file:text-text file:cursor-pointer"
            />
            <button
              type="submit"
              disabled={!selectedFile || upload.isPending}
              className="px-3 py-1.5 text-xs bg-accent text-bg rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {upload.isPending ? 'Uploading…' : 'Upload'}
            </button>
          </form>
          {uploadError && <p className="text-xs font-mono text-red">{uploadError}</p>}

          <p className="text-[10px] font-mono text-muted ml-16">
            Generate the initial tailored resume draft
          </p>

          <button
            onClick={onNavigateToResume}
            className="text-xs font-mono text-accent hover:underline ml-16 block"
          >
            Review Resumes →
          </button>
        </div>

        {/* Pass 2 */}
        <div className="space-y-2 mb-5">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-muted w-12 shrink-0">Pass 2</span>
            <button
              disabled
              className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded opacity-40 cursor-not-allowed"
            >
              Generate Recruiter Review Pass Prompt
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-muted w-12 shrink-0"></span>
            <button
              disabled
              className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded opacity-40 cursor-not-allowed"
            >
              Import Review Pass Feedback
            </button>
            <button
              disabled
              className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded opacity-40 cursor-not-allowed"
            >
              Add Feedback
            </button>
            <button
              disabled
              className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded opacity-40 cursor-not-allowed"
            >
              Review Feedback
            </button>
          </div>

          <p className="text-[10px] font-mono text-muted ml-16">
            Evaluate the draft resume and generate a correction list
          </p>
        </div>

        {/* Pass 3 */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-muted w-12 shrink-0">Pass 3</span>
            <button
              disabled
              className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded opacity-40 cursor-not-allowed"
            >
              Generate Final Pass .typ Prompt
            </button>
          </div>

          <p className="text-[10px] font-mono text-muted ml-16">
            Apply corrections and produce the final resume
          </p>
        </div>
      </div>

      {/* Eval prompt modal */}
      {evalPromptText !== null && (
        <PromptModal
          prompt={evalPromptText}
          title="External Eval Prompt"
          onClose={() => setEvalPromptText(null)}
        />
      )}
    </div>
  )
}
