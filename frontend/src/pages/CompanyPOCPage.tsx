import React, { useState, useEffect } from "react";

interface JobListing {
  title: string;
  url: string;
}

interface QueryCompanyResponse {
  success: boolean;
  jobs: JobListing[];
  error: string | null;
  extraction_method: string | null;
  strategy: string;
}

interface ExtractedJob {
  title: string;
  description: string | null;
  salary_range: string | null;
  remote_status: "remote" | "hybrid" | "on-site" | "unknown";
}

interface ExtractJobResponse {
  success: boolean;
  job: Partial<ExtractedJob>;
  error: string | null;
  extraction_method: string | null;
  confidence: "high" | "medium" | "low";
  strategy: string;
}

interface CompanyEntry {
  company_name: string;
  company_url: string;
  careers_page_url: string;
}

interface POCState {
  companies: CompanyEntry[];
  job_url: string;
  research_prompt: string;
}

export default function CompanyPOCPage() {
  const [state, setState] = useState<POCState>({
    companies: [],
    job_url: "",
    research_prompt: "",
  });

  const [selectedCompanyIndex, setSelectedCompanyIndex] = useState<number>(-1);
  const [formCompanyName, setFormCompanyName] = useState("");
  const [formCompanyUrl, setFormCompanyUrl] = useState("");
  const [formCareersPageUrl, setFormCareersPageUrl] = useState("");

  const [jobsDomainFilter, setJobsDomainFilter] = useState<JobListing[]>([]);
  const [jobsHeuristic, setJobsHeuristic] = useState<JobListing[]>([]);
  const [jobsLLM, setJobsLLM] = useState<JobListing[]>([]);

  const [loadingQuery1, setLoadingQuery1] = useState(false);
  const [loadingQuery2, setLoadingQuery2] = useState(false);
  const [loadingQuery3, setLoadingQuery3] = useState(false);

  const [extractedJobStructured, setExtractedJobStructured] = useState<any>(null);
  const [extractedJobLLM, setExtractedJobLLM] = useState<any>(null);
  const [extractedJobHybrid, setExtractedJobHybrid] = useState<any>(null);
  const [loadingExtractStructured, setLoadingExtractStructured] = useState(false);
  const [loadingExtractLLM, setLoadingExtractLLM] = useState(false);
  const [loadingExtractHybrid, setLoadingExtractHybrid] = useState(false);
  const [selectedExtractTab, setSelectedExtractTab] = useState<"structured" | "llm" | "hybrid">("structured");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadState();
  }, []);

  const loadState = async () => {
    try {
      const response = await fetch("/api/v1/poc/state");
      const text = await response.text();
      if (text) {
        const data = JSON.parse(text);
        if (data && Object.keys(data).length > 0) {
          // Handle old format (backward compatibility)
          if (data.companies === undefined && data.company_name !== undefined) {
            // Migrate old format to new
            const newState: POCState = {
              companies: [
                {
                  company_name: data.company_name || "",
                  company_url: data.company_url || "",
                  careers_page_url: data.careers_page_url || "",
                },
              ],
              job_url: data.job_url || "",
              research_prompt: data.research_prompt || "",
            };
            setState(newState);
            if (data.company_name) {
              setFormCompanyName(data.company_name);
              setFormCompanyUrl(data.company_url);
              setFormCareersPageUrl(data.careers_page_url);
              setSelectedCompanyIndex(0);
            }
          } else {
            // New format
            setState(data);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load state:", err);
    }
  };

  const saveState = async () => {
    // Upsert: check if company already exists by name
    let updated = [...state.companies];
    const existingIndex = updated.findIndex((c) => c.company_name === formCompanyName);

    if (formCompanyName && formCompanyUrl && formCareersPageUrl) {
      if (existingIndex >= 0) {
        // Update existing
        updated[existingIndex] = {
          company_name: formCompanyName,
          company_url: formCompanyUrl,
          careers_page_url: formCareersPageUrl,
        };
      } else {
        // Add new
        updated.push({
          company_name: formCompanyName,
          company_url: formCompanyUrl,
          careers_page_url: formCareersPageUrl,
        });
      }
    }

    const newState = {
      companies: updated,
      job_url: state.job_url,
      research_prompt: state.research_prompt,
    };

    try {
      const response = await fetch("/api/v1/poc/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newState),
      });
      const data = await response.json();
      if (data.success) {
        setState(newState);
        setSelectedCompanyIndex(updated.findIndex((c) => c.company_name === formCompanyName));
        showToast("Company saved");
      }
    } catch (err) {
      showToast(`Save failed: ${err}`);
    }
  };

  const showToast = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 5000);
  };

  const loadCompany = (index: number) => {
    if (index >= 0 && index < state.companies.length) {
      const company = state.companies[index];
      setFormCompanyName(company.company_name);
      setFormCompanyUrl(company.company_url);
      setFormCareersPageUrl(company.careers_page_url);
      setSelectedCompanyIndex(index);
    }
  };

  const deleteCompany = async () => {
    if (selectedCompanyIndex < 0) {
      showToast("No company selected");
      return;
    }

    const updated = state.companies.filter((_, i) => i !== selectedCompanyIndex);
    const newState = {
      companies: updated,
      job_url: state.job_url,
      research_prompt: state.research_prompt,
    };

    try {
      const response = await fetch("/api/v1/poc/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newState),
      });
      const data = await response.json();
      if (data.success) {
        setState(newState);
        setSelectedCompanyIndex(-1);
        setFormCompanyName("");
        setFormCompanyUrl("");
        setFormCareersPageUrl("");
        showToast("Company deleted");
      }
    } catch (err) {
      showToast(`Delete failed: ${err}`);
    }
  };

  const queryCompany = async (strategy: "domain" | "heuristic" | "llm") => {
    setError(null);
    const payload = {
      company_name: formCompanyName,
      company_url: formCompanyUrl,
      careers_page_url: formCareersPageUrl,
      strategy,
    };

    try {
      const response = await fetch("/api/v1/poc/query-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: QueryCompanyResponse = await response.json();
      if (data.success) {
        return data;
      } else {
        showToast(data.error || "Failed to query company");
        return null;
      }
    } catch (err) {
      showToast(`Query failed: ${err}`);
      return null;
    }
  };

  const queryStrategy1 = async () => {
    setLoadingQuery1(true);
    const result = await queryCompany("domain");
    if (result) {
      setJobsDomainFilter(result.jobs);
    }
    setLoadingQuery1(false);
  };

  const queryStrategy2 = async () => {
    setLoadingQuery2(true);
    const result = await queryCompany("heuristic");
    if (result) {
      setJobsHeuristic(result.jobs);
    }
    setLoadingQuery2(false);
  };

  const queryStrategy3 = async () => {
    setLoadingQuery3(true);
    const result = await queryCompany("llm");
    if (result) {
      setJobsLLM(result.jobs);
    }
    setLoadingQuery3(false);
  };

  const extractJob = async (strategy: "structured" | "llm" | "hybrid") => {
    if (strategy === "structured") {
      setLoadingExtractStructured(true);
    } else if (strategy === "llm") {
      setLoadingExtractLLM(true);
    } else {
      setLoadingExtractHybrid(true);
    }
    setError(null);
    try {
      const response = await fetch("/api/v1/poc/extract-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_url: state.job_url || "", strategy }),
      });
      const data: ExtractJobResponse = await response.json();
      if (data.success) {
        if (strategy === "structured") {
          setExtractedJobStructured(data.job);
        } else if (strategy === "llm") {
          setExtractedJobLLM(data.job);
        } else {
          setExtractedJobHybrid(data.job);
        }
        setSelectedExtractTab(strategy);
      } else {
        showToast(data.error || "Failed to extract job");
      }
    } catch (err) {
      showToast(`Extract failed: ${err}`);
    } finally {
      if (strategy === "structured") {
        setLoadingExtractStructured(false);
      } else if (strategy === "llm") {
        setLoadingExtractLLM(false);
      } else {
        setLoadingExtractHybrid(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold mb-2">Company Query & Job Extraction POC</h1>
          <p className="text-gray-400">Test job listing extraction from career pages</p>
        </div>

        {/* Saved companies dropdown */}
        {state.companies.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-4">
            <label className="block text-sm font-medium mb-2">Saved Companies</label>
            <div className="flex gap-2">
              <select
                value={selectedCompanyIndex}
                onChange={(e) => loadCompany(Number(e.target.value))}
                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              >
                <option value="-1">-- Select a company --</option>
                {state.companies.map((company, idx) => (
                  <option key={idx} value={idx}>
                    {company.company_name}
                  </option>
                ))}
              </select>
              <button
                onClick={deleteCompany}
                disabled={selectedCompanyIndex < 0}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded text-white font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        )}

        {/* Save/Load buttons */}
        <div className="flex gap-4">
          <button
            onClick={saveState}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white font-medium"
          >
            Save State
          </button>
          <button
            onClick={loadState}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white font-medium"
          >
            Load State
          </button>
        </div>

        {/* Error toast */}
        {error && (
          <div className="bg-red-900 border border-red-600 p-4 rounded text-red-100">
            {error}
          </div>
        )}

        {/* Section 1: Company Query */}
        <div className="bg-gray-800 rounded-lg p-6 space-y-4">
          <h2 className="text-2xl font-bold">Section 1: Query Open Roles</h2>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Company Name</label>
              <input
                type="text"
                value={formCompanyName}
                onChange={(e) => setFormCompanyName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                placeholder="e.g., Vetcove"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Company URL</label>
              <input
                type="text"
                value={formCompanyUrl}
                onChange={(e) => setFormCompanyUrl(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                placeholder="e.g., https://vetcove.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Careers Page URL</label>
              <input
                type="text"
                value={formCareersPageUrl}
                onChange={(e) => setFormCareersPageUrl(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                placeholder="e.g., https://vetcove.com/careers"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={queryStrategy1}
              disabled={loadingQuery1 || !formCareersPageUrl}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-white font-medium text-sm"
            >
              {loadingQuery1 ? "Querying..." : "Query 1: Domain"}
            </button>
            <button
              onClick={queryStrategy2}
              disabled={loadingQuery2 || !formCareersPageUrl}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded text-white font-medium text-sm"
            >
              {loadingQuery2 ? "Querying..." : "Query 2: Heuristic"}
            </button>
            <button
              onClick={queryStrategy3}
              disabled={loadingQuery3 || !formCareersPageUrl}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded text-white font-medium text-sm"
            >
              {loadingQuery3 ? "Querying..." : "Query 3: LLM"}
            </button>
          </div>

          {/* 3-column results */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            {/* Strategy 1: Domain Filter */}
            <div className="bg-gray-700 rounded p-4 border border-gray-600">
              <h4 className="font-semibold text-blue-400 mb-2">Strategy 1: Domain Filter</h4>
              <p className="text-sm text-gray-300 mb-3">Found {jobsDomainFilter?.length || 0} jobs</p>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {jobsDomainFilter.map((job, idx) => (
                  <div key={idx} className="text-sm flex items-center gap-2">
                    <button
                      onClick={() => {
                        setState({ ...state, job_url: job.url });
                        showToast("Job URL added");
                      }}
                      className="px-2 py-1 bg-blue-500 hover:bg-blue-600 rounded text-white text-xs flex-shrink-0"
                      title="Add to Job URL field"
                    >
                      →
                    </button>
                    <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 break-words flex-1">
                      {job.title}
                    </a>
                  </div>
                ))}
                {jobsDomainFilter?.length || 0 === 0 && <p className="text-gray-400">Click button to query</p>}
              </div>
            </div>

            {/* Strategy 2: Heuristic */}
            <div className="bg-gray-700 rounded p-4 border border-gray-600">
              <h4 className="font-semibold text-green-400 mb-2">Strategy 2: Heuristic</h4>
              <p className="text-sm text-gray-300 mb-3">Found {jobsHeuristic?.length || 0} jobs</p>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {jobsHeuristic.map((job, idx) => (
                  <div key={idx} className="text-sm flex items-center gap-2">
                    <button
                      onClick={() => {
                        setState({ ...state, job_url: job.url });
                        showToast("Job URL added");
                      }}
                      className="px-2 py-1 bg-green-500 hover:bg-green-600 rounded text-white text-xs flex-shrink-0"
                      title="Add to Job URL field"
                    >
                      →
                    </button>
                    <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:text-green-300 break-words flex-1">
                      {job.title}
                    </a>
                  </div>
                ))}
                {jobsHeuristic?.length || 0 === 0 && <p className="text-gray-400">Click button to query</p>}
              </div>
            </div>

            {/* Strategy 3: LLM */}
            <div className="bg-gray-700 rounded p-4 border border-gray-600">
              <h4 className="font-semibold text-purple-400 mb-2">Strategy 3: LLM</h4>
              <p className="text-sm text-gray-300 mb-3">Found {jobsLLM?.length || 0} jobs</p>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {jobsLLM.map((job, idx) => (
                  <div key={idx} className="text-sm flex items-center gap-2">
                    <button
                      onClick={() => {
                        setState({ ...state, job_url: job.url });
                        showToast("Job URL added");
                      }}
                      className="px-2 py-1 bg-purple-500 hover:bg-purple-600 rounded text-white text-xs flex-shrink-0"
                      title="Add to Job URL field"
                    >
                      →
                    </button>
                    <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 break-words flex-1">
                      {job.title}
                    </a>
                  </div>
                ))}
                {jobsLLM?.length || 0 === 0 && <p className="text-gray-400">Click button to query</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Job Extraction */}
        <div className="bg-gray-800 rounded-lg p-6 space-y-4">
          <h2 className="text-2xl font-bold">Section 2: Extract Job Data</h2>

          <div>
            <label className="block text-sm font-medium mb-1">Job URL</label>
            <input
              type="text"
              value={state.job_url}
              onChange={(e) => setState({ ...state, job_url: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              placeholder="e.g., https://jobs.ashbyhq.com/..."
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => extractJob("structured")}
              disabled={loadingExtractStructured || !state.job_url}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-white font-medium text-sm"
            >
              {loadingExtractStructured ? "Extracting..." : "Extract: Structured"}
            </button>
            <button
              onClick={() => extractJob("llm")}
              disabled={loadingExtractLLM || !state.job_url}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded text-white font-medium text-sm"
            >
              {loadingExtractLLM ? "Extracting..." : "Extract: LLM"}
            </button>
            <button
              onClick={() => extractJob("hybrid")}
              disabled={loadingExtractHybrid || !state.job_url}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 rounded text-white font-medium text-sm"
            >
              {loadingExtractHybrid ? "Extracting..." : "Extract: Hybrid"}
            </button>
          </div>

          {/* Tab navigation */}
          {(extractedJobStructured || extractedJobLLM || extractedJobHybrid) && (
            <div className="flex gap-2 border-b border-gray-600 pt-4">
              {extractedJobStructured && (
                <button
                  onClick={() => setSelectedExtractTab("structured")}
                  className={`px-4 py-2 font-medium text-sm ${
                    selectedExtractTab === "structured"
                      ? "border-b-2 border-blue-400 text-blue-400"
                      : "text-gray-400 hover:text-gray-300"
                  }`}
                >
                  Structured
                </button>
              )}
              {extractedJobLLM && (
                <button
                  onClick={() => setSelectedExtractTab("llm")}
                  className={`px-4 py-2 font-medium text-sm ${
                    selectedExtractTab === "llm"
                      ? "border-b-2 border-purple-400 text-purple-400"
                      : "text-gray-400 hover:text-gray-300"
                  }`}
                >
                  LLM
                </button>
              )}
              {extractedJobHybrid && (
                <button
                  onClick={() => setSelectedExtractTab("hybrid")}
                  className={`px-4 py-2 font-medium text-sm ${
                    selectedExtractTab === "hybrid"
                      ? "border-b-2 border-emerald-400 text-emerald-400"
                      : "text-gray-400 hover:text-gray-300"
                  }`}
                >
                  Hybrid
                </button>
              )}
            </div>
          )}

          {/* Tab Content - Single column, full width */}
          {selectedExtractTab === "structured" && extractedJobStructured && (
            <div className="space-y-3 pt-4">
              <div className="bg-gray-700 p-3 rounded border border-gray-600">
                <div className="text-sm text-gray-400">Title</div>
                <div className="font-medium text-white text-sm">{extractedJobStructured.title || "N/A"}</div>
              </div>

              <div className="bg-gray-700 p-3 rounded border border-gray-600">
                <div className="text-sm text-gray-400">Description</div>
                <div className="text-white text-xs max-h-96 overflow-y-auto whitespace-pre-wrap">
                  {extractedJobStructured.description || "N/A"}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-700 p-3 rounded border border-gray-600">
                  <div className="text-sm text-gray-400">Salary Range</div>
                  <div className="font-medium text-white text-sm">{extractedJobStructured.salary_range || "N/A"}</div>
                </div>

                <div className="bg-gray-700 p-3 rounded border border-gray-600">
                  <div className="text-sm text-gray-400">Remote Status</div>
                  <div className="font-medium text-white text-sm capitalize">{extractedJobStructured.remote_status || "N/A"}</div>
                </div>
              </div>
            </div>
          )}

          {selectedExtractTab === "llm" && extractedJobLLM && (
            <div className="space-y-3 pt-4">
              <div className="bg-gray-700 p-3 rounded border border-gray-600">
                <div className="text-sm text-gray-400">Title</div>
                <div className="font-medium text-white text-sm">{extractedJobLLM.title || "N/A"}</div>
              </div>

              <div className="bg-gray-700 p-3 rounded border border-gray-600">
                <div className="text-sm text-gray-400">Description</div>
                <div className="text-white text-xs max-h-96 overflow-y-auto whitespace-pre-wrap">
                  {extractedJobLLM.description || "N/A"}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-700 p-3 rounded border border-gray-600">
                  <div className="text-sm text-gray-400">Salary Range</div>
                  <div className="font-medium text-white text-sm">{extractedJobLLM.salary_range || "N/A"}</div>
                </div>

                <div className="bg-gray-700 p-3 rounded border border-gray-600">
                  <div className="text-sm text-gray-400">Remote Status</div>
                  <div className="font-medium text-white text-sm capitalize">{extractedJobLLM.remote_status || "N/A"}</div>
                </div>
              </div>
            </div>
          )}

          {selectedExtractTab === "hybrid" && extractedJobHybrid && (
            <div className="space-y-3 pt-4">
              <div className="bg-gray-700 p-3 rounded border border-gray-600">
                <div className="text-sm text-gray-400">Title</div>
                <div className="font-medium text-white text-sm">{extractedJobHybrid.title || "N/A"}</div>
              </div>

              <div className="bg-gray-700 p-3 rounded border border-gray-600">
                <div className="text-sm text-gray-400">Description</div>
                <div className="text-white text-xs max-h-96 overflow-y-auto whitespace-pre-wrap">
                  {extractedJobHybrid.description || "N/A"}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-700 p-3 rounded border border-gray-600">
                  <div className="text-sm text-gray-400">Salary Range</div>
                  <div className="font-medium text-white text-sm">{extractedJobHybrid.salary_range || "N/A"}</div>
                </div>

                <div className="bg-gray-700 p-3 rounded border border-gray-600">
                  <div className="text-sm text-gray-400">Remote Status</div>
                  <div className="font-medium text-white text-sm capitalize">{extractedJobHybrid.remote_status || "N/A"}</div>
                </div>
              </div>
            </div>
          )}

          {!extractedJobStructured && !extractedJobLLM && !extractedJobHybrid && (
            <p className="text-gray-400 text-sm pt-4">Click a button to extract job data</p>
          )}
        </div>
      </div>
    </div>
  );
}
