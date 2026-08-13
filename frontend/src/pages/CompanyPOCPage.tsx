import { useState, useEffect } from "react";

interface JobListing {
  title: string;
  url: string;
}

interface CrawlMetadata {
  markdown_length: number;
  js_rendering_used: boolean;
  anti_bot_detected: boolean;
  retry_count: number;
}

interface ExtractionDebug {
  domain_count?: number;
  heuristic_count?: number;
  llm_count?: number;
  llm_raw_response?: string;
  llm_prompt?: string;
  markdown_length?: number;
}

interface QueryCompanyResponse {
  success: boolean;
  jobs: JobListing[];
  error: string | null;
  extraction_method: string | null;
  strategy: string;
  crawl_latency_ms: number;
  process_latency_ms: number;
  llm_model?: string | null;
  data_source?: string;
  crawl_metadata?: CrawlMetadata;
  extraction_debug?: ExtractionDebug;
  markdown?: string;
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
  latency_ms: number;
}

interface CompanyEntry {
  company_name: string;
  company_url: string;
  careers_page_url: string;
  manual_job_count?: number;
  company_notes?: string;
}

interface POCState {
  companies: CompanyEntry[];
  job_url: string;
  research_prompt: string;
}

interface TestResult {
  id: string;
  timestamp: string;
  companyName: string;
  careersPageUrl: string;
  manualJobCount?: number;
  companyNotes?: string;
  careerCrawlLatencyMs?: number;  // Time to crawl career page
  processLatencyMs?: number;  // Time to extract/process
  llmModel?: string;  // Model used (if LLM-based)
  careerPageMethod?: string;
  careerPageJobsFound?: number;
  careerPageSuccess?: boolean;
  careerPageError?: string;
  jobs?: Array<{ title: string; url: string }>;  // Actual job listings extracted
  extractionUrl?: string;
  extractionLatencyMs?: number;
  extractionMethod?: string;
  extractionConfidence?: string;
  extractionSuccess?: boolean;
  extractionError?: string;
  extraction_debug?: ExtractionDebug;  // Debug info from extraction
  markdown?: string;  // Raw markdown from crawl
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

  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [manualJobCount, setManualJobCount] = useState("");
  const [companyNotes, setCompanyNotes] = useState("");
  const [cachedMarkdown, setCachedMarkdown] = useState<string | null>(null);
  const [crawlLatencyMs, setCrawlLatencyMs] = useState<number | null>(null);
  const [crawlInProgress, setCrawlInProgress] = useState(false);
  const [batchTestInProgress, setBatchTestInProgress] = useState(false);
  const [batchTestStatus, setBatchTestStatus] = useState<string>("");

  useEffect(() => {
    loadState();
    loadPersistentData();
  }, []);

