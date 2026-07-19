import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, UserCheck, Briefcase, FileText, Scale, Clock, Globe, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ClientPortal from './components/ClientPortal';
import AdminDashboard from './components/AdminDashboard';

export default function App() {
  const [role, setRole] = useState<'client' | 'admin'>('client');
  const [currentTime, setCurrentTime] = useState<string>('');
  
  // States for hidden admin trigger
  const [logoClicks, setLogoClicks] = useState<number>(0);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(false);
  const [passwordError, setPasswordError] = useState<string>('');
  const [isVerifyingPassword, setIsVerifyingPassword] = useState<boolean>(false);
  const [adminPassword, setAdminPassword] = useState<string>('');
  
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Elegant dynamic clock for margin details
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogoClick = () => {
    // If already unlocked, no need to trigger again
    if (isAdminUnlocked) return;

    // Reset timer on each click
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }

    const nextClicks = logoClicks + 1;
    setLogoClicks(nextClicks);

    if (nextClicks >= 5) {
      setLogoClicks(0);
      setShowPasswordPrompt(true);
      setPasswordInput('');
      setPasswordError('');
    } else {
      // Clear click count if idle for 2 seconds
      clickTimerRef.current = setTimeout(() => {
        setLogoClicks(0);
      }, 2000);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifyingPassword(true);
    setPasswordError('');
    try {
      // Validate against the real ADMIN_PASSWORD configured server-side (.env)
      const res = await fetch('/api/supabase-diagnostics', {
        headers: { 'x-admin-password': passwordInput }
      });
      if (res.ok) {
        setAdminPassword(passwordInput);
        setIsAdminUnlocked(true);
        setRole('admin');
        setShowPasswordPrompt(false);
        setPasswordInput('');
        setPasswordError('');
      } else {
        setPasswordError('Contraseña incorrecta. Intente de nuevo.');
      }
    } catch (err) {
      setPasswordError('No se pudo verificar la contraseña. Revisa tu conexión.');
    } finally {
      setIsVerifyingPassword(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col font-sans">
      {/* Top Professional Navigation Header */}
      <header className="bg-slate-900 text-white shadow-md border-b border-slate-800 print:hidden shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row justify-between items-center gap-4">
          
          {/* Logo & Brand with hidden 5-click handler */}
          <div 
            onClick={handleLogoClick}
            className="flex items-center gap-2.5 cursor-pointer select-none active:scale-95 transition-all"
            title={!isAdminUnlocked ? "Despacho Inteligente" : undefined}
          >
            <div className="p-2 bg-indigo-600 rounded-xl text-white shadow shadow-indigo-600/30">
              <Scale className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h1 className="font-display font-bold text-base tracking-tight leading-none">Despacho Inteligente</h1>
              <p className="text-[10px] text-indigo-200 mt-0.5 font-medium">Recepción Jurídica Digital</p>
            </div>
          </div>

          {/* DUAL ROLE SWITCHER - ONLY visible when admin is unlocked via logo trick */}
          {isAdminUnlocked ? (
            <div className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700/50 items-center gap-1.5">
              <button
                onClick={() => setRole('client')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  role === 'client' 
                    ? 'bg-indigo-600 text-white shadow-sm' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" /> Portal de Clientes
              </button>
              <button
                onClick={() => setRole('admin')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  role === 'admin' 
                    ? 'bg-indigo-600 text-white shadow-sm' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Briefcase className="w-3.5 h-3.5" /> Despacho Admin
              </button>
              <button
                onClick={() => {
                  setRole('client');
                  setIsAdminUnlocked(false);
                }}
                className="text-rose-400 hover:text-rose-300 text-xs px-2.5 py-1.5 hover:bg-rose-500/10 rounded-lg font-semibold transition-all ml-1 cursor-pointer"
                title="Cerrar sesión de Administrador"
              >
                Salir
              </button>
            </div>
          ) : (
            // Discrete space holder
            <div className="text-xs text-slate-500 italic hidden sm:block">
              &nbsp;
            </div>
          )}

          {/* Clock details in margin */}
          <div className="hidden md:flex items-center gap-4 text-xs text-slate-400 font-medium">
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span className="font-mono">{currentTime || '--:--:--'}</span>
            </div>
            <div className="flex items-center gap-1 bg-slate-800 px-2 py-0.5 rounded-md text-[10px] text-indigo-300 font-bold uppercase tracking-wider">
              <Globe className="w-3 h-3" /> MX / LATAM
            </div>
          </div>

        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full flex flex-col justify-start">
        <AnimatePresence mode="wait">
          {role === 'client' ? (
            <motion.div
              key="client-portal-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="w-full"
            >
              <ClientPortal />
            </motion.div>
          ) : (
            <motion.div
              key="admin-dashboard-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="w-full"
            >
              <AdminDashboard adminPassword={adminPassword} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Hidden Admin Access Password Modal */}
      <AnimatePresence>
        {showPasswordPrompt && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="bg-white border border-slate-100 rounded-2xl shadow-2xl p-6 md:p-8 max-w-sm w-full text-left"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900">Despacho Admin</h3>
                  <p className="text-[10px] text-slate-500">Acceso restringido para personal autorizado</p>
                </div>
              </div>

              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Contraseña de Acceso
                  </label>
                  <input
                    type="password"
                    required
                    value={passwordInput}
                    onChange={e => setPasswordInput(e.target.value)}
                    placeholder="••••"
                    className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-center tracking-widest text-slate-800"
                    autoFocus
                  />
                  {passwordError && (
                    <p className="text-[10px] text-rose-500 font-semibold mt-1.5 text-center">
                      {passwordError}
                    </p>
                  )}
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordPrompt(false);
                      setLogoClicks(0);
                    }}
                    className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isVerifyingPassword}
                    className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-xs rounded-xl shadow-sm hover:shadow transition-all cursor-pointer"
                  >
                    {isVerifyingPassword ? 'Verificando...' : 'Acceder'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer Details */}
      <footer className="bg-white border-t border-slate-200/60 py-4 text-center text-xs text-slate-400 font-medium print:hidden shrink-0 mt-12">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-2">
          <p>© 2026 Despacho Inteligente. Todos los derechos reservados.</p>
          <p className="flex items-center gap-1">
            Supervisado por profesionales jurídicos <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          </p>
        </div>
      </footer>
    </div>
  );
}
