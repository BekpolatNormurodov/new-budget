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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Server tekshiruvida xatolik yuz berdi');
      }

      const data = await res.json();
      if (data && (data.report || data.success)) {
        setHealthData({ report: data.report, proxyStats: data.proxyStats });
        showToast('30-daqiqalik tizim tekshiruvi muvaffaqiyatli o\'tkazildi!', 'success');
      }
    } catch (e: any) {
      showToast(e.message || 'Tekshiruvni ishga tushirishda xatolik', 'error');
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
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-md dark:shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Avtomatik 30-Daqiqalik Monitoring</h3>
              <span
                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                  report?.status === 'HEALTHY'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : report?.status === 'DEGRADED'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                }`}
              >
                {report?.status === 'HEALTHY' ? '🟢 A\'LO (HEALTHY)' : report?.status || 'FAOL'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Oxirgi tekshirilgan vaqt: {report?.timestamp ? new Date(report.timestamp).toLocaleTimeString('uz-UZ') : 'Hozir'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
            title="Yangilash"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={triggerHealthCheck}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>Qayta Tekshirish (Test Now)</span>
          </button>
        </div>
      </div>

      {/* 4 Core Pillars Health Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. OpenBudget API */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-md dark:shadow-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Open Budget API</span>
            <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h4 className="text-xl font-bold text-slate-900 dark:text-white">
            {report?.openBudget.isAlive ? '🟢 Faol & Ulanish bor' : '🔴 Uzilish'}
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Javob tezligi: <b className="text-emerald-600 dark:text-emerald-400 font-mono">{report?.openBudget.latencyMs || 0}ms</b>
          </p>
        </div>

        {/* 2. Captcha Solver */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-md dark:shadow-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Captcha OCR Solver</span>
            <Cpu className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          <h4 className="text-xl font-bold text-slate-900 dark:text-white">
            {report?.captcha.isAlive ? '🟢 Tesseract OCR Tayyor' : '🟡 Zaxirada'}
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Yechish tezligi: <b className="text-purple-600 dark:text-purple-400 font-mono">{report?.captcha.latencyMs || 0}ms</b>
          </p>
        </div>

        {/* 3. Proxylar Salomatligi */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-md dark:shadow-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Proxy Hovuzi</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h4 className="text-xl font-bold text-slate-900 dark:text-white">
            {proxyStats?.total ? `${proxyStats.alive} / ${proxyStats.total} ta Faol` : 'To\'g\'ridan-to\'g\'ri (Direct)'}
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Holati: <b className={proxyStats?.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}>
              {proxyStats?.enabled ? 'Rotatsiya Faol' : 'Sotib olinganda ulanadi'}
            </b>
          </p>
        </div>

        {/* 4. Telegram Botlar */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-md dark:shadow-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Telegram Botlar</span>
            <Bot className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          </div>
          <h4 className="text-xl font-bold text-slate-900 dark:text-white">
            {report?.bots.online} / {report?.bots.total} ta Online
          </h4>
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Avtomat Supervisor faol (60s loop)
          </p>
        </div>
      </div>

      {/* Issues / Alerts if any */}
      {report?.issues && report.issues.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4" />
            <span>Aniqlangan Ogohlantirishlar ({report.issues.length}):</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300 pl-1">
            {report.issues.map((issue, idx) => (
              <li key={idx}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Proxy Details Pool Table */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-md dark:shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Ulangan Proxylar Ro'yxati & Salomatligi
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Har 30 daqiqada avtomatik sinovdan o'tkaziladi. Nosoz proxylar chetlatiladi.
            </p>
          </div>
        </div>

        {(!proxyStats?.pool || proxyStats.pool.length === 0) ? (
          <div className="py-8 text-center text-slate-500 dark:text-slate-400 text-xs bg-slate-50 dark:bg-slate-950/50 rounded-xl border border-slate-200 dark:border-slate-800/80">
            <Globe className="w-8 h-8 mx-auto mb-2 text-slate-400 dark:text-slate-600 opacity-40" />
            Hozircha qo'shimcha proxy kiritilmagan. So'rovlar to'g'ridan-to'g'ri (Direct) rejimda yuborilmoqda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3.5">Proxy Manzili</th>
                  <th className="p-3.5">Protokol</th>
                  <th className="p-3.5">Holati</th>
                  <th className="p-3.5">Kechikish (Latency)</th>
                  <th className="p-3.5">Xatolar soni</th>
                  <th className="p-3.5">Oxirgi tekshiruv</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {proxyStats.pool.map((proxy, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="p-3.5 font-mono text-slate-900 dark:text-white font-bold">{proxy.host}:{proxy.port}</td>
                    <td className="p-3.5 uppercase font-semibold text-indigo-600 dark:text-indigo-400">{proxy.protocol}</td>
                    <td className="p-3.5">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          proxy.isAlive
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                        }`}
                      >
                        {proxy.isAlive ? '🟢 Faol' : '🔴 Uzilgan'}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono">{proxy.latencyMs ? `${proxy.latencyMs}ms` : '-'}</td>
                    <td className="p-3.5">{proxy.failCount || 0} marta</td>
                    <td className="p-3.5 text-slate-500 dark:text-slate-400">
                      {proxy.lastCheckedAt ? new Date(proxy.lastCheckedAt).toLocaleTimeString('uz-UZ') : '-'}
                    </td>
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
