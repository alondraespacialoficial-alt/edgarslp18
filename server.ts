import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;
// On Vercel, the filesystem is read-only except /tmp, and it's not persisted across invocations.
// The local JSON file is only a cache/fallback; Supabase remains the source of truth in production.
const DB_FILE = path.join(process.env.VERCEL ? '/tmp' : process.cwd(), 'cases.json');

// Middlewares
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Lazy initializer for Supabase client
let supabaseClient: any = null;
let supabaseLastError: string | null = null;
let lastUsedUrl: string | null = null;
let lastUsedKey: string | null = null;

function getSupabaseClient() {
  let sbUrl = process.env.SB_URL;
  const sbKey = process.env.SB_SERVICE_ROLE_KEY || process.env.SB_ANON_KEY;
  
  if (sbUrl) {
    // Sanitize URL in case user provided the full REST URL ending in /rest/v1 or with trailing slashes
    sbUrl = sbUrl.replace(/\/rest\/v1\/?$/, '');
    if (sbUrl.endsWith('/')) {
      sbUrl = sbUrl.slice(0, -1);
    }
  }

  // Re-initialize if parameters have changed
  if (sbUrl !== lastUsedUrl || sbKey !== lastUsedKey) {
    supabaseClient = null;
    lastUsedUrl = sbUrl;
    lastUsedKey = sbKey;
  }

  if (!supabaseClient) {
    if (sbUrl && sbKey) {
      try {
        supabaseClient = createClient(sbUrl, sbKey, {
          auth: {
            persistSession: false
          }
        });
        console.log('Supabase client initialized successfully!');
        supabaseLastError = null; // Clear error on successful creation
      } catch (err: any) {
        supabaseLastError = `Initialization Error: ${err.message}`;
        console.error('Error creating Supabase client:', err.message);
      }
    } else {
      supabaseLastError = 'Missing SB_URL or SB_ANON_KEY/SB_SERVICE_ROLE_KEY in environment variables.';
    }
  }
  return supabaseClient;
}

// Helper to recursively remove null bytes (\u0000) which are unsupported by PostgreSQL
function sanitizeNullBytes(obj: any): any {
  if (typeof obj === 'string') {
    return obj.replace(/\u0000/g, '');
  } else if (Array.isArray(obj)) {
    return obj.map(item => sanitizeNullBytes(item));
  } else if (obj !== null && typeof obj === 'object') {
    const newObj: any = {};
    for (const key of Object.keys(obj)) {
      newObj[key] = sanitizeNullBytes(obj[key]);
    }
    return newObj;
  }
  return obj;
}

// Helper to ensure Supabase Storage Bucket exists
async function ensureStorageBucket(sb: any) {
  try {
    const { data: buckets, error: getError } = await sb.storage.listBuckets();
    if (getError) {
      console.warn('Error listing buckets, attempting to create:', getError.message);
    }
    
    const exists = buckets?.some((b: any) => b.name === 'case-attachments');
    if (!exists) {
      const { error: createError } = await sb.storage.createBucket('case-attachments', {
        public: true,
        fileSizeLimit: 10485760, // 10MB limit
      });
      if (createError) {
        console.error('Failed to create storage bucket "case-attachments":', createError.message);
      } else {
        console.log('Created Supabase storage bucket "case-attachments" successfully!');
      }
    }
  } catch (err: any) {
    console.error('Error in ensureStorageBucket:', err.message);
  }
}

// Sync local cases cache with Supabase if online
async function syncCasesToSupabase(localCases: any[]) {
  const sb = getSupabaseClient();
  if (!sb) return;
  
  try {
    const cleanedCases = sanitizeNullBytes(localCases);
    const mapped = cleanedCases.map((c: any) => {
      // Pack soft delete flags into aiAnalysis to avoid table schema issues
      const ai = { ...(c.aiAnalysis || {}) };
      if (c.isDeleted !== undefined) ai.isDeleted = c.isDeleted;
      if (c.deletedAt !== undefined) ai.deletedAt = c.deletedAt;

      return {
        folio: c.folio,
        client_name: c.clientName,
        client_email: c.clientEmail,
        client_phone: c.clientPhone || '',
        description: c.description,
        pasted_evidence: c.pastedEvidence || '',
        attachments: c.attachments || [],
        status: c.status,
        created_at: c.createdAt,
        ai_analysis: ai,
        lawyer_notes: c.lawyerNotes || '',
        custom_strategy: c.customStrategy || '',
        custom_response_draft: c.customResponseDraft || '',
        clarification_requests: c.clarificationRequests || [],
        chat_history: c.chatHistory || [],
        access_pin: c.accessPin || '1234'
      };
    });

    const { error } = await sb
      .from('cases')
      .upsert(mapped);
    
    if (error) {
      supabaseLastError = `Upsert Error: ${error.message} (Code: ${error.code})`;
      console.warn('Supabase sync warning (table "cases" might not exist or need RLS adjustments):', error.message);
    } else {
      supabaseLastError = null; // Clear error on success!
      console.log(`Successfully synchronized ${mapped.length} cases to Supabase!`);
    }
  } catch (err: any) {
    supabaseLastError = `Sync Exception: ${err.message}`;
    console.error('Supabase sync failed:', err.message);
  }
}

// Fetch fresh cases from Supabase
async function fetchCasesFromSupabase(): Promise<any[] | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  
  try {
    const { data, error } = await sb
      .from('cases')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) {
      supabaseLastError = `Select Error: ${error.message} (Code: ${error.code})`;
      console.warn('Could not select from Supabase (table "cases" might not exist yet):', error.message);
      return null;
    }
    
    if (data) {
      supabaseLastError = null; // Clear error on success!
      return data.map((c: any) => {
        const ai = c.ai_analysis || c.aiAnalysis || {};
        return {
          folio: c.folio,
          clientName: c.client_name || c.clientName,
          clientEmail: c.client_email || c.clientEmail,
          clientPhone: c.client_phone || c.clientPhone || '',
          description: c.description,
          pastedEvidence: c.pasted_evidence || c.pastedEvidence || '',
          attachments: c.attachments || [],
          status: c.status,
          createdAt: c.created_at || c.createdAt,
          aiAnalysis: ai,
          lawyerNotes: c.lawyer_notes || c.lawyerNotes || '',
          customStrategy: c.custom_strategy || c.customStrategy || '',
          customResponseDraft: c.custom_response_draft || c.customResponseDraft || '',
          clarificationRequests: c.clarification_requests || c.clarificationRequests || [],
          chatHistory: c.chat_history || c.chatHistory || [],
          accessPin: c.access_pin || c.accessPin || '1234',
          isDeleted: ai.isDeleted || false,
          deletedAt: ai.deletedAt || null
        };
      });
    }
  } catch (err: any) {
    supabaseLastError = `Fetch Exception: ${err.message}`;
    console.error('Supabase fetch failed:', err.message);
  }
  return null;
}

