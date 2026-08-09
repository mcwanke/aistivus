export interface JobListing {
  title: string;
  url: string;
}

export interface QueryCompanyResponse {
  success: boolean;
  jobs: JobListing[];
  error: string | null;
  extraction_method: string | null;
}

export interface ExtractedJob {
  title: string;
  description: string | null;
  salary_range: string | null;
  remote_status: "remote" | "hybrid" | "on-site" | "unknown";
}

export interface ExtractJobResponse {
  success: boolean;
  job: Partial<ExtractedJob>;
  error: string | null;
  extraction_method: string | null;
  confidence: "high" | "medium" | "low";
}

export interface POCState {
  company_name: string;
  company_url: string;
  careers_page_url: string;
  job_url: string;
  research_prompt: string;
}
