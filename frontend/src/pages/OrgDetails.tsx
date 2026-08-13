import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import AppHeader from '@/components/AppHeader'
import { useOrgDetail, useOrgResearch, useGenerateOrgResearchPrompt, useImportOrgResearch, useOrgCrawls, useCrawlLogs, useExportOrgCrawls, useExportCrawlLogs, useOrgRoles, useExportOrgRoles } from '@/hooks/useOrgs'
import type { JobResearch, OrgCrawl, OrgCrawlLog, OrgRole } from '@/types/api'

// ─── Tab type ─────────────────────────────────────────────────────────────────

type TabId = 'org-details' | 'crawls' | 'interesting-roles' | 'all-roles'
type OrgDetailsAction = 'org-summary' | 'org-research' | 'org-notes'

const TABS: { id: TabId; label: string }[] = [
  { id: 'org-details',      label: 'Org Details' },
  { id: 'crawls',           label: 'Crawls' },
  { id: 'interesting-roles', label: 'Interesting Roles' },
  { id: 'all-roles',        label: 'All Roles' },
]

const ORG_DETAILS_ACTIONS: { id: OrgDetailsAction; label: string }[] = [
  { id: 'org-summary',   label: 'Org Summary' },
  { id: 'org-research',  label: 'Org Research' },
  { id: 'org-notes',     label: 'Org Notes' },
]

// ─── Confidence badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ level }: { level: string }): React.JSX.Element {
  const colors: Record<string, string> = {
    high: 'text-green border-green/40',
    medium: 'text-accent border-accent/40',
    low: 'text-red border-red/40',
  }
  const cls = colors[level] ?? 'text-muted border-surface2'
  return (
    <span className={`text-[10px] font-mono uppercase tracking-widest border rounded px-1.5 py-0.5 ${cls}`}>
      {level}
    </span>
  )
}

// ─── JSON list display ────────────────────────────────────────────────────────

function JsonList({ raw }: { raw: string | null }): React.JSX.Element {
  if (!raw) return <span className="text-xs text-muted">—</span>
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return (
        <ul className="space-y-1 mt-1">
          {(parsed as unknown[]).map((item, i) => (
            <li key={i} className="text-xs text-text font-mono">• {String(item)}</li>
          ))}
        </ul>
      )
    }
    if (typeof parsed === 'object' && parsed !== null) {
      return (
        <pre className="text-xs font-mono text-text whitespace-pre-wrap mt-1">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      )
    }
  } catch {
    // fall through
  }
  return <span className="text-xs text-text">{raw}</span>
}

// ─── Research display ─────────────────────────────────────────────────────────

