import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Search, ShieldAlert, Sparkles, Filter, Check, Save,
  AlertTriangle, MessageSquare, Send, BookOpen, Clock, Users,
  CheckCircle2, RefreshCw, Layers, ExternalLink, Mail, Phone, Calendar,
  Edit2, Plus, Info, MessageCircle, AlertCircle, Trash2, Download, Copy, Printer, Eye
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, 
  PieChart, Pie, Cell, Legend 
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { Case, CaseStatus, AIAnalysis, LegalGround, InvolvedParty, TimelineEntry, ChatMessage, Attachment } from '../types';

interface AdminDashboardProps {
  adminPassword?: string;
}

export default function AdminDashboard({ adminPassword = '2003' }: AdminDashboardProps) {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [previewFile, setPreviewFile] = useState<Attachment | null>(null);
  
  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [riskFilter, setRiskFilter] = useState<string>('todos');
  const [typeFilter, setTypeFilter] = useState<string>('todos');

  // Case details edit state
  const [editStatus, setEditStatus] = useState<CaseStatus>('Recibido');
  const [editLawyerNotes, setEditLawyerNotes] = useState('');
  const [editStrategy, setEditStrategy] = useState('');
  const [editResponseDraft, setEditResponseDraft] = useState('');
  const [isSavingCase, setIsSavingCase] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [caseToDelete, setCaseToDelete] = useState<Case | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Supreme Admin Role & Access System
  const [adminRole, setAdminRole] = useState<'lawyer' | 'supreme'>('lawyer');
  const [supremePassword, setSupremePassword] = useState('');
  const [isSupremeAuthenticated, setIsSupremeAuthenticated] = useState(false);
  const [showSupremeLoginModal, setShowSupremeLoginModal] = useState(false);
  const [supremeTab, setSupremeTab] = useState<'activos' | 'eliminados'>('activos');

  // Admin supplementary uploads state
  const [adminExtraAttachments, setAdminExtraAttachments] = useState<Attachment[]>([]);
  const [isAdminUploadingExtra, setIsAdminUploadingExtra] = useState(false);
  const [adminExtraDragActive, setAdminExtraDragActive] = useState(false);
  const adminExtraFileInputRef = useRef<HTMLInputElement>(null);

  // New clarification state
  const [newClarificationQuestion, setNewClarificationQuestion] = useState('');
  const [isAddingClarification, setIsAddingClarification] = useState(false);

  // AI assistant chat state
  const [chatMessage, setChatMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const processAdminExtraFiles = (files: FileList) => {
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const content = event.target.result as string;
          const newAttachment: Attachment = {
            name: file.name,
            size: `${(file.size / 1024).toFixed(1)} KB`,
            type: file.type,
            content: content
          };
          setAdminExtraAttachments(prev => [...prev, newAttachment]);
        }
      };
      if (file.type.startsWith('image/') || file.type === 'application/pdf') {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  };

  const handleAdminUploadExtraAttachments = async () => {
    if (adminExtraAttachments.length === 0 || !selectedCase) return;
    setIsAdminUploadingExtra(true);
    try {
      const response = await fetch(`/api/cases/${selectedCase.folio}/attachments`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-password': adminPassword
        },
        body: JSON.stringify({ attachments: adminExtraAttachments })
      });
      if (!response.ok) throw new Error('Error al subir los archivos adicionales.');
      const updatedCase: Case = await response.json();
      setSelectedCase(updatedCase);
      setCases(prev => prev.map(c => c.folio === updatedCase.folio ? updatedCase : c));
      setAdminExtraAttachments([]);
      alert('¡Archivos adicionales guardados con éxito en el expediente!');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error al subir los archivos.');
    } finally {
      setIsAdminUploadingExtra(false);
    }
  };

  const handleRestoreCase = async (folio: string) => {
    setIsSavingCase(true);
    try {
      const res = await fetch(`/api/cases/${folio}/restore`, {
        method: 'POST',
        headers: {
          'x-admin-password': adminPassword
        }
      });
      if (res.ok) {
        const updated = await res.json();
        alert(`Expediente ${folio} restaurado con éxito.`);
        await fetchCases();
        setSelectedCase(updated);
      } else {
        const errData = await res.json();
        alert(`Error al restaurar: ${errData.error || 'Intente de nuevo.'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión.');
    } finally {
      setIsSavingCase(false);
    }
  };

  // Detail view active tab
  const [detailTab, setDetailTab] = useState<'summary' | 'analysis' | 'strategy' | 'clarification' | 'ai-chat'>('summary');

  // Supabase Diagnostics state
  const [supabaseStatus, setSupabaseStatus] = useState<{
    configured: boolean;
    sbUrl: string | null;
    hasServiceRoleKey: boolean;
    hasAnonKey: boolean;
    lastError: string | null;
    requiredSql: string;
  } | null>(null);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    fetchCases();
    fetchSupabaseDiagnostics();
  }, []);

  const fetchSupabaseDiagnostics = async () => {
    try {
      const res = await fetch('/api/supabase-diagnostics', {
        headers: {
          'x-admin-password': adminPassword
        }
      });
      if (res.ok) {
        const data = await res.json();
        setSupabaseStatus(data);
      }
    } catch (err) {
      console.error('Error fetching Supabase diagnostics:', err);
    }
  };

  useEffect(() => {
    if (selectedCase) {
      setEditStatus(selectedCase.status);
      setEditLawyerNotes(selectedCase.lawyerNotes || '');
      setEditStrategy(selectedCase.customStrategy || selectedCase.aiAnalysis?.suggestedStrategy || '');
      setEditResponseDraft(selectedCase.customResponseDraft || selectedCase.aiAnalysis?.suggestedResponseDraft || '');
      setChatHistory(selectedCase.chatHistory || []);
    }
  }, [selectedCase]);

  useEffect(() => {
    if (detailTab === 'ai-chat' && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, detailTab]);

  const fetchCases = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/cases', {
        headers: {
          'x-admin-password': adminPassword
        }
      });
      if (res.ok) {
        const data = await res.json();
        setCases(data);
        if (data.length > 0 && !selectedCase) {
          setSelectedCase(data[0]);
        }
      }
      await fetchSupabaseDiagnostics();
    } catch (err) {
      console.error('Error fetching cases:', err);
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  };

  const handleSaveCaseEdits = async () => {
    if (!selectedCase) return;
    setIsSavingCase(true);
    try {
      const res = await fetch(`/api/cases/${selectedCase.folio}/update`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-password': adminPassword
        },
        body: JSON.stringify({
          status: editStatus,
          lawyerNotes: editLawyerNotes,
          customStrategy: editStrategy,
          customResponseDraft: editResponseDraft
        })
      });

      if (res.ok) {
        const updated = await res.json();
        setSelectedCase(updated);
        // Refresh local cases array
        setCases(prev => prev.map(c => c.folio === updated.folio ? updated : c));
        alert('Cambios guardados con éxito en el expediente.');
      }
    } catch (err) {
      console.error(err);
      alert('Error al guardar los cambios.');
    } finally {
      setIsSavingCase(false);
    }
  };

  const handleDeleteCase = async (folio: string, isHardDelete: boolean = false) => {
    const confirmMessage = isHardDelete 
      ? `🚨 ATENCIÓN SUPREMO: ¿Estás seguro de que deseas eliminar PERMANENTEMENTE el expediente ${folio}? Esta acción es irreversible, se eliminará del servidor físico, de la base de datos de Supabase y de toda persistencia.`
      : `¿Estás seguro de que deseas mover el expediente ${folio} a la papelera? El caso se ocultará para el abogado en turno y podrá ser auditado o restaurado por el Administrador Supremo.`;

    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    setIsDeleting(true);
    try {
      const url = isHardDelete ? `/api/cases/${folio}?hard=true` : `/api/cases/${folio}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: {
          'x-admin-password': adminPassword
        }
      });
      
      if (res.ok) {
        alert(isHardDelete ? `Expediente ${folio} eliminado permanentemente.` : `Expediente ${folio} movido a la papelera con éxito.`);
        
        // Refresh local cases
        await fetchCases();
        
        // Clear or update selectedCase
        setSelectedCase(null);
      } else {
        const errData = await res.json();
        alert(`Error al eliminar expediente: ${errData.error || 'Intente de nuevo.'}`);
      }
    } catch (err: any) {
      console.error('Error deleting case:', err);
      alert('Error al conectar con el servidor para eliminar el expediente.');
    } finally {
      setIsDeleting(false);
    }
  };

  const getFormattedAnalysisText = (c: Case) => {
    if (!c || !c.aiAnalysis) return '';
    const ai = c.aiAnalysis;
    
    return `======================================================================
CHARLITRON DESPACHO INTELIGENTE • EXPEDIENTE JURÍDICO DIGITAL
======================================================================
FOLIO: ${c.folio}
CLIENTE: ${c.clientName}
CORREO: ${c.clientEmail}
TELÉFONO: ${c.clientPhone || 'No especificado'}
FECHA RECEPCIÓN: ${new Date(c.createdAt).toLocaleString('es-MX')}
MATERIA JURÍDICA: ${ai.conflictType || 'Por determinar'}
NIVEL DE RIESGO: ${ai.riskLevel || 'Medio'}
ESTATUS ACTUAL: ${c.status}
----------------------------------------------------------------------

1. RELATO ORIGINAL DE LOS HECHOS:
${c.description}

${c.pastedEvidence ? `\nEVIDENCIA DE MENSAJERÍA PEGADA:\n${c.pastedEvidence}\n` : ''}

----------------------------------------------------------------------
2. RESUMEN EJECUTIVO DE LOS HECHOS (IA):
${ai.summary || 'No disponible'}

----------------------------------------------------------------------
3. PARTES INVOLUCRADAS Y ROLES DETECTADOS:
${ai.parties?.map((p: any) => `- ${p.name} (${p.role}): ${p.details || 'Relevancia directa en el caso.'}`).join('\n') || 'Ninguna'}

----------------------------------------------------------------------
4. LÍNEA DE TIEMPO / CRONOLOGÍA DETECTADA:
${ai.timeline?.map((t: any) => `[${t.date}] (${t.importance}) - ${t.event}${t.details ? `\n  Detalles: ${t.details}` : ''}`).join('\n\n') || 'Ninguna'}

----------------------------------------------------------------------
5. ANÁLISIS JURÍDICO TÉCNICO PRELIMINAR:
${ai.preliminaryAnalysisText || 'No disponible'}

EVALUACIÓN DE EVIDENCIA:
${ai.evidenceSummary || 'No disponible'}

----------------------------------------------------------------------
6. FUNDAMENTO LEGAL PROPUESTO (ARTÍCULOS Y LEYES):
${ai.suggestedArticles?.map((a: any) => `* Artículo/Precepto: ${a.article}\n  Ley/Código: ${a.law}\n  Contenido: ${a.description}\n  Relevancia en la defensa: ${a.relevance}`).join('\n\n') || 'Ninguno'}

----------------------------------------------------------------------
7. PREGUNTAS DE ACLARACIÓN RECOMENDADAS PARA EL CLIENTE:
${ai.clarificationQuestions?.map((q: string, idx: number) => `${idx + 1}. ${q}`).join('\n') || 'Ninguna'}

----------------------------------------------------------------------
8. PROPUESTA DE ESTRATEGIA PROCESAL:
${c.customStrategy || ai.suggestedStrategy || 'No disponible'}

----------------------------------------------------------------------
9. BORRADOR DE COMUNICACIÓN FORMAL (CARTA/WHATSAPP/CORREO):
${c.customResponseDraft || ai.suggestedResponseDraft || 'No disponible'}

======================================================================
REPORTE GENERADO AUTOMÁTICAMENTE PARA REVISIÓN DEL LIC. EDGAR.
======================================================================`;
  };

  const handleDownloadMarkdown = (c: Case) => {
    const text = getFormattedAnalysisText(c);
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Analisis_Legal_${c.folio}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportMenu(false);
  };

  const handleCopyAnalysis = (c: Case) => {
    const text = getFormattedAnalysisText(c);
    navigator.clipboard.writeText(text);
    alert(`Análisis del expediente ${c.folio} copiado al portapapeles.`);
    setShowExportMenu(false);
  };

  const handlePrintAnalysis = () => {
    window.print();
    setShowExportMenu(false);
  };

  const handleAddClarification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase || !newClarificationQuestion.trim()) return;

    setIsAddingClarification(true);
    try {
      const res = await fetch(`/api/cases/${selectedCase.folio}/clarification`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-password': adminPassword
        },
        body: JSON.stringify({
          question: newClarificationQuestion
        })
      });

      if (res.ok) {
        const updated = await res.json();
        setSelectedCase(updated);
        setCases(prev => prev.map(c => c.folio === updated.folio ? updated : c));
        setNewClarificationQuestion('');
        setEditStatus('Faltan Datos'); // Reflect local change
        alert('Pregunta de aclaración enviada al portal del cliente.');
      }
    } catch (err) {
      console.error(err);
      alert('Error al agregar la pregunta.');
    } finally {
      setIsAddingClarification(false);
    }
  };

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase || !chatMessage.trim() || chatLoading) return;

    const userMsgText = chatMessage.trim();
    setChatMessage('');
    setChatLoading(true);

    // Optimistically add user message
    const tempUserMsg: ChatMessage = {
      role: 'user',
      message: userMsgText,
      timestamp: new Date().toISOString()
    };
    setChatHistory(prev => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`/api/cases/${selectedCase.folio}/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-password': adminPassword
        },
        body: JSON.stringify({ message: userMsgText })
      });

      if (res.ok) {
        const data = await res.json();
        setChatHistory(data.chatHistory);
        // Update case history in cases array
        setCases(prev => prev.map(c => {
          if (c.folio === selectedCase.folio) {
            return { ...c, chatHistory: data.chatHistory };
          }
          return c;
        }));
      } else {
        throw new Error('No se pudo obtener respuesta.');
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        role: 'model',
        message: 'Disculpa Edgar, ha ocurrido un error al conectar con Gemini. Por favor verifica tu clave API en Settings.',
        timestamp: new Date().toISOString()
      };
      setChatHistory(prev => [...prev, errorMsg]);
    } finally {
      setChatLoading(false);
    }
  };

  // Filter cases logic
  const filteredCases = cases.filter(c => {
    // Role & soft delete filtering
    if (adminRole === 'lawyer') {
      // Regular lawyer only sees active cases
      if (c.isDeleted) return false;
    } else {
      // Supreme Admin sees cases depending on active supreme tab
      if (supremeTab === 'activos' && c.isDeleted) return false;
      if (supremeTab === 'eliminados' && !c.isDeleted) return false;
    }

    const matchesSearch = 
      c.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.folio.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'todos' || c.status === statusFilter;
    const matchesRisk = riskFilter === 'todos' || c.aiAnalysis?.riskLevel === riskFilter;
    const matchesType = typeFilter === 'todos' || c.aiAnalysis?.conflictType === typeFilter;

    return matchesSearch && matchesStatus && matchesRisk && matchesType;
  });

  // Calculate high-level KPIs based on non-deleted cases
  const activeCases = cases.filter(c => !c.isDeleted);
  const totalCount = activeCases.length;
  const newCount = activeCases.filter(c => c.status === 'Recibido').length;
  const pendingCount = activeCases.filter(c => c.status === 'Faltan Datos').length;
  const resolvedCount = activeCases.filter(c => c.status === 'Respondido' || c.status === 'Analizado').length;
  const deletedCount = cases.filter(c => c.isDeleted).length;

  // Chart Data preparation based on active cases
  const categoryDataMap: Record<string, number> = {};
  const riskDataMap: Record<string, number> = { 'Bajo': 0, 'Medio': 0, 'Alto': 0, 'Crítico': 0 };

  activeCases.forEach(c => {
    const type = c.aiAnalysis?.conflictType || 'Por clasificar';
    categoryDataMap[type] = (categoryDataMap[type] || 0) + 1;
    
    const risk = c.aiAnalysis?.riskLevel || 'Medio';
    riskDataMap[risk] = (riskDataMap[risk] || 0) + 1;
  });

  const chartCategoryData = Object.keys(categoryDataMap).map(key => ({
    name: key,
    value: categoryDataMap[key]
  }));

  const chartRiskData = Object.keys(riskDataMap).map(key => ({
    name: key,
    value: riskDataMap[key]
  }));

  // Recharts color palette
  const RISK_COLORS: Record<string, string> = {
    'Bajo': '#10b981',     // emerald
    'Medio': '#f59e0b',    // amber
    'Alto': '#ef4444',     // red
    'Crítico': '#7f1d1d'   // dark red
  };
  const COLOR_PALETTE = ['#4f46e5', '#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'];

  const getRiskBadgeColor = (risk: string) => {
    switch (risk) {
      case 'Bajo': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Medio': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Alto': return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Crítico': return 'bg-red-100 text-red-900 border-red-300 font-bold animate-pulse';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getStatusBadge = (status: CaseStatus) => {
    switch (status) {
      case 'Recibido':
        return <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-semibold rounded-md border border-blue-100">Nuevo</span>;
      case 'En Análisis':
        return <span className="px-2 py-0.5 bg-yellow-50 text-yellow-700 text-[10px] font-semibold rounded-md border border-yellow-100">En Análisis</span>;
      case 'En Proceso':
        return <span className="px-2 py-0.5 bg-sky-50 text-sky-700 text-[10px] font-semibold rounded-md border border-sky-100">En Proceso</span>;
      case 'Faltan Datos':
        return <span className="px-2 py-0.5 bg-rose-50 text-rose-700 text-[10px] font-semibold rounded-md border border-rose-100">Faltan Datos</span>;
      case 'Analizado':
        return <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-semibold rounded-md border border-emerald-100">Analizado</span>;
      case 'Respondido':
        return <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-semibold rounded-md border border-indigo-100">Respondido</span>;
      case 'Resuelto':
        return <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md border border-emerald-200">✓ Resuelto</span>;
      case 'Cancelado':
        return <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-semibold rounded-md border border-slate-200">Cancelado</span>;
    }
  };

  return (
    <div className="px-4 py-6 max-w-7xl mx-auto space-y-6">
      {/* Supreme Access Login Modal */}
      <AnimatePresence>
        {showSupremeLoginModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 rounded-2xl p-6 max-w-sm w-full shadow-xl text-left"
            >
              <div className="flex items-center gap-3 text-indigo-700 mb-4">
                <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">Acceso de Seguridad</h3>
                  <p className="text-[10px] text-slate-400 font-medium">Verificación requerida</p>
                </div>
              </div>
              
              <div className="space-y-3.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Contraseña de Control</label>
                  <input
                    type="password"
                    value={supremePassword}
                    onChange={e => setSupremePassword(e.target.value)}
                    placeholder="••••"
                    className="w-full text-xs p-2.5 border border-slate-200 rounded-xl outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-50 transition-all font-mono text-center tracking-widest text-slate-800"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        if (supremePassword.trim() === 'nadrian41990') {
                          setIsSupremeAuthenticated(true);
                          setAdminRole('supreme');
                          setShowSupremeLoginModal(false);
                          setSupremePassword('');
                        } else {
                          alert('Contraseña incorrecta.');
                        }
                      }
                    }}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setShowSupremeLoginModal(false);
                      setSupremePassword('');
                    }}
                    className="px-3 py-1.5 text-[11px] font-bold text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (supremePassword.trim() === 'nadrian41990') {
                        setIsSupremeAuthenticated(true);
                        setAdminRole('supreme');
                        setShowSupremeLoginModal(false);
                        setSupremePassword('');
                      } else {
                        alert('Contraseña incorrecta.');
                      }
                    }}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] rounded-lg transition-all cursor-pointer"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header and Role Selection */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold font-display text-slate-800 flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" /> Control y Seguimiento de Casos
          </h1>
          <p className="text-xs text-slate-400">
            {adminRole === 'lawyer' 
              ? 'Espacio de trabajo del Lic. Edgar (Abogado en Turno) — Gestión y análisis de expedientes activos.' 
              : 'Espacio de Control del Creador de la Plataforma (Administrador Supremo) — Acceso total a todos los casos y auditoría de eliminados.'}
          </p>
        </div>

        {/* Role Selector */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl self-start sm:self-center border border-slate-200">
          <button
            onClick={() => {
              setAdminRole('lawyer');
              setIsSupremeAuthenticated(false);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              adminRole === 'lawyer' 
                ? 'bg-white text-slate-800 shadow-3xs' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-slate-500" /> Abogado (Edgar)
          </button>
          <button
            onClick={() => {
              if (isSupremeAuthenticated) {
                setAdminRole('supreme');
              } else {
                setShowSupremeLoginModal(true);
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              adminRole === 'supreme' 
                ? 'bg-indigo-600 text-white shadow-3xs' 
                : 'text-slate-500 hover:text-indigo-600'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" /> Creador Supremo
          </button>
        </div>
      </div>

      {/* Dashboard Top KPIs Section */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center justify-between shadow-sm">
          <div className="text-left">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Asuntos Totales</p>
            <h3 className="text-2xl font-bold font-display text-slate-800 mt-1">{totalCount}</h3>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl text-slate-500 border border-slate-100">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center justify-between shadow-sm">
          <div className="text-left">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nuevos por revisar</p>
            <h3 className="text-2xl font-bold font-display text-blue-600 mt-1">{newCount}</h3>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center justify-between shadow-sm">
          <div className="text-left">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Esperando al Cliente</p>
            <h3 className="text-2xl font-bold font-display text-rose-600 mt-1">{pendingCount}</h3>
          </div>
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl border border-rose-100">
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>

        {adminRole === 'supreme' ? (
          <div className="bg-white border border-rose-200 p-4 rounded-2xl flex items-center justify-between shadow-sm">
            <div className="text-left">
              <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">Papelera de Abogados</p>
              <h3 className="text-2xl font-bold font-display text-rose-700 mt-1">{deletedCount}</h3>
            </div>
            <div className="p-3 bg-rose-50 text-rose-600 rounded-xl border border-rose-100">
              <Trash2 className="w-5 h-5" />
            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center justify-between shadow-sm">
            <div className="text-left">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Casos Resueltos</p>
              <h3 className="text-2xl font-bold font-display text-emerald-600 mt-1">{resolvedCount}</h3>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        )}
      </div>


      {/* Visual Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Category distribution */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3 text-left">Distribución por Materia de Derecho</h3>
          <div className="h-[180px]">
            {chartCategoryData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">Sin información de casos todavía.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartCategoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {chartCategoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLOR_PALETTE[index % COLOR_PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} asuntos`, 'Cantidad']} />
                  <Legend verticalAlign="bottom" height={36} iconSize={10} wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Risk breakdown */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3 text-left">Asuntos por Nivel de Riesgo IA</h3>
          <div className="h-[180px]">
            {cases.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">Sin información de casos todavía.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRiskData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} allowDecimals={false} />
                  <Tooltip formatter={(value) => [`${value} asuntos`, 'Cantidad']} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {chartRiskData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={RISK_COLORS[entry.name] || '#64748b'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Main split dashboard (Left List, Right Details Editor) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Side: Matters list */}
        <div className={`lg:col-span-5 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[650px] ${selectedCase ? 'hidden lg:flex' : 'flex'}`}>
          {/* Supreme Tabs */}
          {adminRole === 'supreme' && (
            <div className="flex border-b border-slate-200 text-xs bg-slate-50/50">
              <button
                onClick={() => {
                  setSupremeTab('activos');
                  const actives = cases.filter(c => !c.isDeleted);
                  if (actives.length > 0) {
                    setSelectedCase(actives[0]);
                  } else {
                    setSelectedCase(null);
                  }
                }}
                className={`flex-1 py-3 font-bold border-b-2 text-center transition-all cursor-pointer ${
                  supremeTab === 'activos' 
                    ? 'border-indigo-600 text-indigo-600 bg-white' 
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                Activos ({cases.filter(c => !c.isDeleted).length})
              </button>
              <button
                onClick={() => {
                  setSupremeTab('eliminados');
                  const deleteds = cases.filter(c => c.isDeleted);
                  if (deleteds.length > 0) {
                    setSelectedCase(deleteds[0]);
                  } else {
                    setSelectedCase(null);
                  }
                }}
                className={`flex-1 py-3 font-bold border-b-2 text-center transition-all cursor-pointer ${
                  supremeTab === 'eliminados' 
                    ? 'border-rose-600 text-rose-600 bg-white' 
                    : 'border-transparent text-slate-400 hover:text-rose-600'
                }`}
              >
                Papelera Abogados ({cases.filter(c => c.isDeleted).length})
              </button>
            </div>
          )}

          {/* List Toolbar / Search */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar por folio, cliente, hechos..."
                className="w-full text-xs pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-600 transition-all"
              />
            </div>
            
            {/* Direct quick filters */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              <select 
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="text-[10px] px-2 py-1 bg-white border border-slate-200 rounded-md outline-none text-slate-600 font-medium"
              >
                <option value="todos">Todos los Estatus</option>
                <option value="Recibido">Estatus: Nuevo</option>
                <option value="En Análisis">Estatus: En Análisis</option>
                <option value="Faltan Datos">Estatus: Faltan Datos</option>
                <option value="En Proceso">Estatus: En Proceso</option>
                <option value="Analizado">Estatus: Analizado</option>
                <option value="Respondido">Estatus: Respondido</option>
                <option value="Resuelto">Estatus: Resuelto</option>
                <option value="Cancelado">Estatus: Cancelado</option>
              </select>

              <select 
                value={riskFilter}
                onChange={e => setRiskFilter(e.target.value)}
                className="text-[10px] px-2 py-1 bg-white border border-slate-200 rounded-md outline-none text-slate-600 font-medium"
              >
                <option value="todos">Todos los Riesgos</option>
                <option value="Bajo">Riesgo: Bajo</option>
                <option value="Medio">Riesgo: Medio</option>
                <option value="Alto">Riesgo: Alto</option>
                <option value="Crítico">Riesgo: Crítico</option>
              </select>
            </div>
          </div>

          {/* List items scroll */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 text-left">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2 h-full">
                <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" /> Cargando bandeja de expedientes...
              </div>
            ) : filteredCases.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 h-full flex flex-col items-center justify-center gap-2">
                <Layers className="w-8 h-8 text-slate-300" /> No se encontraron expedientes con los filtros seleccionados.
              </div>
            ) : (
              filteredCases.map((item) => {
                const isSelected = selectedCase?.folio === item.folio;
                return (
                  <div
                    key={item.folio}
                    onClick={() => setSelectedCase(item)}
                    className={`p-3.5 cursor-pointer transition-all border-l-4 text-left relative ${
                      isSelected 
                        ? 'bg-indigo-50/50 border-l-indigo-600' 
                        : 'hover:bg-slate-50 border-l-transparent'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1.5">
                      <span className="font-mono font-bold text-xs text-slate-800">{item.folio}</span>
                      <span className="text-[10px] text-slate-400 font-medium">{new Date(item.createdAt).toLocaleDateString('es-MX')}</span>
                    </div>
                    <h4 className="text-xs font-bold text-slate-800 truncate">{item.clientName}</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">{item.description}</p>
                    
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] px-1.5 py-0.5 border rounded font-semibold ${getRiskBadgeColor(item.aiAnalysis?.riskLevel || 'Medio')}`}>
                          Riesgo: {item.aiAnalysis?.riskLevel || 'Medio'}
                        </span>
                        <span className="text-[9px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded font-medium border border-indigo-100">
                          {item.aiAnalysis?.conflictType || 'Por clasificar'}
                        </span>
                      </div>
                      {getStatusBadge(item.status)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Case detailed profile & editing */}
        <div className={`lg:col-span-7 bg-white border border-slate-200 rounded-2xl shadow-sm h-[650px] flex flex-col overflow-hidden ${selectedCase ? 'flex' : 'hidden lg:flex'}`}>
          {selectedCase ? (
            <>
              {/* Deleted Case Banner / Controls */}
              {selectedCase.isDeleted && (
                <div className="bg-rose-50 border-b border-rose-100 px-4 py-3 text-xs text-rose-800 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-left">
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                    <div>
                      <p className="font-bold text-rose-900">EXPEDIENTE EN LA PAPELERA</p>
                      <p className="text-[10px] text-rose-600">Este caso fue desactivado por un abogado del despacho.</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => handleRestoreCase(selectedCase.folio)}
                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded-md transition-all shadow-xs cursor-pointer flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> Restaurar
                    </button>
                    <button
                      onClick={() => handleDeleteCase(selectedCase.folio, true)}
                      className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] rounded-md transition-all shadow-xs cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Borrar Permanente
                    </button>
                  </div>
                </div>
              )}

              {/* Header Profile Info */}
              <div className="bg-slate-50 border-b border-slate-100 p-4 flex flex-col gap-3 text-left">
                {/* Mobile Back Button */}
                <button
                  onClick={() => setSelectedCase(null)}
                  className="lg:hidden flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-bold self-start cursor-pointer active:scale-95 transition-all bg-indigo-50 border border-indigo-100/50 px-3 py-1.5 rounded-xl"
                >
                  ← Regresar a la Lista
                </button>
                <div className="flex justify-between items-start w-full gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-indigo-700">{selectedCase.folio}</span>
                    <span className={`px-2 py-0.5 border text-[9px] font-bold rounded ${getRiskBadgeColor(selectedCase.aiAnalysis?.riskLevel || 'Medio')}`}>
                      RIESGO {selectedCase.aiAnalysis?.riskLevel?.toUpperCase() || 'MEDIO'}
                    </span>
                  </div>
                  <h2 className="text-sm font-bold text-slate-800 mt-1">{selectedCase.clientName}</h2>
                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500 mt-1">
                    <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-slate-400" /> {selectedCase.clientEmail}</span>
                    {selectedCase.clientPhone && <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-slate-400" /> {selectedCase.clientPhone}</span>}
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-slate-400" /> {new Date(selectedCase.createdAt).toLocaleString('es-MX')}</span>
                  </div>
                  
                  {/* Risks split division */}
                  <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-slate-200/50">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider self-center mr-1">Riesgos IA:</span>
                    <span className={`text-[9px] px-1.5 py-0.5 border rounded-md font-semibold ${getRiskBadgeColor(selectedCase.aiAnalysis?.detailedRisks?.juridico || selectedCase.aiAnalysis?.riskLevel || 'Medio')}`} title="Solidez del derecho de fondo">
                      Jurídico: {selectedCase.aiAnalysis?.detailedRisks?.juridico || selectedCase.aiAnalysis?.riskLevel || 'Medio'}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 border rounded-md font-semibold ${getRiskBadgeColor(selectedCase.aiAnalysis?.detailedRisks?.probatorio || selectedCase.aiAnalysis?.riskLevel || 'Medio')}`} title="Calidad e idoneidad de la evidencia">
                      Probatorio: {selectedCase.aiAnalysis?.detailedRisks?.probatorio || selectedCase.aiAnalysis?.riskLevel || 'Medio'}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 border rounded-md font-semibold ${getRiskBadgeColor(selectedCase.aiAnalysis?.detailedRisks?.conflictivo || selectedCase.aiAnalysis?.riskLevel || 'Medio')}`} title="Nivel de conflictividad y hostilidad">
                      Conflictivo: {selectedCase.aiAnalysis?.detailedRisks?.conflictivo || selectedCase.aiAnalysis?.riskLevel || 'Medio'}
                    </span>
                    {selectedCase.aiAnalysis?.detailedRisks?.justification && (
                      <span className="text-[9px] text-slate-400 italic self-center block ml-1 truncate max-w-xs" title={selectedCase.aiAnalysis.detailedRisks.justification}>
                        ({selectedCase.aiAnalysis.detailedRisks.justification})
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Save button & status selector */}
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <select
                    value={editStatus}
                    onChange={e => setEditStatus(e.target.value as CaseStatus)}
                    className="text-xs px-2.5 py-1 bg-white border border-slate-200 rounded-md font-semibold text-slate-700 outline-none focus:border-indigo-600"
                  >
                    <option value="Recibido">Estatus: Nuevo</option>
                    <option value="En Análisis">Estatus: En Análisis</option>
                    <option value="Faltan Datos">Estatus: Faltan Datos</option>
                    <option value="En Proceso">Estatus: En Proceso</option>
                    <option value="Analizado">Estatus: Analizado</option>
                    <option value="Respondido">Estatus: Respondido</option>
                    <option value="Resuelto">Estatus: Resuelto</option>
                    <option value="Cancelado">Estatus: Cancelado</option>
                  </select>
                  <div className="flex gap-1.5 relative">
                    <button
                      onClick={() => setCaseToDelete(selectedCase)}
                      disabled={isDeleting}
                      className="flex items-center gap-1 px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold rounded-md transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                      title="Eliminar este expediente de forma permanente"
                    >
                      {isDeleting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Eliminar
                    </button>
                    <button
                      onClick={handleSaveCaseEdits}
                      disabled={isSavingCase}
                      className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-md transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                    >
                      {isSavingCase ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Guardar Notas
                    </button>
                    
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowExportMenu(!showExportMenu)}
                        className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-bold rounded-md transition-all cursor-pointer shadow-xs"
                        title="Exportar reporte del expediente"
                      >
                        <Download className="w-3 h-3" /> Exportar...
                      </button>
                      
                      {showExportMenu && (
                        <>
                          <div 
                            className="fixed inset-0 z-10" 
                            onClick={() => setShowExportMenu(false)}
                          />
                          <div className="absolute right-0 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-20 text-left">
                            <button
                              type="button"
                              onClick={() => handleDownloadMarkdown(selectedCase)}
                              className="w-full text-left px-3 py-1.5 text-[11px] text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 font-medium transition-colors cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5 text-slate-400" /> Descargar Markdown (.md)
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyAnalysis(selectedCase)}
                              className="w-full text-left px-3 py-1.5 text-[11px] text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 font-medium transition-colors cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5 text-slate-400" /> Copiar al portapapeles
                            </button>
                            <button
                              type="button"
                              onClick={handlePrintAnalysis}
                              className="w-full text-left px-3 py-1.5 text-[11px] text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 font-medium transition-colors border-t border-slate-100 cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5 text-slate-400" /> Imprimir Expediente
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

              {/* Navigation Tabs in details panel */}
              <div className="flex border-b border-slate-100 bg-white px-4 py-1.5 overflow-x-auto gap-1">
                <button
                  onClick={() => setDetailTab('summary')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    detailTab === 'summary' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Hechos y Resumen
                </button>
                <button
                  onClick={() => setDetailTab('analysis')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    detailTab === 'analysis' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Análisis Técnico & Leyes
                </button>
                <button
                  onClick={() => setDetailTab('strategy')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    detailTab === 'strategy' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Estrategia Edgar
                </button>
                <button
                  onClick={() => setDetailTab('clarification')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    detailTab === 'clarification' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Aclaraciones ({selectedCase.clarificationRequests.length})
                </button>
                <button
                  onClick={() => setDetailTab('ai-chat')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    detailTab === 'ai-chat' ? 'bg-indigo-600 text-white shadow-sm' : 'text-indigo-600 hover:bg-indigo-50/50'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" /> Asistente IA
                </button>
              </div>

              {/* Tab Content Box */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 text-left">
                <AnimatePresence mode="wait">
                  {/* TAB 1: Facts, timeline and attachments */}
                  {detailTab === 'summary' && (
                    <motion.div
                      key="summary-tab"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-6"
                    >
                      {/* Confidence Score for Facts */}
                      {selectedCase.aiAnalysis?.confidenceScores?.summary && (
                        <div className="bg-emerald-50/50 border border-emerald-100 p-3 rounded-xl flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span className="font-semibold text-emerald-800">Grado de Confianza IA (Hechos):</span>
                          </div>
                          <span className="font-mono font-bold text-emerald-700 bg-white border border-emerald-100 px-2.5 py-0.5 rounded-full text-[10px] shrink-0">
                            {selectedCase.aiAnalysis.confidenceScores.summary}
                          </span>
                        </div>
                      )}

                      {/* Client Hechos block */}
                      <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Relato Original de los Hechos</h4>
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 leading-relaxed font-sans max-h-52 overflow-y-auto whitespace-pre-wrap">
                          {selectedCase.description}
                        </div>
                      </div>

                      {/* Copied WhatsApp evidence */}
                      {selectedCase.pastedEvidence && (
                        <div>
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Evidencia de Mensajería Pegada</h4>
                          <pre className="bg-slate-900 text-slate-200 rounded-xl p-4 text-[11px] font-mono leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                            {selectedCase.pastedEvidence}
                          </pre>
                        </div>
                      )}

                      {/* Attachments list */}
                      {selectedCase.attachments && selectedCase.attachments.length > 0 && (
                        <div>
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Archivos Adjuntos en Expediente</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {selectedCase.attachments.map((file, idx) => (
                              <div key={idx} className="flex items-center justify-between bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-xs">
                                <div className="flex items-center gap-2 truncate">
                                  <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                                  <div className="truncate">
                                    <p className="font-semibold text-slate-700 truncate">{file.name}</p>
                                    <p className="text-[10px] text-slate-400">{file.type}</p>
                                  </div>
                                </div>
                                {(file.url || file.content) && (
                                  <button 
                                    onClick={() => setPreviewFile(file)}
                                    className="p-1 hover:bg-slate-200 rounded text-indigo-600 flex items-center justify-center shrink-0 font-medium cursor-pointer"
                                    title="Visualizar archivo"
                                  >
                                    <span className="text-[10px] mr-1 text-indigo-600 print:hidden hidden sm:inline-block">Ver</span>
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Supplementary Admin/Lawyer File Upload Interface */}
                      <div className="border border-dashed border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
                        <div className="flex justify-between items-center">
                          <div className="text-left">
                            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                              <Plus className="w-4 h-4 text-indigo-600" /> Cargar Documentos y Pruebas Adicionales
                            </h4>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Permite al despacho agregar dictámenes, contratos, capturas o pruebas adicionales al caso.
                            </p>
                          </div>
                        </div>

                        {/* Drag and Drop Zone */}
                        <div 
                          onDragOver={(e) => {
                            e.preventDefault();
                            setAdminExtraDragActive(true);
                          }}
                          onDragLeave={() => setAdminExtraDragActive(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setAdminExtraDragActive(false);
                            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                              processAdminExtraFiles(e.dataTransfer.files);
                            }
                          }}
                          onClick={() => adminExtraFileInputRef.current?.click()}
                          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                            adminExtraDragActive 
                              ? 'border-indigo-500 bg-indigo-50/40' 
                              : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50'
                          }`}
                        >
                          <input 
                            ref={adminExtraFileInputRef}
                            type="file" 
                            multiple 
                            onChange={(e) => {
                              if (e.target.files && e.target.files.length > 0) {
                                processAdminExtraFiles(e.target.files);
                              }
                            }}
                            className="hidden" 
                          />
                          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                            <Plus className="w-5 h-5" />
                          </div>
                          <p className="text-xs font-bold text-slate-700">Arrastra archivos aquí o haz clic para examinar</p>
                          <p className="text-[10px] text-slate-400">Soporta PDFs, imágenes de evidencia, etc.</p>
                        </div>

                        {/* Pending Files Queue */}
                        {adminExtraAttachments.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-slate-200">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-left">Archivos por subir ({adminExtraAttachments.length})</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {adminExtraAttachments.map((file, idx) => (
                                <div key={idx} className="flex items-center justify-between bg-white border border-slate-200 p-2 rounded-lg text-xs">
                                  <div className="flex items-center gap-1.5 truncate">
                                    <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <div className="truncate text-left">
                                      <p className="font-semibold text-slate-700 truncate">{file.name}</p>
                                      <p className="text-[9px] text-slate-400">{file.size || 'Desconocido'}</p>
                                    </div>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAdminExtraAttachments(prev => prev.filter((_, i) => i !== idx));
                                    }}
                                    className="p-1 text-rose-500 hover:bg-rose-50 rounded transition-all cursor-pointer"
                                    title="Quitar archivo de la cola"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>

                            <button
                              onClick={handleAdminUploadExtraAttachments}
                              disabled={isAdminUploadingExtra}
                              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                            >
                              {isAdminUploadingExtra ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Guardando archivos...
                                </>
                              ) : (
                                <>
                                  <Check className="w-3.5 h-3.5" /> Confirmar y Guardar Archivos en Expediente
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Involved Parties with roles */}
                      {selectedCase.aiAnalysis?.parties && (
                        <div>
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Partes Involucradas (Detección IA)</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {selectedCase.aiAnalysis.parties.map((p, idx) => (
                              <div key={idx} className="border border-slate-100 rounded-xl p-3 bg-white shadow-sm text-left">
                                <div className="flex justify-between items-start gap-1">
                                  <h5 className="text-xs font-bold text-slate-800">{p.name}</h5>
                                  <span className="text-[9px] bg-slate-100 text-slate-600 font-semibold px-1.5 py-0.5 rounded-md shrink-0 uppercase tracking-wider">{p.role}</span>
                                </div>
                                {p.details && <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{p.details}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* TAB 2: Legal Analysis and foundations */}
                  {detailTab === 'analysis' && (
                    <motion.div
                      key="analysis-tab"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-6"
                    >
                      {/* Confidence Score for Technical Analysis */}
                      {selectedCase.aiAnalysis?.confidenceScores?.analysis && (
                        <div className="bg-emerald-50/50 border border-emerald-100 p-3 rounded-xl flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span className="font-semibold text-emerald-800">Grado de Confianza IA (Análisis Técnico):</span>
                          </div>
                          <span className="font-mono font-bold text-emerald-700 bg-white border border-emerald-100 px-2.5 py-0.5 rounded-full text-[10px] shrink-0">
                            {selectedCase.aiAnalysis.confidenceScores.analysis}
                          </span>
                        </div>
                      )}

                      {/* Timeline view */}
                      {selectedCase.aiAnalysis?.timeline && (
                        <div>
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Línea de Tiempo Parseada</h4>
                          <div className="relative pl-5 border-l-2 border-slate-100 space-y-4">
                            {selectedCase.aiAnalysis.timeline.map((item, idx) => (
                              <div key={idx} className="relative">
                                <span className={`absolute -left-[28px] top-1.5 w-2 h-2 rounded-full border-4 border-white outline-2 outline-slate-100 ${
                                  item.importance === 'Alta' ? 'bg-rose-500' : item.importance === 'Media' ? 'bg-amber-500' : 'bg-slate-400'
                                }`}></span>
                                <div className="text-xs">
                                  <span className="font-semibold text-slate-400 text-[10px] block font-mono">{item.date}</span>
                                  <h5 className="font-bold text-slate-800 mt-0.5">{item.event}</h5>
                                  {item.details && <p className="text-slate-500 mt-0.5 leading-relaxed">{item.details}</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Technical text from Gemini */}
                      {selectedCase.aiAnalysis?.preliminaryAnalysisText && (
                        <div>
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Análisis Técnico-Jurídico Preliminar</h4>
                          <div className="bg-indigo-50/30 border border-indigo-100/50 rounded-xl p-4 text-xs text-slate-700 leading-relaxed font-sans whitespace-pre-wrap">
                            {selectedCase.aiAnalysis.preliminaryAnalysisText}
                          </div>
                        </div>
                      )}

                      {/* Articles suggested */}
                      {selectedCase.aiAnalysis?.suggestedArticles && (
                        <div>
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Leyes y Artículos Sugeridos para Sustentar</h4>
                          <div className="space-y-3">
                            {selectedCase.aiAnalysis.suggestedArticles.map((art, idx) => (
                              <div key={idx} className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 border-b border-slate-100 pb-2 mb-2">
                                  <span className="font-display font-bold text-xs text-indigo-700">{art.article}</span>
                                  <span className="text-[10px] text-slate-500 font-semibold uppercase">{art.law}</span>
                                </div>
                                <p className="text-xs text-slate-700 italic leading-relaxed">"{art.description}"</p>
                                <p className="text-[11px] text-slate-500 mt-2 font-medium leading-relaxed bg-white border border-slate-100 p-2 rounded-lg">
                                  <span className="text-indigo-600 font-bold block mb-0.5">Aplicación en este caso:</span>
                                  {art.relevance}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* TAB 3: Strategy & custom draft editor */}
                  {detailTab === 'strategy' && (
                    <motion.div
                      key="strategy-tab"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-5"
                    >
                      {/* Confidence Score for Strategy */}
                      {selectedCase.aiAnalysis?.confidenceScores?.strategy && (
                        <div className="bg-emerald-50/50 border border-emerald-100 p-3 rounded-xl flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span className="font-semibold text-emerald-800">Grado de Confianza IA (Estrategia):</span>
                          </div>
                          <span className="font-mono font-bold text-emerald-700 bg-white border border-emerald-100 px-2.5 py-0.5 rounded-full text-[10px] shrink-0">
                            {selectedCase.aiAnalysis.confidenceScores.strategy}
                          </span>
                        </div>
                      )}

                      {/* Lawyer notes area */}
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Notas del Abogado (Uso Interno Edgar)</label>
                        <textarea
                          value={editLawyerNotes}
                          onChange={e => setEditLawyerNotes(e.target.value)}
                          placeholder="Agrega tus apuntes personales, recordatorios, o detalles adicionales del caso aquí..."
                          rows={3}
                          className="w-full text-xs p-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-600 transition-all font-sans leading-relaxed"
                        />
                      </div>

                      {/* Strategy editor */}
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Estrategia Procesal o Defensiva</label>
                          <span className="text-[10px] text-slate-400">Pre-rellenado con propuesta IA • Modificable</span>
                        </div>
                        <textarea
                          value={editStrategy}
                          onChange={e => setEditStrategy(e.target.value)}
                          rows={4}
                          className="w-full text-xs p-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-600 transition-all font-sans leading-relaxed"
                        />
                      </div>

                      {/* AI Response Drafts (Dual Option) */}
                      {(selectedCase.aiAnalysis?.suggestedResponseDraftInternal || selectedCase.aiAnalysis?.suggestedResponseDraftExternal) && (
                        <div className="space-y-3 pt-1">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Propuestas de Borradores IA</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {selectedCase.aiAnalysis?.suggestedResponseDraftInternal && (
                              <div className="border border-slate-200 rounded-xl bg-slate-50/60 p-3.5 flex flex-col justify-between">
                                <div>
                                  <div className="flex justify-between items-center mb-2">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-md">
                                      Borrador Interno (Uso Despacho)
                                    </span>
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(selectedCase.aiAnalysis?.suggestedResponseDraftInternal || '');
                                        alert("Borrador interno copiado al portapapeles.");
                                      }}
                                      className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition-colors"
                                      title="Copiar borrador interno"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  <p className="text-[11px] text-slate-600 leading-relaxed font-sans whitespace-pre-wrap max-h-32 overflow-y-auto border border-slate-150 rounded-md p-2 bg-white">
                                    {selectedCase.aiAnalysis.suggestedResponseDraftInternal}
                                  </p>
                                </div>
                                <button
                                  onClick={() => setEditResponseDraft(selectedCase.aiAnalysis?.suggestedResponseDraftInternal || '')}
                                  className="mt-2 text-left text-[10px] text-amber-700 hover:text-amber-800 font-bold flex items-center gap-1 transition-all cursor-pointer"
                                >
                                  Usar como base de respuesta ↓
                                </button>
                              </div>
                            )}

                            {selectedCase.aiAnalysis?.suggestedResponseDraftExternal && (
                              <div className="border border-slate-200 rounded-xl bg-slate-50/60 p-3.5 flex flex-col justify-between">
                                <div>
                                  <div className="flex justify-between items-center mb-2">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                                      Borrador Externo (Para Cliente)
                                    </span>
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(selectedCase.aiAnalysis?.suggestedResponseDraftExternal || '');
                                        alert("Borrador externo copiado al portapapeles.");
                                      }}
                                      className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition-colors"
                                      title="Copiar borrador externo"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  <p className="text-[11px] text-slate-600 leading-relaxed font-sans whitespace-pre-wrap max-h-32 overflow-y-auto border border-slate-150 rounded-md p-2 bg-white">
                                    {selectedCase.aiAnalysis.suggestedResponseDraftExternal}
                                  </p>
                                </div>
                                <button
                                  onClick={() => setEditResponseDraft(selectedCase.aiAnalysis?.suggestedResponseDraftExternal || '')}
                                  className="mt-2 text-left text-[10px] text-indigo-700 hover:text-indigo-800 font-bold flex items-center gap-1 transition-all cursor-pointer"
                                >
                                  Usar como base de respuesta ↓
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Response Draft editor */}
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Borrador de Comunicación / Oficio de Respuesta</label>
                          <span className="text-[10px] text-slate-400">Pre-rellenado con borrador IA • Visible por cliente al resolver</span>
                        </div>
                        <textarea
                          value={editResponseDraft}
                          onChange={e => setEditResponseDraft(e.target.value)}
                          rows={6}
                          className="w-full text-xs p-3.5 border border-slate-200 rounded-xl outline-none focus:border-indigo-600 transition-all font-mono leading-relaxed"
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* TAB 4: Clarifications flow (Double-sided) */}
                  {detailTab === 'clarification' && (
                    <motion.div
                      key="clarifications-tab"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-6"
                    >
                      {/* Form to ask new question */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                        <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1"><Plus className="w-4 h-4 text-indigo-600" /> Solicitar Nueva Aclaración al Cliente</h4>
                        <p className="text-[10px] text-slate-400 mb-3">
                          Esto enviará de inmediato la pregunta al portal de consulta del cliente bajo el folio de este caso. Su estatus cambiará a "Faltan Datos" para avisarle.
                        </p>
                        <form onSubmit={handleAddClarification} className="flex gap-2">
                          <input
                            type="text"
                            required
                            value={newClarificationQuestion}
                            onChange={e => setNewClarificationQuestion(e.target.value)}
                            placeholder="Ej. ¿En qué fecha exacta firmaste el contrato individual de trabajo?"
                            className="flex-1 text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-600"
                          />
                          <button
                            type="submit"
                            disabled={isAddingClarification || !newClarificationQuestion.trim()}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-all disabled:opacity-50 cursor-pointer shadow-sm shrink-0"
                          >
                            {isAddingClarification ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Enviar'}
                          </button>
                        </form>
                      </div>

                      {/* Current list of questions */}
                      <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Historial de Aclaraciones Solicitadas</h4>
                        {selectedCase.clarificationRequests.length === 0 ? (
                          <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl text-xs text-slate-400">
                            No se han solicitado aclaraciones en este caso.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {selectedCase.clarificationRequests.map((req, idx) => (
                              <div key={idx} className="border border-slate-200 rounded-xl p-3 bg-white text-xs space-y-2">
                                <div className="flex justify-between items-center text-[10px]">
                                  <span className="text-indigo-600 font-bold uppercase tracking-wider">Aclaración #{idx + 1}</span>
                                  <span className="text-slate-400">{new Date(req.askedAt).toLocaleDateString('es-MX')}</span>
                                </div>
                                <p className="font-semibold text-slate-800 leading-relaxed">P: {req.question}</p>
                                
                                {req.answer ? (
                                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-slate-700 leading-relaxed mt-2">
                                    <span className="font-bold text-emerald-800 block text-[9px] uppercase mb-1">Respuesta del cliente:</span>
                                    <p>{req.answer}</p>
                                    <span className="text-[9px] text-slate-400 mt-1 block">Recibido el: {new Date(req.answeredAt!).toLocaleString('es-MX')}</span>
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 font-semibold rounded text-[9px] border border-amber-200 mt-1">
                                    <Clock className="w-2.5 h-2.5" /> Esperando respuesta del cliente...
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* TAB 5: AI Chat box specific to this case context */}
                  {detailTab === 'ai-chat' && (
                    <motion.div
                      key="ai-chat-tab"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col h-[400px] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800"
                    >
                      {/* Chat header info */}
                      <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex justify-between items-center text-xs">
                        <div className="flex items-center gap-1.5 text-slate-300 font-bold">
                          <Sparkles className="w-4 h-4 text-indigo-400" /> Consultar Expediente con Gemini
                        </div>
                        <span className="text-[10px] text-slate-500">Haz consultas sobre leyes, fallos o contraargumentos</span>
                      </div>

                      {/* Messages screen */}
                      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-sans">
                        {chatHistory.length === 0 && (
                          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2 px-8 text-center text-xs leading-relaxed">
                            <MessageSquare className="w-8 h-8 text-slate-600 mb-1" />
                            <p className="font-semibold text-slate-400">Pregúntale a la IA sobre este caso</p>
                            <p className="text-[11px]">Puedes pedir cosas como: "Calcula la indemnización exacta", "Redacta el primer hecho de la demanda en formato legal de Nuevo León", o "¿Cuáles son nuestras debilidades en base a los hechos?"</p>
                          </div>
                        )}
                        {chatHistory.map((msg, idx) => (
                          <div 
                            key={idx} 
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div 
                              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                                msg.role === 'user' 
                                  ? 'bg-indigo-600 text-white rounded-br-none' 
                                  : 'bg-slate-800 text-slate-100 rounded-bl-none whitespace-pre-wrap'
                              }`}
                            >
                              {msg.message}
                            </div>
                          </div>
                        ))}
                        {chatLoading && (
                          <div className="flex justify-start">
                            <div className="bg-slate-800 text-slate-400 rounded-2xl rounded-bl-none px-3.5 py-2.5 text-xs flex items-center gap-1.5 font-medium">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Gemini está formulando el argumento legal...
                            </div>
                          </div>
                        )}
                        <div ref={chatBottomRef} />
                      </div>

                      {/* Input send bar */}
                      <form onSubmit={handleSendChatMessage} className="bg-slate-900 p-3 border-t border-slate-800 flex gap-2">
                        <input
                          type="text"
                          required
                          value={chatMessage}
                          onChange={e => setChatMessage(e.target.value)}
                          placeholder="Haz una consulta jurídica sobre este expediente..."
                          className="flex-1 text-xs px-3 py-2 bg-slate-950 border border-slate-800 text-slate-100 rounded-xl outline-none focus:border-indigo-600 transition-all placeholder:text-slate-600"
                        />
                        <button
                          type="submit"
                          disabled={chatLoading || !chatMessage.trim()}
                          className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all disabled:opacity-50 cursor-pointer shrink-0"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </form>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs gap-2 leading-relaxed">
              <FileText className="w-12 h-12 text-slate-200" />
              <p className="font-bold text-slate-500">No hay ningún expediente seleccionado</p>
              <p className="text-[10px]">Por favor, selecciona un asunto en el panel izquierdo para comenzar la validación jurídica.</p>
            </div>
          )}
        </div>
      </div>

      {/* Supabase SQL Config Modal */}
      {showSqlModal && supabaseStatus && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999]">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-left">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Guía de Configuración de Supabase</h3>
                  <p className="text-[10px] text-slate-500">Crea tu tabla de expedientes en un clic</p>
                </div>
              </div>
              <button 
                onClick={() => setShowSqlModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-600 leading-relaxed">
              <p>
                Para habilitar la sincronización en la nube, necesitas ejecutar un script SQL sencillo en el panel de control de Supabase. Esto creará la estructura exacta que requiere la inteligencia artificial.
              </p>
              
              <div className="space-y-2">
                <h4 className="font-bold text-slate-800">Pasos de instalación rápidos:</h4>
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>Ve a tu panel de <strong>Supabase</strong>.</li>
                  <li>En la barra lateral izquierda, haz clic en el <strong>SQL Editor</strong> (icono con la palabra <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">SQL</code>).</li>
                  <li>Haz clic en <strong>New Query</strong> (Nueva consulta vacía).</li>
                  <li>Copia el script SQL de abajo e insértalo en el editor.</li>
                  <li>Presiona el botón verde <strong>Run</strong> (Ejecutar) para procesar el comando.</li>
                  <li>Regresa a esta página y dale clic en "Refrescar" para sincronizar tus casos al instante.</li>
                </ol>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-800">Script SQL requerido:</span>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(supabaseStatus.requiredSql);
                        setSqlCopied(true);
                        setTimeout(() => setSqlCopied(false), 2000);
                      } catch (err) {
                        console.error('Error copying text:', err);
                      }
                    }}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-md transition-all flex items-center gap-1 cursor-pointer"
                  >
                    {sqlCopied ? <Check className="w-3 h-3" /> : null}
                    {sqlCopied ? '¡Copiado!' : 'Copiar SQL'}
                  </button>
                </div>
                <pre className="p-4 bg-slate-900 text-slate-100 rounded-xl font-mono text-[10px] overflow-x-auto whitespace-pre leading-normal border border-slate-800 select-all">
                  {supabaseStatus.requiredSql}
                </pre>
              </div>

              <div className="p-3 bg-amber-50 text-amber-800 rounded-xl border border-amber-200 text-[11px] flex gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Nota sobre Seguridad:</span> El script incluye una instrucción para desactivar Row Level Security (RLS) en la tabla <code className="bg-amber-100/50 px-1 rounded">cases</code>. Esto es ideal para que puedas prototipar y probar tu aplicación rápido. Si vas a producción, puedes habilitar RLS y configurar políticas de acceso por usuario.
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button
                onClick={() => setShowSqlModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs rounded-xl cursor-pointer"
              >
                Cerrar
              </button>
              <button
                onClick={async () => {
                  setShowSqlModal(false);
                  await fetchCases();
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refrescar Conexión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal (completamente seguro para iFrames) */}
      {caseToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999]">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full shadow-2xl flex flex-col overflow-hidden text-left font-sans">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-rose-50/50">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-rose-100 text-rose-700 rounded-lg">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Desactivar Expediente</h3>
                  <p className="text-[10px] text-slate-500">Mover caso a la papelera de control</p>
                </div>
              </div>
              <button 
                onClick={() => setCaseToDelete(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 space-y-4 text-xs text-slate-600 leading-relaxed">
              <p>
                ¿Estás seguro de que deseas desactivar el expediente <strong className="font-mono text-slate-900">{caseToDelete.folio}</strong> de <strong>{caseToDelete.clientName}</strong>?
              </p>
              <p className="text-indigo-900 font-medium flex gap-2 items-start bg-indigo-50 p-3.5 rounded-xl border border-indigo-100 leading-relaxed">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600" />
                <span>Este caso se ocultará de la lista activa del Abogado Edgar y pasará a la Papelera. Solo el Administrador Supremo (Creador) podrá visualizarlo, auditarlo, restaurarlo a la lista activa o depurarlo de forma irrevocable.</span>
              </p>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCaseToDelete(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs rounded-xl cursor-pointer"
                disabled={isDeleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsDeleting(true);
                  try {
                    const res = await fetch(`/api/cases/${caseToDelete.folio}`, {
                      method: 'DELETE'
                    });
                    
                    if (res.ok) {
                      alert(`Expediente ${caseToDelete.folio} desactivado correctamente.`);
                      await fetchCases();
                      setSelectedCase(null);
                      setCaseToDelete(null);
                    } else {
                      const errData = await res.json();
                      alert(`Error al eliminar el expediente: ${errData.error || 'Intente de nuevo.'}`);
                    }
                  } catch (err: any) {
                    console.error('Error deleting case:', err);
                    alert('Error al conectar con el servidor.');
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                disabled={isDeleting}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5"
              >
                {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Sí, Desactivar Caso
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      <AnimatePresence>
        {previewFile && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col text-left overflow-hidden"
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 truncate max-w-[250px] sm:max-w-md">{previewFile.name}</h3>
                    <p className="text-[10px] text-slate-400">{previewFile.size || ''} • {previewFile.type}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setPreviewFile(null)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-semibold cursor-pointer p-1"
                >
                  ✕
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto p-4 bg-slate-100 flex items-center justify-center min-h-[300px]">
                {previewFile.type.startsWith('image/') || previewFile.content.startsWith('data:image/') ? (
                  <img 
                    src={previewFile.content} 
                    alt={previewFile.name}
                    className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-sm"
                  />
                ) : previewFile.type === 'application/pdf' || previewFile.content.startsWith('data:application/pdf') ? (
                  <iframe 
                    src={previewFile.content} 
                    title={previewFile.name}
                    className="w-full h-[60vh] rounded-lg border border-slate-200 bg-white"
                  />
                ) : (
                  <div className="w-full h-full max-h-[60vh] overflow-auto bg-slate-900 rounded-xl p-4 border border-slate-800 text-left font-mono">
                    <pre className="text-xs text-emerald-400 whitespace-pre-wrap leading-relaxed select-all">
                      {previewFile.content}
                    </pre>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                <a 
                  href={previewFile.content} 
                  download={previewFile.name}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" /> Descargar Archivo
                </a>
                <button 
                  onClick={() => setPreviewFile(null)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs rounded-xl cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
