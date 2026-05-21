import { useState, useRef, useLayoutEffect, useEffect } from 'react'
import AppHeader from '@/components/AppHeader'
import { useProfileHealth } from '@/hooks/useProfileHealth'
import { useProfileSections, useUpdateSection } from '@/hooks/useProfileSections'
import { useProfileChat } from '@/hooks/useProfileChat'
import { useLlmModels } from '@/hooks/useSettings'
import type {
  ProfileSection,
  ChatMode,
  ProposedUpdate,
  CoherenceCheckResponse,
  ChatMessage,
} from '@/types/profile'

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTION_HINTS: Record<string, string> = {
  who_i_am:
    "The model's first impression of you and the lens for every evaluation. Seniority and experience level are especially important: they change how the model frames questions and what it considers a good JD fit.",
  career_narrative:
    'The answer to "tell me about yourself." Every recruiter asks this in the first call. A strong narrative explains your transitions without the reader having to connect the dots. The model uses this for culture fit scoring and cover letter openers.',
  career_history:
    "The model's primary evidence base. More specific detail means better evaluation accuracy. Include metrics where you have them. New grads: include projects, coursework, and internships — this section supports all backgrounds.",
  skills_strengths:
    'Used to calculate domain match and identify keyword gaps against job descriptions. Be specific — "Python" is more useful than "programming." Include leadership scope and domain areas alongside technical skills.',
  target_role:
    'Defines what "a good fit" looks like for you. Must-haves and deal-breakers are used to flag mismatches in evaluations. The more precise this is, the fewer irrelevant recommendations you\'ll see.',
  resume_master:
    "The source the model tailors from. Paste your full resume here. Don't summarize or try to fit this to length — more data helps produce better resumes and tailoring. Update it whenever your actual resume changes.",
  tailoring_rules:
    'Standing rules the model follows every time it generates or edits application materials. Use the Generate Rules button to build an initial set from your profile, then refine over time based on what you observe in real applications.',
  insights_lessons:
    "A running record of what's working and what isn't across your search. The model reads this to calibrate its advice. Use Synthesize from Logs to build from your application history, or add entries manually after interviews.",
  model_behavior:
    'Instructions the model follows in every session, both in-app and in standalone Claude sessions. Edit these as you learn what works. Do not delete this section — it is read on every evaluation.',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseExperienceLevel(content: string): string | undefined {
  const match = /\*\*Experience level:\*\*\s*(.+)/i.exec(content)
  return match?.[1]?.trim()
}

function useAutoGrow(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return ref
}

function defaultModeForSection(section: ProfileSection): ChatMode {
  if (section.recommended_mode === 'directive') return 'directive'
  return 'socratic'
}

function showsAiChat(section: ProfileSection): boolean {
  return section.recommended_mode !== 'edit_only' && section.recommended_mode !== 'generate'
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

type SectionStatus = 'complete' | 'in_progress' | 'empty'

function sectionStatus(section: ProfileSection): SectionStatus {
  if (section.complete) return 'complete'
  if (section.content.trim().length > 0) return 'in_progress'
  return 'empty'
}

function StatusBadge({ status }: { status: SectionStatus }): React.JSX.Element {
  if (status === 'complete')
    return (
      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-green/15 text-green">
        Complete
      </span>
    )
  if (status === 'in_progress')
    return (
      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-accent/15 text-accent">
        In Progress
      </span>
    )
  return (
    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface2 text-muted">
      Empty
    </span>
  )
}

// ─── ViewContent ──────────────────────────────────────────────────────────────
// Renders section markdown with styled labels and fill markers. Strips --- display dividers.

function ViewContent({ content }: { content: string }): React.JSX.Element {
  const lines = content.split('\n').filter((l) => l.trim() !== '---')

  return (
    <div className="text-sm font-mono leading-relaxed">
      {lines.map((line, i) => {
        const isBoldLabel = /^\*\*[^*]+\*\*:/.test(line)
        const hasFill = /\[(?:FILL|AUTO)[^\]]*\]/.test(line)

        if (hasFill) {
          const segments = line.split(/(\[(?:FILL|AUTO)[^\]]*\])/)
          return (
            <div key={i} className={isBoldLabel ? 'text-muted' : 'text-text'}>
              {segments.map((seg, j) =>
                /^\[(?:FILL|AUTO)/.test(seg) ? (
                  <span key={j} className="text-accent">
                    {seg}
                  </span>
                ) : (
                  <span key={j}>{seg}</span>
                ),
              )}
            </div>
          )
        }

        return (
          <div key={i} className={isBoldLabel ? 'text-muted' : 'text-text'}>
            {line || ' '}
          </div>
        )
      })}
    </div>
  )
}

// ─── SectionCard ──────────────────────────────────────────────────────────────

interface SectionCardProps {
  section: ProfileSection
  isActive: boolean
  onActivate: () => void
  onSave: (content: string) => void
  isSaving: boolean
  onGenerateRules?: () => void
  generatingRules?: boolean
  onSynthesizeInsights?: () => void
  synthesizingInsights?: boolean
}

function SectionCard({
  section,
  isActive,
  onActivate,
  onSave,
  isSaving,
  onGenerateRules,
  generatingRules,
  onSynthesizeInsights,
  synthesizingInsights,
}: SectionCardProps): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(section.content)
  const textareaRef = useAutoGrow(draft)
  const status = sectionStatus(section)
  const aiChatEnabled = showsAiChat(section)
  const isGenerateOnly = section.recommended_mode === 'generate'
  const isSynthesize = section.recommended_mode === 'synthesize'
  const hint = SECTION_HINTS[section.id]

  // Auto-expand when this section is selected for AI chat
  useEffect(() => {
    if (isActive) setCollapsed(false)
  }, [isActive])

  // Sync draft with fresh section content when not editing (e.g. after AI accept)
  useEffect(() => {
    if (!isEditing) setDraft(section.content)
  }, [section.content, isEditing])

  function handleSave(): void {
    onSave(draft)
    setIsEditing(false)
  }

  function handleCancel(): void {
    setDraft(section.content)
    setIsEditing(false)
  }

  return (
    <div
      className={`border rounded transition-colors ${
        isActive ? 'border-accent/40' : 'border-surface2'
      } bg-surface`}
    >
      {/* ── Header row — always visible ────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-mono text-muted/60 shrink-0">
            {collapsed ? '▸' : '▾'}
          </span>
          <p className="text-sm font-sans font-medium text-text truncate">{section.name}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <StatusBadge status={status} />
          {!collapsed && !isEditing && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsEditing(true)
                setCollapsed(false)
              }}
              title="Edit section"
              className="text-muted/60 hover:text-accent transition-colors text-xs font-mono leading-none"
            >
              ✎
            </button>
          )}
        </div>
      </div>

      {/* ── Expanded body ───────────────────────────────────────────── */}
      {!collapsed && (
        <div className="px-4 pb-4 space-y-3">
          {/* Hint block */}
          {hint && (
            <details className="text-[11px] font-sans text-muted/70 leading-relaxed">
              <summary className="cursor-pointer hover:text-muted transition-colors select-none">
                About this section
              </summary>
              <p className="mt-1.5 pl-3 border-l border-surface2">{hint}</p>
            </details>
          )}

          {/* Content area: view or edit */}
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full bg-bg border border-surface2 rounded px-3 py-2 text-sm font-mono text-muted focus:outline-none focus:border-accent/50 resize-none overflow-hidden min-h-[80px]"
              spellCheck={false}
            />
          ) : (
            <div
              className="w-full bg-bg border border-surface2 rounded px-3 py-2 min-h-[80px] cursor-text"
              onClick={() => setIsEditing(true)}
            >
              {section.content.trim() ? (
                <ViewContent content={section.content} />
              ) : (
                <p className="text-xs font-mono text-muted/40 italic">Empty — click to edit</p>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-3 py-1.5 text-xs font-sans bg-accent text-bg rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 text-xs font-sans border border-surface2 text-muted rounded hover:text-text transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                {/* Standard AI chat button — shown unless edit_only or generate-only */}
                {aiChatEnabled && !isGenerateOnly && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onActivate()
                    }}
                    className={`px-3 py-1.5 text-xs font-sans rounded border transition-colors ${
                      isActive
                        ? 'border-accent/40 text-accent bg-accent/10'
                        : 'border-surface2 text-muted hover:text-text hover:border-accent/30'
                    }`}
                  >
                    {isActive ? 'Chatting →' : 'Edit with AI →'}
                  </button>
                )}

                {/* Synthesize button for insights_lessons */}
                {isSynthesize && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onSynthesizeInsights?.()
                    }}
                    disabled={synthesizingInsights}
                    className="px-3 py-1.5 text-xs font-sans border border-surface2 text-muted rounded hover:text-text hover:border-accent/30 transition-colors disabled:opacity-50"
                  >
                    {synthesizingInsights ? 'Synthesizing…' : 'Synthesize from Logs'}
                  </button>
                )}

                {/* Generate button for tailoring_rules */}
                {isGenerateOnly && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onGenerateRules?.()
                    }}
                    disabled={generatingRules}
                    className="px-3 py-1.5 text-xs font-sans border border-surface2 text-muted rounded hover:text-text hover:border-accent/30 transition-colors disabled:opacity-50"
                  >
                    {generatingRules ? 'Generating…' : 'Generate Rules'}
                  </button>
                )}

                {/* Resume master hint */}
                {section.id === 'resume_master' && (
                  <span className="text-[10px] font-mono text-muted">
                    Paste resume first, then chat
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }): React.JSX.Element {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser ? 'bg-accent/20 text-text' : 'bg-surface2 text-muted'
        }`}
      >
        {msg.content}
      </div>
    </div>
  )
}

// ─── ProposedUpdateCard ───────────────────────────────────────────────────────

interface ProposedUpdateCardProps {
  update: ProposedUpdate
  sectionName: string
  onAccept: (content: string) => void
  onDiscard: () => void
  isAccepting: boolean
}

function ProposedUpdateCard({
  update,
  sectionName,
  onAccept,
  onDiscard,
  isAccepting,
}: ProposedUpdateCardProps): React.JSX.Element {
  return (
    <div className="border border-accent/30 rounded p-4 space-y-3 bg-accent/5">
      <p className="text-[10px] font-mono text-accent uppercase tracking-wider">
        Proposed update — {sectionName}
      </p>
      <pre className="text-xs font-mono text-muted whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
        {update.proposed_content}
      </pre>
      <div className="flex gap-2">
        <button
          onClick={() => onAccept(update.proposed_content)}
          disabled={isAccepting}
          className="px-3 py-1.5 text-xs font-sans bg-accent text-bg rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          {isAccepting ? 'Saving…' : 'Accept'}
        </button>
        <button
          onClick={onDiscard}
          className="px-3 py-1.5 text-xs font-sans border border-surface2 text-muted rounded hover:text-text transition-colors"
        >
          Discard
        </button>
      </div>
    </div>
  )
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────
// Wrapped with key={activeSectionId} by the parent to reset state on section switch.

interface ChatPanelProps {
  section: ProfileSection
  mode: ChatMode
  onModeChange: (mode: ChatMode) => void
  experienceLevel?: string
  modelId: number | null
  proposedUpdate: ProposedUpdate | null
  onProposedUpdate: (update: ProposedUpdate) => void
  onAcceptProposal: (content: string) => void
  onDiscardProposal: () => void
  isAccepting: boolean
}

function ChatPanel({
  section,
  mode,
  onModeChange,
  experienceLevel,
  modelId,
  proposedUpdate,
  onProposedUpdate,
  onAcceptProposal,
  onDiscardProposal,
  isAccepting,
}: ChatPanelProps): React.JSX.Element {
  const [input, setInput] = useState('')
  const [proposing, setProposing] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { messages, streamingContent, isStreaming, error, sendMessage, proposeUpdate, clearConversation } =
    useProfileChat({
      sectionId: section.id,
      mode,
      sectionContent: section.content,
      experienceLevel,
      modelId,
    })

  const msgCount = messages.length + (streamingContent ? 1 : 0)
  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgCount, streamingContent])

  function handleSend(): void {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    sendMessage(text)
  }

  async function handleProposeUpdate(): Promise<void> {
    setProposing(true)
    try {
      const update = await proposeUpdate()
      onProposedUpdate(update)
    } catch {
      // proposeUpdate throws on failure; error surfaced via hook's error state
    } finally {
      setProposing(false)
    }
  }

  const modeLabel =
    section.recommended_mode === 'either' || section.recommended_mode === 'synthesize'
      ? 'Either'
      : section.recommended_mode === 'socratic'
        ? 'Socratic'
        : section.recommended_mode === 'directive'
          ? 'Directive'
          : section.recommended_mode.charAt(0).toUpperCase() + section.recommended_mode.slice(1)

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="px-5 py-3 border-b border-surface2 shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-sans font-medium text-text">{section.name}</p>
            <p className="text-[10px] font-mono text-muted">Recommended: {modeLabel}</p>
          </div>
          {/* Mode toggle */}
          <div className="flex items-center gap-0.5 bg-surface2 rounded p-0.5">
            <button
              onClick={() => onModeChange('socratic')}
              className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                mode === 'socratic' ? 'bg-bg text-accent' : 'text-muted hover:text-text'
              }`}
            >
              Socratic
            </button>
            <button
              onClick={() => onModeChange('directive')}
              className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                mode === 'directive' ? 'bg-bg text-accent' : 'text-muted hover:text-text'
              }`}
            >
              Directive
            </button>
          </div>
        </div>
      </div>

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.length === 0 && !streamingContent && (
          <p className="text-sm text-muted text-center py-8">
            Send a message to start building this section with AI.
          </p>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}
        {/* In-flight streaming message */}
        {streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[85%] bg-surface2 rounded px-3 py-2 text-sm text-muted whitespace-pre-wrap leading-relaxed">
              {streamingContent}
              <span className="inline-block w-1.5 h-3.5 bg-accent/60 ml-0.5 animate-pulse align-text-bottom" />
            </div>
          </div>
        )}
        {error && <p className="text-xs font-mono text-red text-center">{error}</p>}
        <div ref={bottomRef} />
      </div>

      {/* Proposed update card */}
      {proposedUpdate && (
        <div className="px-5 pb-3 shrink-0">
          <ProposedUpdateCard
            update={proposedUpdate}
            sectionName={section.name}
            onAccept={onAcceptProposal}
            onDiscard={onDiscardProposal}
            isAccepting={isAccepting}
          />
        </div>
      )}

      {/* Input area */}
      <div className="px-5 pb-4 shrink-0 space-y-2">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Message… (Enter to send, Shift+Enter for newline)"
            rows={2}
            disabled={isStreaming}
            className="flex-1 bg-surface border border-surface2 rounded px-3 py-2 text-sm font-sans text-text placeholder-muted/50 focus:outline-none focus:border-accent/50 resize-none disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className="px-4 py-2 bg-accent text-bg text-sm font-sans rounded hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-end"
          >
            Send
          </button>
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={() => void handleProposeUpdate()}
            disabled={isStreaming || messages.length === 0 || proposing}
            className="text-xs font-mono text-muted hover:text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {proposing ? 'Proposing…' : 'Propose Update ↑'}
          </button>
          <button
            onClick={clearConversation}
            disabled={isStreaming}
            className="text-xs font-mono text-muted/60 hover:text-muted transition-colors"
          >
            Clear conversation
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ReviewModal ──────────────────────────────────────────────────────────────

function ReviewModal({
  title,
  result,
  onClose,
}: {
  title: string
  result: CoherenceCheckResponse
  onClose: () => void
}): React.JSX.Element {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-surface2 rounded-xl p-7 max-w-2xl w-full shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-start justify-between mb-4 shrink-0">
          <div>
            <p className="font-serif text-accent text-lg">{title}</p>
            <p className="text-xs font-mono text-muted mt-0.5">
              {result.issues_found === 0
                ? 'No issues found'
                : `${result.issues_found} issue${result.issues_found === 1 ? '' : 's'} found`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-text transition-colors text-sm font-mono"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          <p className="text-sm text-muted whitespace-pre-wrap leading-relaxed">{result.review}</p>
        </div>
        <div className="mt-4 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-sans bg-surface2 text-muted border border-surface2 rounded hover:text-text transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function JobSearchProfile(): React.JSX.Element {
  const health = useProfileHealth()
  const sections = useProfileSections()
  const updateSection = useUpdateSection()
  const models = useLlmModels()

  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [activeMode, setActiveMode] = useState<ChatMode>('socratic')
  const [proposedUpdate, setProposedUpdate] = useState<ProposedUpdate | null>(null)
  const [alignmentResult, setAlignmentResult] = useState<CoherenceCheckResponse | null>(null)
  const [alignmentLoading, setAlignmentLoading] = useState(false)
  const [qualityResult, setQualityResult] = useState<CoherenceCheckResponse | null>(null)
  const [qualityLoading, setQualityLoading] = useState(false)
  const [generatingRules, setGeneratingRules] = useState(false)
  const [synthesizingInsights, setSynthesizingInsights] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null)

  const sectionsList = sections.data?.sections ?? []
  const activeSection = sectionsList.find((s) => s.id === activeSectionId) ?? null

  const whoIAm = sectionsList.find((s) => s.id === 'who_i_am')
  const experienceLevel = whoIAm ? parseExperienceLevel(whoIAm.content) : undefined

  const modelList = models.data ?? []

  function handleActivateSection(section: ProfileSection): void {
    if (activeSectionId !== section.id) {
      setActiveSectionId(section.id)
      setActiveMode(defaultModeForSection(section))
      setProposedUpdate(null)
    }
  }

  function handleSaveSection(sectionId: string, content: string): void {
    updateSection.mutate({ sectionId, content, note: 'Manual edit via Profile page' })
  }

  function handleAcceptProposal(content: string): void {
    if (!activeSectionId) return
    const section = sectionsList.find((s) => s.id === activeSectionId)
    updateSection.mutate(
      {
        sectionId: activeSectionId,
        content,
        note: `AI edit — ${section?.name ?? activeSectionId}`,
      },
      { onSuccess: () => setProposedUpdate(null) },
    )
  }

  async function handleGenerateRules(): Promise<void> {
    setGeneratingRules(true)
    try {
      const res = await fetch('/api/v1/profile/generate-tailoring-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: selectedModelId }),
      })
      if (!res.ok) throw new Error(`generate-tailoring-rules ${res.status}`)
      const data = (await res.json()) as ProposedUpdate
      const section = sectionsList.find((s) => s.id === 'tailoring_rules')
      if (section) {
        setActiveSectionId('tailoring_rules')
        setActiveMode(defaultModeForSection(section))
      }
      setProposedUpdate(data)
    } catch {
      // silently ignore — user can retry
    } finally {
      setGeneratingRules(false)
    }
  }

  async function handleSynthesizeInsights(): Promise<void> {
    setSynthesizingInsights(true)
    try {
      const res = await fetch('/api/v1/profile/synthesize-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: selectedModelId }),
      })
      if (!res.ok) throw new Error(`synthesize-insights ${res.status}`)
      const data = (await res.json()) as ProposedUpdate
      const section = sectionsList.find((s) => s.id === 'insights_lessons')
      if (section) {
        setActiveSectionId('insights_lessons')
        setActiveMode(defaultModeForSection(section))
      }
      setProposedUpdate(data)
    } catch {
      // silently ignore — user can retry
    } finally {
      setSynthesizingInsights(false)
    }
  }

  async function handleAlignmentCheck(): Promise<void> {
    setAlignmentLoading(true)
    try {
      const res = await fetch('/api/v1/profile/coherence-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: selectedModelId }),
      })
      if (!res.ok) throw new Error(`coherence-check ${res.status}`)
      const data = (await res.json()) as CoherenceCheckResponse
      setAlignmentResult(data)
    } catch {
      // silently ignore — user can retry
    } finally {
      setAlignmentLoading(false)
    }
  }

  async function handleQualityAudit(): Promise<void> {
    setQualityLoading(true)
    try {
      const res = await fetch('/api/v1/profile/quality-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: selectedModelId }),
      })
      if (!res.ok) throw new Error(`quality-audit ${res.status}`)
      const data = (await res.json()) as CoherenceCheckResponse
      setQualityResult(data)
    } catch {
      // silently ignore — user can retry
    } finally {
      setQualityLoading(false)
    }
  }

  const completedCount = health.data?.completed_sections ?? 0
  const totalCount = health.data?.total_sections ?? 9
  const fileExists = health.data?.file_exists ?? true

  return (
    <div className="flex flex-col h-screen">
      <AppHeader pageName="JS Profile" />
      <div className="flex flex-col flex-1 overflow-hidden">
      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-surface2 flex items-center justify-between shrink-0 gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <h1 className="font-serif text-accent text-xl shrink-0">Job Search Profile</h1>
          {health.data && (
            <span className="text-xs font-mono text-muted">
              {completedCount} of {totalCount} sections complete
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Model selector */}
          {modelList.length > 0 && (
            <select
              value={selectedModelId ?? ''}
              onChange={(e) =>
                setSelectedModelId(e.target.value === '' ? null : Number(e.target.value))
              }
              className="bg-surface border border-surface2 rounded px-2 py-1.5 text-xs font-mono text-muted focus:outline-none focus:border-accent/50"
            >
              <option value="">Default model</option>
              {Array.from(
                [...modelList]
                  .sort((a, b) => {
                    const s = a.server_name.localeCompare(b.server_name)
                    return s !== 0 ? s : a.model.localeCompare(b.model)
                  })
                  .reduce<Map<string, typeof modelList>>((acc, m) => {
                    const g = acc.get(m.server_name) ?? []
                    g.push(m)
                    acc.set(m.server_name, g)
                    return acc
                  }, new Map())
                  .entries(),
              ).map(([serverName, serverModels]) => (
                <optgroup key={serverName} label={serverName}>
                  {serverModels.map((m) => (
                    <option key={m.id} value={m.id} disabled={m.available !== 1}>
                      {m.model}
                      {m.available !== 1 ? ' (unavailable)' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}

          {/* Review · Alignment */}
          <button
            onClick={() => void handleAlignmentCheck()}
            disabled={alignmentLoading || !fileExists}
            className="px-3 py-1.5 text-xs font-sans border border-surface2 text-muted rounded hover:text-text hover:border-accent/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {alignmentLoading ? 'Reviewing…' : 'Review · Alignment'}
          </button>

          {/* Review · Quality */}
          <button
            onClick={() => void handleQualityAudit()}
            disabled={qualityLoading || !fileExists}
            className="px-3 py-1.5 text-xs font-sans border border-surface2 text-muted rounded hover:text-text hover:border-accent/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {qualityLoading ? 'Auditing…' : 'Review · Quality'}
          </button>
        </div>
      </div>

      {/* ── No file warning ─────────────────────────────────────────── */}
      {health.data && !fileExists && (
        <div className="px-6 py-3 bg-red/5 border-b border-red/20 shrink-0">
          <p className="text-sm text-muted">
            <span className="text-red">jobsearch.md not found.</span> Copy{' '}
            <span className="font-mono text-xs">templates/JOBSEARCH_TEMPLATE.md</span> to{' '}
            <span className="font-mono text-xs">my_data/jobsearch.md</span> to get started.
          </p>
        </div>
      )}

      {/* ── Main columns ─────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left column — section cards ─────────────────────────── */}
        <div className="w-[420px] shrink-0 border-r border-surface2 overflow-y-auto px-4 py-4 space-y-2">
          {sections.isLoading && (
            <p className="text-sm text-muted px-2">Loading sections…</p>
          )}
          {sections.isError && (
            <p className="text-sm text-red px-2">Failed to load profile sections.</p>
          )}
          {sectionsList.map((section) => (
            <SectionCard
              key={section.id}
              section={section}
              isActive={activeSectionId === section.id}
              onActivate={() => handleActivateSection(section)}
              onSave={(content) => handleSaveSection(section.id, content)}
              isSaving={
                updateSection.isPending &&
                (updateSection.variables as { sectionId: string } | undefined)?.sectionId ===
                  section.id
              }
              onGenerateRules={
                section.id === 'tailoring_rules' ? () => void handleGenerateRules() : undefined
              }
              generatingRules={section.id === 'tailoring_rules' ? generatingRules : undefined}
              onSynthesizeInsights={
                section.id === 'insights_lessons'
                  ? () => void handleSynthesizeInsights()
                  : undefined
              }
              synthesizingInsights={
                section.id === 'insights_lessons' ? synthesizingInsights : undefined
              }
            />
          ))}
        </div>

        {/* ── Right column — chat panel ───────────────────────────── */}
        <div className="flex-1 overflow-hidden">
          {activeSection ? (
            <ChatPanel
              key={activeSectionId}
              section={activeSection}
              mode={activeMode}
              onModeChange={setActiveMode}
              experienceLevel={experienceLevel}
              modelId={selectedModelId}
              proposedUpdate={proposedUpdate}
              onProposedUpdate={setProposedUpdate}
              onAcceptProposal={handleAcceptProposal}
              onDiscardProposal={() => setProposedUpdate(null)}
              isAccepting={updateSection.isPending}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
              <span className="text-4xl text-muted/20 select-none">✦</span>
              <p className="text-sm text-muted">Select a section on the left to edit with AI.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Review modals ────────────────────────────────────────────── */}
      {alignmentResult && (
        <ReviewModal
          title="Profile Review · Alignment"
          result={alignmentResult}
          onClose={() => setAlignmentResult(null)}
        />
      )}
      {qualityResult && (
        <ReviewModal
          title="Profile Quality Audit"
          result={qualityResult}
          onClose={() => setQualityResult(null)}
        />
      )}
      </div>
    </div>
  )
}