// Lazy initializer for Gemini
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('La variable de entorno GEMINI_API_KEY no está configurada. Agrégala en Settings > Secrets.');
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Ensure database file exists and is populated with seed dat// Ensure database file exists and is populated with seed data
async function ensureDatabase() {
  let localDataExists = existsSync(DB_FILE);
  let localCases: any[] = [];
  
  if (localDataExists) {
    try {
      const data = await fs.readFile(DB_FILE, 'utf-8');
      localCases = JSON.parse(data);
    } catch (e) {
      console.error('Invalid DB file, recreating seed data...', e);
    }
  }

  // Try to load cases from Supabase if configured
  const remoteCases = await fetchCasesFromSupabase();
  if (remoteCases && remoteCases.length > 0) {
    console.log(`Loaded ${remoteCases.length} cases from Supabase!`);
    // Cache to local file
    await fs.writeFile(DB_FILE, JSON.stringify(remoteCases, null, 2), 'utf-8');
    return;
  }

  // If Supabase is connected but empty, and we have local cases, write them to Supabase
  if (localCases.length > 0) {
    await syncCasesToSupabase(localCases);
    return;
  }

  // Create high-quality Mexican/Hispanic legal seed cases for "Edgar" and user testing
  const seedCases = [
    {
      folio: "EXP-2026-07-001",
      clientName: "Sofia Ramirez Estrada",
      clientEmail: "sofia.ramirez@example.com",
      clientPhone: "55 1234 5678",
      description: "Fui despedida de mi empleo injustificadamente el día de ayer. Trabajaba como Coordinadora de Logística en Distribuidora Azteca S.A. de C.V. desde hace 4 años y medio. Me llamaron a recursos humanos y me dijeron que por 'recorte de personal' prescindían de mis servicios, pero se negaron a pagarme mi liquidación constitucional completa, solo me ofrecieron 15,000 pesos firmando una renuncia voluntaria. No acepté firmar nada y me retiré. Mi salario diario integrado era de 650 pesos diarios.",
      pastedEvidence: "Mensaje de WhatsApp de la de Recursos Humanos (Lic. Patricia Gomez):\n'Sofía, lamentamos informarte que por reestructuración tu puesto queda cancelado. Pasa hoy a RH por tu cheque de 15,000 pesos de finiquito. Debes entregar tu credencial y firmar el formato de mutuo acuerdo.'",
      attachments: [
        {
          name: "contrato_laboral_sofia.txt",
          type: "text/plain",
          content: "CONTRATO INDIVIDUAL DE TRABAJO por tiempo indeterminado que celebran Distribuidora Azteca SA de CV y Sofia Ramirez Estrada..."
        }
      ],
      status: "En Análisis",
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago
      aiAnalysis: {
        summary: "Despido injustificado de Sofia Ramirez Estrada por Distribuidora Azteca S.A. de C.V. tras 4.5 años de servicios. Se le pretendió obligar a firmar renuncia voluntaria a cambio de 15,000 pesos, lo cual es inferior a la indemnización de ley.",
        parties: [
          { name: "Sofia Ramirez Estrada", role: "Actor / Afectado", details: "Ex-Coordinadora de Logística (Antigüedad: 4.5 años, Salario Diario: $650 MXN)." },
          { name: "Distribuidora Azteca S.A. de C.V.", role: "Demandado", details: "Patrón / Empresa demandable." },
          { name: "Lic. Patricia Gomez", role: "Tercero", details: "Gerente de Recursos Humanos que notificó el despido vía verbal/WhatsApp." }
        ],
        riskLevel: "Alto",
        conflictType: "Laboral",
        timeline: [
          { date: "Hace 4 años y medio", event: "Inicio de la relación laboral con la empresa.", importance: "Media", details: "Establece el cálculo de antigüedad para liquidación." },
          { date: "Ayer", event: "Llamada a RH y notificación de despido verbal por supuesto recorte.", importance: "Alta", details: "Fecha del despido injustificado (detona término de 2 meses para demandar)." },
          { date: "Ayer (Tarde)", event: "Mensaje de WhatsApp insistiendo en firma de mutuo acuerdo.", importance: "Alta", details: "Prueba documental de la presión para firmar renuncia simulada." }
        ],
        evidenceSummary: "Se cuenta con un contrato laboral escrito que demuestra la relación, antigüedad e ingresos. Adicionalmente, el mensaje de WhatsApp de la Lic. Patricia Gómez sirve como indicio fuerte de despido encubierto y coacción para firmar mutuo acuerdo.",
        preliminaryAnalysisText: "De acuerdo con el artículo 123 constitucional y la Ley Federal del Trabajo mexicana, el despido por 'recorte de personal' o 'reestructuración' obliga al patrón a pagar la indemnización constitucional (3 meses de salario), más 20 días por año (si reclama reinstalación y el patrón se niega, o por rescisión), prima de antigüedad (12 días por año topado), y partes proporcionales de aguinaldo, vacaciones y prima vacacional. Ofrecer 15,000 pesos por 4.5 años con un salario de $650 es una violación flagrante. El cálculo de indemnización real asciende a aproximadamente $95,000 MXN.",
        suggestedArticles: [
          { article: "Artículo 123 Apartado A", law: "Constitución Política de los Estados Unidos Mexicanos", description: "Establece el derecho a la estabilidad laboral y la indemnización de 3 meses de salario por despido injustificado.", relevance: "Fundamento constitucional supremo de la acción." },
          { article: "Artículo 48 y 50", law: "Ley Federal del Trabajo", description: "Norma el derecho del trabajador a ser indemnizado con el importe de tres meses de salario y el pago de salarios vencidos.", relevance: "Sustento procesal para demandar la indemnización constitucional ante los Centros de Conciliación y Tribunales Laborales." },
          { article: "Artículo 162", law: "Ley Federal del Trabajo", description: "Regula la prima de antigüedad consistente en 12 días de salario por cada año de servicios prestados.", relevance: "Cálculo obligatorio para el finiquito de Sofia por despido." }
        ],
        clarificationQuestions: [
          "¿Sofia firmó alguna bitácora de entrega de equipo o laptop de la empresa el día de ayer?",
          "¿Tiene recibos de nómina (CFDI) que demuestren que el salario diario de 650 pesos era el registrado ante el IMSS?",
          "¿Existen testigos (compañeros de trabajo) que hayan presenciado el momento en que se le impidió el acceso o se le notificó el despido?"
        ],
        suggestedStrategy: "1. Presentar de inmediato solicitud de conciliación prejudicial obligatoria ante el Centro de Conciliación Laboral local (término de 45 días naturales). 2. Cuantificar formalmente la liquidación por $95,000 pesos para usar como base de negociación. 3. Evitar firmar cualquier documento sin supervisión del despacho.",
        suggestedResponseDraft: "Estimada Lic. Gómez,\nAgradezco sus atenciones. En relación con su propuesta de término de la relación de trabajo, les informo que no es de mi interés firmar un mutuo acuerdo por la cantidad sugerida de $15,000 pesos, ya que no corresponde a mis derechos devengados ni a la indemnización constitucional señalada en la Ley Federal del Trabajo por despido injustificado. \nQuedo a la espera de una propuesta apegada a la ley o, en su defecto, nos encontraremos en el Centro de Conciliación Laboral correspondiente para dirimir la situación.\nAtentamente,\nSofía Ramírez Estrada."
      },
      lawyerNotes: "Hablé brevemente con Sofía. Dice que no le han quitado el IMSS todavía, lo cual es buena señal. Agendaré cita presencial para preparar la solicitud de conciliación.",
      clarificationRequests: [
        {
          id: "req-1",
          question: "¿Los recibos de nómina timbrados muestran que estabas registrada con tu sueldo real ante el IMSS?",
          answer: "Sí, acabo de revisar mis XML y el IMSS me tiene registrada con los 650 pesos completos diarios.",
          askedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          answeredAt: new Date(Date.now() - 2.8 * 24 * 60 * 60 * 1000).toISOString()
        }
      ],
      chatHistory: []
    },
    {
      folio: "EXP-2026-07-002",
      clientName: "Inmobiliaria Vertice S.A.",
      clientEmail: "representante@vertice.mx",
      clientPhone: "81 9876 5432",
      description: "Un inquilino en nuestro local comercial ubicado en Plaza Patria, Monterrey (el señor Roberto Anzures) tiene 3 meses de renta vencidos. Además de no pagar, nos enteramos por los vecinos que subarrendó el local a un tercero sin nuestro consentimiento por escrito, lo cual está explícitamente prohibido en la cláusula novena de nuestro contrato de arrendamiento. Queremos rescindir el contrato, cobrar los adeudos y recuperar el local comercial.",
      pastedEvidence: "Cláusula Novena del Contrato:\n'EL ARRENDATARIO tiene estrictamente prohibido subarrendar, ceder o traspasar en todo o en parte el Local Arrendado sin la previa autorización por escrito del ARRENDADOR...'",
      attachments: [],
      status: "Recibido",
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
      aiAnalysis: {
        summary: "Incumplimiento de contrato de arrendamiento comercial por falta de pago de 3 meses de renta y subarriendo no autorizado del local comercial en Plaza Patria, Monterrey por el arrendatario Roberto Anzures.",
        parties: [
          { name: "Inmobiliaria Vértice S.A.", role: "Actor / Afectado", details: "Arrendador y propietario del local comercial." },
          { name: "Roberto Anzures", role: "Demandado", details: "Arrendatario original que incumplió pagos y cláusula de subarriendo." },
          { name: "Tercero Subarrendatario", role: "Tercero", details: "Ocupante actual no autorizado del local comercial." }
        ],
        riskLevel: "Medio",
        conflictType: "Civil",
        timeline: [
          { date: "Hace 1 año", event: "Firma del contrato de arrendamiento por un plazo forzoso de 2 años.", importance: "Baja" },
          { date: "Hace 3 meses", event: "El arrendatario suspende el pago mensual de rentas pactadas.", importance: "Alta" },
          { date: "Hace 15 días", event: "Vecinos reportan que un negocio diferente opera en el local bajo otra administración.", importance: "Alta" }
        ],
        evidenceSummary: "Se cuenta con el Contrato de Arrendamiento original con firma autógrafa. Faltan pruebas documentales del subarrendamiento ilegal (fotografías, testimonios o actas de hechos) y estado de cuenta de rentas impagas.",
        preliminaryAnalysisText: "En el estado de Nuevo León, la falta de pago de la renta y el subarrendamiento no autorizado son causales expresas de rescisión de contrato de arrendamiento de acuerdo al Código Civil. Procede demandar el Juicio Oral de Arrendamiento Inmobiliario para exigir la rescisión, la desocupación y entrega inmediata física del inmueble, el pago de rentas vencidas más los intereses moratorios contractuales, y gastos y costas procesales.",
        suggestedArticles: [
          { article: "Artículo 2383", law: "Código Civil del Estado de Nuevo León", description: "El arrendatario no puede subarrendar la cosa arrendada en todo, ni en parte, sin consentimiento del arrendador; si lo hiciere, responderá solidariamente con el subarrendatario y es causa de rescisión.", relevance: "Sustento directo para rescindir por subarriendo." },
          { article: "Artículo 2322", law: "Código Civil del Estado de Nuevo León", description: "Establece la obligación del arrendatario de pagar la renta en la forma y tiempo convenidos.", relevance: "Sustento para demandar el cobro de rentas insolutas." }
        ],
        clarificationQuestions: [
          "¿Se le han enviado notificaciones, requerimientos formales por escrito o vía notario para el cobro de las rentas vencidas?",
          "¿Tienen fotos de la fachada del local que demuestren que hay una marca o negocio distinto operando ahí?",
          "¿El contrato de arrendamiento cuenta con un Fiador o Aval con bien raíz para garantizar los adeudos?"
        ],
        suggestedStrategy: "1. Enviar requerimiento formal extrajudicial o a través de Jurisdicción Voluntaria para constituir en mora y documentar el requerimiento. 2. Levantar fe de hechos ante notario o documentar con fotografías la ocupación del tercero. 3. Interponer demanda de Juicio Oral de Arrendamiento en el Tribunal Superior de Justicia de NL.",
        suggestedResponseDraft: "REQUERIMIENTO DE PAGO Y RESCISIÓN CONTRACTUAL\nAt'n: Sr. Roberto Anzures.\nPor medio de la presente, Inmobiliaria Vértice S.A. le requiere formalmente el pago inmediato de la cantidad de [$X,XXX.XX] correspondiente a los meses vencidos de renta de mayo, junio y julio de 2026...\nAsimismo, se le notifica que ha incurrido en rescisión automática del contrato de arrendamiento al violar la Cláusula Novena..."
      },
      clarificationRequests: [
        {
          id: "req-2",
          question: "¿El contrato de arrendamiento cuenta con un Aval o Fiador con propiedad inmueble en Monterrey?",
          askedAt: new Date().toISOString()
        }
      ],
      chatHistory: []
    }
  ];

  await fs.writeFile(DB_FILE, JSON.stringify(seedCases, null, 2), 'utf-8');
  await syncCasesToSupabase(seedCases);
}