function ResearchDisplay({ research }: { research: JobResearch }): React.JSX.Element {
  return (
    <div className="space-y-5">
      {/* Summary */}
      {research.research_summary && (
        <div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Summary</p>
          <p className="text-sm text-text leading-relaxed">{research.research_summary}</p>
        </div>
      )}

      {/* Company */}
      <div>
        <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-2">Company</p>
        <div className="space-y-1.5">
          {(
            [
              ['Overview', research.company_overview],
              ['Stage', research.company_stage],
              ['Size', research.company_size_actual],
              ['Trajectory', research.company_trajectory],
            ] as [string, string | null][]
          ).map(([label, val]) => (
            <div key={label} className="flex items-baseline gap-2">
              <span className="text-[10px] font-mono text-muted uppercase w-20 shrink-0">{label}</span>
              <span className="text-xs text-text">{val ?? '—'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Culture */}
      {research.company_culture_overview && (
        <div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Culture</p>
          <p className="text-sm text-text leading-relaxed">{research.company_culture_overview}</p>
          {research.culture_signals && (
            <div className="mt-2">
              <JsonList raw={research.culture_signals} />
            </div>
          )}
        </div>
      )}

      {/* Compensation */}
      {research.comp_signals && (
        <div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Compensation</p>
          <JsonList raw={research.comp_signals} />
        </div>
      )}

      {/* Role context */}
      {research.role_context && (
        <div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Role Context</p>
          <JsonList raw={research.role_context} />
        </div>
      )}

      {/* Interview process */}
      {research.interview_process && (
        <div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Interview Process</p>
          <p className="text-sm text-text leading-relaxed">{research.interview_process}</p>
        </div>
      )}

      {/* Flags */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Green Flags</p>
          <JsonList raw={research.green_flags} />
        </div>
        <div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Red Flags</p>
          <JsonList raw={research.red_flags} />
        </div>
      </div>
    </div>
  )
}

// ─── Edit Org Modal ───────────────────────────────────────────────────────────

interface EditOrgModalProps {
  org: any
  onClose: () => void
}

function EditOrgModal({ org, onClose }: EditOrgModalProps): React.JSX.Element {
  const [name, setName] = useState(org.name)
  const [url, setUrl] = useState(org.url)
  const [careerPageUrl, setCareerPageUrl] = useState(org.career_page_url)
  const [crawlFrequency, setCrawlFrequency] = useState(org.crawl_frequency)

  async function handleSave(): Promise<void> {
    // TODO: Implement PATCH /api/v1/orgs/:id
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-bg/80 flex items-center justify-center z-50">
      <div className="bg-surface rounded p-6 w-full max-w-md space-y-4">
        <h2 className="font-serif text-accent text-lg">Edit Organization</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="text-muted text-xs font-mono uppercase tracking-widest">Name</span>
            <input
              className="mt-1 w-full bg-surface2 rounded px-3 py-2 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-muted text-xs font-mono uppercase tracking-widest">URL</span>
            <input
              className="mt-1 w-full bg-surface2 rounded px-3 py-2 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-muted text-xs font-mono uppercase tracking-widest">Career Page URL</span>
            <input
              className="mt-1 w-full bg-surface2 rounded px-3 py-2 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              value={careerPageUrl}
              onChange={(e) => setCareerPageUrl(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-muted text-xs font-mono uppercase tracking-widest">Crawl Frequency (days)</span>
            <input
              type="number"
              className="mt-1 w-full bg-surface2 rounded px-3 py-2 text-text text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              value={crawlFrequency}
              onChange={(e) => setCrawlFrequency(parseInt(e.target.value))}
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-muted hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            className="px-4 py-1.5 text-sm bg-accent text-bg rounded hover:bg-accent/90 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Org Research Section ─────────────────────────────────────────────────────

interface OrgResearchSectionProps {
  orgId: number
}

function OrgResearchSection({ orgId }: OrgResearchSectionProps): React.JSX.Element {
  const { data: research, isLoading, isError } = useOrgResearch(orgId)
  const generateMutation = useGenerateOrgResearchPrompt(orgId)
  const importMutation = useImportOrgResearch(orgId)

  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null)
  const [copiedGen, setCopiedGen] = useState(false)
  const [importText, setImportText] = useState('')
  const [copiedRes, setCopiedRes] = useState(false)

  async function handleGeneratePrompt(): Promise<void> {
    try {
      const result = await generateMutation.mutateAsync()
      setGeneratedPrompt(result.prompt)
    } catch {
      // error shown by mutation
    }
  }

  async function handleCopyGenerated(): Promise<void> {
    if (!generatedPrompt) return
    await navigator.clipboard.writeText(generatedPrompt)
    setCopiedGen(true)
    setTimeout(() => setCopiedGen(false), 2000)
  }

  async function handleCopyResearch(): Promise<void> {
    if (!research?.raw_json) return
    await navigator.clipboard.writeText(research.raw_json)
    setCopiedRes(true)
    setTimeout(() => setCopiedRes(false), 2000)
  }

  async function handleImport(): Promise<void> {
    try {
      await importMutation.mutateAsync(importText.trim())
      setImportText('')
      setGeneratedPrompt(null)
    } catch {
      // error shown by mutation
    }
  }

  return (
    <div className="space-y-5">
      {/* BLOCK 1: Generate Research */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {research && <span className="text-green text-sm">✓</span>}
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest">Research Organization</p>
        </div>
        <p className="text-sm text-muted leading-relaxed">
          This is an external prompt — it requires internet access. Do this first to gather information about the company before running evaluations. This data is inserted into following prompts, so don't skip it.
        </p>
        <button
          onClick={() => void handleGeneratePrompt()}
          disabled={generateMutation.isPending}
          className="px-4 py-2 text-sm font-mono text-bg bg-accent rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
        >
          {generateMutation.isPending ? 'Generating…' : 'Open Research Generation Workflow'}
        </button>
        {generateMutation.isError && (
          <p className="text-xs font-mono text-red">{generateMutation.error.message}</p>
        )}
      </div>

      <hr className="border-surface2" />

      {/* BLOCK 2: Options/Buttons */}
      <div className="flex gap-2 flex-wrap">
        {research?.raw_json && (
          <button
            onClick={() => void handleCopyResearch()}
            className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors"
          >
            {copiedRes ? 'Copied!' : 'Copy Research JSON'}
          </button>
        )}
      </div>

      <hr className="border-surface2" />

      {/* BLOCK 3: Confidence & Date */}
      {research && (
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest">Research Confidence</span>
            <ConfidenceBadge level={research.research_confidence} />
          </div>
          <div className="flex flex-col gap-0.5 ml-6">
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest">Last Researched</span>
            <span className="text-xs font-mono text-text">
              {new Date(research.imported_at).toLocaleDateString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric',
              })}
            </span>
          </div>
        </div>
      )}

      <hr className="border-surface2" />

      {/* BLOCK 4: Research Display */}
      {isLoading && (
        <p className="text-xs font-mono text-muted">Loading research…</p>
      )}
      {isError && (
        <p className="text-xs font-mono text-red">Failed to load research data.</p>
      )}
      {research ? (
        <ResearchDisplay research={research} />
      ) : (
        !isLoading && (
          <p className="text-xs font-mono text-muted italic">
            No research data yet. Use the Research Generation Workflow above to generate and import research.
          </p>
        )
      )}

      {/* Import Section */}
      {generatedPrompt && (
        <div className="space-y-3 bg-surface2/40 border border-surface2 rounded p-4 mt-6">
          <p className="text-xs font-mono text-muted">Step 1: Copy and paste the prompt below into Claude</p>
          <pre className="bg-surface2 rounded p-4 overflow-y-auto text-xs font-mono text-text whitespace-pre-wrap break-words leading-relaxed max-h-[250px]">
            {generatedPrompt}
          </pre>
          <button
            onClick={() => void handleCopyGenerated()}
            className="w-full px-3 py-1.5 text-xs font-mono text-bg bg-accent rounded hover:bg-accent/90 transition-colors"
          >
            {copiedGen ? 'Copied!' : 'Copy Prompt to Clipboard'}
          </button>

          <p className="text-xs font-mono text-muted mt-4">Step 2: Paste Claude's JSON response below</p>
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
              onClick={() => void handleImport()}
              disabled={!importText.trim() || importMutation.isPending}
              className="px-4 py-1.5 text-xs font-mono text-bg bg-accent rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {importMutation.isPending ? 'Importing…' : 'Submit Research'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Crawls Tab ────────────────────────────────────────────────────────────────

interface TextPopupState {
  isOpen: boolean
  title: string
  content: string
}

function CrawlsTab({ orgId, orgName }: { orgId: number; orgName: string }): React.JSX.Element {
  const { data: crawls = [], isLoading } = useOrgCrawls(orgId)
  const [selectedCrawlId, setSelectedCrawlId] = useState<number | null>(null)
  const { data: logs = [] } = useCrawlLogs(orgId, selectedCrawlId)
  const exportCrawls = useExportOrgCrawls(orgId)
  const exportLogs = useExportCrawlLogs(orgId, selectedCrawlId ?? 0)
  const [copiedCrawls, setCopiedCrawls] = useState(false)
  const [copiedLogs, setCopiedLogs] = useState(false)
  const [markdownPopup, setMarkdownPopup] = useState<TextPopupState>({ isOpen: false, title: '', content: '' })
  const [textPopup, setTextPopup] = useState<TextPopupState>({ isOpen: false, title: '', content: '' })
  const [crawlPage, setCrawlPage] = useState(1)
  const [logPage, setLogPage] = useState(1)

  const crawlsPerPage = 10
  const logsPerPage = 10

  const startCrawl = (crawlPage - 1) * crawlsPerPage
  const endCrawl = startCrawl + crawlsPerPage
  const paginatedCrawls = crawls.slice(startCrawl, endCrawl)
  const totalCrawlPages = Math.ceil(crawls.length / crawlsPerPage)

  const startLog = (logPage - 1) * logsPerPage
  const endLog = startLog + logsPerPage
  const paginatedLogs = logs.slice(startLog, endLog)
  const totalLogPages = Math.ceil(logs.length / logsPerPage)

  function handleCopyCrawlData(): void {
    const text = formatCrawlsAsText(crawls)
    void navigator.clipboard.writeText(text)
    setCopiedCrawls(true)
    setTimeout(() => setCopiedCrawls(false), 2000)
  }

  function handleSaveCrawlJSON(): void {
    void exportCrawls.mutateAsync().then((result) => {
      if (result.success) alert(`Saved: ${result.filename}`)
    })
  }

  function handleCopyLogData(): void {
    const text = formatLogsAsText(logs)
    void navigator.clipboard.writeText(text)
    setCopiedLogs(true)
    setTimeout(() => setCopiedLogs(false), 2000)
  }

  function handleSaveLogJSON(): void {
    if (!selectedCrawlId) return
    void exportLogs.mutateAsync().then((result) => {
      if (result.success) alert(`Saved: ${result.filename}`)
    })
  }

  function showMarkdown(markdown: string | null): void {
    if (!markdown) return
    setMarkdownPopup({ isOpen: true, title: 'Career Page Markdown', content: markdown })
  }

  function showText(title: string, content: string | null): void {
    if (!content) return
    setTextPopup({ isOpen: true, title, content })
  }

  return (
    <div className="px-[5%] py-6 space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">Crawl Information</h2>
        <p className="text-sm text-muted">Crawl history, extraction results, and detailed logs for {orgName}</p>
      </div>

      {/* Crawl Options */}
      <div className="flex gap-2">
        <button
          onClick={handleCopyCrawlData}
          className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors"
        >
          {copiedCrawls ? 'Copied!' : 'Copy Crawl Data'}
        </button>
        <button
          onClick={handleSaveCrawlJSON}
          disabled={exportCrawls.isPending || crawls.length === 0}
          className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50"
        >
          {exportCrawls.isPending ? 'Saving…' : 'Save Crawl JSON'}
        </button>
      </div>

      {/* Crawls Table */}
      <div className="bg-surface border border-surface2 rounded overflow-x-auto">
        {isLoading ? (
          <div className="p-4 text-xs text-muted">Loading crawls…</div>
        ) : crawls.length === 0 ? (
          <div className="p-4 text-xs text-muted">No crawls yet.</div>
        ) : (
          <>
            <table className="w-full text-xs">
              <thead className="bg-surface2 border-b border-surface2">
                <tr>
                  <th className="px-3 py-2 text-left text-muted">Status</th>
                  <th className="px-3 py-2 text-left text-muted">Started</th>
                  <th className="px-3 py-2 text-left text-muted">Completed</th>
                  <th className="px-3 py-2 text-left text-muted">Domain</th>
                  <th className="px-3 py-2 text-left text-muted">Heuristic</th>
                  <th className="px-3 py-2 text-left text-muted">Dedupe</th>
                  <th className="px-3 py-2 text-left text-muted">Current</th>
                  <th className="px-3 py-2 text-left text-muted">Missing</th>
                  <th className="px-3 py-2 text-left text-muted">Matched</th>
                  <th className="px-3 py-2 text-left text-muted">Unvalidated</th>
                  <th className="px-3 py-2 text-left text-muted">Found</th>
                  <th className="px-3 py-2 text-left text-muted">Added</th>
                  <th className="px-3 py-2 text-left text-muted">Closed</th>
                  <th className="px-3 py-2 text-left text-muted">Markdown</th>
                  <th className="px-3 py-2 text-left text-muted">Logs</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCrawls.map((crawl) => (
                  <tr key={crawl.id} className="border-b border-surface2 hover:bg-surface2/50">
                    <td className="px-3 py-2">
                      <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                        crawl.status === 'success' ? 'bg-green/20 text-green' :
                        crawl.status === 'running' || crawl.status === 'pending' ? 'bg-accent/20 text-accent' :
                        'bg-red/20 text-red'
                      }`}>
                        {crawl.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-text">{new Date(crawl.started_at).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                    <td className="px-3 py-2 text-text">{crawl.completed_at ? new Date(crawl.completed_at).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</td>
                    <td className="px-3 py-2 text-text">{crawl.domain_roles ?? '—'}</td>
                    <td className="px-3 py-2 text-text">{crawl.heuristic_roles ?? '—'}</td>
                    <td className="px-3 py-2 text-text">{crawl.dedupe_roles ?? '—'}</td>
                    <td className="px-3 py-2 text-text">{crawl.current_org_roles ?? '—'}</td>
                    <td className="px-3 py-2 text-text">{crawl.missing_roles ?? '—'}</td>
                    <td className="px-3 py-2 text-text">{crawl.matched_roles ?? '—'}</td>
                    <td className="px-3 py-2 text-text">{crawl.unvalidated_roles ?? '—'}</td>
                    <td className="px-3 py-2 text-text">{crawl.roles_found ?? '—'}</td>
                    <td className="px-3 py-2 text-text">{crawl.roles_added ?? '—'}</td>
                    <td className="px-3 py-2 text-text">{crawl.roles_closed ?? '—'}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => showMarkdown(crawl.career_page_markdown)}
                        className="text-accent hover:underline text-xs"
                      >
                        Show
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => setSelectedCrawlId(crawl.id)}
                        className="text-accent hover:underline text-xs"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalCrawlPages > 1 && (
              <div className="flex items-center justify-center gap-2 p-3 bg-surface2/40 border-t border-surface2">
                <button
                  onClick={() => setCrawlPage(Math.max(1, crawlPage - 1))}
                  disabled={crawlPage === 1}
                  className="px-2 py-1 text-xs text-muted hover:text-text disabled:opacity-50 transition-colors"
                >
                  ← Prev
                </button>
                <span className="text-xs text-muted">Page {crawlPage} of {totalCrawlPages}</span>
                <button
                  onClick={() => setCrawlPage(Math.min(totalCrawlPages, crawlPage + 1))}
                  disabled={crawlPage === totalCrawlPages}
                  className="px-2 py-1 text-xs text-muted hover:text-text disabled:opacity-50 transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <hr className="border-surface2" />

      {/* Crawl Logs Options */}
      <div className="flex gap-2">
        <button
          onClick={handleCopyLogData}
          disabled={logs.length === 0}
          className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50"
        >
          {copiedLogs ? 'Copied!' : 'Copy Crawl Log Data'}
        </button>
        <button
          onClick={handleSaveLogJSON}
          disabled={exportLogs.isPending || logs.length === 0}
          className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50"
        >
          {exportLogs.isPending ? 'Saving…' : 'Save Crawl Log JSON'}
        </button>
      </div>

      {/* Crawl Logs Table */}
      {selectedCrawlId && (
        <div className="bg-surface border border-surface2 rounded overflow-x-auto">
          {logs.length === 0 ? (
            <div className="p-4 text-xs text-muted">No logs for this crawl.</div>
          ) : (
            <>
              <table className="w-full text-xs">
                <thead className="bg-surface2 border-b border-surface2">
                  <tr>
                    <th className="px-3 py-2 text-left text-muted">Action</th>
                    <th className="px-3 py-2 text-left text-muted">URL</th>
                    <th className="px-3 py-2 text-left text-muted">Output</th>
                    <th className="px-3 py-2 text-left text-muted">Markdown</th>
                    <th className="px-3 py-2 text-left text-muted">Model</th>
                    <th className="px-3 py-2 text-left text-muted">Prompt</th>
                    <th className="px-3 py-2 text-left text-muted">P.Tokens</th>
                    <th className="px-3 py-2 text-left text-muted">R.Tokens</th>
                    <th className="px-3 py-2 text-left text-muted">Response</th>
                    <th className="px-3 py-2 text-left text-muted">Status</th>
                    <th className="px-3 py-2 text-left text-muted">Latency</th>
                    <th className="px-3 py-2 text-left text-muted">Method</th>
                    <th className="px-3 py-2 text-left text-muted">Error</th>
                    <th className="px-3 py-2 text-left text-muted">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.map((log) => (
                    <tr key={log.id} className="border-b border-surface2 hover:bg-surface2/50">
                      <td className="px-3 py-2 text-text">{log.action_type}</td>
                      <td className="px-3 py-2 text-text truncate max-w-xs">{log.url ?? '—'}</td>
                      <td className="px-3 py-2">
                        {log.output_data ? (
                          <button onClick={() => showText('Output Data', log.output_data)} className="text-accent hover:underline text-xs">Show</button>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {log.markdown ? (
                          <button onClick={() => showText('Markdown', log.markdown)} className="text-accent hover:underline text-xs">Show</button>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 text-text">{log.llm_model ?? '—'}</td>
                      <td className="px-3 py-2">
                        {log.prompt ? (
                          <button onClick={() => showText('Prompt', log.prompt)} className="text-accent hover:underline text-xs">Show</button>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 text-text">{log.tokens_prompt ?? '—'}</td>
                      <td className="px-3 py-2 text-text">{log.tokens_response ?? '—'}</td>
                      <td className="px-3 py-2">
                        {log.response ? (
                          <button onClick={() => showText('Response', log.response)} className="text-accent hover:underline text-xs">Show</button>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 text-text">{log.status_code ?? '—'}</td>
                      <td className="px-3 py-2 text-text">{log.latency_ms ?? '—'} ms</td>
                      <td className="px-3 py-2 text-text">{log.method ?? '—'}</td>
                      <td className="px-3 py-2 text-red">{log.error_msg ?? '—'}</td>
                      <td className="px-3 py-2 text-text text-xs">{new Date(log.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalLogPages > 1 && (
                <div className="flex items-center justify-center gap-2 p-3 bg-surface2/40 border-t border-surface2">
                  <button
                    onClick={() => setLogPage(Math.max(1, logPage - 1))}
                    disabled={logPage === 1}
                    className="px-2 py-1 text-xs text-muted hover:text-text disabled:opacity-50 transition-colors"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs text-muted">Page {logPage} of {totalLogPages}</span>
                  <button
                    onClick={() => setLogPage(Math.min(totalLogPages, logPage + 1))}
                    disabled={logPage === totalLogPages}
                    className="px-2 py-1 text-xs text-muted hover:text-text disabled:opacity-50 transition-colors"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Text Popup Modal */}
      {textPopup.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-surface2 rounded max-w-2xl w-full max-h-[80vh] overflow-auto">
            <div className="sticky top-0 bg-surface2 px-4 py-3 border-b border-surface2 flex items-center justify-between">
              <p className="text-sm font-mono text-text">{textPopup.title}</p>
              <button onClick={() => setTextPopup({ ...textPopup, isOpen: false })} className="text-muted hover:text-text">✕</button>
            </div>
            <div className="p-4">
              <code className="block bg-bg p-4 rounded text-xs font-mono text-text overflow-x-auto whitespace-pre-wrap break-words">
                {textPopup.content}
              </code>
            </div>
            <div className="flex gap-2 justify-end p-4 bg-surface2/40 border-t border-surface2">
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(textPopup.content)
                  alert('Copied to clipboard')
                }}
                className="px-3 py-1.5 text-xs font-mono text-bg bg-accent rounded hover:bg-accent/90 transition-colors"
              >
                Copy
              </button>
              <button
                onClick={() => setTextPopup({ ...textPopup, isOpen: false })}
                className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Markdown Popup Modal */}
      {markdownPopup.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-surface2 rounded max-w-2xl w-full max-h-[80vh] overflow-auto">
            <div className="sticky top-0 bg-surface2 px-4 py-3 border-b border-surface2 flex items-center justify-between">
              <p className="text-sm font-mono text-text">Career Page Markdown</p>
              <button onClick={() => setMarkdownPopup({ ...markdownPopup, isOpen: false })} className="text-muted hover:text-text">✕</button>
            </div>
            <div className="p-4">
              <code className="block bg-bg p-4 rounded text-xs font-mono text-text overflow-x-auto whitespace-pre-wrap break-words">
                {markdownPopup.content}
              </code>
            </div>
            <div className="flex gap-2 justify-end p-4 bg-surface2/40 border-t border-surface2">
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(markdownPopup.content)
                  alert('Copied to clipboard')
                }}
                className="px-3 py-1.5 text-xs font-mono text-bg bg-accent rounded hover:bg-accent/90 transition-colors"
              >
                Copy
              </button>
              <button
                onClick={() => setMarkdownPopup({ ...markdownPopup, isOpen: false })}
                className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function formatCrawlsAsText(crawls: OrgCrawl[]): string {
  const headers = ['ID', 'Status', 'Started', 'Completed', 'Domain', 'Heuristic', 'Dedupe', 'Current', 'Missing', 'Matched', 'Unvalidated', 'Found', 'Added', 'Closed']
  const rows = crawls.map(c => [
    String(c.id), c.status,
    new Date(c.started_at).toLocaleString(),
    c.completed_at ? new Date(c.completed_at).toLocaleString() : '—',
    String(c.domain_roles ?? '—'),
    String(c.heuristic_roles ?? '—'),
    String(c.dedupe_roles ?? '—'),
    String(c.current_org_roles ?? '—'),
    String(c.missing_roles ?? '—'),
    String(c.matched_roles ?? '—'),
    String(c.unvalidated_roles ?? '—'),
    String(c.roles_found ?? '—'),
    String(c.roles_added ?? '—'),
    String(c.roles_closed ?? '—'),
  ])
  return [headers, ...rows].map(r => r.join('\t')).join('\n')
}

function formatLogsAsText(logs: OrgCrawlLog[]): string {
  const headers = ['ID', 'Action', 'URL', 'Model', 'P.Tokens', 'R.Tokens', 'Status', 'Latency (ms)', 'Method', 'Created']
  const rows = logs.map(l => [
    String(l.id), l.action_type, l.url ?? '—', l.llm_model ?? '—',
    String(l.tokens_prompt ?? '—'),
    String(l.tokens_response ?? '—'),
    String(l.status_code ?? '—'),
    String(l.latency_ms ?? '—'),
    l.method ?? '—',
    new Date(l.created_at).toLocaleString(),
  ])
  return [headers, ...rows].map(r => r.join('\t')).join('\n')
}

// ─── Role utilities ───────────────────────────────────────────────────────────

function calculateRoleAge(firstSeenDate: string, scrapeDate: string): number {
  const older = new Date(firstSeenDate) < new Date(scrapeDate) ? firstSeenDate : scrapeDate
  const now = new Date()
  const diff = now.getTime() - new Date(older).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

interface TextPopupState {
  isOpen: boolean
  title: string
  content: string
}

function AllRolesTab({ orgId }: { orgId: number }): React.JSX.Element {
  const { data: roles, isLoading, isError } = useOrgRoles(orgId)
  const exportMutation = useExportOrgRoles(orgId)
  const [searchTerm, setSearchTerm] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [textPopup, setTextPopup] = useState<TextPopupState>({ isOpen: false, title: '', content: '' })
  const [copyConfirm, setCopyConfirm] = useState(false)
  const [page, setPage] = useState(1)
  const itemsPerPage = 50

  if (isLoading) {
    return <p className="text-muted text-sm">Loading roles…</p>
  }

  if (isError || !roles) {
    return <p className="text-muted text-sm">Error loading roles</p>
  }

  const filtered = roles.filter(r => {
    const matchesSearch = r.title.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = showInactive || r.is_active === 1
    return matchesSearch && matchesStatus
  })

  const totalPages = Math.ceil(filtered.length / itemsPerPage)
  const paginatedRoles = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  const copyRolesData = async (): Promise<void> => {
    const text = formatRolesAsText(filtered)
    await navigator.clipboard.writeText(text)
    setCopyConfirm(true)
    setTimeout(() => setCopyConfirm(false), 2000)
  }

  const handleExport = async (): Promise<void> => {
    try {
      await exportMutation.mutateAsync()
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  return (
    <div className="px-[5%] py-6">
      {/* Title Block */}
      <div className="mb-6">
        <p className="font-serif text-accent text-xl mb-2">ALL ROLES SCRAPED FOR ORG</p>
        <p className="text-sm text-muted leading-relaxed">Complete list of all roles extracted during organization crawls, with metadata for manual review and validation.</p>
      </div>

      <hr className="border-surface2 mb-6" />

      {/* Function Block */}
      <div className="mb-6 flex gap-3">
        <button
          onClick={copyRolesData}
          className="px-4 py-2 text-xs font-mono bg-surface border border-accent text-accent rounded hover:bg-surface2 transition-colors"
        >
          {copyConfirm ? '✓ Copied' : 'Copy Role Data'}
        </button>
        <button
          onClick={handleExport}
          disabled={exportMutation.isPending}
          className="px-4 py-2 text-xs font-mono bg-surface border border-accent text-accent rounded hover:bg-surface2 transition-colors disabled:opacity-50"
        >
          {exportMutation.isPending ? '…' : 'Save Role JSON'}
        </button>
      </div>

      <hr className="border-surface2 mb-6" />

      {/* Filter/Search Block */}
      <div className="mb-6">
        <div className="mb-3">
          <input
            type="text"
            placeholder="Search by title (local)…"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setPage(1)
            }}
            className="w-full px-3 py-2 text-xs bg-surface border border-surface2 text-text rounded placeholder-muted focus:outline-none focus:border-accent"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setShowInactive(false)
              setPage(1)
            }}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${!showInactive ? 'bg-accent text-bg' : 'bg-surface border border-surface2 text-muted hover:text-text'}`}
          >
            Active
          </button>
          <button
            onClick={() => {
              setShowInactive(true)
              setPage(1)
            }}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${showInactive ? 'bg-accent text-bg' : 'bg-surface border border-surface2 text-muted hover:text-text'}`}
          >
            Inactive
          </button>
        </div>
      </div>

      <hr className="border-surface2 mb-6" />

      {/* Grid Block */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted italic">No roles match your filter.</p>
      ) : (
        <>
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-xs">
              <thead className="bg-surface2 border-b border-surface2">
                <tr>
                  <th className="px-3 py-2 text-left text-muted">Title</th>
                  <th className="px-3 py-2 text-left text-muted">URL</th>
                  <th className="px-3 py-2 text-left text-muted">Description</th>
                  <th className="px-3 py-2 text-left text-muted">Salary</th>
                  <th className="px-3 py-2 text-left text-muted">Remote</th>
                  <th className="px-3 py-2 text-left text-muted">Keywords</th>
                  <th className="px-3 py-2 text-left text-muted">Markdown</th>
                  <th className="px-3 py-2 text-left text-muted">Scraped</th>
                  <th className="px-3 py-2 text-left text-muted">Last Seen</th>
                  <th className="px-3 py-2 text-left text-muted">Missing</th>
                  <th className="px-3 py-2 text-left text-muted">Crawls</th>
                  <th className="px-3 py-2 text-left text-muted">Age (d)</th>
                  <th className="px-3 py-2 text-left text-muted">Interesting</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRoles.map((role) => {
                  const roleAge = calculateRoleAge(role.first_seen_date, role.scrape_date)
                  return (
                    <tr key={role.id} className="border-b border-surface2 hover:bg-surface2/50">
                      <td className="px-3 py-1 text-text">{role.title}</td>
                      <td className="px-3 py-1">
                        {role.role_url ? (
                          <a href={role.role_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                            Open
                          </a>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1">
                        {role.description ? (
                          <button
                            onClick={() => setTextPopup({ isOpen: true, title: 'Description', content: role.description ?? '' })}
                            className="text-accent hover:underline text-xs"
                          >
                            Show
                          </button>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1 text-text">{role.salary_range || '—'}</td>
                      <td className="px-3 py-1 text-text">{role.remote_type}</td>
                      <td className="px-3 py-1">
                        {role.keywords ? (
                          <button
                            onClick={() => setTextPopup({ isOpen: true, title: 'Keywords', content: role.keywords ?? '' })}
                            className="text-accent hover:underline text-xs"
                          >
                            Show
                          </button>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1">
                        {role.markdown ? (
                          <button
                            onClick={() => setTextPopup({ isOpen: true, title: 'Role Markdown', content: role.markdown ?? '' })}
                            className="text-accent hover:underline text-xs"
                          >
                            Show
                          </button>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1 text-muted">{new Date(role.scrape_date).toLocaleDateString()}</td>
                      <td className="px-3 py-1 text-muted">{new Date(role.last_seen_date).toLocaleDateString()}</td>
                      <td className="px-3 py-1 text-muted">{role.missing_count}</td>
                      <td className="px-3 py-1 text-muted">{role.crawl_count}</td>
                      <td className="px-3 py-1 text-muted">{roleAge}</td>
                      <td className="px-3 py-1">
                        {role.is_interesting ? (
                          <span className="text-green">✓</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 p-3 bg-surface2/40 border-t border-surface2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-2 py-1 text-xs text-muted hover:text-text disabled:opacity-50 transition-colors"
              >
                ← Prev
              </button>
              <span className="text-xs text-muted">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-2 py-1 text-xs text-muted hover:text-text disabled:opacity-50 transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* Text Popup Modal */}
      {textPopup.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-surface2 rounded-xl max-w-2xl max-h-96 w-full flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-surface2">
              <p className="font-mono text-sm text-accent">{textPopup.title}</p>
              <button
                onClick={() => setTextPopup({ isOpen: false, title: '', content: '' })}
                className="text-muted hover:text-text text-lg"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <code className="text-xs text-text whitespace-pre-wrap break-words">{textPopup.content}</code>
            </div>
            <div className="flex gap-2 p-4 border-t border-surface2">
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(textPopup.content)
                  setTextPopup({ isOpen: false, title: '', content: '' })
                }}
                className="px-3 py-1.5 text-xs font-mono text-accent border border-accent rounded hover:bg-surface2 transition-colors"
              >
                Copy
              </button>
              <button
                onClick={() => setTextPopup({ isOpen: false, title: '', content: '' })}
                className="px-3 py-1.5 text-xs font-mono text-muted border border-surface2 rounded hover:text-text transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function formatRolesAsText(roles: OrgRole[]): string {
  const headers = ['Title', 'URL', 'Salary', 'Remote', 'Keywords', 'Missing', 'Crawls', 'Age (days)', 'Interesting']
  const rows = roles.map(r => {
    const age = calculateRoleAge(r.first_seen_date, r.scrape_date)
    return [
      r.title,
      r.role_url ?? '—',
      r.salary_range ?? '—',
      r.remote_type,
      r.keywords ?? '—',
      String(r.missing_count),
      String(r.crawl_count),
      String(age),
      r.is_interesting ? 'Yes' : 'No',
    ]
  })
  return [headers, ...rows].map(row => row.join('\t')).join('\n')
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OrgDetails(): React.JSX.Element {
  const { orgId: orgIdStr } = useParams<{ orgId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const orgId = parseInt(orgIdStr ?? '0', 10)
  const activeTab = (searchParams.get('tab') ?? 'org-details') as TabId
  const activeAction = (searchParams.get('action') ?? 'org-summary') as OrgDetailsAction

  const { data: org, isLoading, isError } = useOrgDetail(orgId)
  const [editOrgOpen, setEditOrgOpen] = useState(false)

  function setTab(tab: TabId): void {
    setSearchParams({ tab })
  }

  function setAction(action: OrgDetailsAction): void {
    setSearchParams({ tab: activeTab, action })
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen">
        <AppHeader pageName="Organization" />
        <p className="text-muted text-sm p-4">Loading…</p>
      </div>
    )
  }

  if (isError || !org) {
    return (
      <div className="flex flex-col h-screen">
        <AppHeader pageName="Organization" />
        <p className="text-red text-sm p-4">Failed to load organization.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      <AppHeader pageName={org.name} />

      {/* Org subheader */}
      <div className="sticky top-[57px] z-10 bg-bg border-b border-surface2 px-6 py-3">
        <div className="flex items-start gap-8">
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="text-xs text-muted font-mono">{org.url}</span>
            <span className="font-serif text-lg text-text leading-tight">{org.name}</span>
            <span className="text-xs text-muted font-mono">
              Career page: {org.career_page_url}
            </span>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-surface2 px-6 shrink-0">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-3 text-xs font-mono uppercase tracking-widest transition-colors border-b-2 -mb-px ${
              activeTab === id
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content area */}
      {activeTab === 'org-details' ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Left column — actions nav */}
          <div className="w-[280px] shrink-0 border-r border-surface2 overflow-y-auto p-4">
            <div className="space-y-0.5">
              <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-2">Details</p>
              {ORG_DETAILS_ACTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setAction(id)}
                  className={`w-full text-left px-3 py-2 text-sm font-mono rounded-r transition-colors ${
                    activeAction === id
                      ? 'bg-surface2 text-accent border-l-2 border-accent'
                      : 'text-muted hover:text-text'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Right column — content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeAction === 'org-summary' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-mono text-muted uppercase tracking-widest">Org Info</p>
                  <button
                    onClick={() => setEditOrgOpen(true)}
                    className="text-xs text-muted hover:text-text px-2 py-0.5 border border-surface2 rounded transition-colors"
                  >
                    Edit
                  </button>
                </div>
                <div className="space-y-1">
                  {([
                    ['Name',               org.name],
                    ['URL',                org.url],
                    ['Career Page',       org.career_page_url],
                    ['Crawl Frequency',   `${org.crawl_frequency} days`],
                  ] as [string, string][]).map(([label, val]) => (
                    <div key={label} className="flex items-baseline gap-2">
                      <span className="text-[10px] font-mono text-muted w-24 shrink-0">{label}</span>
                      <span className="text-xs text-text">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeAction === 'org-research' && (
              <OrgResearchSection orgId={orgId} />
            )}

            {activeAction === 'org-notes' && (
              <div className="bg-surface border border-surface2 rounded-xl p-6 max-w-lg">
                <p className="font-serif text-accent text-lg mb-2">Org Notes</p>
                <p className="text-sm text-muted leading-relaxed">Coming soon.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'crawls' && (
            <CrawlsTab orgId={orgId} orgName={org.name} />
          )}

          {activeTab === 'interesting-roles' && (
            <div className="bg-surface border border-surface2 rounded-xl p-6 max-w-lg">
              <p className="font-serif text-accent text-lg mb-2">Interesting Roles</p>
              <p className="text-sm text-muted leading-relaxed">Matched roles coming soon.</p>
            </div>
          )}

          {activeTab === 'all-roles' && (
            <AllRolesTab orgId={orgId} />
          )}
        </div>
      )}

      {editOrgOpen && (
        <EditOrgModal org={org} onClose={() => setEditOrgOpen(false)} />
      )}
    </div>
  )
}
