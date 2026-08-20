import React, { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Server,
  Cpu,
  ShieldCheck,
  Globe,
  Bot,
  Zap,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { HealthReport, ProxyStats } from '../types';

interface HealthViewProps {
  token: string;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const HealthView: React.FC<HealthViewProps> = ({ token, showToast }) => {
  const [healthData, setHealthData] = useState<{ report: HealthReport; proxyStats: ProxyStats } | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/health', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setHealthData(data);
    } catch (e: any) {
      showToast('Salomatlik ma\'lumotlarini yuklashda xatolik', 'error');
    } finally {
      setLoading(false);
    }
  };

  const triggerHealthCheck = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/health/trigger', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setHealthData({ report: data.report, proxyStats: data.proxyStats });
        showToast('30-daqiqalik tizim tekshiruvi muvaffaqiyatli o\'tkazildi!', 'success');
      }
    } catch (e) {
      showToast('Tekshiruvni ishga tushirishda xatolik', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const report = healthData?.report;
  const proxyStats = healthData?.proxyStats;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header Card with Manual Trigger */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">Avtomatik 30-Daqiqalik Monitoring</h3>
              <span
                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                  report?.status === 'HEALTHY'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : report?.status === 'DEGRADED'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                }`}
              >
                {report?.status === 'HEALTHY' ? '🟢 A\'LO (HEALTHY)' : report?.status || 'FAOL'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Oxirgi tekshirilgan vaqt: {report?.timestamp ? new Date(report.timestamp).toLocaleTimeString('uz-UZ') : 'Hozir'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="Yangilash"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={triggerHealthCheck}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-50"
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>Qayta Tekshirish (Test Now)</span>
          </button>
        </div>
      </div>

      {/* 4 Core Pillars Health Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. OpenBudget API */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Open Budget API</span>
            <Globe className="w-4 h-4 text-indigo-400" />
          </div>
          <h4 className="text-xl font-bold text-white">
            {report?.openBudget.isAlive ? '🟢 Faol & Ulanish bor' : '🔴 Uzilish'}
          </h4>
          <p className="text-xs text-slate-400">
            Javob tezligi: <b className="text-emerald-400 font-mono">{report?.openBudget.latencyMs || 0}ms</b>
          </p>
        </div>

        {/* 2. Captcha Solver */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Captcha OCR Solver</span>
            <Cpu className="w-4 h-4 text-purple-400" />
          </div>
          <h4 className="text-xl font-bold text-white">
            {report?.captcha.isAlive ? '🟢 Tesseract OCR Tayyor' : '🟡 Zaxirada'}
          </h4>
          <p className="text-xs text-slate-400">
            Yechish tezligi: <b className="text-purple-400 font-mono">{report?.captcha.latencyMs || 0}ms</b>
          </p>
        </div>

        {/* 3. Proxylar Salomatligi */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Proxy Hovuzi</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <h4 className="text-xl font-bold text-white">
            {proxyStats?.total ? `${proxyStats.alive} / ${proxyStats.total} ta Faol` : 'To\'g\'ridan-to\'g\'ri (Direct)'}
          </h4>
          <p className="text-xs text-slate-400">
            Holati: <b className={proxyStats?.enabled ? 'text-emerald-400' : 'text-slate-400'}>
              {proxyStats?.enabled ? 'Rotatsiya Faol' : 'Sotib olinganda ulanadi'}
            </b>
          </p>
        </div>

        {/* 4. Telegram Botlar */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Telegram Botlar</span>
            <Bot className="w-4 h-4 text-cyan-400" />
          </div>
          <h4 className="text-xl font-bold text-white">
            {report?.bots.online} / {report?.bots.total} ta Online
          </h4>
          <p className="text-xs text-emerald-400">
            Avtomat Supervisor faol (60s loop)
          </p>
        </div>
      </div>

      {/* Issues / Alerts if any */}
      {report?.issues && report.issues.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-amber-400">
            <AlertTriangle className="w-4 h-4" />
            <span>Aniqlangan Ogohlantirishlar ({report.issues.length}):</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-slate-300 pl-1">
            {report.issues.map((issue, idx) => (
              <li key={idx}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Proxy Details Pool Table */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              Ulangan Proxylar Ro'yxati & Salomatligi
            </h4>
            <p className="text-xs text-slate-400">
              Har 30 daqiqada avtomatik sinovdan o'tkaziladi. Nosoz proxylar chetlatiladi.
            </p>
          </div>
        </div>

        {(!proxyStats?.pool || proxyStats.pool.length === 0) ? (
          <div className="py-8 text-center text-slate-500 text-xs bg-slate-950/50 rounded-xl border border-slate-800/80">
            <Globe className="w-8 h-8 mx-auto mb-2 text-slate-600 opacity-40" />
            Hozircha maxsus proxy ro'yxati kiritilmagan (To'g'ridan-to'g'ri internet orqali ishlamoqda).
            <p className="text-[11px] text-slate-400 mt-1">
              Sotib olingan proxylarni <code>.env</code> dagi <code>PROXY_LIST</code> ga kiritishingiz mumkin.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/80 text-slate-400 font-semibold uppercase text-[10px]">
                <tr>
                  <th className="p-3">Host & Port</th>
                  <th className="p-3">Protokol</th>
                  <th className="p-3">Holat</th>
                  <th className="p-3">Latency</th>
                  <th className="p-3">Xatolar Soni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {proxyStats.pool.map((p, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30">
                    <td className="p-3 font-mono text-white">{p.host}:{p.port}</td>
                    <td className="p-3 uppercase text-[10px] font-bold text-slate-400">{p.protocol}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        p.isAlive
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}>
                        {p.isAlive ? '🟢 Faol' : '🔴 Nosoz'}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-slate-300">{p.latencyMs ? `${p.latencyMs}ms` : '-'}</td>
                    <td className="p-3 text-slate-400">{p.failCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