// REST API Endpoints

// Middleware to authenticate admin requests
function adminAuth(req: any, res: any, next: any) {
  const password = req.headers['x-admin-password'] || req.headers['authorization'];
  const expectedPassword = process.env.ADMIN_PASSWORD || '2003';
  if (password === expectedPassword || password === `Bearer ${expectedPassword}`) {
    return next();
  }
  res.status(401).json({ error: 'Acceso no autorizado. Contraseña de administrador inválida o ausente.' });
}

// GET /api/supabase-diagnostics - Check connection status and get required schema setup
app.get('/api/supabase-diagnostics', adminAuth, async (req, res) => {
  const sb = getSupabaseClient();
  if (sb) {
    try {
      const { error } = await sb.from('cases').select('folio').limit(1);
      if (error) {
        supabaseLastError = `Query Error: ${error.message} (Code: ${error.code})`;
      } else {
        supabaseLastError = null; // Clear error on successful connection and table check!
      }
    } catch (err: any) {
      supabaseLastError = `Query Exception: ${err.message}`;
    }
  }

  const sbUrl = process.env.SB_URL;
  const sbKey = process.env.SB_SERVICE_ROLE_KEY || process.env.SB_ANON_KEY;
  const hasUrl = !!sbUrl;
  const hasKey = !!sbKey;
  
  res.json({
    configured: hasUrl && hasKey,
    sbUrl: sbUrl ? `${sbUrl.slice(0, 15)}...` : null,
    hasServiceRoleKey: !!process.env.SB_SERVICE_ROLE_KEY,
    hasAnonKey: !!process.env.SB_ANON_KEY,
    lastError: supabaseLastError,
    requiredSql: `-- 1. EJECUTAR ESTE CÓDIGO EN EL SQL EDITOR DE SUPABASE:
-- Esto creará la tabla 'cases' con todos los campos necesarios.

CREATE TABLE IF NOT EXISTS cases (
  folio TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  client_phone TEXT,
  description TEXT NOT NULL,
  pasted_evidence TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'Recibido',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ai_analysis JSONB DEFAULT '{}'::jsonb,
  lawyer_notes TEXT DEFAULT '',
  custom_strategy TEXT DEFAULT '',
  custom_response_draft TEXT DEFAULT '',
  clarification_requests JSONB DEFAULT '[]'::jsonb,
  chat_history JSONB DEFAULT '[]'::jsonb,
  access_pin TEXT NOT NULL DEFAULT '1234'
);

-- 2. DESACTIVAR POLÍTICAS RLS (Para desarrollo rápido y pruebas sin bloqueos):
ALTER TABLE cases DISABLE ROW LEVEL SECURITY;`
  });
});

