import React, { useState } from 'react';
import {
  ShieldCheck,
  Phone,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  AlertCircle,
  Sparkles,
  KeyRound,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: (token: string, admin: any) => void;
}

const DESIGNATED_ADMIN_PRESETS = [
  {
    name: 'Elbek Muxtorov',
    phone: '+998943489900',
    displayPhone: '+998 94 348 99 00',
    role: 'Tizim Rahbari & Bosh Admin',
    badge: '👑 Rahbar',
    avatar: '👑',
    defaultPassword: 'Elbek#Budget2026!',
  },
  {
    name: 'Xurshid Ismoilov',
    phone: '+998950642827',
    displayPhone: '+998 95 064 28 27',
    role: 'Bosh Dasturchi & DevOps',
    badge: '⚡️ DevOps',
    avatar: '⚡️',
    defaultPassword: 'Khurshid#Dev2026!',
  },
  {
    name: 'Jonibek Ismoilov',
    phone: '+998990652651',
    displayPhone: '+998 99 065 26 51',
    role: 'Menejer & Nazoratchi',
    badge: '💼 Menejer',
    avatar: '💼',
    defaultPassword: 'Jonibek#Open2026!',
  },
  {
    name: 'Test Administrator',
    phone: '+998901234567',
    displayPhone: '+998 90 123 45 67',
    role: 'Standart Tizim Admini',
    badge: '🛡 Test',
    avatar: '🛡',
    defaultPassword: 'OpenBudget#2026!',
  },
];

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [phone, setPhone] = useState(DESIGNATED_ADMIN_PRESETS[0].phone);
  const [password, setPassword] = useState(DESIGNATED_ADMIN_PRESETS[0].defaultPassword);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedPreset = DESIGNATED_ADMIN_PRESETS.find(
    (p) => p.phone === phone || p.phone.replace(/[^0-9]/g, '') === phone.replace(/[^0-9]/g, '')
  );

  const handleSelectAdmin = (admin: typeof DESIGNATED_ADMIN_PRESETS[0]) => {
    setPhone(admin.phone);
    setPassword(admin.defaultPassword);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Telefon raqam yoki maxfiy parol noto\'g\'ri!');
      }

      const data = await res.json();
      localStorage.setItem('ob_admin_token', data.token);
      localStorage.setItem('ob_admin_user', JSON.stringify(data.admin));
      onLoginSuccess(data.token, data.admin);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden bg-slate-950">
      {/* Background Decorative Mesh Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/15 rounded-full blur-3xl pointer-events-none translate-x-1/2 translate-y-1/2"></div>
      <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2"></div>

      <div className="max-w-md w-full rounded-3xl bg-slate-900/95 backdrop-blur-2xl p-6 sm:p-8 space-y-6 shadow-2xl border border-slate-800/90 relative z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-500 text-white shadow-lg shadow-indigo-500/25 mb-1">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              Open Budget 2026
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              SECURE
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Multi-Bot Orchestrator & Boshqaruv Markazi
          </p>
        </div>

        {/* 3 ta Mas'ul Admin Tanlash (Quick 1-Tap Selector) */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              <span>Admin Hisobini Tanlang:</span>
            </span>
            <span className="text-[10px] text-slate-500 font-normal">3 ta mas'ul admin</span>
          </label>

          <div className="grid grid-cols-2 gap-2">
            {DESIGNATED_ADMIN_PRESETS.map((admin) => {
              const isSelected = selectedPreset?.phone === admin.phone;

              return (
                <button
                  key={admin.phone}
                  type="button"
                  onClick={() => handleSelectAdmin(admin)}
                  className={`p-2.5 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                    isSelected
                      ? 'bg-gradient-to-b from-indigo-950/80 to-slate-900 border-indigo-500/80 shadow-md shadow-indigo-500/20 ring-1 ring-indigo-500/40'
                      : 'bg-slate-950/70 hover:bg-slate-800/80 border-slate-800/90 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs">{admin.avatar}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      isSelected
                        ? 'bg-indigo-500/30 text-indigo-200 border border-indigo-400/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {admin.badge}
                    </span>
                  </div>

                  <div>
                    <p className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                      {admin.name}
                    </p>
                    <p className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">
                      {admin.displayPhone}
                    </p>
                  </div>

                  {isSelected && (
                    <div className="absolute top-1 right-1">
                      <CheckCircle2 className="w-3 h-3 text-indigo-400" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2 animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Inputs */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Phone Input */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-indigo-400" />
              <span>Telefon Raqam</span>
            </label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+998 94 348 99 00"
              className="w-full px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-slate-700 focus:border-indigo-500 rounded-xl text-white font-mono text-xs focus:outline-none transition-colors shadow-inner"
            />
          </div>

          {/* Password Input */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-indigo-400" />
                <span>Maxfiy Parol</span>
              </span>
              <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                <KeyRound className="w-2.5 h-2.5" />
                Kuchli Parol
              </span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Maxfiy parolni kiriting"
                className="w-full px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-slate-700 focus:border-indigo-500 rounded-xl text-white font-mono text-xs focus:outline-none pr-10 transition-colors shadow-inner"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white transition-colors"
                title="Parolni ko'rsatish"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Active Admin Details Banner */}
          {selectedPreset && (
            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span>{selectedPreset.avatar}</span>
                <span className="font-semibold text-slate-300">{selectedPreset.name}</span>
                <span className="text-[10px] text-slate-500">• {selectedPreset.role}</span>
              </div>
              <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                Himoyalangan
              </span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 active:scale-98"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Tekshirilmoqda...</span>
              </>
            ) : (
              <>
                <span>Boshqaruv Paneliga Kirish</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        {/* Security & System Info Footer */}
        <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <KeyRound className="w-3 h-3 text-emerald-400" />
            256-Bit SSL Shifrlash
          </span>
          <span>Open Budget Multi-Bot v2.0</span>
        </div>
      </div>
    </div>
  );
};
