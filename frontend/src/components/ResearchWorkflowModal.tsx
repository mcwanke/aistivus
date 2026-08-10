import { useState, useEffect } from 'react'
import { useGenerateResearchPrompt, useImportResearch, useJobResearch } from '@/hooks/useJobs'

interface ResearchWorkflowModalProps {
  jobId: number
  onClose: () => void
}

export function ResearchWorkflowModal({ jobId, onClose }: ResearchWorkflowModalProps): React.JSX.Element {
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null)
  const [copiedGen, setCopiedGen] = useState(false)
  const [importText, setImportText] = useState('')
  const [copiedImp, setCopiedImp] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const generateMutation = useGenerateResearchPrompt(jobId)
  const importMutation = useImportResearch(jobId)
  const { data: existingResearch } = useJobResearch(jobId)

  // Pre-populate import textarea with existing research JSON on first load only
  useEffect(() => {
    if (existingResearch?.raw_json && !initialized) {
      setImportText(existingResearch.raw_json)
      setInitialized(true)
    }
  }, [existingResearch?.raw_json, initialized])

  // Auto-generate research prompt on mount
  useEffect(() => {
    if (!generatedPrompt && !generateMutation.isPending) {
      void generateMutation.mutateAsync().then(result => {
        setGeneratedPrompt(result.prompt)
      })
    }
  }, [])

  async function handleCopyGenerated(): Promise<void> {
    if (!generatedPrompt) return
    await navigator.clipboard.writeText(generatedPrompt)
    setCopiedGen(true)
    setTimeout(() => setCopiedGen(false), 2000)
  }

  async function handleCopyImport(): Promise<void> {
    await navigator.clipboard.writeText(importText)
    setCopiedImp(true)
    setTimeout(() => setCopiedImp(false), 2000)
  }

  async function handleImport(): Promise<void> {
    await importMutation.mutateAsync(importText.trim())
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-bg/80 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded p-6 w-full max-w-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        {/* ─── Top section: Generate ─────────────────────────────────────────────── */}
        <div className="space-y-3 pb-4 border-b border-surface2">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-accent text-lg">Research Workflow</h2>
            <button
              onClick={onClose}
              className="text-xs px-3 py-1.5 text-muted hover:text-text transition-colors"
            >
              Close
            </button>
          </div>

          <div className="space-y-3">
            {existingResearch?.raw_json && (
              <span className="text-xs font-mono text-green flex items-center gap-1">
                ✓ Research already imported
              </span>
            )}
            <p className="text-xs font-mono text-muted">
              Copy the research prompt below and paste it into Claude. Then paste Claude's response in the field at the bottom.
            </p>

            {generateMutation.isPending && !generatedPrompt ? (
              <div className="py-4 text-center">
                <p className="text-xs font-mono text-muted">Generating research prompt…</p>
              </div>
            ) : generatedPrompt ? (
              <div className="space-y-2">
                <pre className="bg-surface2 rounded p-4 overflow-y-auto text-xs font-mono text-text whitespace-pre-wrap break-words leading-relaxed max-h-[250px]">
                  {generatedPrompt}
                </pre>
                <button
                  onClick={() => void handleCopyGenerated()}
                  className="w-full px-3 py-1.5 text-xs font-mono text-bg bg-accent rounded hover:bg-accent/90 transition-colors"
                >
                  {copiedGen ? 'Copied!' : 'Copy Prompt to Clipboard'}
                </button>
              </div>
            ) : null}

            {generateMutation.isError && (
              <p className="text-xs font-mono text-red">{generateMutation.error.message}</p>
            )}
          </div>
        </div>

        {/* ─── Bottom section: Import ────────────────────────────────────────────── */}
        <div className="space-y-3">
          <p className="text-xs font-mono text-muted">
            Step 2: Paste the JSON output from the research prompt below:
          </p>

          <textarea
            className="w-full min-h-[200px] bg-surface2 rounded px-3 py-2 text-xs font-mono text-text focus:outline-none focus:ring-1 focus:ring-accent resize-y"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='Paste JSON output from Claude here: { "research_summary": "...", ... }'
          />

          {importMutation.isError && (
            <p className="text-xs font-mono text-red">{importMutation.error.message}</p>
          )}

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setImportText('')}
              disabled={!importText.trim()}
              className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50"
            >
              Clear JSON
            </button>
            <button
              onClick={() => void handleCopyImport()}
              disabled={!importText.trim()}
              className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50"
            >
              {copiedImp ? 'Copied!' : 'Copy JSON'}
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-mono text-muted hover:text-text transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleImport()}
              disabled={!importText.trim() || importMutation.isPending}
              className="px-4 py-1.5 text-xs font-mono text-bg bg-accent rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {importMutation.isPending ? 'Importing…' : 'Submit Research'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
