import { useState, useEffect } from 'react'
import { useGeneratePrompt } from '@/hooks/useApplications'
import { useModels, useImportEvaluationMutation } from '@/hooks/useEvaluate'
import { useSettings } from '@/hooks/useSettings'

interface ExternalEvalWorkflowModalProps {
  jobId: number
  onClose: () => void
}

export function ExternalEvalWorkflowModal({ jobId, onClose }: ExternalEvalWorkflowModalProps): React.JSX.Element {
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null)
  const [copiedGen, setCopiedGen] = useState(false)
  const [importText, setImportText] = useState('')
  const [copiedImp, setCopiedImp] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null)
  const [importError, setImportError] = useState('')

  const generateMutation = useGeneratePrompt()
  const importMutation = useImportEvaluationMutation(jobId)
  const { data: allModels = [] } = useModels()
  const { data: settings } = useSettings()

  // Filter to external models only (server_type !== 'ollama')
  const externalModels = allModels.filter(m => m.server_type !== 'ollama')

  // Use default external model if set, otherwise auto-select first external model
  const resolvedModelId = selectedModelId ?? settings?.external_default_model_id ?? externalModels[0]?.id ?? null

  // Auto-generate external eval prompt on mount
  useEffect(() => {
    if (!generatedPrompt && !generateMutation.isPending) {
      void generateMutation.mutateAsync(jobId).then(result => {
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
    const trimmed = importText.trim()
    if (!trimmed) return

    setImportError('')

    // Parse JSON, handling optional EVALUATION_JSON_START/END sentinels
    const start = trimmed.indexOf('EVALUATION_JSON_START')
    const end = trimmed.indexOf('EVALUATION_JSON_END')
    const jsonStr = start !== -1 && end !== -1
      ? trimmed.slice(start + 'EVALUATION_JSON_START'.length, end).trim()
      : trimmed

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(jsonStr) as Record<string, unknown>
    } catch (e) {
      setImportError(`JSON parse error: ${(e as Error).message}`)
      return
    }

    try {
      await importMutation.mutateAsync({
        job_id: jobId,
        llm_model_id: resolvedModelId,
        ...parsed,
      })
      onClose()
    } catch (err) {
      setImportError((err as Error).message)
    }
  }

  return (
    <div className="fixed inset-0 bg-bg/80 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded p-6 w-full max-w-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        {/* ─── Top section: Generate ─────────────────────────────────────────────── */}
        <div className="space-y-3 pb-4 border-b border-surface2">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-accent text-lg">External Eval Workflow</h2>
            <button
              onClick={onClose}
              className="text-xs px-3 py-1.5 text-muted hover:text-text transition-colors"
            >
              Close
            </button>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-mono text-muted">
              Copy the external evaluation prompt below and paste it into Claude. Then paste Claude's response in the field at the bottom.
            </p>

            {generateMutation.isPending && !generatedPrompt ? (
              <div className="py-4 text-center">
                <p className="text-xs font-mono text-muted">Generating external eval prompt…</p>
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
            Paste the JSON evaluation output below:
          </p>

          {externalModels.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted uppercase tracking-widest block">Model (used for this eval)</label>
              <select
                value={resolvedModelId ?? ''}
                onChange={(e) => setSelectedModelId(e.target.value ? parseInt(e.target.value, 10) : null)}
                className="w-full bg-surface2 rounded px-3 py-2 text-xs font-mono text-text focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {externalModels.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.model} [{m.server_name}]
                  </option>
                ))}
              </select>
            </div>
          )}

          <textarea
            className="w-full min-h-[200px] bg-surface2 rounded px-3 py-2 text-xs font-mono text-text focus:outline-none focus:ring-1 focus:ring-accent resize-y"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='Paste JSON output from Claude here: { "score_overall": 7.5, ... }'
          />

          {importError && (
            <p className="text-xs font-mono text-red">{importError}</p>
          )}
          {importMutation.isError && !importError && (
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
              {importMutation.isPending ? 'Importing…' : 'Submit External Eval'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
