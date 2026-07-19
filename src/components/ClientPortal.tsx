import React, { useState, useRef, useEffect } from 'react';
import { 
  FileText, Upload, Copy, Check, Search, Calendar, AlertTriangle, 
  User, Mail, Phone, MessageSquare, Clipboard, Eye, EyeOff, ArrowRight,
  ShieldCheck, CheckCircle2, ChevronRight, RefreshCw, Sparkles, Printer, Download,
  Scale, ShieldAlert, BookOpen, ExternalLink, Lock, LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Case, CaseStatus, Attachment, ClarificationRequest } from '../types';

export default function ClientPortal() {
  const [activeTab, setActiveTab] = useState<'submit' | 'status'>('submit');
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings/hero-image')
      .then(res => res.json())
      .then(data => setHeroImageUrl(data.url || null))
      .catch(() => setHeroImageUrl(null));
  }, []);
  
  // Submit Form State
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientPin, setClientPin] = useState('');
  const [clientPinConfirm, setClientPinConfirm] = useState('');
  const [showClientPin, setShowClientPin] = useState(false);
  const [description, setDescription] = useState('');
  const [pastedEvidence, setPastedEvidence] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdCase, setCreatedCase] = useState<Case | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [previewFile, setPreviewFile] = useState<Attachment | null>(null);

  // Status Check State
  const [searchFolio, setSearchFolio] = useState('');
  const [searchPin, setSearchPin] = useState('');
  const [searchedCase, setSearchedCase] = useState<Case | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [submittingReplyId, setSubmittingReplyId] = useState<string | null>(null);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});

  // Additional attachments state (forgotten uploads)
  const [extraAttachments, setExtraAttachments] = useState<Attachment[]>([]);
  const [isUploadingExtra, setIsUploadingExtra] = useState(false);
  const [extraDragActive, setExtraDragActive] = useState(false);
  const extraFileInputRef = useRef<HTMLInputElement>(null);

  const [copied, setCopied] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processExtraFiles = (files: FileList) => {
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
          setExtraAttachments(prev => [...prev, newAttachment]);
        }
      };
      if (file.type.startsWith('image/') || file.type === 'application/pdf') {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  };

  const handleUploadExtraAttachments = async () => {
    if (extraAttachments.length === 0 || !searchedCase) return;
    setIsUploadingExtra(true);
    try {
      const response = await fetch(`/api/cases/${searchedCase.folio}/attachments`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-case-pin': searchPin.trim()
        },
        body: JSON.stringify({ attachments: extraAttachments })
      });
      if (!response.ok) throw new Error('Error al subir los archivos adicionales.');
      const updatedCase: Case = await response.json();
      setSearchedCase(updatedCase);
      setExtraAttachments([]);
      alert('¡Archivos adicionales agregados correctamente a tu expediente!');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error al subir los archivos.');
    } finally {
      setIsUploadingExtra(false);
    }
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const processFiles = (files: FileList) => {
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
          setAttachments(prev => [...prev, newAttachment]);
        }
      };
      // Read images or pdfs as base64 data url, txt as plain text
      if (file.type.startsWith('image/') || file.type === 'application/pdf') {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFiles(e.target.files);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const copyFolio = (folio: string) => {
    navigator.clipboard.writeText(folio);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName || !clientEmail || !description) return;
    if (clientPin.trim().length < 4) {
      alert('Tu contraseña de acceso debe tener al menos 4 caracteres.');
      return;
    }
    if (clientPin.trim() !== clientPinConfirm.trim()) {
      alert('Las contraseñas no coinciden. Verifícalas e intenta de nuevo.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName,
          clientEmail,
          clientPhone,
          description,
          pastedEvidence,
          attachments,
          clientPin: clientPin.trim()
        })
      });

      if (!response.ok) throw new Error('Error al registrar caso.');
      
      const data: Case = await response.json();
      setCreatedCase(data);
      
      // Clear form
      setClientName('');
      setClientEmail('');
      setClientPhone('');
      setClientPin('');
      setClientPinConfirm('');
      setDescription('');
      setPastedEvidence('');
      setAttachments([]);
    } catch (err) {
      console.error(err);
      alert('Hubo un error al procesar tu asunto. Por favor, reintenta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchFolio.trim() || !searchPin.trim()) return;

    setIsSearching(true);
    setSearchError('');
    try {
      const response = await fetch(`/api/cases/${searchFolio.trim()}?pin=${searchPin.trim()}`, {
        headers: {
          'x-case-pin': searchPin.trim()
        }
      });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('La Clave de Acceso (PIN) o Folio ingresado es incorrecto.');
        } else if (response.status === 404) {
          throw new Error('No se encontró ningún expediente con ese folio.');
        } else {
          throw new Error('Error al buscar el folio.');
        }
      }
      const data = await response.json();
      setSearchedCase(data);
    } catch (err: any) {
      setSearchError(err.message || 'Error de conexión.');
      setSearchedCase(null);
    } finally {
      setIsSearching(false);
    }
  };

  const handleLogout = () => {
    setSearchedCase(null);
    setSearchFolio('');
    setSearchPin('');
    setSearchError('');
  };

  const handleClarificationReply = async (reqId: string) => {
    const answer = replyTexts[reqId];
    if (!answer || !answer.trim() || !searchedCase) return;

    setSubmittingReplyId(reqId);
    try {
      const response = await fetch(`/api/cases/${searchedCase.folio}/clarification`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-case-pin': searchPin.trim()
        },
        body: JSON.stringify({
          reqId,
          answer
        })
      });

      if (!response.ok) throw new Error('Error al enviar respuesta.');
      
      const updatedCase = await response.json();
      setSearchedCase(updatedCase);
      setReplyTexts(prev => {
        const copy = { ...prev };
        delete copy[reqId];
        return copy;
      });
    } catch (err) {
      console.error(err);
      alert('Error al guardar la aclaración.');
    } finally {
      setSubmittingReplyId(null);
    }
  };

  const printAcuse = () => {
    window.print();
  };

  const getStatusBadge = (status: CaseStatus) => {
    switch (status) {
      case 'Recibido':
        return <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full border border-blue-200">Recibido</span>;
      case 'En Análisis':
        return <span className="px-3 py-1 bg-yellow-50 text-yellow-700 text-xs font-semibold rounded-full border border-yellow-200 flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> En Revisión</span>;
      case 'En Proceso':
        return <span className="px-3 py-1 bg-sky-50 text-sky-700 text-xs font-semibold rounded-full border border-sky-200 flex items-center gap-1">En Proceso</span>;
      case 'Faltan Datos':
        return <span className="px-3 py-1 bg-rose-50 text-rose-700 text-xs font-semibold rounded-full border border-rose-200">Requiere Información</span>;
      case 'Analizado':
        return <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200 flex items-center gap-1">Analizado - Listo</span>;
      case 'Respondido':
        return <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full border border-indigo-200">Respondido</span>;
      case 'Resuelto':
        return <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full border border-emerald-300">✓ Resuelto</span>;
      case 'Cancelado':
        return <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-full border border-slate-200">Cancelado</span>;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header and navigation tabs */}
      <div className="relative text-center mb-10 rounded-3xl overflow-hidden">
        {heroImageUrl && (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center opacity-[0.08]"
              style={{ backgroundImage: `url(${heroImageUrl})` }}
              aria-hidden="true"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-white/60 via-white/80 to-white" aria-hidden="true" />
          </>
        )}
        <div className="relative z-10 py-2">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-full text-xs font-semibold mb-3">
          <Scale className="w-3.5 h-3.5" /> Recepción Jurídica Digital
        </div>
        <h1 className="font-display text-3xl font-bold text-slate-900 tracking-tight">Despacho Inteligente</h1>
        <p className="text-slate-500 mt-2 text-sm max-w-xl mx-auto leading-relaxed">
          Presenta tu asunto de forma estructurada para su revisión documental y jurídica. La plataforma organiza la información, integra la evidencia y canaliza tu expediente para atención profesional.
        </p>

        {/* 4 Bloques Informativos de Confianza Jurídica */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8 text-left max-w-3xl mx-auto">
          <div className="bg-white border border-slate-200/80 p-4 rounded-xl shadow-sm hover:shadow-md transition-all flex gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 h-fit shrink-0 mt-0.5">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                ¿Qué es la plataforma?
              </h3>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Despacho Inteligente es una plataforma de recepción jurídica digital diseñada para concentrar información, documentos y evidencia relacionada con asuntos legales, a fin de facilitar su revisión y seguimiento profesional.
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 p-4 rounded-xl shadow-sm hover:shadow-md transition-all flex gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 h-fit shrink-0 mt-0.5">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                ¿Para qué sirve?
              </h3>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Sirve para registrar asuntos, aportar documentos, organizar hechos, adjuntar evidencia y generar un folio de control para su atención y evaluación.
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 p-4 rounded-xl shadow-sm hover:shadow-md transition-all flex gap-3">
            <div className="p-2 bg-rose-50 rounded-lg text-rose-600 h-fit shrink-0 mt-0.5">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                ¿Qué no es?
              </h3>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                El envío de información por este medio no constituye por sí mismo representación legal, asesoría definitiva ni aceptación automática del asunto.
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 p-4 rounded-xl shadow-sm hover:shadow-md transition-all flex gap-3">
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600 h-fit shrink-0 mt-0.5">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                ¿Cómo funciona?
              </h3>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Registras tu asunto, se genera un folio de recepción, la información se organiza digitalmente y el expediente queda disponible para revisión profesional; en su caso, se solicitarán datos adicionales o se dará seguimiento.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-center mt-8">
          <div className="bg-slate-100 p-1 rounded-xl flex gap-1 border border-slate-200">
            <button
              onClick={() => { setActiveTab('submit'); setCreatedCase(null); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'submit' 
                  ? 'bg-white text-slate-900 shadow-sm' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-4 h-4" /> Ingresar Nuevo Caso
            </button>
            <button
              onClick={() => setActiveTab('status')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'status' 
                  ? 'bg-white text-slate-900 shadow-sm' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Search className="w-4 h-4" /> Consultar Estatus de Folio
            </button>
          </div>
        </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'submit' ? (
          <motion.div
            key="submit-form"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
          >
            {createdCase ? (
              // Success Case Creation Receipt (Acuse)
              <div id="print-area" className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden p-6 md:p-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-6 mb-6 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 text-emerald-600">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold font-display text-slate-900">¡Caso Recibido Exitosamente!</h2>
                      <p className="text-xs text-slate-500">Se ha generado tu acuse formal de recibido.</p>
                    </div>
                  </div>
                  <div className="flex gap-2 print:hidden">
                    <button 
                      onClick={printAcuse}
                      className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 text-xs font-medium"
                    >
                      <Printer className="w-3.5 h-3.5" /> Imprimir Acuse
                    </button>
                    <button
                      onClick={() => setActiveTab('status')}
                      className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-xs font-medium"
                    >
                      Verificar Estatus <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Formal Receipt Design */}
                <div className="border-4 border-double border-slate-300 p-6 md:p-8 rounded-xl bg-slate-50/50 relative">
                  {/* Watermark/Seal effect */}
                  <div className="absolute right-6 top-6 opacity-5 print:opacity-10 pointer-events-none">
                    <ShieldCheck className="w-32 h-32 text-slate-900" />
                  </div>

                  {/* Corporate Header */}
                  <div className="text-center mb-8 border-b border-slate-200 pb-6">
                    <h3 className="font-display font-bold text-lg tracking-wider uppercase text-slate-800">ACUSE FORMAL DE RECEPCIÓN DIGITAL</h3>
                    <p className="text-slate-500 text-xs mt-1">DESPACHO JURÍDICO EDGAR & ASOCIADOS</p>
                    <p className="text-[10px] text-slate-400">Monterrey, N.L. • San Pedro Garza García • México</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 text-sm">
                    <div>
                      <p className="text-slate-400 text-xs font-semibold">FOLIO DE EXPEDIENTE</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono font-bold text-indigo-700 text-lg">{createdCase.folio}</span>
                        <button 
                          onClick={() => copyFolio(createdCase.folio)}
                          className="p-1 hover:bg-slate-200 rounded text-slate-500 print:hidden transition-colors"
                          title="Copiar folio"
                        >
                          {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="text-rose-600 text-xs font-bold flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5 text-rose-500 shrink-0" /> TU CONTRASEÑA DE ACCESO (PIN)
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono font-bold text-rose-700 text-lg tracking-widest">{createdCase.accessPin || 'N/A'}</span>
                        <span className="text-[10px] text-rose-500 font-medium print:hidden">(La que creaste • úsala junto al folio para consultar tu estatus)</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-slate-400 text-xs font-semibold">FECHA Y HORA DE PRESENTACIÓN</p>
                      <p className="font-semibold text-slate-700 mt-1">{new Date(createdCase.createdAt).toLocaleString('es-MX')}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-xs font-semibold">CLIENTE PRESENTANTE</p>
                      <p className="font-semibold text-slate-700 mt-1">{createdCase.clientName}</p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-slate-400 text-xs font-semibold">DATOS DE CONTACTO</p>
                      <p className="text-slate-600 mt-1">{createdCase.clientEmail} {createdCase.clientPhone && `• ${createdCase.clientPhone}`}</p>
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-6 mb-6">
                    <p className="text-slate-400 text-xs font-semibold mb-2">RESEÑA DEL ASUNTO RECIBIDO</p>
                    <div className="bg-white border border-slate-200 rounded-lg p-4 text-xs text-slate-700 leading-relaxed max-h-48 overflow-y-auto">
                      {createdCase.description}
                    </div>
                  </div>

                  {createdCase.attachments.length > 0 && (
                    <div className="mb-8">
                      <p className="text-slate-400 text-xs font-semibold mb-2">EVIDENCIA Y ARCHIVOS ANEXADOS</p>
                      <div className="flex flex-wrap gap-2">
                        {createdCase.attachments.map((file, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1 rounded-md text-[11px] text-slate-600 font-medium">
                            <FileText className="w-3 h-3 text-slate-400" />
                            <span>{file.name}</span>
                            <span className="text-[9px] text-slate-400">({file.size || 'N/A'})</span>
                            {(file.url || file.content) && (
                              <button 
                                onClick={() => setPreviewFile(file)}
                                className="text-indigo-600 hover:text-indigo-800 font-bold ml-1.5 flex items-center gap-0.5 cursor-pointer"
                                title="Ver archivo"
                              >
                                <Eye className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Legal footer */}
                  <div className="border-t border-slate-200 pt-6 flex flex-col md:flex-row justify-between items-center text-[11px] text-slate-400 gap-4">
                    <p className="text-center md:text-left">
                      Este documento certifica la correcta recepción y radicación electrónica del expediente jurídico preliminar. El proceso de revisión humana por parte del Lic. Edgar ha iniciado.
                    </p>
                    <div className="flex flex-col items-center">
                      <div className="w-32 border-b border-slate-300 h-8"></div>
                      <span className="mt-1 text-[9px]">Sello Digital de Validación</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex justify-center print:hidden">
                  <button
                    onClick={() => setCreatedCase(null)}
                    className="px-5 py-2 text-xs font-semibold border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600"
                  >
                    Ingresar otro asunto legal
                  </button>
                </div>
              </div>
            ) : (
              // Case Intake Form
              <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 md:p-8">
                {/* Aviso Importante Banner */}
                <div className="mb-6 bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 text-left">
                  <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-amber-600" /> Aviso Legal de Envío de Información
                  </h3>
                  <p className="text-[11px] text-amber-900/95 leading-relaxed font-medium">
                    Al enviar este formulario, la persona usuaria manifiesta que la información y documentación proporcionadas corresponden a hechos que declara bajo su responsabilidad, y autoriza su recepción, almacenamiento, organización, revisión y análisis preliminar para fines de valoración jurídica y seguimiento del asunto. El envío de documentos no genera por sí mismo una relación de representación legal, ni implica aceptación automática del caso.
                  </p>
                </div>

                <div className="border-b border-slate-100 pb-4 mb-6">
                  <h2 className="text-lg font-bold font-display text-slate-900">Formulario de Recepción Jurídica</h2>
                  <p className="text-xs text-slate-500">Ingresa tus datos y los detalles de tu problema legal de la forma más detallada posible.</p>
                </div>

                {/* Client Contact Info */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-slate-400" /> Nombre Completo *
                    </label>
                    <input 
                      type="text" 
                      required
                      value={clientName}
                      onChange={e => setClientName(e.target.value)}
                      placeholder="Ej. Sofía Ramírez Estrada"
                      className="w-full text-sm px-3.5 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-slate-400" /> Correo Electrónico *
                    </label>
                    <input 
                      type="email" 
                      required
                      value={clientEmail}
                      onChange={e => setClientEmail(e.target.value)}
                      placeholder="correo@ejemplo.com"
                      className="w-full text-sm px-3.5 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-slate-400" /> Teléfono de Contacto
                    </label>
                    <input 
                      type="tel" 
                      value={clientPhone}
                      onChange={e => setClientPhone(e.target.value)}
                      placeholder="Ej. 55 1234 5678"
                      className="w-full text-sm px-3.5 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Client-created private access password (PIN) */}
                <div className="mb-6 p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                  <h3 className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-indigo-500" /> Crea tu Contraseña de Acceso al Expediente *
                  </h3>
                  <p className="text-[10px] text-slate-500 mb-3">
                    Esta contraseña quedará ligada a tu número de folio. La usarás junto con tu folio para consultar el estatus de tu asunto, así que elige una que puedas recordar.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">Crear Contraseña *</label>
                      <div className="relative">
                        <input
                          type={showClientPin ? 'text' : 'password'}
                          required
                          minLength={4}
                          maxLength={20}
                          value={clientPin}
                          onChange={e => setClientPin(e.target.value)}
                          placeholder="Mínimo 4 caracteres"
                          className="w-full text-sm px-3.5 py-2 pr-10 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition-all font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowClientPin(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                          title={showClientPin ? 'Ocultar' : 'Mostrar'}
                        >
                          {showClientPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">Confirmar Contraseña *</label>
                      <input
                        type={showClientPin ? 'text' : 'password'}
                        required
                        minLength={4}
                        maxLength={20}
                        value={clientPinConfirm}
                        onChange={e => setClientPinConfirm(e.target.value)}
                        placeholder="Repite tu contraseña"
                        className="w-full text-sm px-3.5 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition-all font-mono"
                      />
                      {clientPinConfirm && clientPin !== clientPinConfirm && (
                        <p className="text-[10px] text-rose-500 font-semibold mt-1">Las contraseñas no coinciden.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Main Problem Description */}
                <div className="mb-6">
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5 text-slate-400" /> Relato Cronológico de los Hechos *
                  </label>
                  <textarea 
                    required
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={6}
                    placeholder="Describe minuciosamente qué ocurrió, quién está involucrado, cuándo sucedieron las cosas (fechas) y qué te exigen o qué pretendes reclamar..."
                    className="w-full text-sm p-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition-all"
                  ></textarea>
                </div>

                {/* Paste WhatsApp/Chats Evidence */}
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700 flex items-center gap-1">
                      <Clipboard className="w-3.5 h-3.5 text-slate-400" /> Copiar y Pegar Chats o Mensajes de WhatsApp
                    </label>
                    <span className="text-[10px] text-slate-400">(Opcional • Muy útil para amenazas/evidencias)</span>
                  </div>
                  <textarea 
                    value={pastedEvidence}
                    onChange={e => setPastedEvidence(e.target.value)}
                    rows={3}
                    placeholder="Pega aquí fragmentos de mensajes de chat o correos electrónicos relevantes..."
                    className="w-full text-xs p-3 bg-slate-50/50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition-all font-mono"
                  ></textarea>
                </div>

                {/* File Upload (Click and Drag and Drop!) */}
                <div className="mb-8">
                  <label className="block text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1">
                    <Upload className="w-3.5 h-3.5 text-slate-400" /> Documentos Adjuntos, PDFs o Capturas de Pantalla
                  </label>
                  
                  <div 
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center ${
                      dragActive 
                        ? 'border-indigo-600 bg-indigo-50/50 scale-[0.99]' 
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      multiple
                      onChange={handleFileChange}
                      className="hidden" 
                      accept="image/*,text/plain,application/pdf"
                    />
                    <Upload className={`w-8 h-8 mb-2 transition-transform ${dragActive ? 'text-indigo-600 -translate-y-1' : 'text-slate-400'}`} />
                    <p className="text-xs font-semibold text-slate-700">Arrastra tus archivos aquí o haz clic para subir</p>
                    <p className="text-[10px] text-slate-400 mt-1">Soporta PDFs, Documentos de texto (.txt) o Capturas de pantalla (.png, .jpg)</p>
                  </div>

                  {attachments.length > 0 && (
                    <div className="mt-4 border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                      <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1">Archivos cargados al expediente ({attachments.length}):</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {attachments.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-white border border-slate-200 p-2 rounded-lg text-xs">
                            <div className="flex items-center gap-2 truncate">
                              <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                              <div className="truncate text-left">
                                <p className="font-medium text-slate-700 truncate">{file.name}</p>
                                <p className="text-[10px] text-slate-400">{file.size}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); removeAttachment(idx); }}
                              className="text-slate-400 hover:text-rose-600 font-medium px-2 py-1 text-[11px]"
                            >
                              Eliminar
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Checkbox Obligatorio */}
                <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-xl text-left">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input 
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={e => setAcceptedTerms(e.target.checked)}
                      className="mt-1 w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                    />
                    <span className="text-[11px] text-slate-600 leading-relaxed select-none">
                      Declaro que la información proporcionada es veraz a mi leal saber y entender, autorizo la recepción y revisión de los documentos enviados, y acepto el Aviso Legal anterior, los{' '}
                      <button 
                        type="button" 
                        onClick={() => setShowTermsModal(true)} 
                        className="text-indigo-600 font-bold hover:underline cursor-pointer"
                      >
                        Términos y Condiciones
                      </button>{' '}
                      y el{' '}
                      <button 
                        type="button" 
                        onClick={() => setShowPrivacyModal(true)} 
                        className="text-indigo-600 font-bold hover:underline cursor-pointer"
                      >
                        Aviso de Privacidad
                      </button>{' '}
                      de la plataforma.
                    </span>
                  </label>
                </div>

                <div className="flex flex-col items-center gap-3">
                  <button
                    type="submit"
                    disabled={isSubmitting || !clientName || !clientEmail || !description || !acceptedTerms || clientPin.trim().length < 4 || clientPin.trim() !== clientPinConfirm.trim()}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Procesando y organizando expediente...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" /> Enviar Expediente y Generar Folio
                      </>
                    )}
                  </button>
                  <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                    El folio confirma recepción del caso; la aceptación del asunto y cualquier estrategia jurídica quedan sujetas a revisión posterior.
                  </p>
                </div>
              </form>
            )}
          </motion.div>
        ) : (
          // Case Status Consultation Portal
          <motion.div
            key="status-portal"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Search Box */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
              <form onSubmit={handleSearch} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-slate-400" /> Folio de Expediente *
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
                      <input 
                        type="text"
                        required
                        value={searchFolio}
                        onChange={e => setSearchFolio(e.target.value)}
                        placeholder="Ej. EXP-2026-07-001"
                        className="w-full text-xs pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition-all uppercase font-mono font-bold"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5 text-slate-400" /> Clave de Acceso Privada (PIN) *
                    </label>
                    <input 
                      type="password"
                      required
                      value={searchPin}
                      onChange={e => setSearchPin(e.target.value)}
                      placeholder="••••"
                      maxLength={12}
                      className="w-full text-xs px-3.5 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition-all font-mono tracking-widest text-center font-bold"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={isSearching || !searchFolio.trim() || !searchPin.trim()}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {isSearching ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Consultar Estatus'}
                  </button>
                </div>
              </form>
              {searchError && (
                <div className="mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-100 p-2.5 rounded-lg text-left flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{searchError}</span>
                </div>
              )}
            </div>

            {searchedCase && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
              >
                {/* Header Banner */}
                <div className="bg-slate-50 border-b border-slate-100 p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-left">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold font-mono tracking-wider">EXPEDIENTE DIGITAL</span>
                    <h2 className="font-mono font-bold text-lg text-slate-800 mt-0.5">{searchedCase.folio}</h2>
                    <p className="text-xs text-slate-500 mt-1">Presentado por: <span className="font-semibold text-slate-700">{searchedCase.clientName}</span></p>
                  </div>
                  <div className="flex flex-col sm:items-end items-start gap-3">
                    <div className="flex flex-col items-start sm:items-end gap-1 text-left sm:text-right">
                      <span className="text-[10px] text-slate-400 font-semibold">ESTATUS ACTUAL</span>
                      {getStatusBadge(searchedCase.status)}
                    </div>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-rose-600 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Cerrar sesión
                    </button>
                  </div>
                </div>

                <div className="p-6 md:p-8 space-y-8 text-left">
                  {/* Case Progress Progressbar */}
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-3">Progreso de la Revisión Legal:</p>
                    <div className="relative">
                      <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-slate-100">
                        <div 
                          className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all duration-500 ${
                            searchedCase.status === 'Recibido' ? 'w-1/6 bg-blue-500' :
                            searchedCase.status === 'En Análisis' ? 'w-2/6 bg-yellow-500' :
                            searchedCase.status === 'Faltan Datos' ? 'w-2/6 bg-rose-500' :
                            searchedCase.status === 'En Proceso' ? 'w-4/6 bg-sky-500' :
                            searchedCase.status === 'Analizado' ? 'w-5/6 bg-emerald-500' : 
                            searchedCase.status === 'Cancelado' ? 'w-full bg-slate-400' : 'w-full bg-indigo-600'
                          }`}
                        ></div>
                      </div>
                      {/* Desktop Horizontal Progress */}
                      <div className="hidden md:grid grid-cols-5 text-[9px] font-bold text-slate-400 gap-1 text-center">
                        <span className={searchedCase.status === 'Recibido' ? 'text-blue-600' : ''}>1. RECIBIDO</span>
                        <span className={searchedCase.status === 'En Análisis' ? 'text-yellow-600' : searchedCase.status === 'Faltan Datos' ? 'text-rose-600 font-bold' : ''}>2. ANÁLISIS</span>
                        <span className={searchedCase.status === 'En Proceso' ? 'text-sky-600 font-bold' : ''}>3. TRÁMITE / PROCESO</span>
                        <span className={searchedCase.status === 'Analizado' ? 'text-emerald-600' : ''}>4. VALIDACIÓN JURÍDICA</span>
                        <span className={searchedCase.status === 'Respondido' || searchedCase.status === 'Resuelto' ? 'text-indigo-600 font-extrabold' : ''}>5. RESPUESTA / FIN</span>
                      </div>

                      {/* Mobile Vertical/Compact Progress */}
                      <div className="md:hidden flex flex-col gap-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Estatus del Trámite:</p>
                        <div className="space-y-3 text-xs text-left">
                          <div className={`flex items-center gap-2.5 font-semibold ${searchedCase.status === 'Recibido' ? 'text-blue-600' : 'text-slate-500'}`}>
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${searchedCase.status === 'Recibido' ? 'bg-blue-500 ring-4 ring-blue-100' : 'bg-slate-300'}`} />
                            <span>1. Recibido</span>
                          </div>
                          <div className={`flex items-center gap-2.5 font-semibold ${searchedCase.status === 'En Análisis' ? 'text-yellow-600' : searchedCase.status === 'Faltan Datos' ? 'text-rose-600' : 'text-slate-500'}`}>
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${searchedCase.status === 'En Análisis' ? 'bg-yellow-500 ring-4 ring-yellow-100' : searchedCase.status === 'Faltan Datos' ? 'bg-rose-500 ring-4 ring-rose-100' : 'bg-slate-300'}`} />
                            <span>2. Análisis e IA {searchedCase.status === 'Faltan Datos' && ' (Faltan Datos)'}</span>
                          </div>
                          <div className={`flex items-center gap-2.5 font-semibold ${searchedCase.status === 'En Proceso' ? 'text-sky-600' : 'text-slate-500'}`}>
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${searchedCase.status === 'En Proceso' ? 'bg-sky-500 ring-4 ring-sky-100' : 'bg-slate-300'}`} />
                            <span>3. Trámite o Proceso</span>
                          </div>
                          <div className={`flex items-center gap-2.5 font-semibold ${searchedCase.status === 'Analizado' ? 'text-emerald-600' : 'text-slate-500'}`}>
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${searchedCase.status === 'Analizado' ? 'bg-emerald-500 ring-4 ring-emerald-100' : 'bg-slate-300'}`} />
                            <span>4. Validación Jurídica Humana</span>
                          </div>
                          <div className={`flex items-center gap-2.5 font-semibold ${['Respondido', 'Resuelto'].includes(searchedCase.status) ? 'text-indigo-600 font-bold' : 'text-slate-500'}`}>
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${['Respondido', 'Resuelto'].includes(searchedCase.status) ? 'bg-indigo-600 ring-4 ring-indigo-100' : 'bg-slate-300'}`} />
                            <span>5. Respuesta y Conclusión</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Submitted Facts & Attachments View */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Tu Narrativa o Relato de Hechos</h4>
                      <div className="bg-white border border-slate-150 rounded-lg p-3.5 text-xs text-slate-700 leading-relaxed font-sans max-h-40 overflow-y-auto whitespace-pre-wrap">
                        {searchedCase.description}
                      </div>
                    </div>

                    {searchedCase.attachments && searchedCase.attachments.length > 0 && (
                      <div className="border-t border-slate-100 pt-3">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tus Documentos y Evidencia Adjuntada</h4>
                        <div className="flex flex-wrap gap-2">
                          {searchedCase.attachments.map((file, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 shadow-3xs">
                              <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                              <span className="truncate max-w-[150px]">{file.name}</span>
                              <span className="text-[10px] text-slate-400">({file.size || 'N/A'})</span>
                              {(file.url || file.content) && (
                                <button 
                                  onClick={() => setPreviewFile(file)}
                                  className="text-indigo-600 hover:text-indigo-800 font-bold ml-1.5 flex items-center gap-0.5 whitespace-nowrap cursor-pointer"
                                  title="Ver archivo original"
                                >
                                  Ver <Eye className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Append Forgotten Evidence */}
                    <div className="border-t border-slate-150 pt-4 mt-2">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <Upload className="w-3.5 h-3.5 text-indigo-500" />
                        ¿Olvidaste subir algún documento o evidencia?
                      </h4>
                      <p className="text-[10px] text-slate-400 mb-2.5">
                        Puedes adjuntar imágenes, capturas de chats, contratos o archivos PDF para robustecer tu expediente.
                      </p>

                      <div 
                        onDragEnter={e => { e.preventDefault(); setExtraDragActive(true); }}
                        onDragOver={e => { e.preventDefault(); setExtraDragActive(true); }}
                        onDragLeave={e => { e.preventDefault(); setExtraDragActive(false); }}
                        onDrop={e => {
                          e.preventDefault();
                          setExtraDragActive(false);
                          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                            processExtraFiles(e.dataTransfer.files);
                          }
                        }}
                        onClick={() => extraFileInputRef.current?.click()}
                        className={`border border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                          extraDragActive ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/30'
                        }`}
                      >
                        <input 
                          type="file"
                          ref={extraFileInputRef}
                          multiple
                          onChange={e => {
                            if (e.target.files && e.target.files[0]) {
                              processExtraFiles(e.target.files);
                            }
                          }}
                          className="hidden"
                        />
                        <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                        <p className="text-[11px] font-semibold text-slate-600">
                          Arrastra archivos aquí o <span className="text-indigo-600 hover:underline">haz clic para explorar</span>
                        </p>
                        <p className="text-[9px] text-slate-400">PDF, Imágenes o Archivos de texto</p>
                      </div>

                      {/* File Queue */}
                      {extraAttachments.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Archivos por agregar:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {extraAttachments.map((file, idx) => (
                              <div key={idx} className="flex items-center gap-1 bg-indigo-50 border border-indigo-100 text-indigo-800 px-2 py-1 rounded-md text-[11px] font-medium">
                                <FileText className="w-3 h-3 text-indigo-500" />
                                <span className="max-w-[150px] truncate">{file.name}</span>
                                <button 
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExtraAttachments(prev => prev.filter((_, i) => i !== idx));
                                  }}
                                  className="text-indigo-400 hover:text-indigo-600 font-bold ml-1.5 cursor-pointer text-xs"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            disabled={isUploadingExtra}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUploadExtraAttachments();
                            }}
                            className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg shadow-2xs transition-all cursor-pointer"
                          >
                            {isUploadingExtra ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5" /> Guardar y Subir Archivos al Expediente
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Clarification Request box - DUAL SIDE COLLABORATION */}
                  {searchedCase.clarificationRequests.length > 0 && (
                    <div className="border border-indigo-100 rounded-xl overflow-hidden shadow-sm">
                      <div className="bg-indigo-50/50 border-b border-indigo-100 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-indigo-600" />
                          <h3 className="text-xs font-bold text-indigo-900 uppercase tracking-wider">Aclaraciones Solicitadas por el Lic. Edgar</h3>
                        </div>
                        <span className="bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded text-[10px]">
                          {searchedCase.clarificationRequests.filter(r => !r.answer).length} Pendientes
                        </span>
                      </div>
                      <div className="divide-y divide-indigo-50">
                        {searchedCase.clarificationRequests.map((req, idx) => (
                          <div key={idx} className="p-4 bg-white">
                            <p className="text-xs font-semibold text-slate-800 leading-relaxed">
                              {idx + 1}. {req.question}
                            </p>
                            
                            {req.answer ? (
                              <div className="mt-3 bg-slate-50 border border-slate-100 rounded-lg p-3 text-xs">
                                <span className="font-semibold text-slate-500 block uppercase text-[9px] mb-1">Tu respuesta enviada:</span>
                                <p className="text-slate-700 leading-relaxed">{req.answer}</p>
                                <span className="text-[9px] text-slate-400 mt-1 block">Respondido el: {new Date(req.answeredAt!).toLocaleString('es-MX')}</span>
                              </div>
                            ) : (
                              <div className="mt-3 space-y-2">
                                <textarea
                                  value={replyTexts[req.id] || ''}
                                  onChange={e => setReplyTexts(prev => ({ ...prev, [req.id]: e.target.value }))}
                                  placeholder="Escribe aquí tu respuesta detallada a esta duda..."
                                  rows={2}
                                  className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition-all resize-none"
                                />
                                <div className="flex justify-end">
                                  <button
                                    onClick={() => handleClarificationReply(req.id)}
                                    disabled={submittingReplyId === req.id || !replyTexts[req.id]?.trim()}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-md transition-all disabled:opacity-50 cursor-pointer"
                                  >
                                    {submittingReplyId === req.id ? (
                                      <RefreshCw className="w-3 h-3 animate-spin" />
                                    ) : 'Enviar Respuesta'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Summary and Response Draft if analyzed */}
                  {searchedCase.status === 'Respondido' && searchedCase.customResponseDraft && (
                    <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-5 space-y-3">
                      <div className="flex items-center gap-2 text-emerald-800">
                        <CheckCircle2 className="w-5 h-5" />
                        <h3 className="font-display font-semibold text-sm">Respuesta y Estrategia Validada por Edgar</h3>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        El Lic. Edgar ha preparado la siguiente respuesta formal para tu asunto legal. Puedes usarla como base:
                      </p>
                      <pre className="bg-white border border-emerald-100 rounded-lg p-4 text-xs font-sans text-slate-800 leading-relaxed overflow-x-auto whitespace-pre-wrap">
                        {searchedCase.customResponseDraft}
                      </pre>
                    </div>
                  )}

                  {/* Timeline section to show they have things under control */}
                  {searchedCase.aiAnalysis && searchedCase.aiAnalysis.timeline && (
                    <div>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Cronología Registrada</h3>
                      <div className="relative pl-6 border-l-2 border-slate-100 space-y-6">
                        {searchedCase.aiAnalysis.timeline.map((event, idx) => (
                          <div key={idx} className="relative">
                            {/* Dot */}
                            <span className="absolute -left-[31px] top-1.5 w-2 h-2 rounded-full bg-slate-400 border-4 border-white outline-2 outline-slate-100"></span>
                            <div>
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-semibold bg-slate-100 text-slate-600 uppercase mb-1">
                                {event.date}
                              </span>
                              <h4 className="text-xs font-bold text-slate-800">{event.event}</h4>
                              {event.details && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{event.details}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer con enlaces legales */}
      <div className="mt-10 pt-6 border-t border-slate-200 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-slate-500">
        <button
          type="button"
          onClick={() => setShowPrivacyModal(true)}
          className="font-semibold hover:text-indigo-600 hover:underline cursor-pointer"
        >
          Aviso de Privacidad
        </button>
        <span className="text-slate-300">•</span>
        <button
          type="button"
          onClick={() => setShowTermsModal(true)}
          className="font-semibold hover:text-indigo-600 hover:underline cursor-pointer"
        >
          Términos y Condiciones
        </button>
      </div>

      {/* Modal de Términos y Condiciones */}
      <AnimatePresence>
        {showTermsModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto"
            onClick={() => setShowTermsModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 md:p-8 text-left border border-slate-100"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-display font-bold text-base text-slate-900">Términos y Condiciones de Uso</h3>
                </div>
                <button 
                  onClick={() => setShowTermsModal(false)}
                  className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 font-bold text-xs cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
              
              <div className="space-y-4 text-xs text-slate-600 leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
                <p className="font-semibold text-slate-800">
                  Bienvenido a Despacho Inteligente. Lea atentamente los siguientes términos:
                </p>
                <div>
                  <h4 className="font-bold text-slate-800 mb-1">1. Recepción y Análisis Preliminar</h4>
                  <p>
                    La plataforma sirve únicamente para el registro formal, organización inicial de evidencias y un análisis documental preliminar. El folio otorgado es un acuse de recibo electrónico, no una aceptación o garantía de representación.
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 mb-1">2. No Creación de Relación Mandataria</h4>
                  <p>
                    El envío de información mediante este portal no constituye de manera directa asesoría jurídica definitiva, representación legal activa ni crea una relación formal abogado-cliente por el mero llenado de los campos o la subida de evidencia.
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 mb-1">3. Autorización de Procesamiento de Datos</h4>
                  <p>
                    Usted otorga su consentimiento expreso para que el sistema procese la narrativa de los hechos, transcripciones, audios, fotos, archivos adjuntos de mensajería (como capturas de chats de WhatsApp) o documentos PDF a fin de estructurar el expediente digital.
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 mb-1">4. Veracidad de la Información</h4>
                  <p>
                    El usuario se compromete a ingresar información verídica y a su leal saber y entender. Queda prohibido subir información o documentación manipulada, falsa o perteneciente a terceros sin su consentimiento expreso conforme lo exija la ley.
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 mb-1">5. Revisión y Validación Humana Exigida</h4>
                  <p>
                    Todo análisis o sugerencia automatizada proporcionado por la herramienta es preliminar y está sujeto a corrección, validación, ampliación y re-evaluación por parte del responsable jurídico de manera presencial o directa.
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 mb-1">6. Límites de Responsabilidad</h4>
                  <p>
                    La plataforma declina cualquier responsabilidad por decisiones jurídicas unilaterales que el usuario o cliente tome antes de recibir una confirmación firmada u oficio de estrategia oficial validado por nuestro equipo de manera formal.
                  </p>
                </div>
              </div>
              
              <div className="border-t border-slate-100 pt-4 mt-6 flex justify-end">
                <button 
                  onClick={() => setShowTermsModal(false)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg transition-all cursor-pointer shadow-sm"
                >
                  Entendido y Aceptar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Aviso de Privacidad */}
      <AnimatePresence>
        {showPrivacyModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto"
            onClick={() => setShowPrivacyModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 md:p-8 text-left border border-slate-100"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-display font-bold text-base text-slate-900">Aviso de Privacidad</h3>
                </div>
                <button 
                  onClick={() => setShowPrivacyModal(false)}
                  className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 font-bold text-xs cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
              
              <div className="space-y-4 text-xs text-slate-600 leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
                <p className="font-semibold text-slate-800">
                  En Despacho Inteligente, su confianza es nuestro principal pilar. Lea sobre el tratamiento de sus datos personales y sensibles:
                </p>
                <div>
                  <h4 className="font-bold text-slate-800 mb-1">1. Responsable del Tratamiento</h4>
                  <p>
                    La plataforma Despacho Inteligente actúa como receptora e integradora de su expediente jurídico preliminar. Garantizamos el resguardo seguro y confidencial de la información con el mayor rigor ético.
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 mb-1">2. Datos Recopilados</h4>
                  <p>
                    Al utilizar el formulario, recopilamos su Nombre Completo, Correo Electrónico, Teléfono, narrativas de hechos, evidencias escritas de mensajería electrónica (WhatsApp o similar), así como imágenes de capturas de pantalla, fotos y archivos PDF adjuntados por usted de forma voluntaria.
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 mb-1">3. Finalidades Primarias</h4>
                  <p>
                    La recolección tiene por único fin estructurar su expediente mediante herramientas digitales de análisis documental para generar una cronología formal de hechos, resumen de partes y fundamentaciones preliminares para que el Lic. Edgar u otro responsable jurídico pueda analizar de forma rápida el caso y emitir una opinión informada.
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 mb-1">4. Confidencialidad y No Transferencia</h4>
                  <p>
                    Bajo ninguna circunstancia sus datos personales o sensibles serán transferidos, vendidos o comercializados con anunciantes, empresas ajenas o terceros fuera del despacho jurídico encargado de la revisión de su asunto legal. Se rige estrictamente bajo secreto profesional.
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 mb-1">5. Derechos ARCO</h4>
                  <p>
                    Usted podrá solicitar el acceso, rectificación, cancelación u oposición al uso de sus datos o la eliminación completa de su expediente y folio de la base de datos enviando una solicitud formal a la oficina del despacho de Edgar.
                  </p>
                </div>
              </div>
              
              <div className="border-t border-slate-100 pt-4 mt-6 flex justify-end">
                <button 
                  onClick={() => setShowPrivacyModal(false)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg transition-all cursor-pointer shadow-sm"
                >
                  Entendido y Aceptar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                {(() => {
                  const src = previewFile.url || previewFile.content || '';
                  const isImage = previewFile.type?.startsWith('image/') || src.startsWith('data:image/');
                  const isPdf = previewFile.type === 'application/pdf' || src.startsWith('data:application/pdf');

                  if (isImage) {
                    return (
                      <img
                        src={src}
                        alt={previewFile.name}
                        className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-sm"
                      />
                    );
                  }
                  if (isPdf) {
                    return (
                      <iframe
                        src={src}
                        title={previewFile.name}
                        className="w-full h-[60vh] rounded-lg border border-slate-200 bg-white"
                      />
                    );
                  }
                  if (previewFile.content) {
                    return (
                      <div className="w-full h-full max-h-[60vh] overflow-auto bg-slate-900 rounded-xl p-4 border border-slate-800 text-left font-mono">
                        <pre className="text-xs text-emerald-400 whitespace-pre-wrap leading-relaxed select-all">
                          {previewFile.content}
                        </pre>
                      </div>
                    );
                  }
                  return (
                    <div className="text-center text-slate-500 text-sm px-6">
                      <FileText className="w-10 h-10 mx-auto mb-2 text-slate-400" />
                      Vista previa no disponible para este tipo de archivo.<br />
                      Usa el botón "Descargar Archivo" para verlo.
                    </div>
                  );
                })()}
              </div>

              {/* Footer */}
              <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                <a 
                  href={previewFile.url || previewFile.content} 
                  download={previewFile.name}
                  target={previewFile.url ? '_blank' : undefined}
                  rel={previewFile.url ? 'noopener noreferrer' : undefined}
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
