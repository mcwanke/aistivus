import { useState, useRef, useCallback, useEffect } from 'react'
import { useUploadDocument, useApplicationDocuments } from '@/hooks/useDocuments'
import { useGenerateResumePrompt, useGenerateCoverPrompt } from '@/hooks/useApplications'
import { useJobResearch } from '@/hooks/useJobs'
import { useModels, useRunInternalEval } from '@/hooks/useEvaluate'
import type { InternalEvalEvent } from '@/hooks/useEvaluate'
import { InternalEvalModal } from '@/components/InternalEvalModal'
import { ResearchWorkflowModal } from '@/components/ResearchWorkflowModal'
import { ExternalEvalWorkflowModal } from '@/components/ExternalEvalWorkflowModal'
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

// ─── ApplyWorkflow ────────────────────────────────────────────────────────────

interface ApplyWorkflowProps {
  jobId: number
  applicationId: number
  evaluations: EvalWithMeta[]
  aggScoreOverall: number | null
  typstAvailable: boolean
  onNavigateToEvals: () => void
  onNavigateToResume: () => void
  onNavigateToResearch: () => void
  onNavigateToCover: () => void
}

export function ApplyWorkflow({
  jobId,
  applicationId,
  evaluations,
  aggScoreOverall,
  _typstAvailable,
  onNavigateToEvals,
  onNavigateToResume,
  onNavigateToResearch,
  onNavigateToCover,
}: ApplyWorkflowProps): React.JSX.Element {
  const [evalPromptText, setEvalPromptText] = useState<string | null>(null)
  const [researchPromptText, setResearchPromptText] = useState<string | null>(null)
  const [showResearchWorkflow, setShowResearchWorkflow] = useState(false)
  const [showExternalEvalWorkflow, setShowExternalEvalWorkflow] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Resume generation state
  const [resumePromptText, setResumePromptText] = useState<string | null>(null)
  const [_resumeLineCount, _setResumeLineCount] = useState<number | null>(null)
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null)
  const [dropdownDocId, setDropdownDocId] = useState<number | null>(null)
  const [p2UserFeedback, setP2UserFeedback] = useState('')
  const [p3CorrectionList, setP3CorrectionList] = useState('')
  const [p3JsonError, setP3JsonError] = useState('')
  const [resumePassError, setResumePassError] = useState('')
  const [replaceOnUploadStep4, setReplaceOnUploadStep4] = useState(true)
  const [step4UploadError, setStep4UploadError] = useState('')
  const [step4SelectedFile, setStep4SelectedFile] = useState<File | null>(null)
  const step4FileInputRef = useRef<HTMLInputElement>(null)

  // Cover letter generation state
  const [coverPromptText, setCoverPromptText] = useState<string | null>(null)
  const [coverSelectedFile, setCoverSelectedFile] = useState<File | null>(null)
  const [coverUploadError, setCoverUploadError] = useState('')
  const coverFileInputRef = useRef<HTMLInputElement>(null)

  const { data: research } = useJobResearch(jobId)
  const upload = useUploadDocument(applicationId)
  const step4Upload = useUploadDocument(applicationId)
  const { data: models } = useModels()
  const { run: runInternalEval } = useRunInternalEval(jobId)
  const generateResumePrompt = useGenerateResumePrompt()
  const generateCoverPrompt = useGenerateCoverPrompt()
  const coverUpload = useUploadDocument(applicationId)
  const { data: allDocs = [] } = useApplicationDocuments(applicationId)
  const resumeDocs = allDocs.filter(
    (d) => d.type_value === 'resume' && d.extension === '.typ' && d.file_exists
  )

  const [selectedModelId, setSelectedModelId] = useState<number | null>(null)
  const [showInternalEvalModal, setShowInternalEvalModal] = useState(false)
  const internalEvalHandlerRef = useRef<((evt: InternalEvalEvent) => void) | null>(null)

  // Load selectedDocId from backend on mount
  useEffect(() => {
    void fetch(`/api/v1/applications/${applicationId}/step4-selected-resume`)
      .then(res => res.json() as Promise<{ doc_id: number | null }>)
      .then(data => setSelectedDocId(data.doc_id))
      .catch(() => {
        // Silently fail if fetch doesn't work
      })
  }, [applicationId])

  // Save selectedDocId to backend whenever it changes (but not on initial null)
  useEffect(() => {
    if (selectedDocId === null) return
    void fetch(`/api/v1/applications/${applicationId}/step4-selected-resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc_id: selectedDocId }),
    }).catch(() => {
      // Silently fail if save doesn't work
    })
  }, [selectedDocId, applicationId])

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

  async function handleUpload(e: React.SyntheticEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (!selectedFile) return
    setUploadError('')
    try {
      const result = await upload.mutateAsync({ file: selectedFile, doc_type: 'resume' })
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if ('id' in result) {
        setSelectedDocId((result as { id: number }).id)
      }
    } catch (err) {
      setUploadError((err as Error).message)
    }
  }

  async function handleStep4Upload(e: React.SyntheticEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (!step4SelectedFile) return
    setStep4UploadError('')
    try {
      const result = await step4Upload.mutateAsync({ file: step4SelectedFile, doc_type: 'resume' })
      setStep4SelectedFile(null)
      if (step4FileInputRef.current) step4FileInputRef.current.value = ''
      if (replaceOnUploadStep4 && 'id' in result) {
        setSelectedDocId((result as { id: number }).id)
      }
    } catch (err) {
      setStep4UploadError((err as Error).message)
    }
  }

  function handleSelectResume(): void {
    if (dropdownDocId !== null) {
      setSelectedDocId(dropdownDocId)
    }
  }

  function handleP3CorrectionListChange(value: string): void {
    setP3CorrectionList(value)
    setP3JsonError('')

    if (!value.trim()) {
      return
    }

    try {
      const data = JSON.parse(value)

      // Extract evaluations and auto-save if present
      if (data.evaluations && selectedDocId) {
        void fetch('/api/v1/resume-evaluations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            document_id: selectedDocId,
            evaluation_json: JSON.stringify(data.evaluations),
          }),
        }).catch(() => {
          // Silently fail if evaluation save doesn't work
        })
      }

      // Extract corrections and update state
      if (data.corrections && Array.isArray(data.corrections)) {
        setP3CorrectionList(JSON.stringify(data.corrections))
      }
    } catch (err) {
      setP3JsonError(`Invalid JSON: ${(err as Error).message}`)
    }
  }

  async function handleGenerateResumePrompt(passNum: 1 | 2 | 3): Promise<void> {
    setResumePassError('')
    try {
      const result = await generateResumePrompt.mutateAsync({
        applicationId,
        passNum,
        docId: passNum > 1 ? (selectedDocId ?? undefined) : undefined,
        userFeedback: passNum === 2 ? p2UserFeedback || undefined : undefined,
        correctionList: passNum === 3 ? p3CorrectionList || undefined : undefined,
      })
      setResumePromptText(result.prompt)
      if (result.line_count != null) _setResumeLineCount(result.line_count)
    } catch (err) {
      setResumePassError((err as Error).message)
    }
  }

  async function handleGenerateCoverPrompt(): Promise<void> {
    const result = await generateCoverPrompt.mutateAsync(applicationId)
    setCoverPromptText(result.prompt)
  }

  async function handleCoverUpload(e: React.SyntheticEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (!coverSelectedFile) return
    setCoverUploadError('')
    try {
      await coverUpload.mutateAsync({ file: coverSelectedFile, doc_type: 'cover_letter' })
      setCoverSelectedFile(null)
      if (coverFileInputRef.current) coverFileInputRef.current.value = ''
    } catch (err) {
      setCoverUploadError((err as Error).message)
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
              onClick={() => setShowResearchWorkflow(true)}
              className="px-3 py-1.5 text-xs font-mono text-text/70 border-2 border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors shrink-0"
            >
              Open Research Workflow
            </button>
            <span className="text-xs font-mono text-muted">Generate prompt & import results.</span>
          </div>
          <button
            onClick={onNavigateToResearch}
            className="text-xs font-mono text-accent hover:underline self-start"
          >
            Review Research →
          </button>
        </div>
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
              onClick={() => setShowExternalEvalWorkflow(true)}
              className="px-3 py-1.5 text-xs font-mono text-text/70 border-2 border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors shrink-0"
            >
              Open External Eval Workflow
            </button>
            <span className="text-xs font-mono text-muted">Generate prompt & import results.</span>
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

      {/* ── STEP 3 — RESUME INITIAL GENERATION ────────────────────────────────── */}
      <div>
        <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Step 3 — Resume Initial Generation</p>
        <p className="text-xs font-mono text-muted mb-4">
          Generate tailored application materials after you've decided to pursue this role.
        </p>

        <div className="grid grid-cols-2 gap-6 mb-4">
          {/* Column 1 */}
          <div className="space-y-3">
            <button
              onClick={() => void handleGenerateResumePrompt(1)}
              disabled={generateResumePrompt.isPending}
              className="w-full px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:border-accent hover:text-text transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {generateResumePrompt.isPending ? 'Generating…' : 'Generate First Pass .typ Prompt'}
            </button>
            <p className="text-[10px] font-mono text-muted">
              Generate the initial tailored resume draft, then upload the result here
            </p>
            <button
              onClick={onNavigateToResume}
              className="text-xs font-mono text-accent hover:underline block"
            >
              Review Resumes →
            </button>
          </div>

          {/* Column 2 */}
          <form onSubmit={(e) => void handleUpload(e)} className="space-y-2">
            <p className="text-[10px] font-mono text-muted uppercase tracking-widest">Upload</p>
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
              className="w-full px-3 py-1.5 text-xs bg-accent text-bg rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {upload.isPending ? 'Uploading…' : 'Upload'}
            </button>
            {uploadError && <p className="text-xs font-mono text-red">{uploadError}</p>}
          </form>
        </div>
      </div>

      <hr className="border-surface2" />

      {/* ── STEP 4 — RESUME TAILORING ────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Step 4 — Resume Tailoring</p>
        <p className="text-xs font-mono text-muted mb-4">
          Iterate on resume materials for optimal job application success.
        </p>

        <div className="grid grid-cols-3 gap-4 mb-4">
          {/* Column 1 — Current Resume Selection */}
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-2">Current Target Resume</p>
              {selectedDocId ? (
                <p className="text-xs font-mono text-text bg-surface2 rounded px-2 py-1.5">
                  {resumeDocs.find(d => d.id === selectedDocId)?.filename || 'Unknown'}
                </p>
              ) : (
                <p className="text-xs font-mono text-muted italic">No resume selected</p>
              )}
            </div>

            <div className="border-t border-surface2"></div>

            <div className="space-y-2">
              <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-2">Select a Different Target Resume</p>
              {resumeDocs.length === 0 ? (
                <p className="text-[10px] font-mono text-muted">No .typ files yet — upload one above.</p>
              ) : (
                <>
                  <select
                    value={dropdownDocId ?? ''}
                    onChange={(e) => setDropdownDocId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full text-xs font-mono text-text bg-surface2 border border-surface2 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="">Select .typ file…</option>
                    {resumeDocs.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.filename}{d.is_final ? ' ★' : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleSelectResume}
                    disabled={dropdownDocId === null}
                    className="w-full px-2 py-1 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent disabled:opacity-50 transition-colors"
                  >
                    Select
                  </button>
                </>
              )}
            </div>

            <form onSubmit={(e) => void handleStep4Upload(e)} className="space-y-2 pt-2 border-t border-surface2">
              <p className="text-[10px] font-mono text-muted uppercase tracking-widest">Upload & Replace</p>
              <input
                ref={step4FileInputRef}
                type="file"
                accept=".typ"
                onChange={(e) => setStep4SelectedFile(e.target.files?.[0] ?? null)}
                className="text-xs font-mono text-muted file:mr-2 file:px-2 file:py-0.5 file:rounded file:border-0 file:bg-surface2 file:text-muted file:text-xs file:font-mono hover:file:text-text file:cursor-pointer"
              />
              <label className="flex items-center gap-2 text-[10px] font-mono text-muted hover:text-text">
                <input
                  type="checkbox"
                  checked={replaceOnUploadStep4}
                  onChange={(e) => setReplaceOnUploadStep4(e.target.checked)}
                  className="w-3 h-3 rounded cursor-pointer"
                />
                Replace current selected .typ resume with upload
              </label>
              <button
                type="submit"
                disabled={!step4SelectedFile || step4Upload.isPending}
                className="w-full px-2 py-1 text-xs bg-accent text-bg rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
              >
                {step4Upload.isPending ? 'Uploading…' : 'Upload'}
              </button>
              {step4UploadError && <p className="text-xs font-mono text-red">{step4UploadError}</p>}
            </form>
          </div>

          {/* Column 2 — Evaluation & Feedback */}
          <div className="space-y-3">
            <button
              onClick={() => void handleGenerateResumePrompt(2)}
              disabled={generateResumePrompt.isPending || !selectedDocId}
              className="w-full px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:border-accent hover:text-text transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {generateResumePrompt.isPending ? 'Generating…' : 'Generate Evaluation & Feedback Prompt'}
            </button>

            <textarea
              value={p2UserFeedback}
              onChange={(e) => setP2UserFeedback(e.target.value)}
              placeholder="Optional: notes or feedback to include in the prompt (e.g. 'make the summary shorter', 'cut the Miovision bullet')"
              rows={4}
              className="w-full bg-surface2 rounded px-3 py-2 text-xs font-mono text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent resize-y"
            />

            {resumePassError && (
              <p className="text-xs font-mono text-red">{resumePassError}</p>
            )}
          </div>

          {/* Column 3 — Enhanced Resume */}
          <div className="space-y-3">
            <button
              onClick={() => void handleGenerateResumePrompt(3)}
              disabled={generateResumePrompt.isPending || !selectedDocId || !p3CorrectionList.trim() || p3JsonError !== ''}
              className="w-full px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:border-accent hover:text-text transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {generateResumePrompt.isPending ? 'Generating…' : 'Generate Enhanced Resume .typ Prompt'}
            </button>

            <textarea
              value={p3CorrectionList}
              onChange={(e) => handleP3CorrectionListChange(e.target.value)}
              placeholder="Paste the JSON corrections from Pass 2 here…"
              rows={4}
              className="w-full bg-surface2 rounded px-3 py-2 text-xs font-mono text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent resize-y"
            />

            {p3JsonError && <p className="text-xs font-mono text-red">{p3JsonError}</p>}
          </div>
        </div>
      </div>

      <hr className="border-surface2" />

      {/* ── STEP 5 — COVER LETTER GENERATION ──────────────────────────────────── */}
      <div>
        <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Step 5 — Cover Letter Generation</p>
        <p className="text-xs font-mono text-muted mb-4">
          Generate a tailored cover letter for this application.
        </p>

        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => void handleGenerateCoverPrompt()}
              disabled={generateCoverPrompt.isPending}
              className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:border-accent hover:text-text transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {generateCoverPrompt.isPending ? 'Generating…' : 'Generate Cover Letter Prompt'}
            </button>
          </div>
          {generateCoverPrompt.isError && (
            <p className="text-xs font-mono text-red">{generateCoverPrompt.error.message}</p>
          )}

          <form onSubmit={(e) => void handleCoverUpload(e)} className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest w-12 shrink-0">Upload</span>
            <input
              ref={coverFileInputRef}
              type="file"
              accept=".typ,.pdf"
              onChange={(e) => setCoverSelectedFile(e.target.files?.[0] ?? null)}
              className="text-xs font-mono text-muted file:mr-2 file:px-2 file:py-0.5 file:rounded file:border-0 file:bg-surface2 file:text-muted file:text-xs file:font-mono hover:file:text-text file:cursor-pointer"
            />
            <button
              type="submit"
              disabled={!coverSelectedFile || coverUpload.isPending}
              className="px-3 py-1.5 text-xs bg-accent text-bg rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {coverUpload.isPending ? 'Uploading…' : 'Upload'}
            </button>
          </form>
          {coverUploadError && <p className="text-xs font-mono text-red">{coverUploadError}</p>}

          <button
            onClick={onNavigateToCover}
            className="text-xs font-mono text-accent hover:underline block"
          >
            Review Cover Letters →
          </button>
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
      {resumePromptText !== null && (
        <PromptModal
          prompt={resumePromptText}
          title="Resume Generation Prompt"
          onClose={() => setResumePromptText(null)}
        />
      )}
      {coverPromptText !== null && (
        <PromptModal
          prompt={coverPromptText}
          title="Cover Letter Generation Prompt"
          onClose={() => setCoverPromptText(null)}
        />
      )}
      {showResearchWorkflow && (
        <ResearchWorkflowModal
          jobId={jobId}
          onClose={() => setShowResearchWorkflow(false)}
        />
      )}
      {showExternalEvalWorkflow && (
        <ExternalEvalWorkflowModal
          jobId={jobId}
          onClose={() => setShowExternalEvalWorkflow(false)}
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
