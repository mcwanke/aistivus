export type DocumentTypeValue = 'resume' | 'cover_letter'

export interface ApplicationDocument {
  id: number
  application_id: number
  type_id: number
  type_value: DocumentTypeValue
  file_path: string
  filename: string
  extension: '.typ' | '.pdf'
  file_exists: boolean
  is_final: number  // 0 | 1
  created_at: string
}

export interface DocumentUploadResult {
  id: number
  application_id: number
  type_value: DocumentTypeValue
  file_path: string
  filename: string
  is_final: number
  created_at: string
}

export interface CompileResult {
  success: boolean
  pdf_doc_id?: number
  filename?: string
  file_path?: string
  error?: string
  detail?: string
}

export interface FinalizeResult {
  success: boolean
  final_doc_id?: number
  filename?: string
  file_path?: string
}

export interface TypstTemplate {
  filename: string
  display_name: string
  category: 'resume' | 'cover_letter'
}

export interface TypstTemplateList {
  resume: TypstTemplate[]
  cover_letter: TypstTemplate[]
}

export interface DocumentsStorageInfo {
  application_docs_dir: string
  total_bytes: number
  total_mb: number
  file_count: number
  typst_available: boolean
  typst_binary: string
}

export interface RenameDocumentRequest {
  new_name: string  // base name only, no extension
}
