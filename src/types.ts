export type CaseStatus = 'Recibido' | 'En Análisis' | 'Faltan Datos' | 'En Proceso' | 'Analizado' | 'Respondido' | 'Resuelto' | 'Cancelado';

export interface Attachment {
  name: string;
  size?: string;
  type: string; // e.g. "application/pdf", "image/png", "text/plain"
  content?: string; // Base64 or plain text if txt (legacy inline storage)
  url?: string; // Public URL if stored in Supabase Storage
}

export interface StatusHistoryEntry {
  status: CaseStatus;
  changedAt: string;
}

export interface AttachmentLogEntry {
  uploadedAt: string;
  fileNames: string[];
  uploadedBy: 'client' | 'admin';
}

export interface TimelineEntry {
  date: string;
  event: string;
  importance: 'Alta' | 'Media' | 'Baja';
  details?: string;
}

export interface LegalGround {
  article: string;
  law: string; // e.g. "Código Civil", "Ley Federal del Trabajo"
  description: string;
  relevance: string;
}

export interface InvolvedParty {
  name: string;
  role: string; // e.g. "Actor / Afectado", "Demandado", "Testigo", "Tercero"
  details?: string;
}

export interface DetailedRisks {
  juridico: 'Bajo' | 'Medio' | 'Alto' | 'Crítico';
  probatorio: 'Bajo' | 'Medio' | 'Alto' | 'Crítico';
  conflictivo: 'Bajo' | 'Medio' | 'Alto' | 'Crítico';
  justification: string;
}

export interface ConfidenceScores {
  summary: string;     // e.g. "95% - Alta certidumbre"
  analysis: string;    // e.g. "80% - Basado en relato del cliente"
  strategy: string;    // e.g. "85% - Depende de validación de pruebas"
}

export interface AIAnalysis {
  summary: string;
  parties: InvolvedParty[];
  riskLevel: 'Bajo' | 'Medio' | 'Alto' | 'Crítico';
  detailedRisks?: DetailedRisks; // Divide el riesgo en tres categorías
  confidenceScores?: ConfidenceScores; // Nivel de confianza para cada bloque
  conflictType: string; // e.g. "Laboral", "Civil", "Mercantil", "Penal", "Familiar", "Administrativo"
  timeline: TimelineEntry[];
  evidenceSummary: string;
  preliminaryAnalysisText: string;
  suggestedArticles: LegalGround[];
  clarificationQuestions: string[];
  suggestedStrategy: string;
  suggestedResponseDraft: string; // Default or client-visible
  suggestedResponseDraftInternal?: string; // Borrador interno para el despacho
  suggestedResponseDraftExternal?: string; // Borrador externo sobrio
}

export interface ClarificationRequest {
  id: string;
  question: string;
  answer?: string;
  askedAt: string;
  answeredAt?: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  message: string;
  timestamp: string;
}

export interface Case {
  folio: string; // e.g. "EXP-2026-07-001"
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  description: string;
  pastedEvidence?: string;
  attachments: Attachment[];
  status: CaseStatus;
  createdAt: string;
  updatedAt?: string; // Last time the case was modified (status, notes, attachments, etc.)
  statusHistory?: StatusHistoryEntry[]; // Audit trail of status changes over time
  attachmentLog?: AttachmentLogEntry[]; // Audit trail of every batch of documents received, with timestamp
  
  // AI-generated analysis
  aiAnalysis?: AIAnalysis;

  // Lawyer (Edgar) updates
  lawyerNotes?: string;
  customStrategy?: string;
  customResponseDraft?: string;
  clarificationRequests: ClarificationRequest[];
  
  // Custom chat history with Gemini regarding this case
  chatHistory: ChatMessage[];

  // Private 4-to-5 digit access pin for client status checks
  accessPin?: string;
}
