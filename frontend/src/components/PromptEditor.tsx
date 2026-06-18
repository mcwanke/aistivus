import { useState, useEffect } from 'react'
import {
  usePrompts,
  usePrompt,
  useSavePrompt,
  usePromptPreview,
  useFeedbackLoop,
} from '@/hooks/usePrompts'

type Segment = { type: 'editable' | 'readonly'; content: string }

function parseSegments(segmentsText: string): Segment[] {
  if (!segmentsText.includes('[[EDITABLE]]') && !segmentsText.includes('[[READONLY]]')) {
    return [{ type: 'editable', content: segmentsText }]
  }
  const parts = segmentsText.split(/(\[\[(?:\/?)(?:EDITABLE|READONLY)\]\])/)
  const segments: Segment[] = []
  let currentType: 'editable' | 'readonly' | null = null

  for (const part of parts) {
    if (part === '[[EDITABLE]]') {
      currentType = 'editable'
    } else if (part === '[[READONLY]]') {
      currentType = 'readonly'
    } else if (part === '[[/EDITABLE]]' || part === '[[/READONLY]]') {
      currentType = null
    } else if (currentType !== null && part.length > 0) {
      segments.push({ type: currentType, content: part })
    }
  }
  return segments
}

function reassembleSegments(segments: Segment[]): string {
  return segments
    .map(s => {
      const tag = s.type === 'editable' ? 'EDITABLE' : 'READONLY'
      return `[[${tag}]]${s.content}[[/${tag}]]`
    })
    .join('')
}

const EVAL_PROMPT_KEYS = ['eval_analysis', 'eval_scoring']

