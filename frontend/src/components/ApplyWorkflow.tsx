import { useState, useRef, useCallback } from 'react'
import { useUploadDocument } from '@/hooks/useDocuments'
import { useGeneratePrompt } from '@/hooks/useApplications'
import { useGenerateResearchPrompt, useImportResearch, useJobResearch } from '@/hooks/useJobs'
import { useModels, useRunInternalEval } from '@/hooks/useEvaluate'
import type { InternalEvalEvent } from '@/hooks/useEvaluate'
import { InternalEvalModal } from '@/components/InternalEvalModal'
import { fmtScore } from '@/utils/formatting'
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

// ─── Research import modal ────────────────────────────────────────────────────

function ResearchImportModal({ jobId, onClose }: { jobId: number; onClose: () => void }): React.JSX.Element {
  const [text, setText] = useState('')
  const importMutation = useImportResearch(jobId)

  async function handleImport(): Promise<void> {
    await importMutation.mutateAsync(text.trim())
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-bg/80 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded p-6 w-full max-w-2xl flex flex-col gap-4 max-h-[80vh]">
        <h2 className="font-serif text-accent text-lg">Import Research Results</h2>
        <p className="text-xs font-mono text-muted">Paste the JSON output from the research prompt below.</p>
        <textarea
          className="flex-1 min-h-[300px] bg-surface2 rounded px-3 py-2 text-xs font-mono text-text focus:outline-none focus:ring-1 focus:ring-accent resize-y"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{ "research_summary": "...", "research_confidence": "high", ... }'
        />
        {importMutation.isError && (
          <p className="text-red text-xs font-mono">{importMutation.error.message}</p>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-muted hover:text-text transition-colors">
            Cancel
          </button>
          <button
            onClick={() => void handleImport()}
            disabled={!text.trim() || importMutation.isPending}
            className="px-4 py-1.5 text-sm bg-accent text-bg rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {importMutation.isPending ? 'Importing…' : 'Parse & Import'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ApplyWorkflow ────────────────────────────────────────────────────────────

interface ApplyWorkflowProps {
  jobId: number
  applicationId: number
  evaluations: EvalWithMeta[]
  aggScoreOverall: number | null
  typstAvailable: boolean
  onImportEval: () => void
  onNavigateToEvals: () => void
  onNavigateToResume: () => void
  onNavigateToResearch: () => void
}

export function ApplyWorkflow({
  jobId,
  applicationId,
  evaluations,
  aggScoreOverall,
  onImportEval,
  onNavigateToEvals,
  onNavigateToResume,
  onNavigateToResearch,
}: ApplyWorkflowProps): React.JSX.Element {
  const [evalPromptText, setEvalPromptText] = useState<string | null>(null)
  const [researchPromptText, setResearchPromptText] = useState<string | null>(null)
  const [showResearchImport, setShowResearchImport] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const generateEvalPrompt = useGeneratePrompt()
  const generateResearchPrompt = useGenerateResearchPrompt(jobId)
  const { data: research } = useJobResearch(jobId)
  const upload = useUploadDocument(applicationId)
  const { data: models } = useModels()
  const { run: runInternalEval } = useRunInternalEval(jobId)

  const [selectedModelId, setSelectedModelId] = useState<number | null>(null)
  const [showInternalEvalModal, setShowInternalEvalModal] = useState(false)
  const internalEvalHandlerRef = useRef<((evt: InternalEvalEvent) => void) | null>(null)

  // Default selectedModelId to the default model once models load
  const defaultModelId = models?.find(m => m.default_flag === 1)?.id ?? models?.[0]?.id ?? null
  const resolvedModelId = selectedModelId ?? defaultModelId

  const registerInternalEvalHandler = useCallback(
    (handler: (evt: InternalEvalEvent) => void) => {
      internalEvalHandlerRef.current = handler
    },
    [],
  )

  async function handleRunInternalEval(): Promise<void> {
    setShowInternalEvalModal(true)
    await runInternalEval(resolvedModelId, (evt) => {
      internalEvalHandlerRef.current?.(evt)
    })
  }

  // Composite score averages from new-schema evals (composite_screenability populated)
  const newSchemaEvals = evaluations.filter((e) => e.composite_screenability != null)
  const avgScreen = newSchemaEvals.length > 0
    ? newSchemaEvals.reduce((s, e) => s + (e.composite_screenability ?? 0), 0) / newSchemaEvals.length
    : null
  const avgCompany = newSchemaEvals.length > 0
    ? newSchemaEvals.reduce((s, e) => s + (e.composite_company_fit ?? 0), 0) / newSchemaEvals.length
    : null
  const avgCandidate = newSchemaEvals.length > 0
    ? newSchemaEvals.reduce((s, e) => s + (e.composite_candidate_fit ?? 0), 0) / newSchemaEvals.length
    : null

  async function handleGenerateEvalPrompt(): Promise<void> {
    const result = await generateEvalPrompt.mutateAsync(applicationId)
    setEvalPromptText(result.prompt)
  }

  async function handleGenerateResearchPrompt(): Promise<void> {
    const result = await generateResearchPrompt.mutateAsync()
    setResearchPromptText(result.prompt)
  }

  async function handleUpload(e: React.SyntheticEvent<HTMLFormElement>): Promise<void> {
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

      {/* ── STEP 1 — RESEARCH ─────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1 flex items-center gap-2">
          {research != null && <span className="text-green text-base leading-none">✓</span>}
          Step 1 — Research
        </p>
        <p className="text-xs font-mono text-muted mb-3">
          This is an external prompt — it requires internet access. Do this first to gather
          information about the company before running evaluations. This data is inserted
          into following prompts, so don't skip it.
        </p>

        <div className="flex flex-col gap-2 mb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => void handleGenerateResearchPrompt()}
              disabled={generateResearchPrompt.isPending}
              className="px-3 py-1.5 text-xs font-mono text-text/70 border-2 border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50 shrink-0"
            >
              {generateResearchPrompt.isPending ? 'Generating…' : 'Generate Research Prompt'}
            </button>
            <span className="text-xs font-mono text-muted">Build the external research prompt for this job.</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowResearchImport(true)}
              className="px-3 py-1.5 text-xs font-mono text-text/70 border-2 border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors shrink-0"
            >
              Import Research Results
            </button>
            <span className="text-xs font-mono text-muted">Paste the JSON output from the research prompt.</span>
          </div>
          <button
            onClick={onNavigateToResearch}
            className="text-xs font-mono text-accent hover:underline self-start"
          >
            Review Research →
          </button>
        </div>
        {generateResearchPrompt.isError && (
          <p className="text-xs font-mono text-red mb-2">{generateResearchPrompt.error.message}</p>
        )}
      </div>

      <hr className="border-surface2" />

      {/* ── STEP 2 — EVALUATE ─────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1 flex items-center gap-2">
          {evaluations.length >= 2 && <span className="text-green text-base leading-none">✓</span>}
          Step 2 — Evaluate
        </p>
        <p className="text-xs font-mono text-muted mb-3">
          Run the evaluation after completing research. Scores reflect how well you match
          this role from both the company's and your own perspective. Research context is
          automatically included when available.
        </p>

        {/* Summary row */}
        <div className="grid grid-cols-5 gap-4 mb-4">
          <div className="flex flex-col">
            <span className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Evaluation Count</span>
            <span className="text-sm font-mono text-text">
              {evaluations.length > 0 ? `${evaluations.length}` : '—'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Screenability</span>
            <span className="text-sm font-mono text-text">
              {avgScreen != null ? `${fmtScore(avgScreen)} / 10` : '—'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Company Fit</span>
            <span className="text-sm font-mono text-text">
              {avgCompany != null ? `${fmtScore(avgCompany)} / 10` : '—'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Candidate Fit</span>
            <span className="text-sm font-mono text-text">
              {avgCandidate != null ? `${fmtScore(avgCandidate)} / 10` : '—'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Overall</span>
            <span className="text-sm font-mono text-text">
              {aggScoreOverall != null ? fmtScore(aggScoreOverall) : '—'}
            </span>
          </div>
        </div>

        {/* Model selector + internal eval */}
        <div className="flex flex-col gap-1 mb-2">
          {models && models.length > 0 && (
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-muted shrink-0">Model:</span>
              <select
                value={resolvedModelId ?? ''}
                onChange={e => setSelectedModelId(Number(e.target.value))}
                className="text-xs font-mono text-text bg-surface2 border border-surface2 rounded px-2 py-1 focus:outline-none focus:border-accent/40"
              >
                {models.map(m => (
                  <option key={m.id} value={m.id}>{m.model}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => void handleRunInternalEval()}
              disabled={showInternalEvalModal}
              className="px-3 py-1.5 text-xs font-mono text-text/70 border-2 border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              Run Internal Eval
            </button>
            <span className="text-xs font-mono text-muted">Run an in-app evaluation using your configured LLM.</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => void handleGenerateEvalPrompt()}
              disabled={generateEvalPrompt.isPending}
              className="px-3 py-1.5 text-xs font-mono text-text/70 border-2 border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50 shrink-0"
            >
              {generateEvalPrompt.isPending ? 'Generating…' : 'Generate External Eval'}
            </button>
            <span className="text-xs font-mono text-muted">Build the external evaluation prompt for use in Claude.ai.</span>
          </div>
          {generateEvalPrompt.isError && (
            <p className="text-xs font-mono text-red ml-0">{generateEvalPrompt.error.message}</p>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={onImportEval}
              className="px-3 py-1.5 text-xs font-mono text-text/70 border-2 border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors shrink-0"
            >
              Import External Eval
            </button>
            <span className="text-xs font-mono text-muted">Paste the JSON output from the external eval prompt.</span>
          </div>
        </div>

        <button
          onClick={onNavigateToEvals}
          className="text-xs font-mono text-accent hover:underline"
        >
          Review Evaluations →
        </button>
      </div>

      <hr className="border-surface2" />

      {/* ── STEP 3 — RESUME GENERATION ────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Step 3 — Resume Generation</p>
        <p className="text-xs font-mono text-muted mb-4">
          Generate tailored application materials after you've decided to pursue this role.
        </p>

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

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      {evalPromptText !== null && (
        <PromptModal
          prompt={evalPromptText}
          title="External Eval Prompt"
          onClose={() => setEvalPromptText(null)}
        />
      )}
      {researchPromptText !== null && (
        <PromptModal
          prompt={researchPromptText}
          title="Company Research Prompt"
          onClose={() => setResearchPromptText(null)}
        />
      )}
      {showResearchImport && (
        <ResearchImportModal
          jobId={jobId}
          onClose={() => setShowResearchImport(false)}
        />
      )}
      {showInternalEvalModal && (
        <InternalEvalModal
          onEvent={registerInternalEvalHandler}
          onClose={() => setShowInternalEvalModal(false)}
        />
      )}
    </div>
  )
}