  // Auto-save persistent data whenever companies or test results change
  useEffect(() => {
    savePersistentData();
  }, [state.companies, testResults]);

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
                  manual_job_count: data.manual_job_count,
                  company_notes: data.company_notes,
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
              setManualJobCount(data.manual_job_count?.toString() || "");
              setCompanyNotes(data.company_notes || "");
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
          manual_job_count: manualJobCount ? Number(manualJobCount) : undefined,
          company_notes: companyNotes || undefined,
        };
      } else {
        // Add new
        updated.push({
          company_name: formCompanyName,
          company_url: formCompanyUrl,
          careers_page_url: formCareersPageUrl,
          manual_job_count: manualJobCount ? Number(manualJobCount) : undefined,
          company_notes: companyNotes || undefined,
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

  const addTestResult = (result: Partial<TestResult>) => {
    const newResult: TestResult = {
      id: `test-${Date.now()}-${Math.random()}`,
      timestamp: new Date().toLocaleTimeString(),
      companyName: formCompanyName,
      careersPageUrl: formCareersPageUrl,
      ...result,
    };
    setTestResults((prev) => [newResult, ...prev]);
    // Optionally auto-clear manual fields after adding result
    // setManualJobCount("");
    // setCompanyNotes("");
  };

  const clearTestResults = () => {
    setTestResults([]);
  };

  const loadPersistentData = async () => {
    try {
      const response = await fetch("/api/v1/poc/persistent-data");
      const data = await response.json();
      if (data.companies && data.testResults) {
        setState((prev) => ({ ...prev, companies: data.companies }));
        setTestResults(data.testResults);
      }
    } catch (err) {
      console.error("Failed to load persistent data:", err);
    }
  };

  const savePersistentData = async () => {
    try {
      await fetch("/api/v1/poc/persistent-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companies: state.companies,
          testResults: testResults,
        }),
      });
    } catch (err) {
      console.error("Failed to save persistent data:", err);
    }
  };

  const testAllCompanies = async () => {
    if (state.companies.length === 0) {
      showToast("No companies to test");
      return;
    }

    setBatchTestInProgress(true);
    setBatchTestStatus("");
    setError(null);

    try {
      for (let i = 0; i < state.companies.length; i++) {
        const company = state.companies[i];
        setBatchTestStatus(`Testing ${company.company_name} (${i + 1}/${state.companies.length})...`);

        // Crawl the page
        try {
          const crawlResponse = await fetch("/api/v1/poc/crawl-page", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              company_name: company.company_name,
              company_url: company.company_url,
              careers_page_url: company.careers_page_url,
            }),
          });
          const crawlData = await crawlResponse.json();

          if (!crawlData.success) {
            setBatchTestStatus(
              `${company.company_name}: Crawl failed - ${crawlData.error}`
            );
            addTestResult({
              companyName: company.company_name,
              careersPageUrl: company.careers_page_url,
              manualJobCount: company.manual_job_count,
              companyNotes: company.company_notes,
              careerCrawlLatencyMs: crawlData.crawl_latency_ms,
              careerPageMethod: "crawl4ai",
              careerPageSuccess: false,
              careerPageError: crawlData.error,
            });
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          }

          const markdown = crawlData.markdown;

          // Log the crawl
          addTestResult({
            companyName: company.company_name,
            careersPageUrl: company.careers_page_url,
            manualJobCount: company.manual_job_count,
            companyNotes: company.company_notes,
            careerCrawlLatencyMs: crawlData.crawl_latency_ms,
            careerPageMethod: "crawl4ai",
            careerPageSuccess: true,
            markdown: markdown || undefined,
          });

          // Test all 4 strategies on cached markdown
          for (const strategy of [
            "domain",
            "heuristic",
            "llm",
            "validate",
          ] as const) {
            setBatchTestStatus(
              `${company.company_name}: Testing ${strategy}...`
            );

            const strategyResponse = await fetch(
              "/api/v1/poc/query-company-cached",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  company_name: company.company_name,
                  markdown: markdown || undefined,
                  strategy: strategy,
                }),
              }
            );
            const strategyData = await strategyResponse.json();

            addTestResult({
              companyName: company.company_name,
              careersPageUrl: company.careers_page_url,
              manualJobCount: company.manual_job_count,
              companyNotes: company.company_notes,
              // Don't log crawl latency for cached extractions - it was already logged in crawl row
              processLatencyMs: strategyData.process_latency_ms,
              llmModel: strategyData.llm_model || undefined,
              careerPageMethod: strategyData.extraction_method,
              careerPageJobsFound: strategyData.jobs.length,
              careerPageSuccess: strategyData.success,
              careerPageError: strategyData.error || undefined,
              jobs: strategyData.jobs || [],
              extraction_debug: strategyData.extraction_debug,
              markdown: strategyData.markdown,
            });

            await new Promise((resolve) => setTimeout(resolve, 300));
          }
        } catch (err) {
          setBatchTestStatus(`${company.company_name}: Error - ${err}`);
          addTestResult({
            companyName: company.company_name,
            careersPageUrl: company.careers_page_url,
            manualJobCount: company.manual_job_count,
            companyNotes: company.company_notes,
            careerPageSuccess: false,
            careerPageError: `Error: ${err}`,
          });
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      setBatchTestStatus("✓ All companies tested!");
      showToast(`Tested ${state.companies.length} companies`);
    } catch (err) {
      setBatchTestStatus(`Batch test failed: ${err}`);
      showToast(`Batch test error: ${err}`);
    } finally {
      setBatchTestInProgress(false);
    }
  };

  const loadCompany = (index: number) => {
    if (index >= 0 && index < state.companies.length) {
      const company = state.companies[index];
      setFormCompanyName(company.company_name);
      setFormCompanyUrl(company.company_url);
      setFormCareersPageUrl(company.careers_page_url);
      setSelectedCompanyIndex(index);
      // Restore manual count/notes for this company
      setManualJobCount(company.manual_job_count?.toString() || "");
      setCompanyNotes(company.company_notes || "");
      // Clear cached markdown when switching companies
      setCachedMarkdown(null);
      setCrawlLatencyMs(null);
    }
  };

  const crawlPage = async () => {
    if (!formCareersPageUrl) {
      showToast("Enter careers page URL first");
      return;
    }

    setCrawlInProgress(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/poc/crawl-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: formCompanyName,
          company_url: formCompanyUrl,
          careers_page_url: formCareersPageUrl,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setCachedMarkdown(data.markdown);
        setCrawlLatencyMs(data.crawl_latency_ms);
        // Log the crawl as a test result
        addTestResult({
          manualJobCount: manualJobCount ? Number(manualJobCount) : undefined,
          companyNotes: companyNotes || undefined,
          careerCrawlLatencyMs: data.crawl_latency_ms,
          careerPageMethod: "crawl4ai",
          careerPageJobsFound: undefined,
          careerPageSuccess: true,
          markdown: data.markdown,
        });
        showToast(`Page crawled in ${(data.crawl_latency_ms / 1000).toFixed(1)}s`);
      } else {
        showToast(`Crawl failed: ${data.error}`);
        addTestResult({
          manualJobCount: manualJobCount ? Number(manualJobCount) : undefined,
          companyNotes: companyNotes || undefined,
          careerCrawlLatencyMs: data.crawl_latency_ms,
          careerPageMethod: "crawl4ai",
          careerPageSuccess: false,
          careerPageError: data.error,
          markdown: data.markdown,
        });
      }
    } catch (err) {
      showToast(`Crawl error: ${err}`);
    } finally {
      setCrawlInProgress(false);
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

  const queryCompanyCached = async (strategy: "domain" | "heuristic" | "llm" | "validate", markdown: string) => {
    setError(null);
    const payload = {
      company_name: formCompanyName,
      markdown: markdown,
      strategy,
    };

    try {
      const response = await fetch("/api/v1/poc/query-company-cached", {
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
    let result;
    if (cachedMarkdown) {
      result = await queryCompanyCached("domain", cachedMarkdown);
    } else {
      result = await queryCompany("domain");
    }
    if (result) {
      setJobsDomainFilter(result.jobs);
      addTestResult({
        manualJobCount: manualJobCount ? Number(manualJobCount) : undefined,
        companyNotes: companyNotes || undefined,
        careerCrawlLatencyMs: result.crawl_latency_ms,
        processLatencyMs: result.process_latency_ms,
        llmModel: result.llm_model || undefined,
        careerPageMethod: result.extraction_method || undefined,
        careerPageJobsFound: result.jobs.length,
        careerPageSuccess: result.success,
        careerPageError: result.error || undefined,
        jobs: result.jobs || [],
        extraction_debug: result.extraction_debug,
        markdown: result.markdown,
      });
    }
    setLoadingQuery1(false);
  };

  const queryStrategy2 = async () => {
    setLoadingQuery2(true);
    let result;
    if (cachedMarkdown) {
      result = await queryCompanyCached("heuristic", cachedMarkdown);
    } else {
      result = await queryCompany("heuristic");
    }
    if (result) {
      setJobsHeuristic(result.jobs);
      addTestResult({
        manualJobCount: manualJobCount ? Number(manualJobCount) : undefined,
        companyNotes: companyNotes || undefined,
        careerCrawlLatencyMs: result.crawl_latency_ms,
        processLatencyMs: result.process_latency_ms,
        llmModel: result.llm_model || undefined,
        careerPageMethod: result.extraction_method || undefined,
        careerPageJobsFound: result.jobs.length,
        careerPageSuccess: result.success,
        careerPageError: result.error || undefined,
        jobs: result.jobs || [],
        extraction_debug: result.extraction_debug,
        markdown: result.markdown,
      });
    }
    setLoadingQuery2(false);
  };

  const queryStrategy3 = async () => {
    setLoadingQuery3(true);
    let result;
    if (cachedMarkdown) {
      result = await queryCompanyCached("llm", cachedMarkdown);
    } else {
      result = await queryCompany("llm");
    }
    if (result) {
      setJobsLLM(result.jobs);
      addTestResult({
        manualJobCount: manualJobCount ? Number(manualJobCount) : undefined,
        companyNotes: companyNotes || undefined,
        careerCrawlLatencyMs: result.crawl_latency_ms,
        processLatencyMs: result.process_latency_ms,
        llmModel: result.llm_model || undefined,
        careerPageMethod: result.extraction_method || undefined,
        careerPageJobsFound: result.jobs.length,
        careerPageSuccess: result.success,
        careerPageError: result.error || undefined,
        jobs: result.jobs || [],
        extraction_debug: result.extraction_debug,
        markdown: result.markdown,
      });
    }
    setLoadingQuery3(false);
  };

  const queryHybrid = async () => {
    setError(null);
    setLoadingQuery3(true);
    let result;

    if (cachedMarkdown) {
      result = await queryCompanyCached("validate", cachedMarkdown);
    } else {
      const payload = {
        company_name: formCompanyName,
        company_url: formCompanyUrl,
        careers_page_url: formCareersPageUrl,
        strategy: "validate",
      };

      try {
        const response = await fetch("/api/v1/poc/query-company", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        result = await response.json();
      } catch (err) {
        showToast(`Query failed: ${err}`);
        setLoadingQuery3(false);
        return;
      }
    }

    if (result?.success) {
      setJobsLLM(result.jobs);
      addTestResult({
        manualJobCount: manualJobCount ? Number(manualJobCount) : undefined,
        companyNotes: companyNotes || undefined,
        careerCrawlLatencyMs: result.crawl_latency_ms,
        processLatencyMs: result.process_latency_ms,
        llmModel: result.llm_model || undefined,
        careerPageMethod: result.extraction_method || undefined,
        careerPageJobsFound: result.jobs.length,
        careerPageSuccess: result.success,
        careerPageError: result.error || undefined,
        jobs: result.jobs || [],
        extraction_debug: result.extraction_debug,
        markdown: result.markdown,
      });
    } else {
      showToast(result?.error || "Failed to query company");
    }
    setLoadingQuery3(false);
  };

  const queryAllStrategies = async () => {
    setError(null);
    setLoadingQuery1(true);
    setLoadingQuery2(true);
    setLoadingQuery3(true);

    try {
      // If no cached markdown, crawl first
      let markdown = cachedMarkdown;
      if (!markdown) {
        const crawlResponse = await fetch("/api/v1/poc/crawl-page", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company_name: formCompanyName,
            company_url: formCompanyUrl,
            careers_page_url: formCareersPageUrl,
          }),
        });
        const crawlData = await crawlResponse.json();
        if (!crawlData.success) {
          showToast(`Crawl failed: ${crawlData.error}`);
          addTestResult({
            manualJobCount: manualJobCount ? Number(manualJobCount) : undefined,
            companyNotes: companyNotes || undefined,
            careerPageMethod: "crawl4ai",
            careerPageSuccess: false,
            careerPageError: crawlData.error,
            markdown: crawlData.markdown,
          });
          setLoadingQuery1(false);
          setLoadingQuery2(false);
          setLoadingQuery3(false);
          return;
        }
        markdown = crawlData.markdown;
        setCachedMarkdown(markdown);
        setCrawlLatencyMs(crawlData.crawl_latency_ms);
        // Log the crawl
        addTestResult({
          manualJobCount: manualJobCount ? Number(manualJobCount) : undefined,
          companyNotes: companyNotes || undefined,
          careerCrawlLatencyMs: crawlData.crawl_latency_ms,
          careerPageMethod: "crawl4ai",
          careerPageSuccess: true,
          markdown: markdown || undefined,
        });
      }

      // Run all 4 strategies on cached markdown
      for (const strategy of ["domain", "heuristic", "llm", "validate"]) {
        const data = await queryCompanyCached(strategy as "domain" | "heuristic" | "llm" | "validate", markdown || "");
        if (data?.success) {
          addTestResult({
            manualJobCount: manualJobCount ? Number(manualJobCount) : undefined,
            companyNotes: companyNotes || undefined,
            careerCrawlLatencyMs: data.crawl_latency_ms,
            processLatencyMs: data.process_latency_ms,
            llmModel: data.llm_model || undefined,
            careerPageMethod: data.extraction_method || undefined,
            careerPageJobsFound: data.jobs.length,
            careerPageSuccess: data.success,
            careerPageError: data.error || undefined,
            jobs: data.jobs || [],
            extraction_debug: data.extraction_debug,
            markdown: data.markdown || undefined,
          });
          if (strategy === "domain") setJobsDomainFilter(data.jobs);
          if (strategy === "heuristic") setJobsHeuristic(data.jobs);
          if (strategy === "llm" || strategy === "validate") setJobsLLM(data.jobs);
        }
        // Small delay between requests
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      showToast("All strategies tested");
    } catch (err) {
      showToast(`Test all failed: ${err}`);
    } finally {
      setLoadingQuery1(false);
      setLoadingQuery2(false);
      setLoadingQuery3(false);
    }
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
        addTestResult({
          manualJobCount: manualJobCount ? Number(manualJobCount) : undefined,
          companyNotes: companyNotes || undefined,
          extractionUrl: state.job_url,
          extractionLatencyMs: data.latency_ms,
          extractionMethod: data.extraction_method || undefined,
          extractionConfidence: data.confidence,
          extractionSuccess: data.success,
        });
      } else {
        showToast(data.error || "Failed to extract job");
        addTestResult({
          manualJobCount: manualJobCount ? Number(manualJobCount) : undefined,
          companyNotes: companyNotes || undefined,
          extractionUrl: state.job_url,
          extractionLatencyMs: data.latency_ms,
          extractionMethod: data.extraction_method || undefined,
          extractionSuccess: false,
          extractionError: data.error || undefined,
        });
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

        {/* Test Results Panel */}
        {testResults.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6 space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Test Results ({testResults.length})</h2>
              <div className="flex gap-2">
                <button
                  onClick={clearTestResults}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white font-medium text-sm"
                >
                  Clear Results
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-600">
                    <th className="text-left py-2 px-2">Time</th>
                    <th className="text-left py-2 px-2">Company</th>
                    <th className="text-left py-2 px-2">Manual Count</th>
                    <th className="text-left py-2 px-2">Career Crawl (ms)</th>
                    <th className="text-left py-2 px-2">Process (ms)</th>
                    <th className="text-left py-2 px-2">Model</th>
                    <th className="text-left py-2 px-2">Method</th>
                    <th className="text-left py-2 px-2">Found</th>
                    <th className="text-left py-2 px-2">Confidence</th>
                    <th className="text-left py-2 px-2">Company Notes</th>
                    <th className="text-left py-2 px-2">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {testResults.map((result) => (
                    <tr key={result.id} className="border-b border-gray-700 hover:bg-gray-700">
                      <td className="py-2 px-2 text-gray-400">{result.timestamp}</td>
                      <td className="py-2 px-2 font-medium truncate max-w-xs">{result.companyName || "—"}</td>
                      <td className="py-2 px-2 text-yellow-400 font-medium">
                        {result.manualJobCount !== undefined ? result.manualJobCount : "—"}
                      </td>
                      <td className="py-2 px-2">
                        {result.careerCrawlLatencyMs !== undefined ? (
                          <span className={result.careerPageSuccess ? "text-green-400" : "text-red-400"}>
                            {result.careerCrawlLatencyMs.toFixed(0)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {result.processLatencyMs !== undefined ? (
                          <span className="text-blue-400">{result.processLatencyMs.toFixed(0)}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 px-2 text-purple-300 text-xs">{result.llmModel || "—"}</td>
                      <td className="py-2 px-2 text-gray-300">{result.careerPageMethod || "—"}</td>
                      <td className="py-2 px-2 text-gray-300">{result.careerPageJobsFound || "—"}</td>
                      <td className="py-2 px-2 text-gray-300">{result.extractionConfidence || "—"}</td>
                      <td className="py-2 px-2 text-gray-400 text-xs max-w-xs truncate">{result.companyNotes || "—"}</td>
                      <td className="py-2 px-2 text-red-400 text-xs max-w-xs truncate">
                        {result.careerPageError || result.extractionError || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formCompanyUrl}
                  onChange={(e) => setFormCompanyUrl(e.target.value)}
                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                  placeholder="e.g., https://vetcove.com"
                />
                <button
                  onClick={() => formCompanyUrl && window.open(formCompanyUrl, "_blank")}
                  disabled={!formCompanyUrl}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-white font-medium text-sm"
                  title="Open in new tab"
                >
                  →
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Careers Page URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formCareersPageUrl}
                  onChange={(e) => setFormCareersPageUrl(e.target.value)}
                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                  placeholder="e.g., https://vetcove.com/careers"
                />
                <button
                  onClick={() => formCareersPageUrl && window.open(formCareersPageUrl, "_blank")}
                  disabled={!formCareersPageUrl}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-white font-medium text-sm"
                  title="Open in new tab"
                >
                  →
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Manual Job Count</label>
                <input
                  type="number"
                  value={manualJobCount}
                  onChange={(e) => setManualJobCount(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                  placeholder="e.g., 27"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <input
                  type="text"
                  value={companyNotes}
                  onChange={(e) => setCompanyNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                  placeholder="e.g., pagination on page 2"
                />
              </div>
            </div>
          </div>

          {cachedMarkdown && (
            <div className="bg-green-900 border border-green-600 p-2 rounded text-green-100 text-xs">
              ✓ Page crawled ({(crawlLatencyMs! / 1000).toFixed(1)}s) — testing extractions on cached data
            </div>
          )}

          {batchTestInProgress && (
            <div className="bg-blue-900 border border-blue-600 p-3 rounded text-blue-100 text-xs">
              <div className="font-medium mb-1">Batch Testing in Progress</div>
              <div>{batchTestStatus}</div>
            </div>
          )}

          <div className="grid grid-cols-6 gap-2">
            <button
              onClick={crawlPage}
              disabled={crawlInProgress || !formCareersPageUrl}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 rounded text-white font-medium text-xs"
              title="Crawl page once, then test all strategies on cached data"
            >
              {crawlInProgress ? "Crawling..." : "Crawl Page"}
            </button>
            <button
              onClick={queryStrategy1}
              disabled={loadingQuery1 || !formCareersPageUrl}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-white font-medium text-xs"
            >
              {loadingQuery1 ? "..." : "Domain"}
            </button>
            <button
              onClick={queryStrategy2}
              disabled={loadingQuery2 || !formCareersPageUrl}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded text-white font-medium text-xs"
            >
              {loadingQuery2 ? "..." : "Heuristic"}
            </button>
            <button
              onClick={queryStrategy3}
              disabled={loadingQuery3 || !formCareersPageUrl}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded text-white font-medium text-xs"
            >
              {loadingQuery3 ? "..." : "LLM"}
            </button>
            <button
              onClick={queryHybrid}
              disabled={loadingQuery3 || !formCareersPageUrl}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 rounded text-white font-medium text-xs"
            >
              {loadingQuery3 ? "..." : "Hybrid"}
            </button>
            <button
              onClick={queryAllStrategies}
              disabled={loadingQuery1 || loadingQuery2 || loadingQuery3 || !formCareersPageUrl}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 rounded text-white font-medium text-xs"
            >
              {loadingQuery1 || loadingQuery2 || loadingQuery3 ? "..." : "Test All 4"}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2 mt-2">
            <button
              onClick={testAllCompanies}
              disabled={batchTestInProgress || state.companies.length === 0}
              className="px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded text-white font-medium text-sm"
              title="Test all companies with all 4 strategies (crawl + domain + heuristic + llm + hybrid)"
            >
              {batchTestInProgress ? `Testing... (${batchTestStatus})` : `Test All ${state.companies.length} Companies`}
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