export default function PromptEditor(): React.JSX.Element {
  const [selectedKey, setSelectedKey] = useState<string>('')
  const [localSegments, setLocalSegments] = useState<Segment[]>([])
  const [localTemperature, setLocalTemperature] = useState<number>(0.0)
  const [savedVersion, setSavedVersion] = useState<number | null>(null)
  const [suggestions, setSuggestions] = useState<string | null>(null)
  const [suggestionsVisible, setSuggestionsVisible] = useState(false)
  const [noFeedbackMsg, setNoFeedbackMsg] = useState(false)

  const showTemperature = EVAL_PROMPT_KEYS.includes(selectedKey)

  const { data: promptList } = usePrompts()
  const { data: promptData } = usePrompt(selectedKey)
  const { data: previewData } = usePromptPreview(selectedKey)
  const saveMutation = useSavePrompt(selectedKey)
  const feedbackLoopMutation = useFeedbackLoop(selectedKey)

  useEffect(() => {
    if (promptList && promptList.length > 0 && selectedKey === '') {
      setSelectedKey(promptList[0].prompt_key)
    }
  }, [promptList, selectedKey])

  useEffect(() => {
    if (promptData) {
      setLocalSegments(parseSegments(promptData.segments_text))
      setLocalTemperature(promptData.temperature ?? 0.0)
      setSavedVersion(null)
      setSuggestions(null)
      setSuggestionsVisible(false)
      setNoFeedbackMsg(false)
    }
  }, [promptData])

  function handleSegmentChange(index: number, newContent: string): void {
    setLocalSegments(prev =>
      prev.map((s, i) => (i === index ? { ...s, content: newContent } : s)),
    )
    setSavedVersion(null)
  }

  function handleSave(): void {
    const segmentsText = reassembleSegments(localSegments)
    saveMutation.mutate(
      { segments_text: segmentsText, temperature: localTemperature },
      {
        onSuccess: data => {
          setSavedVersion(data.version)
        },
      },
    )
  }

  function handleFeedbackLoop(): void {
    setNoFeedbackMsg(false)
    feedbackLoopMutation.mutate(undefined, {
      onSuccess: data => {
        if (data.success && data.suggestions) {
          setSuggestions(data.suggestions)
          setSuggestionsVisible(true)
        } else {
          setNoFeedbackMsg(true)
        }
      },
    })
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <select
          value={selectedKey}
          onChange={e => {
            setSelectedKey(e.target.value)
            setSavedVersion(null)
          }}
          className="bg-surface border border-surface2 text-text text-sm rounded px-3 py-1.5 focus:outline-none focus:border-accent/50"
        >
          {promptList?.map(p => (
            <option key={p.prompt_key} value={p.prompt_key}>
              {p.label}
            </option>
          ))}
        </select>
        {promptData && (
          <span className="text-xs text-muted font-mono">v{promptData.version}</span>
        )}
        {showTemperature && (
          <label className="flex items-center gap-1.5 text-xs text-muted font-mono">
            Temp:
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={localTemperature}
              onChange={e => { setLocalTemperature(parseFloat(e.target.value)); setSavedVersion(null); }}
              className="w-16 bg-surface border border-surface2 text-text rounded px-2 py-1 focus:outline-none focus:border-accent/50"
            />
          </label>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleFeedbackLoop}
            disabled={feedbackLoopMutation.isPending || !selectedKey}
            className="px-3 py-1.5 text-sm border border-surface2 rounded text-muted hover:text-text hover:border-text/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {feedbackLoopMutation.isPending ? (
              <span className="flex items-center gap-1.5">
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Running…
              </span>
            ) : (
              'Run Feedback Loop'
            )}
          </button>
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending || !selectedKey || localSegments.length === 0}
            className="px-3 py-1.5 text-sm bg-accent/10 border border-accent/30 text-accent rounded hover:bg-accent/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
          {savedVersion !== null && (
            <span className="text-xs text-green font-mono">Saved (v{savedVersion})</span>
          )}
        </div>
      </div>

      <hr className="border-surface2 mb-5" />

      {/* Two-column layout */}
      <div className="grid grid-cols-2 gap-5 items-start">
        {/* Left: segment editor */}
        <div className="space-y-2">
          <p className="text-xs text-muted font-mono uppercase tracking-wide mb-2">Edit Prompt</p>
          {localSegments.length === 0 && (
            <p className="text-sm text-muted italic">Loading…</p>
          )}
          {localSegments.map((segment, i) =>
            segment.type === 'editable' ? (
              <textarea
                key={i}
                value={segment.content}
                ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                onChange={e => { handleSegmentChange(i, e.target.value); const el = e.target; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }}
                className="w-full bg-surface border border-surface2 text-text text-xs font-mono rounded p-3 resize-y focus:outline-none focus:border-accent/50 overflow-hidden"
                aria-label={`Editable segment ${i + 1}`}
              />
            ) : (
              <div
                key={i}
                className="text-xs text-muted/50 font-mono whitespace-pre-wrap bg-surface/40 rounded p-3 border border-surface2/40 select-none"
                aria-label={`Readonly segment ${i + 1}`}
              >
                {segment.content}
              </div>
            ),
          )}

          {/* Feedback loop suggestions panel */}
          {suggestionsVisible && suggestions && (
            <div className="mt-3 border border-accent/20 rounded p-4 bg-surface">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-accent font-mono uppercase tracking-wide">
                  Feedback Loop Suggestions
                </span>
                <button
                  onClick={() => setSuggestionsVisible(false)}
                  className="text-xs text-muted hover:text-text transition-colors"
                >
                  Dismiss
                </button>
              </div>
              <pre className="text-xs text-text/80 whitespace-pre-wrap font-mono leading-relaxed">
                {suggestions}
              </pre>
            </div>
          )}

          {noFeedbackMsg && (
            <p className="text-xs text-muted mt-2">No unprocessed feedback for this prompt.</p>
          )}
        </div>

        {/* Right: assembled preview */}
        <div>
          <p className="text-xs text-muted font-mono uppercase tracking-wide mb-2">Prompt Preview</p>
          <div className="border border-surface2 rounded p-4 bg-surface/50 sticky top-0">
            {previewData ? (
              <pre className="text-xs text-text/70 whitespace-pre-wrap font-mono leading-relaxed">
                {previewData.preview_text}
              </pre>
            ) : (
              <p className="text-xs text-muted/40 italic">Loading preview…</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