// GET /api/cases - List all cases
app.get('/api/cases', adminAuth, async (req, res) => {
  try {
    await ensureDatabase();
    // Prefer fresh remote data if available
    const remoteCases = await fetchCasesFromSupabase();
    if (remoteCases) {
      return res.json(remoteCases);
    }
    const data = await fs.readFile(DB_FILE, 'utf-8');
    const cases = JSON.parse(data);
    res.json(cases);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener expedientes: ' + error.message });
  }
});

// GET /api/cases/:folio - Get single case
app.get('/api/cases/:folio', async (req, res) => {
  try {
    await ensureDatabase();
    // Try fetch fresh from Supabase
    const remoteCases = await fetchCasesFromSupabase();
    let caseItem: any = null;
    if (remoteCases) {
      caseItem = remoteCases.find((c: any) => c.folio.toUpperCase() === req.params.folio.toUpperCase());
    }
    
    if (!caseItem) {
      const data = await fs.readFile(DB_FILE, 'utf-8');
      const cases = JSON.parse(data);
      caseItem = cases.find((c: any) => c.folio.toUpperCase() === req.params.folio.toUpperCase());
    }

    if (!caseItem) {
      return res.status(404).json({ error: 'Expediente no encontrado.' });
    }

    // Authenticate: Must match accessPin OR expected admin password
    const pinHeader = req.headers['x-case-pin'];
    const pinQuery = req.query.pin;
    const clientPin = (pinHeader || pinQuery || '').toString().trim();

    const adminHeader = req.headers['x-admin-password'] || req.headers['authorization'];
    const expectedAdminPassword = process.env.ADMIN_PASSWORD || '2003';
    const isAuthorizedAdmin = adminHeader === expectedAdminPassword || adminHeader === `Bearer ${expectedAdminPassword}`;

    const isAuthorizedClient = clientPin && caseItem.accessPin && String(caseItem.accessPin).trim() === clientPin;

    if (!isAuthorizedAdmin && !isAuthorizedClient) {
      return res.status(401).json({ error: 'No autorizado. La clave de acceso del expediente es incorrecta o no fue proporcionada.' });
    }

    res.json(caseItem);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener expediente: ' + error.message });
  }
});

