import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateOrg } from '@/hooks/useOrgs'
import AppHeader from '@/components/AppHeader'

// ─── Success modal ────────────────────────────────────────────────────────────

function SuccessModal({
  orgId,
  onCreateAnother,
}: {
  orgId: number
  onCreateAnother: () => void
}): React.JSX.Element {
  const navigate = useNavigate()
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-surface2 rounded-xl p-8 max-w-sm w-full shadow-2xl text-center">
        <p className="font-serif text-accent text-lg mb-6">Organization created successfully.</p>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => navigate(`/orgs/${orgId}`)}
            className="px-5 py-2 text-sm font-sans bg-accent text-bg rounded hover:bg-accent/90 transition-colors"
          >
            Go To Organization
          </button>
          <button
            onClick={onCreateAnother}
            className="px-5 py-2 text-sm font-sans bg-surface2 text-muted border border-surface2 rounded hover:text-text transition-colors"
          >
            Create Another Org
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreateOrg(): React.JSX.Element {
  const [orgName, setOrgName] = useState('')
  const [orgUrl, setOrgUrl] = useState('')
  const [careerPageUrl, setCareerPageUrl] = useState('')
  const [crawlFrequency, setCrawlFrequency] = useState(5)

  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [createdOrgId, setCreatedOrgId] = useState<number | null>(null)

  const createOrgMutation = useCreateOrg()

  function handleClear(): void {
    setOrgName('')
    setOrgUrl('')
    setCareerPageUrl('')
    setCrawlFrequency(5)
    setErrorMsg(null)
    setCreatedOrgId(null)
  }

  async function handleCreate(): Promise<void> {
    if (!orgName.trim()) {
      setErrorMsg('Organization name is required.')
      return
    }
    if (!orgUrl.trim()) {
      setErrorMsg('Organization URL is required.')
      return
    }
    if (!careerPageUrl.trim()) {
      setErrorMsg('Career page URL is required.')
      return
    }

    setErrorMsg(null)
    try {
      const data = await createOrgMutation.mutateAsync({
        name: orgName.trim(),
        url: orgUrl.trim(),
        career_page_url: careerPageUrl.trim(),
        crawl_frequency: crawlFrequency,
      })
      setCreatedOrgId(data.id)
    } catch (err) {
      setErrorMsg(`Could not create organization: ${(err as Error).message}`)
    }
  }

  const isPending = createOrgMutation.isPending

  return (
    <div className="flex flex-col h-screen">
      <AppHeader pageName="Create Organization" />
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left column ─────────────────────────────────────────────── */}
        <div className="w-[300px] shrink-0 border-r border-surface2 flex flex-col overflow-y-auto">
          <div className="flex flex-col gap-4 p-5">

            {errorMsg && (
              <p className="text-xs font-mono text-red">{errorMsg}</p>
            )}

            <div className="flex flex-col gap-2">
              <button
                onClick={() => void handleCreate()}
                disabled={isPending}
                className="px-5 py-2 bg-accent text-bg text-sm font-sans font-medium rounded hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createOrgMutation.isPending ? 'Creating…' : 'Create Organization'}
              </button>
              <button
                onClick={handleClear}
                disabled={isPending}
                className="px-4 py-2 text-sm font-sans text-muted bg-surface2 border border-surface2 rounded hover:text-text transition-colors disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* ── Right column ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex flex-col gap-4 max-w-2xl">

            {/* Organization Name */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Organization Name</label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Acme Corp"
                className="bg-surface border border-surface2 rounded px-3 py-2 text-sm font-sans text-text focus:outline-none focus:border-accent/50"
              />
            </div>

            {/* Organization URL */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Organization URL</label>
              <input
                type="url"
                value={orgUrl}
                onChange={(e) => setOrgUrl(e.target.value)}
                placeholder="https://acme-corp.com"
                className="bg-surface border border-surface2 rounded px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent/50"
              />
            </div>

            {/* Career Page URL */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Career Page URL</label>
              <input
                type="url"
                value={careerPageUrl}
                onChange={(e) => setCareerPageUrl(e.target.value)}
                placeholder="https://acme-corp.com/careers"
                className="bg-surface border border-surface2 rounded px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent/50"
              />
            </div>

            {/* Crawl Frequency */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Crawl Frequency (days)</label>
              <input
                type="number"
                min="1"
                max="365"
                value={crawlFrequency}
                onChange={(e) => setCrawlFrequency(Math.max(1, parseInt(e.target.value) || 5))}
                placeholder="5"
                className="bg-surface border border-surface2 rounded px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-accent/50"
              />
            </div>

          </div>
        </div>

      </div>

      {/* ── Success modal ───────────────────────────────────────────────── */}
      {createdOrgId !== null && (
        <SuccessModal
          orgId={createdOrgId}
          onCreateAnother={handleClear}
        />
      )}
    </div>
  )
}
