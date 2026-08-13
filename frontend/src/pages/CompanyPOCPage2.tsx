import { useState, useEffect } from "react";

interface Org {
  id: number;
  name: string;
  url: string;
  career_page_url: string;
  crawl_frequency: number;
  last_crawl_at: string | null;
  next_crawl_at: string | null;
  created_at: string;
}

interface ValidatedRole {
  id: number;
  title: string;
  url: string;
  salary_range: string | null;
  remote_type: string;
}

interface AlgorithmResult {
  success: boolean;
  error?: string;
  new_roles_validated?: number;
  existing_roles_matched?: number;
  roles_marked_inactive?: number;
  validated_roles?: ValidatedRole[];
  validation_errors?: string[];
  debug_log?: string[];
}

interface OrgRole {
  id: number;
  org_id: number;
  title: string;
  role_url: string | null;
  description: string | null;
  salary_range: string | null;
  remote_type: string;
  local_score_overall: number | null;
  is_interesting: boolean;
  is_active: boolean;
  missing_count: number;
  created_at: string;
}

export default function CompanyPOCPage2() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<AlgorithmResult | null>(null);
  const [orgRoles, setOrgRoles] = useState<OrgRole[]>([]);
  const [showDebugLog, setShowDebugLog] = useState(false);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>("");
  const [crawls, setCrawls] = useState<any[]>([]);
  const [selectedCrawlId, setSelectedCrawlId] = useState<number>(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string>("");
  const [crawlAllInProgress, setCrawlAllInProgress] = useState(false);
  const [crawlAllStatus, setCrawlAllStatus] = useState<string>("");
  const [pollIntervalId, setPollIntervalId] = useState<number | null>(null);

  // Load orgs on mount
  useEffect(() => {
    setLoadingOrgs(true);
    fetch("/api/v1/orgs")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setOrgs(data);
          if (data.length > 0) {
            setSelectedOrgId(data[0].id);
          }
        }
      })
      .catch((err) => {
        console.error("Failed to load orgs:", err);
        setCurrentStep("Error loading organizations");
      })
      .finally(() => setLoadingOrgs(false));
  }, []);

  // Load org roles when org changes
  useEffect(() => {
    if (!selectedOrgId) return;

    setLoadingRoles(true);
    fetch(`/api/v1/orgs/${selectedOrgId}/roles`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setOrgRoles(data);
        }
      })
      .catch((err) => {
        console.error("Failed to load roles:", err);
        setCurrentStep("Error loading roles");
      })
      .finally(() => setLoadingRoles(false));
  }, [selectedOrgId]);

  // Load crawls on mount
  useEffect(() => {
    fetch("/api/v1/poc/org-crawls")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setCrawls(data);
        }
      })
      .catch((err) => console.error("Failed to load crawls:", err));
  }, []);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalId) {
        clearInterval(pollIntervalId);
      }
    };
  }, [pollIntervalId]);

  const handleRunAlgorithm = async () => {
    if (!selectedOrgId) return;

    setLoading(true);
    setCurrentStep("Starting algorithm...");
    setLastResult(null);
    setShowDebugLog(false);

    try {
      setCurrentStep("Sending request to server...");
      const response = await fetch("/api/v1/poc/validate-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: selectedOrgId }),
      });

      if (!response.ok) {
        setCurrentStep(`Server error: ${response.status}`);
        setLastResult({
          success: false,
          error: `HTTP ${response.status}`,
          debug_log: [],
        });
        return;
      }

      setCurrentStep("Processing results...");
      const result = await response.json();
      setLastResult(result);

      if (result.success) {
        setCurrentStep("Algorithm complete! Reloading roles...");
        const rolesResp = await fetch(`/api/v1/orgs/${selectedOrgId}/roles`);
        const rolesData = await rolesResp.json();
        if (Array.isArray(rolesData)) {
          setOrgRoles(rolesData);
        }
        setCurrentStep("Done!");
        setShowDebugLog(true);
      } else {
        setCurrentStep(`Algorithm failed: ${result.error}`);
        setShowDebugLog(true);
      }
    } catch (error) {
      console.error("Algorithm error:", error);
      setCurrentStep(`Error: ${String(error)}`);
      setLastResult({
        success: false,
        error: String(error),
        debug_log: [],
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!selectedCrawlId) {
      setExportMessage("Please select a crawl");
      return;
    }

    setIsExporting(true);
    setExportMessage("");

    try {
      const response = await fetch(`/api/v1/poc/org-crawls/${selectedCrawlId}/export`, {
        method: "POST",
      });

      if (!response.ok) {
        setExportMessage(`Error: HTTP ${response.status}`);
        return;
      }

      const result = await response.json();
      if (result.success) {
        setExportMessage(`Success: Exported to ${result.filename}`);
        // Reload crawls to reflect any changes
        fetch("/api/v1/poc/org-crawls")
          .then((res) => res.json())
          .then((data) => {
            if (Array.isArray(data)) setCrawls(data);
          })
          .catch((err) => console.error("Failed to reload crawls:", err));
      } else {
        setExportMessage(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error("Export error:", error);
      setExportMessage(`Error: ${String(error)}`);
    } finally {
      setIsExporting(false);
    }
  };

  const pollCrawlStatus = async () => {
    try {
      const response = await fetch("/api/v1/poc/org-crawls");
      const data = await response.json();
      if (Array.isArray(data)) {
        setCrawls(data);

        // Check if any crawls are still running
        const runningCrawls = data.filter((c: any) => c.status === "running" || c.status === "pending");
        if (runningCrawls.length === 0) {
          // All crawls complete, stop polling
          setCrawlAllInProgress(false);
          setCrawlAllStatus("All crawls complete!");
          if (pollIntervalId) {
            clearInterval(pollIntervalId);
            setPollIntervalId(null);
          }
        } else {
          setCrawlAllStatus(`${runningCrawls.length} crawl(s) running...`);
        }
      }
    } catch (err) {
      console.error("Failed to poll crawl status:", err);
    }
  };

  const handleCrawlAllOrgs = async () => {
    setCrawlAllInProgress(true);
    setCrawlAllStatus("Starting all crawls...");
    setCurrentStep("Firing off parallel crawls...");

    try {
      const response = await fetch("/api/v1/poc/crawl-all-orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        setCrawlAllStatus(`Error: HTTP ${response.status}`);
        setCrawlAllInProgress(false);
        return;
      }

      const result = await response.json();
      if (result.success) {
        setCrawlAllStatus(`Started ${result.crawls_started}/${result.total_orgs} crawls (${result.errors} errors)`);
        setCurrentStep("Monitoring crawl progress...");

        // Start polling for status
        if (pollIntervalId) clearInterval(pollIntervalId);
        const newIntervalId = window.setInterval(pollCrawlStatus, 2000);
        setPollIntervalId(newIntervalId);

        // Reload crawls immediately
        await pollCrawlStatus();
      } else {
        setCrawlAllStatus(`Error: ${result.error}`);
        setCrawlAllInProgress(false);
      }
    } catch (error) {
      console.error("Crawl all error:", error);
      setCrawlAllStatus(`Error: ${String(error)}`);
      setCrawlAllInProgress(false);
    }
  };

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">POC 2: Algorithm Validation</h1>
      <p className="text-sm text-gray-400 mb-6">
        Crawl career pages, extract & validate roles, track missing counts
      </p>

      {/* Status Bar */}
      {currentStep && (
        <div
          className={`mb-4 p-3 rounded text-sm font-semibold flex items-center gap-2 ${
            loading
              ? "bg-accent/10 text-accent"
              : currentStep === "Done!"
                ? "bg-green/10 text-green"
                : currentStep.startsWith("Error")
                  ? "bg-red/10 text-red"
                  : "bg-surface2 text-gray-300"
          }`}
        >
          {loading && <span className="inline-block animate-spin">⟳</span>}
          {currentStep}
        </div>
      )}

      {/* Org Selection & Bulk Operations */}
      <div className="mb-6 space-y-3">
        <div className="p-4 bg-surface border border-surface2 rounded">
          <div className="flex items-center gap-2 mb-2">
            <label className="block text-sm font-semibold">Select Organization</label>
            {loadingOrgs && <span className="text-xs text-gray-400">(loading...)</span>}
          </div>
          <select
            value={selectedOrgId || ""}
            onChange={(e) => setSelectedOrgId(Number(e.target.value))}
            disabled={loadingOrgs || loading || crawlAllInProgress}
            className="w-full px-3 py-2 bg-bg border border-surface2 rounded text-sm disabled:opacity-50"
          >
            <option value="">
              {loadingOrgs ? "Loading organizations..." : "-- Choose an org --"}
            </option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>

        {/* Crawl All Orgs Button */}
        <div className="p-4 bg-surface border border-surface2 rounded">
          <button
            onClick={handleCrawlAllOrgs}
            disabled={crawlAllInProgress || loadingOrgs}
            className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded font-semibold text-white transition"
          >
            {crawlAllInProgress ? `Crawling all orgs... ${crawlAllStatus}` : "⚡ Crawl All Orgs"}
          </button>
          {crawlAllInProgress && crawlAllStatus && (
            <p className="text-xs text-gray-400 mt-2">{crawlAllStatus}</p>
          )}
        </div>

        {/* Crawl Progress Table */}
        {crawlAllInProgress && crawls.length > 0 && (
          <div className="p-4 bg-surface border border-surface2 rounded">
            <h3 className="text-sm font-semibold mb-3">Crawl Progress</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface2 border-b border-surface2">
                  <tr>
                    <th className="px-3 py-2 text-left">Org ID</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Found</th>
                    <th className="px-3 py-2 text-left">Added</th>
                    <th className="px-3 py-2 text-left">Closed</th>
                    <th className="px-3 py-2 text-left">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {crawls
                    .filter((c: any) => orgs.map((o) => o.id).includes(c.org_id))
                    .slice(-10)
                    .map((crawl: any) => (
                      <tr
                        key={crawl.id}
                        className={`border-b border-surface2 ${
                          crawl.status === "running" || crawl.status === "pending"
                            ? "bg-accent/10"
                            : crawl.status === "success"
                              ? "bg-green/10"
                              : "bg-red/10"
                        }`}
                      >
                        <td className="px-3 py-2">#{crawl.org_id}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold ${
                              crawl.status === "running" || crawl.status === "pending"
                                ? "bg-accent/20 text-accent"
                                : crawl.status === "success"
                                  ? "bg-green/20 text-green"
                                  : "bg-red/20 text-red"
                            }`}
                          >
                            {crawl.status}
                          </span>
                        </td>
                        <td className="px-3 py-2">{crawl.roles_found ?? "—"}</td>
                        <td className="px-3 py-2">{crawl.roles_added ?? "—"}</td>
                        <td className="px-3 py-2">{crawl.roles_closed ?? "—"}</td>
                        <td className="px-3 py-2 text-gray-400">
                          {crawl.completed_at
                            ? new Date(crawl.completed_at).toLocaleTimeString()
                            : new Date(crawl.created_at).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Run Algorithm */}
      {selectedOrg && (
        <div className="mb-6 p-4 bg-surface border border-surface2 rounded">
          <div className="mb-4 space-y-2">
            <div>
              <p className="text-xs text-gray-500 mb-1">Career Page URL</p>
              <p className="text-sm font-mono text-gray-300 break-all">
                {selectedOrg.career_page_url}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-2">
              <div className="p-2 bg-bg rounded">
                <p className="text-xs text-gray-500">Active Roles</p>
                <p className="text-xl font-bold text-green">
                  {loadingRoles ? "..." : orgRoles.filter((r) => r.is_active).length}
                </p>
              </div>
              <div className="p-2 bg-bg rounded">
                <p className="text-xs text-gray-500">Inactive Roles</p>
                <p className="text-xl font-bold text-red">
                  {loadingRoles ? "..." : orgRoles.filter((r) => !r.is_active).length}
                </p>
              </div>
              <div className="p-2 bg-bg rounded">
                <p className="text-xs text-gray-500">Total Roles</p>
                <p className="text-xl font-bold text-accent">
                  {loadingRoles ? "..." : orgRoles.length}
                </p>
              </div>
            </div>

            {selectedOrg.last_crawl_at && (
              <p className="text-xs text-gray-400 pt-2">
                Last crawled: {new Date(selectedOrg.last_crawl_at).toLocaleString()}
              </p>
            )}
          </div>

          <button
            onClick={handleRunAlgorithm}
            disabled={loading || !selectedOrg}
            className="w-full px-4 py-3 bg-accent hover:bg-opacity-80 disabled:opacity-50 disabled:cursor-not-allowed rounded font-semibold text-bg text-lg transition"
          >
            {loading ? `Running... ${currentStep}` : "▶ Run Algorithm"}
          </button>
        </div>
      )}

      {/* Results */}
      {lastResult && (
        <div className="mb-6 space-y-6">
          {/* Summary Cards */}
          {lastResult.success ? (
            <div>
              <p className="text-sm font-semibold text-green mb-3">✓ Algorithm completed successfully</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-green/10 border border-green/20 rounded">
                  <p className="text-xs text-gray-500 mb-1">Validated</p>
                  <p className="text-2xl font-bold text-green">
                    {lastResult.new_roles_validated}
                  </p>
                  <p className="text-xs text-green/60 mt-1">new roles</p>
                </div>

                <div className="p-3 bg-accent/10 border border-accent/20 rounded">
                  <p className="text-xs text-gray-500 mb-1">Matched</p>
                  <p className="text-2xl font-bold text-accent">
                    {lastResult.existing_roles_matched}
                  </p>
                  <p className="text-xs text-accent/60 mt-1">existing</p>
                </div>

                <div className="p-3 bg-yellow-700/10 border border-yellow-700/20 rounded">
                  <p className="text-xs text-gray-500 mb-1">Marked Inactive</p>
                  <p className="text-2xl font-bold text-yellow-600">
                    {lastResult.roles_marked_inactive}
                  </p>
                  <p className="text-xs text-yellow-600/60 mt-1">missing 2+ times</p>
                </div>

                <div className="p-3 bg-surface2 border border-surface2 rounded">
                  <p className="text-xs text-gray-500 mb-1">Total</p>
                  <p className="text-2xl font-bold text-gray-300">
                    {(lastResult.new_roles_validated ?? 0) +
                      (lastResult.existing_roles_matched ?? 0)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">processed</p>
                </div>
              </div>

              {lastResult.validation_errors && lastResult.validation_errors.length > 0 && (
                <div className="mt-4 p-3 bg-red/10 border border-red/20 rounded">
                  <p className="text-sm font-semibold text-red mb-2">
                    {lastResult.validation_errors.length} validation errors
                  </p>
                  <div className="text-xs text-gray-400 max-h-24 overflow-y-auto space-y-1">
                    {lastResult.validation_errors.map((err, idx) => (
                      <p key={idx}>• {err}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 bg-red/10 border border-red rounded">
              <p className="font-semibold text-red mb-1">✗ Algorithm failed</p>
              <p className="text-sm text-gray-300">{lastResult.error}</p>
            </div>
          )}

          {/* Validated Roles Grid */}
          {lastResult.validated_roles && lastResult.validated_roles.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Newly Validated Roles</h3>
              <div className="overflow-x-auto bg-surface border border-surface2 rounded">
                <table className="w-full text-sm">
                  <thead className="bg-surface2 border-b border-surface2">
                    <tr>
                      <th className="px-3 py-2 text-left">Title</th>
                      <th className="px-3 py-2 text-left">Salary</th>
                      <th className="px-3 py-2 text-left">Remote</th>
                      <th className="px-3 py-2 text-left">URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lastResult.validated_roles.map((role) => (
                      <tr key={role.id} className="border-b border-surface2 hover:bg-surface2">
                        <td className="px-3 py-2">{role.title}</td>
                        <td className="px-3 py-2 text-gray-400">
                          {role.salary_range || "—"}
                        </td>
                        <td className="px-3 py-2 text-gray-400">{role.remote_type}</td>
                        <td className="px-3 py-2">
                          <a
                            href={role.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline text-xs truncate block"
                          >
                            {role.url.substring(0, 60)}...
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Debug Log */}
          <div>
            <button
              onClick={() => setShowDebugLog(!showDebugLog)}
              className={`px-3 py-2 text-sm rounded font-semibold transition ${
                showDebugLog
                  ? "bg-accent text-bg"
                  : "bg-surface2 hover:bg-surface2/80 text-gray-300"
              }`}
            >
              {showDebugLog ? "▼ Hide Debug Log" : "▶ Show Debug Log"}
              {lastResult.debug_log && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  ({lastResult.debug_log.length} steps)
                </span>
              )}
            </button>
            {showDebugLog && lastResult.debug_log && (
              <div className="mt-3 p-4 bg-bg border border-surface2 rounded">
                <div className="space-y-1 font-mono text-xs">
                  {lastResult.debug_log.map((line, idx) => {
                    const isError = line.includes("ERROR");
                    const isComplete = line.includes("Complete");
                    const isStep = line.match(/^\[\d+/);

                    return (
                      <div
                        key={idx}
                        className={`pl-2 py-0.5 ${
                          isError
                            ? "text-red"
                            : isComplete
                              ? "text-green font-semibold"
                              : isStep
                                ? "text-accent"
                                : "text-gray-400"
                        }`}
                      >
                        {line}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Current Org Roles */}
      {selectedOrgId && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Org Roles Tracking</h3>

          {loadingRoles ? (
            <div className="p-6 text-center text-gray-400">
              <p className="mb-2">⟳ Loading roles...</p>
            </div>
          ) : orgRoles.length === 0 ? (
            <div className="p-6 bg-surface border border-surface2 rounded text-center text-gray-400">
              <p>No roles yet. Run the algorithm to extract and validate roles.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Active Roles */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h4 className="text-sm font-semibold text-green">✓ Active</h4>
                  <span className="px-2 py-1 bg-green/20 text-green text-xs font-bold rounded">
                    {orgRoles.filter((r) => r.is_active).length}
                  </span>
                </div>
                <div className="bg-surface border border-surface2 rounded max-h-96 overflow-y-auto divide-y divide-surface2">
                  {orgRoles.filter((r) => r.is_active).length === 0 ? (
                    <p className="p-3 text-xs text-gray-400">No active roles</p>
                  ) : (
                    orgRoles
                      .filter((r) => r.is_active)
                      .map((role) => (
                        <div key={role.id} className="p-3 hover:bg-surface2/50 transition">
                          <p className="font-semibold text-sm truncate mb-1">{role.title}</p>
                          <div className="flex justify-between text-xs text-gray-400">
                            <span>
                              Score:{" "}
                              <span className="text-accent font-semibold">
                                {role.local_score_overall
                                  ? role.local_score_overall.toFixed(1)
                                  : "—"}
                              </span>
                            </span>
                            <span>
                              Missing: <span className="font-semibold">{role.missing_count}</span>
                            </span>
                          </div>
                          {role.is_interesting && (
                            <p className="text-xs text-green mt-1">🌟 Interesting</p>
                          )}
                        </div>
                      ))
                  )}
                </div>
              </div>

              {/* Inactive Roles */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h4 className="text-sm font-semibold text-red">✗ Inactive</h4>
                  <span className="px-2 py-1 bg-red/20 text-red text-xs font-bold rounded">
                    {orgRoles.filter((r) => !r.is_active).length}
                  </span>
                </div>
                <div className="bg-surface border border-surface2 rounded max-h-96 overflow-y-auto divide-y divide-surface2">
                  {orgRoles.filter((r) => !r.is_active).length === 0 ? (
                    <p className="p-3 text-xs text-gray-400">No inactive roles</p>
                  ) : (
                    orgRoles
                      .filter((r) => !r.is_active)
                      .map((role) => (
                        <div
                          key={role.id}
                          className="p-3 hover:bg-surface2/50 transition opacity-70"
                        >
                          <p className="font-semibold text-sm truncate mb-1 line-through">
                            {role.title}
                          </p>
                          <div className="flex justify-between text-xs text-gray-500">
                            <span>Missing for</span>
                            <span className="font-semibold text-red">
                              {role.missing_count} crawls
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">
                            Last seen: {role.last_seen_date
                              ? new Date(role.last_seen_date).toLocaleDateString()
                              : "—"}
                          </p>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Export Section — Always Visible */}
      <div className="mb-6 p-4 bg-surface border border-surface2 rounded">
        <hr className="mb-4" />
        <h3 className="text-sm font-semibold mb-4">Export Crawl Data</h3>
        <div className="flex gap-2">
          <select
            value={selectedCrawlId}
            onChange={(e) => setSelectedCrawlId(Number(e.target.value))}
            className="flex-1 px-3 py-2 bg-bg border border-surface2 rounded text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">Select a crawl to export...</option>
            {crawls.map((crawl) => (
              <option key={crawl.id} value={crawl.id}>
                ID {crawl.id} — {new Date(crawl.created_at).toLocaleString()}
              </option>
            ))}
          </select>
          <button
            onClick={handleExport}
            disabled={!selectedCrawlId || isExporting}
            className="px-4 py-2 bg-accent text-black font-semibold rounded hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm"
          >
            {isExporting ? "Exporting..." : "Export"}
          </button>
        </div>
        {exportMessage && (
          <p className={`text-xs mt-2 ${exportMessage.includes("Success") ? "text-green" : "text-red"}`}>
            {exportMessage}
          </p>
        )}
      </div>
    </div>
  );
}