// POST /api/cases - Create new case and trigger Gemini analysis
app.post('/api/cases', async (req, res) => {
  try {
    const { clientName, clientEmail, clientPhone, description, pastedEvidence, attachments } = req.body;

    if (!clientName || !clientEmail || !description) {
      return res.status(400).json({ error: 'Nombre, Email y Descripción son obligatorios.' });
    }

    await ensureDatabase();
    const data = await fs.readFile(DB_FILE, 'utf-8');
    const cases = JSON.parse(data);

    // Generate custom unique folio number
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const count = cases.filter((c: any) => c.folio.startsWith(`EXP-${year}-${month}`)).length + 1;
    const folio = `EXP-${year}-${month}-${String(count).padStart(3, '0')}`;

    // Process attachments: upload them to Supabase Storage if online to prevent inflating database size with base64
    const processedAttachments = [];
    const sb = getSupabaseClient();
    if (sb) {
      await ensureStorageBucket(sb);
    }

    if (attachments && attachments.length > 0) {
      for (const file of attachments) {
        if (file.content && sb) {
          try {
            const isBase64DataUrl = file.content.startsWith('data:');
            let base64Data = file.content;
            if (isBase64DataUrl) {
              base64Data = file.content.replace(/^data:[\w/+-]+;base64,/, '');
            }

            let buffer: Buffer;
            if (file.type.startsWith('image/') || isBase64DataUrl) {
              buffer = Buffer.from(base64Data, 'base64');
            } else {
              buffer = Buffer.from(file.content, 'utf-8');
            }

            // Clean filename to avoid issues with special characters in URLs
            const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const storagePath = `${folio}/${cleanFileName}`;

            const { data, error: uploadError } = await sb.storage
              .from('case-attachments')
              .upload(storagePath, buffer, {
                contentType: file.type,
                upsert: true
              });

            if (uploadError) {
              console.error(`Error uploading file ${file.name} to Supabase Storage:`, uploadError.message);
              // Fallback to local storage (base64)
              processedAttachments.push(file);
            } else {
              const { data: { publicUrl } } = sb.storage
                .from('case-attachments')
                .getPublicUrl(storagePath);

              console.log(`Uploaded ${file.name} to Supabase Storage! Public URL:`, publicUrl);
              processedAttachments.push({
                name: file.name,
                size: file.size,
                type: file.type,
                url: publicUrl
              });
            }
          } catch (err: any) {
            console.error(`Failed to upload attachment ${file.name}:`, err.message);
            processedAttachments.push(file);
          }
        } else {
          processedAttachments.push(file);
        }
      }
    }

    // Generate a secure 4-digit PIN for private case access
    const accessPin = String(Math.floor(1000 + Math.random() * 9000));

    const newCase: any = {
      folio,
      clientName,
      clientEmail,
      clientPhone: clientPhone || '',
      description,
      pastedEvidence: pastedEvidence || '',
      attachments: processedAttachments,
      status: 'Recibido',
      createdAt: new Date().toISOString(),
      clarificationRequests: [],
      chatHistory: [],
      accessPin
    };

    // Analyze case details using Gemini 3.5 Flash server-side
    try {
      const ai = getGeminiClient();

      // Build parts for multimodal analysis
      const contentsParts: any[] = [];

      // Let's add the core text prompt instructions
      let analysisPrompt = `
      Analiza el siguiente caso legal que ha ingresado un cliente al despacho.
      El abogado supervisor es Edgar. Proporciona un análisis de alta calidad y de extrema rigurosidad y prudencia legal en español latinoamericano (aplicable en el contexto de México o América Latina).
      
      DATOS DEL CLIENTE:
      - Nombre: ${clientName}
      - Correo: ${clientEmail}
      - Teléfono: ${clientPhone || 'No especificado'}
      
      HECHOS DESCRITOS POR EL CLIENTE:
      ${description}
      
      EVIDENCIA O MENSAJES ADICIONALES (chats de WhatsApp, correos, etc.):
      ${pastedEvidence || 'No se proporcionaron mensajes de WhatsApp o chat.'}
      
      ARCHIVOS ADJUNTOS DETECTADOS:
      ${(attachments || []).map((a: any) => `- Archivo: ${a.name} (Tipo: ${a.type})`).join('\n') || 'Ninguno'}
      
      Instrucciones de Rigor Legal y Prudencia Técnica (¡CRÍTICO!):
      1. LENGUAJE PRELIMINAR Y PRUDENTE: No afirmes nunca de forma absoluta que la contraparte carece de viabilidad jurídica o que perderá por completo. Evita la asertividad desmedida y utiliza siempre terminología prudente y probabilística propia de un abogado experto (por ejemplo: "preliminarmente", "bajo reserva de confirmación probatoria", "existen indicios que sugieren", "de corroborarse los supuestos de hecho").
      2. RESTRICCIÓN DE TÉRMINOS GRAVES O DELICTIVOS: Está estrictamente prohibido usar de forma automática o ligera términos penales o graves como "extorsión", "tráfico de influencias", "difamación", "amenazas penales" o similares, a menos que exista evidencia directa, indubitable, explícita y plenamente documentada de tales conductas. En su lugar, describe las conductas de forma neutral y técnica (v.gr., "presión comercial indebida", "comportamiento irregular", "declaraciones perjudiciales").
      3. SEPARACIÓN RIGUROSA EN EL ANÁLISIS: En el campo "preliminaryAnalysisText", divide obligatoriamente el contenido en las siguientes cuatro secciones de Markdown claramente diferenciadas, usando exactamente estos títulos:
         ### HECHOS ACREDITADOS
         (Hechos objetivos que se pueden probar de inmediato con los documentos o capturas cargadas).
         ### INFERENCIAS
         (Deducciones lógicas obtenidas a partir de la narrativa y la evidencia preliminar).
         ### HIPÓTESIS
         (Posibles posturas, defensas de la contraparte, o líneas de acción procesal bajo el principio de contradicción).
         ### RECOMENDACIONES
         (Sugerencias y pasos inmediatos de prudencia técnica para proteger la postura del cliente).
      4. EVALUACIÓN DE CONFIANZA: Para cada bloque clave del análisis (Hechos y Resumen, Análisis Técnico, y Estrategia/Propuesta), determina un nivel de confianza fundamentado (e.g., "95% - Alta certidumbre debido a contrato firmado", "60% - Moderada certidumbre por falta de pruebas de entrega de mercancías").
      5. CRONOLOGÍA Y PREGUNTAS: Mantén la generación del timeline detallado y las preguntas de aclaración críticas que Edgar debe formularle al cliente, ya que aportan un valor estratégico sustancial.
      6. DIVISION DE RIESGOS: Evalúa los riesgos en tres vertientes independientes: Jurídico (solidez del derecho de fondo), Probatorio (calidad e idoneidad de la evidencia actual), y Conflictivo (vulnerabilidad o aspereza del conflicto y disposición de las partes).
      7. BORRADOR DUAL DE COMUNICACIÓN: Genera dos borradores:
         - Uno INTERNO ("suggestedResponseDraftInternal") para el despacho, donde incluyas notas estratégicas, puntos críticos de cuidado al hablar con el cliente o contraparte, y advertencias.
         - Uno EXTERNO ("suggestedResponseDraftExternal") de tono sobrio, prudente, formal, libre de confrontación innecesaria, redactado con lenguaje técnico y respetuoso, listo para una eventual notificación o envío.
      `;

      contentsParts.push({ text: analysisPrompt });

      // Add actual image inlineData if client uploaded an image, so Gemini can read the screenshot or document!
      if (attachments && attachments.length > 0) {
        for (const attachment of attachments) {
          if (attachment.type.startsWith('image/') && attachment.content) {
            // content is base64 string
            // strip header if present
            const base64Data = attachment.content.replace(/^data:image\/\w+;base64,/, '');
            contentsParts.push({
              inlineData: {
                mimeType: attachment.type,
                data: base64Data
              }
            });
          }
        }
      }

      // Query Gemini with structured JSON response schema
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: { parts: contentsParts },
        config: {
          systemInstruction: `Eres el Abogado Máster / Socio Director Jurídico de Charlitron Despacho Inteligente, el despacho legal de Edgar. Tu función es realizar un análisis legal documental de altísimo nivel, profundo, prudente, sumamente riguroso, formal y de vanguardia de la evidencia y los hechos proporcionados por el cliente.

          Lineamientos jurídicos, metodológicos e imperativos:
          - Toda afirmación de viabilidad jurídica sobre la postura del cliente o la contraparte debe redactarse con lenguaje técnico preliminar, prudente y probabilístico. Evita conclusiones absolutas que comprometan la responsabilidad del despacho.
          - Es OBLIGATORIO fundamentar con precisión técnica: debes especificar los artículos exactos de los códigos o leyes aplicables de la legislación mexicana (e.g. Código Civil Federal, Código de Comercio, Ley de Amparo, Ley Federal del Trabajo, Ley de la Propiedad Industrial, Ley Federal de Derechos de Autor, Ley General de Títulos y Operaciones de Crédito, etc.).
          - Debes incorporar y hacer referencia a Jurisprudencias y Tesis Aisladas de la Suprema Corte de Justicia de la Nación (SCJN) o Tribunales Colegiados de Circuito que sean aplicables al caso, indicando su rubro o sentido jurídico relevante.
          - No califiques conductas con términos penales severos de forma ligera a menos que la prueba aportada sea directa y concluyente. Usa descripciones técnicas y civilizadas en su lugar.
          - Separa estrictamente tu análisis preliminar bajo los títulos de Markdown de Hechos Acreditados, Inferencias, Hipótesis y Recomendaciones.
          - El campo 'suggestedArticles' debe llenarse con fundamentos robustos, incluyendo tanto los artículos y leyes aplicables como las jurisprudencias o tesis aisladas recomendadas para el caso.
          - Sé sumamente formal, profesional, persuasivo y preciso en español de México.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description: "Resumen ejecutivo formal, sumamente objetivo y detallado de los hechos del caso en español."
              },
              parties: {
                type: Type.ARRAY,
                description: "Lista de las personas o entidades involucradas y sus roles en la controversia.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: "Nombre de la persona o institución." },
                    role: { type: Type.STRING, description: "Rol procesal o de hecho (e.g., Actor / Afectado, Demandado, Co-demandado, Testigo, Tercero, Autoridad)." },
                    details: { type: Type.STRING, description: "Breve explicación de su relevancia en el caso." }
                  },
                  required: ["name", "role"]
                }
              },
              riskLevel: {
                type: Type.STRING,
                description: "Nivel de riesgo estimado general para el cliente.",
                enum: ["Bajo", "Medio", "Alto", "Crítico"]
              },
              detailedRisks: {
                type: Type.OBJECT,
                description: "División detallada del riesgo en tres categorías clave.",
                properties: {
                  juridico: { type: Type.STRING, enum: ["Bajo", "Medio", "Alto", "Crítico"], description: "Riesgo en cuanto a la solidez de fondo de los argumentos jurídicos." },
                  probatorio: { type: Type.STRING, enum: ["Bajo", "Medio", "Alto", "Crítico"], description: "Riesgo respecto a la disponibilidad, idoneidad y fuerza de las pruebas aportadas." },
                  conflictivo: { type: Type.STRING, enum: ["Bajo", "Medio", "Alto", "Crítico"], description: "Riesgo relativo a la aspereza, escala, conflictividad social o personal y posibilidad de litigio adverso." },
                  justification: { type: Type.STRING, description: "Justificación analítica breve de estas calificaciones." }
                },
                required: ["juridico", "probatorio", "conflictivo", "justification"]
              },
              confidenceScores: {
                type: Type.OBJECT,
                description: "Nivel de confianza o certidumbre técnica estimado para cada bloque principal.",
                properties: {
                  summary: { type: Type.STRING, description: "Nivel de confianza del resumen de hechos (ej. '95% - Alta certidumbre, respaldado por contrato escrito')." },
                  analysis: { type: Type.STRING, description: "Nivel de confianza de la hipótesis y encuadre técnico (ej. '80% - Pendiente de corroboración de firmas')." },
                  strategy: { type: Type.STRING, description: "Nivel de confianza de la propuesta estratégica (ej. '75% - Requiere pruebas documentales adicionales para subir de nivel')." }
                },
                required: ["summary", "analysis", "strategy"]
              },
              conflictType: {
                type: Type.STRING,
                description: "Materia jurídica principal de la controversia (e.g., Laboral, Civil, Mercantil, Penal, Familiar, Administrativo, Amparo, Propiedad Intelectual)."
              },
              timeline: {
                type: Type.ARRAY,
                description: "Cronología de eventos ordenados cronológicamente a partir del relato.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    date: { type: Type.STRING, description: "Fecha del acontecimiento o aproximación (e.g., 'Ayer', 'Marzo 2026', 'No especificado')." },
                    event: { type: Type.STRING, description: "Hecho concreto suscitado." },
                    importance: { type: Type.STRING, enum: ["Alta", "Media", "Baja"], description: "Gravedad o impacto procesal del hecho." },
                    details: { type: Type.STRING, description: "Breve análisis o comentario de por qué este hecho es importante." }
                  },
                  required: ["date", "event", "importance"]
                }
              },
              evidenceSummary: {
                type: Type.STRING,
                description: "Evaluación formal de la evidencia aportada (contratos, conversaciones de WhatsApp, capturas de pantalla, audios). Evalúa su peso probatorio o indiciario."
              },
              preliminaryAnalysisText: {
                type: Type.STRING,
                description: "Análisis técnico-jurídico preliminar prudente estructurado en las secciones de Markdown: ### HECHOS ACREDITADOS, ### INFERENCIAS, ### HIPÓTESIS y ### RECOMENDACIONES."
              },
              suggestedArticles: {
                type: Type.ARRAY,
                description: "Fundamentos legales, artículos específicos, leyes o tesis de jurisprudencia que sustentan el caso.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    article: { type: Type.STRING, description: "Número de artículo o precepto legal." },
                    law: { type: Type.STRING, description: "Cuerpo de leyes o código (e.g., Código Civil, Ley de Amparo, etc.)." },
                    description: { type: Type.STRING, description: "Contenido o resumen breve de lo que dicta la ley." },
                    relevance: { type: Type.STRING, description: "Cómo aplica específicamente para defender o sustentar la postura de nuestro cliente." }
                  },
                  required: ["article", "law", "description", "relevance"]
                }
              },
              clarificationQuestions: {
                type: Type.ARRAY,
                description: "Preguntas cruciales o datos faltantes que Edgar debe consultar o solicitar al cliente para robustecer el expediente.",
                items: { type: Type.STRING }
              },
              suggestedStrategy: {
                type: Type.STRING,
                description: "Propuesta detallada de estrategia procesal o de negociación inmediata recomendada para el despacho."
              },
              suggestedResponseDraft: {
                type: Type.STRING,
                description: "Borrador de comunicación externo (copia el mismo contenido del campo 'suggestedResponseDraftExternal' para mantener compatibilidad)."
              },
              suggestedResponseDraftInternal: {
                type: Type.STRING,
                description: "Borrador interno para el despacho, conteniendo sugerencias, llamadas de atención o consideraciones preventivas antes de responderle al cliente o contraparte."
              },
              suggestedResponseDraftExternal: {
                type: Type.STRING,
                description: "Borrador externo, sobrio, prudente y formal de respuesta o requerimiento inicial para posible envío."
              }
            },
            required: [
              "summary", "parties", "riskLevel", "detailedRisks", "confidenceScores", "conflictType", "timeline",
              "evidenceSummary", "preliminaryAnalysisText", "suggestedArticles",
              "clarificationQuestions", "suggestedStrategy", "suggestedResponseDraft",
              "suggestedResponseDraftInternal", "suggestedResponseDraftExternal"
            ]
          }
        }
      });

      const parsedAnalysis = JSON.parse(response.text || '{}');
      newCase.aiAnalysis = parsedAnalysis;
      
      // Seed pre-filled clarification requests based on Gemini recommendations
      if (parsedAnalysis.clarificationQuestions && parsedAnalysis.clarificationQuestions.length > 0) {
        newCase.clarificationRequests = parsedAnalysis.clarificationQuestions.slice(0, 3).map((q: string, idx: number) => ({
          id: `req-${Date.now()}-${idx}`,
          question: q,
          askedAt: new Date().toISOString()
        }));
      }

    } catch (aiError: any) {
      console.error('Gemini Analysis Failed:', aiError);
      // Fallback analysis if Gemini is offline or api key is missing, so user doesn't block
      newCase.aiAnalysis = {
        summary: "Caso recibido correctamente. Análisis de IA pendiente por configuración de API key.",
        parties: [
          { name: clientName, role: "Actor / Afectado", details: "Cliente que ingresó la queja." }
        ],
        riskLevel: "Medio",
        conflictType: "Por Determinar",
        timeline: [
          { date: "Hoy", event: "Recepción digital del asunto legal.", importance: "Alta", details: "Expediente digital inicial creado en plataforma." }
        ],
        evidenceSummary: "Evidencia guardada en el expediente y lista para ser analizada manualmente o re-procesada con IA.",
        preliminaryAnalysisText: `El asunto ha sido radicado con el folio ${folio}. Se requiere que el administrador ingrese su clave API de Gemini o analice el asunto manualmente. Hechos principales descritos: ${description.substring(0, 200)}...`,
        suggestedArticles: [
          { article: "Artículo 8 Constitucional", law: "Constitución Política de los Estados Unidos Mexicanos", description: "Derecho de petición por escrito de manera pacífica y respetuosa.", relevance: "Fundamento general para formalizar trámites o peticiones." }
        ],
        clarificationQuestions: [
          "¿Tiene documentos físicos firmados que demuestren las obligaciones alegadas?",
          "¿Cuál es la fecha exacta del último suceso relevante?",
          "¿Se ha entablado diálogo de conciliación con la contraparte?"
        ],
        suggestedStrategy: "Revisión física del expediente en oficina con el Lic. Edgar y validación de las pruebas aportadas.",
        suggestedResponseDraft: `Estimado(a) ${clientName},\nHemos recibido su asunto legal y le hemos asignado el folio de expediente ${folio}.\nUn especialista del despacho de Edgar se pondrá en contacto con usted en breve para iniciar el análisis formal de su situación.\nAtentamente,\nDespacho Jurídico Inteligente.`
      };
    }

    cases.unshift(newCase);
    await fs.writeFile(DB_FILE, JSON.stringify(cases, null, 2), 'utf-8');
    await syncCasesToSupabase(cases);
    res.status(201).json(newCase);

  } catch (error: any) {
    console.error('Error creating case:', error);
    res.status(500).json({ error: 'Error al registrar el expediente: ' + error.message });
  }
});

// POST /api/cases/:folio/update - Update case details (status, notes, custom drafts)
app.post('/api/cases/:folio/update', adminAuth, async (req, res) => {
  try {
    const { status, lawyerNotes, customStrategy, customResponseDraft } = req.body;
    await ensureDatabase();
    const data = await fs.readFile(DB_FILE, 'utf-8');
    const cases = JSON.parse(data);

    const caseIndex = cases.findIndex((c: any) => c.folio.toUpperCase() === req.params.folio.toUpperCase());
    if (caseIndex === -1) {
      return res.status(404).json({ error: 'Expediente no encontrado.' });
    }

    const item = cases[caseIndex];
    if (status) item.status = status;
    if (lawyerNotes !== undefined) item.lawyerNotes = lawyerNotes;
    if (customStrategy !== undefined) item.customStrategy = customStrategy;
    if (customResponseDraft !== undefined) item.customResponseDraft = customResponseDraft;

    cases[caseIndex] = item;
    await fs.writeFile(DB_FILE, JSON.stringify(cases, null, 2), 'utf-8');
    await syncCasesToSupabase(cases);
    res.json(item);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al actualizar expediente: ' + error.message });
  }
});

// DELETE /api/cases/:folio - Delete (soft-delete by default, hard-delete if ?hard=true)
app.delete('/api/cases/:folio', adminAuth, async (req, res) => {
  try {
    await ensureDatabase();
    const data = await fs.readFile(DB_FILE, 'utf-8');
    const cases = JSON.parse(data);

    const folio = req.params.folio.toUpperCase();
    const caseIndex = cases.findIndex((c: any) => c.folio.toUpperCase() === folio);
    if (caseIndex === -1) {
      return res.status(404).json({ error: 'Expediente no encontrado.' });
    }

    const isHardDelete = req.query.hard === 'true';

    if (isHardDelete) {
      // Permanent removal from local cache array
      cases.splice(caseIndex, 1);
      await fs.writeFile(DB_FILE, JSON.stringify(cases, null, 2), 'utf-8');

      // Remove from Supabase if configured
      const sb = getSupabaseClient();
      if (sb) {
        try {
          const { error } = await sb
            .from('cases')
            .delete()
            .eq('folio', folio);
          
          if (error) {
            console.warn(`Supabase hard-delete warning for ${folio}:`, error.message);
          } else {
            console.log(`Successfully hard-deleted ${folio} from Supabase!`);
          }
        } catch (err: any) {
          console.error(`Supabase hard-delete exception for ${folio}:`, err.message);
        }
      }
      res.json({ success: true, message: `Expediente ${folio} eliminado permanentemente.` });
    } else {
      // Soft-delete
      cases[caseIndex].isDeleted = true;
      cases[caseIndex].deletedAt = new Date().toISOString();
      await fs.writeFile(DB_FILE, JSON.stringify(cases, null, 2), 'utf-8');
      await syncCasesToSupabase(cases);
      res.json({ success: true, message: `Expediente ${folio} movido a la papelera.` });
    }
  } catch (error: any) {
    res.status(500).json({ error: 'Error al eliminar el expediente: ' + error.message });
  }
});

// POST /api/cases/:folio/restore - Restore a soft-deleted case
app.post('/api/cases/:folio/restore', adminAuth, async (req, res) => {
  try {
    await ensureDatabase();
    const data = await fs.readFile(DB_FILE, 'utf-8');
    const cases = JSON.parse(data);

    const folio = req.params.folio.toUpperCase();
    const caseIndex = cases.findIndex((c: any) => c.folio.toUpperCase() === folio);
    if (caseIndex === -1) {
      return res.status(404).json({ error: 'Expediente no encontrado.' });
    }

    cases[caseIndex].isDeleted = false;
    delete cases[caseIndex].deletedAt;

    // Clean up inside aiAnalysis if packed there
    if (cases[caseIndex].aiAnalysis) {
      cases[caseIndex].aiAnalysis.isDeleted = false;
      delete cases[caseIndex].aiAnalysis.deletedAt;
    }

    await fs.writeFile(DB_FILE, JSON.stringify(cases, null, 2), 'utf-8');
    await syncCasesToSupabase(cases);

    res.json(cases[caseIndex]);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al restaurar expediente: ' + error.message });
  }
});

// POST /api/cases/:folio/attachments - Upload and add new attachments to an existing case
app.post('/api/cases/:folio/attachments', async (req, res) => {
  try {
    const { attachments } = req.body;
    if (!attachments || !Array.isArray(attachments)) {
      return res.status(400).json({ error: 'Se requiere una lista de archivos adjuntos.' });
    }

    await ensureDatabase();
    const data = await fs.readFile(DB_FILE, 'utf-8');
    const cases = JSON.parse(data);

    const folio = req.params.folio.toUpperCase();
    const caseIndex = cases.findIndex((c: any) => c.folio.toUpperCase() === folio);
    if (caseIndex === -1) {
      return res.status(404).json({ error: 'Expediente no encontrado.' });
    }

    const item = cases[caseIndex];

    // Authenticate: Must match accessPin OR expected admin password
    const pinHeader = req.headers['x-case-pin'];
    const pinQuery = req.query.pin;
    const clientPin = (pinHeader || pinQuery || '').toString().trim();

    const adminHeader = req.headers['x-admin-password'] || req.headers['authorization'];
    const expectedAdminPassword = process.env.ADMIN_PASSWORD || '2003';
    const isAuthorizedAdmin = adminHeader === expectedAdminPassword || adminHeader === `Bearer ${expectedAdminPassword}`;

    const isAuthorizedClient = clientPin && item.accessPin && String(item.accessPin).trim() === clientPin;

    if (!isAuthorizedAdmin && !isAuthorizedClient) {
      return res.status(401).json({ error: 'No autorizado. La clave de acceso del expediente es incorrecta o no fue proporcionada.' });
    }

    if (!item.attachments) item.attachments = [];

    // Process attachments
    const processedAttachments = [];
    const sb = getSupabaseClient();
    if (sb) {
      await ensureStorageBucket(sb);
    }

    for (const file of attachments) {
      if (file.content && sb) {
        try {
          const isBase64DataUrl = file.content.startsWith('data:');
          let base64Data = file.content;
          if (isBase64DataUrl) {
            base64Data = file.content.replace(/^data:[\w/+-]+;base64,/, '');
          }

          let buffer: Buffer;
          if (file.type.startsWith('image/') || isBase64DataUrl) {
            buffer = Buffer.from(base64Data, 'base64');
          } else {
            buffer = Buffer.from(file.content, 'utf-8');
          }

          // Clean filename and ensure uniqueness with timestamp
          const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
          const uniquePrefix = Date.now();
          const storagePath = `${folio}/${uniquePrefix}_${cleanFileName}`;

          const { data: uploadData, error: uploadError } = await sb.storage
            .from('case-attachments')
            .upload(storagePath, buffer, {
              contentType: file.type,
              upsert: true
            });

          if (uploadError) {
            console.error(`Error uploading file ${file.name} to Supabase Storage:`, uploadError.message);
            // Fallback base64
            processedAttachments.push({
              name: file.name,
              size: file.size,
              type: file.type,
              content: file.content
            });
          } else {
            const { data: { publicUrl } } = sb.storage
              .from('case-attachments')
              .getPublicUrl(storagePath);

            console.log(`Uploaded additional ${file.name} to Supabase Storage! Public URL:`, publicUrl);
            processedAttachments.push({
              name: file.name,
              size: file.size,
              type: file.type,
              url: publicUrl
            });
          }
        } catch (err: any) {
          console.error(`Failed to upload attachment ${file.name}:`, err.message);
          processedAttachments.push({
            name: file.name,
            size: file.size,
            type: file.type,
            content: file.content
          });
        }
      } else {
        processedAttachments.push(file);
      }
    }

    // Append new attachments
    item.attachments = [...item.attachments, ...processedAttachments];

    cases[caseIndex] = item;
    await fs.writeFile(DB_FILE, JSON.stringify(cases, null, 2), 'utf-8');
    await syncCasesToSupabase(cases);

    res.json(item);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al agregar archivos adjuntos: ' + error.message });
  }
});

// POST /api/cases/:folio/clarification - Add or reply to clarification requests
app.post('/api/cases/:folio/clarification', async (req, res) => {
  try {
    const { reqId, question, answer } = req.body;
    await ensureDatabase();
    const data = await fs.readFile(DB_FILE, 'utf-8');
    const cases = JSON.parse(data);

    const caseIndex = cases.findIndex((c: any) => c.folio.toUpperCase() === req.params.folio.toUpperCase());
    if (caseIndex === -1) {
      return res.status(404).json({ error: 'Expediente no encontrado.' });
    }

    const item = cases[caseIndex];

    // Authenticate: Must match accessPin OR expected admin password
    const pinHeader = req.headers['x-case-pin'];
    const pinQuery = req.query.pin;
    const clientPin = (pinHeader || pinQuery || '').toString().trim();

    const adminHeader = req.headers['x-admin-password'] || req.headers['authorization'];
    const expectedAdminPassword = process.env.ADMIN_PASSWORD || '2003';
    const isAuthorizedAdmin = adminHeader === expectedAdminPassword || adminHeader === `Bearer ${expectedAdminPassword}`;

    const isAuthorizedClient = clientPin && item.accessPin && String(item.accessPin).trim() === clientPin;

    if (!isAuthorizedAdmin && !isAuthorizedClient) {
      return res.status(401).json({ error: 'No autorizado. La clave de acceso del expediente es incorrecta o no fue proporcionada.' });
    }

    if (question) {
      // Edgar asking a new question
      item.clarificationRequests.push({
        id: `req-${Date.now()}`,
        question,
        askedAt: new Date().toISOString()
      });
      item.status = 'Faltan Datos'; // Auto flag status
    } else if (reqId && answer !== undefined) {
      // Client answering a question
      const rIndex = item.clarificationRequests.findIndex((r: any) => r.id === reqId);
      if (rIndex !== -1) {
        item.clarificationRequests[rIndex].answer = answer;
        item.clarificationRequests[rIndex].answeredAt = new Date().toISOString();
        
        // Check if all answered, to restore status
        const pending = item.clarificationRequests.filter((r: any) => !r.answer).length;
        if (pending === 0 && item.status === 'Faltan Datos') {
          item.status = 'En Análisis';
        }
      }
    }

    cases[caseIndex] = item;
    await fs.writeFile(DB_FILE, JSON.stringify(cases, null, 2), 'utf-8');
    await syncCasesToSupabase(cases);
    res.json(item);
  } catch (error: any) {
    res.status(500).json({ error: 'Error en aclaraciones: ' + error.message });
  }
});

// POST /api/cases/:folio/chat - Chat with Gemini regarding a specific case
app.post('/api/cases/:folio/chat', adminAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'El mensaje es obligatorio.' });
    }

    await ensureDatabase();
    const data = await fs.readFile(DB_FILE, 'utf-8');
    const cases = JSON.parse(data);

    const caseIndex = cases.findIndex((c: any) => c.folio.toUpperCase() === req.params.folio.toUpperCase());
    if (caseIndex === -1) {
      return res.status(404).json({ error: 'Expediente no encontrado.' });
    }

    const item = cases[caseIndex];

    const ai = getGeminiClient();

    // Prepare conversation context for Gemini
    // Prepare attachments summary for Gemini prompt
    const attachmentsSummary = item.attachments && item.attachments.length > 0
      ? item.attachments.map((att: any) => `- Archivo: ${att.name} (${att.type || 'desconocido'})${att.url ? ` - URL: ${att.url}` : ''}`).join('\n')
      : 'Ninguno subido aún';

    // Prepare clarification requests summary
    const clarificationsSummary = item.clarificationRequests && item.clarificationRequests.length > 0
      ? item.clarificationRequests.map((req: any) => `- Pregunta: "${req.question}"\n  Respuesta del cliente: ${req.answer ? `"${req.answer}"` : 'Pendiente de responder'}`).join('\n')
      : 'Ninguna pregunta de aclaración formulada aún';

    const systemPrompt = `
    Eres el Socio Abogado Máster / Director Jurídico de Charlitron Despacho Inteligente, el asistente legal de inteligencia artificial personal del Lic. Edgar.
    Tu misión es brindarle asesoría procesal, consultoría legal y estrategia litigiosa de la más alta sofisticación técnica.
    Estás analizando el expediente con Folio: ${item.folio} del cliente ${item.clientName}.
    
    RESUMEN DEL EXPEDIENTE:
    - Cliente: ${item.clientName} (${item.clientEmail}, ${item.clientPhone})
    - Descripción de Hechos: ${item.description}
    - Pruebas adicionales: ${item.pastedEvidence || 'No especificadas'}
    - Análisis previo: ${JSON.stringify(item.aiAnalysis || {})}
    - Notas del Lic. Edgar: ${item.lawyerNotes || 'Sin notas del Lic. Edgar aún'}
    
    NUEVA INFORMACIÓN Y AVANCES:
    - Archivos Adjuntos / Evidencia en el expediente:
    ${attachmentsSummary}
    
    - Preguntas de Aclaración y Respuestas del Cliente:
    ${clarificationsSummary}
    
    REGLAS DE RESPUESTA DEL ABOGADO MÁSTER (SÉ RIGUROSO Y FORMAL):
    1. Edgar te hará preguntas sobre cómo defender al cliente, leyes aplicables, sugerencias de respuestas o análisis de riesgos.
    2. En cada respuesta jurídica, es un REQUISITO IMPERATIVO fundamentar tu opinión citando los ARTÍCULOS específicos, el NOMBRE de los códigos, reglamentos o leyes aplicables de la legislación mexicana (e.g. Código Civil Federal, Código de Comercio, Ley de Amparo, Ley de la Propiedad Industrial, Ley Federal de Derechos de Autor, Ley General de Títulos y Operaciones de Crédito, Ley Federal del Trabajo, etc.).
    3. Siempre que sea relevante o de apoyo técnico, incluye JURISPRUDENCIAS y TESIS AISLADAS de la Suprema Corte de Justicia de la Nación (SCJN) o Tribunales Colegiados de Circuito. Explica el rubro, criterio jurídico aplicable o su sentido, y cómo apoya la defensa del cliente o desestima el amago de la contraparte.
    4. Mantén siempre un tono de respeto profesional absoluto, refiriéndote a él como "Licenciado Edgar" o "Lic. Edgar", con lenguaje formal, sobrio, persuasivo y pulcro. Evita respuestas vagas, simplistas o de soporte técnico general; brinda criterio jurídico real y valioso de abogado litigante senior.
    `;

    // Map history to Gemini format (user/model roles)
    const chatHistory = item.chatHistory || [];
    const formattedHistory = chatHistory.map((h: any) => ({
      role: h.role,
      parts: [{ text: h.message }]
    }));

    // Start a chat session or send contents
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: [
        ...formattedHistory,
        { role: 'user', parts: [{ text: message }] }
      ],
      config: {
        systemInstruction: systemPrompt,
      }
    });

    const replyText = response.text || 'Sin respuesta';

    // Store in history
    if (!item.chatHistory) item.chatHistory = [];
    item.chatHistory.push({ role: 'user', message, timestamp: new Date().toISOString() });
    item.chatHistory.push({ role: 'model', message: replyText, timestamp: new Date().toISOString() });

    cases[caseIndex] = item;
    await fs.writeFile(DB_FILE, JSON.stringify(cases, null, 2), 'utf-8');
    await syncCasesToSupabase(cases);

    res.json({ reply: replyText, chatHistory: item.chatHistory });

  } catch (error: any) {
    console.error('AI chat error:', error);
    res.status(500).json({ error: 'Error al consultar a la IA: ' + error.message });
  }
});

// Configure Vite or Static Assets
async function startServer() {
  await ensureDatabase();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

if (process.env.VERCEL) {
  // On Vercel, the frontend is built and served separately as static files by the platform.
  // This module is only imported as a Serverless Function to handle /api/* routes,
  // so we must NOT call app.listen() or set up Vite/static middleware here.
} else {
  startServer();
}

export default app;

