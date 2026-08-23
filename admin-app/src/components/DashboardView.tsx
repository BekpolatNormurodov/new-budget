import React, { useState } from 'react';
import {
  Vote,
  Wallet,
  Bot,
  Users,
  TrendingUp,
  Activity,
  CheckCircle2,
  Hourglass,
  ArrowRight,
  ShieldCheck,
  Zap,
  Target,
  ExternalLink,
  Sparkles,
  DollarSign,
  AlertTriangle,
  Send,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { DashboardStats, BotInstanceItem, VoteItem, WithdrawalItem } from '../types';
import { formatSum, formatTashkentTime } from '../utils/format';
import { BotVotesModal } from './BotVotesModal';

interface DashboardViewProps {
  stats: DashboardStats | null;
  onNavigateTab: (tab: 'dashboard' | 'bots' | 'votes' | 'withdrawals' | 'users' | 'health') => void;
  onApproveVote: (id: number) => void;
  onOpenApproveWithdrawal: (item: WithdrawalItem) => void;
  onOpenEditBot: (bot: BotInstanceItem) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  onNavigateTab,
  onApproveVote,
  onOpenApproveWithdrawal,
  onOpenEditBot,
}) => {
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [selectedBotForVotes, setSelectedBotForVotes] = useState<BotInstanceItem | null>(null);
  const [syncingBotId, setSyncingBotId] = useState<number | null>(null);

  const handleSyncSingleBot = async (botId: number) => {
    setSyncingBotId(botId);
    try {
      const res = await fetch(`/api/admin/bots/${botId}/sync`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        window.location.reload();
      }
    } catch (e) {
      alert('Botni yangilashda xatolik yuz berdi');
    } finally {
      setSyncingBotId(null);
    }
  };

  const handleTestMarketingBroadcast = async () => {
    setIsBroadcasting(true);
    try {
      const res = await fetch('/api/admin/broadcast/marketing-trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot: 'TEST' }),
      });
      const data = await res.json();
      alert(`📢 Test Eslatma Xabarnomasi yakunlandi!\n\nJami yuborildi: ${data.sentCount} ta xabar\nBloklangan/Nofaol: ${data.failedCount} ta\nVaqt: ${data.durationMs}ms`);
    } catch (e) {
      alert('Xabar yuborishda xatolik yuz berdi.');
    } finally {
      setIsBroadcasting(false);
    }
  };

  if (!stats) return null;

  const totalTargetVotes = stats.bots.reduce((acc, b) => acc + (b.targetVotes || 5000), 0) || 5000;
  const overallVotePercentage = Math.min(100, Math.round((stats.totalVotes / totalTargetVotes) * 100 * 10) / 10);

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-300">
      {/* Open Budget 10-Day Season Tracker Banner */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-indigo-50 via-slate-50 to-indigo-50 dark:from-slate-900 dark:via-indigo-950/60 dark:to-slate-900 border border-amber-500/30 shadow-lg dark:shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 dark:text-amber-400 flex-shrink-0">
            <Sparkles className="w-4 h-4 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">Open Budget 2026 — Ovoz Berish Mavsumi</h4>
              <span className="text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                22-Avgust — 31-Avgust (10 Kun)
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400">
              10 kunlik ovoz yig'ish tsikli. Har bir bo'limda sana va bot filtrlari faol.
            </p>
          </div>
        </div>

        <button
          onClick={() => onNavigateTab('votes')}
          className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all flex-shrink-0 cursor-pointer"
        >
          <span>Ovozlarni Ko'rish</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Ovozlar */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-md dark:shadow-xl relative overflow-hidden group hover:border-slate-300 dark:hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Jami Ovozlar</span>
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              <Vote className="w-5 h-5" />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white">{formatSum(stats.totalVotes)} ta</h3>
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>+{formatSum(stats.todayVotes)} ta bugun</span>
              <span className="text-slate-400 dark:text-slate-500 font-normal ml-1">({stats.pendingVotesCount} ta kutilmoqda)</span>
            </div>
          </div>
          {/* Progress Bar */}
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              <span>Umumiy reja:</span>
              <span className="text-slate-800 dark:text-white font-medium">{overallVotePercentage}% ({formatSum(stats.totalVotes)} / {formatSum(totalTargetVotes)})</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.max(2, overallVotePercentage)}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* 2. Moliyaviy Oqim */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-md dark:shadow-xl relative overflow-hidden group hover:border-slate-300 dark:hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">To'lab Berilgan Mablag'</span>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{formatSum(stats.totalPaid)} so'm</h3>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
              <Hourglass className="w-3.5 h-3.5 text-amber-500" />
              <span>Kutilayotgan arizalar: </span>
              <b className="text-amber-600 dark:text-amber-400 font-bold">{stats.pendingWithdrawalsCount} ta</b>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
            <span className="text-slate-500 dark:text-slate-400">Yechish arizalari:</span>
            <button
              onClick={() => onNavigateTab('withdrawals')}
              className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-semibold flex items-center gap-1 cursor-pointer"
            >
              Ko'rish <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* 3. Botlar Ekosistemasi */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-md dark:shadow-xl relative overflow-hidden group hover:border-slate-300 dark:hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Faol Botlar</span>
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
              <Bot className="w-5 h-5" />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white">{stats.onlineBotsCount} / {stats.totalBotsCount} ta</h3>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Barcha botlar doimiy supervisor nazoratida
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
            <span className="text-slate-500 dark:text-slate-400">Botlar ro'yxati:</span>
            <button
              onClick={() => onNavigateTab('bots')}
              className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-semibold flex items-center gap-1 cursor-pointer"
            >
              Boshqarish <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* 4. Foydalanuvchilar */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-md dark:shadow-xl relative overflow-hidden group hover:border-slate-300 dark:hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Foydalanuvchilar</span>
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white">{formatSum(stats.totalUsers)} ta</h3>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              +{formatSum(stats.todayUsers)} ta yangi bugun
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
            <span className="text-slate-500 dark:text-slate-400">Mijozlar bazasi:</span>
            <button
              onClick={() => onNavigateTab('users')}
              className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-semibold flex items-center gap-1 cursor-pointer"
            >
              Barchasi <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 15-Daqiqalik Monitoring & System Health Banner Widget */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-100 via-indigo-50/50 to-slate-100 dark:from-slate-900 dark:via-indigo-950/40 dark:to-slate-900 border border-indigo-500/20 shadow-md dark:shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 flex-shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Avtomatik 15-Daqiqalik Tizim Monitoringi</h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                🟢 HEALTHY
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              OpenBudget API, Captcha OCR Solver, Proxylar hovuzi va Telegram botlar doimiy nazorat ostida.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleTestMarketingBroadcast}
            disabled={isBroadcasting}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Barcha botlardagi foydalanuvchilarga sinov xabarnomasini yuborish"
          >
            <Send className="w-3.5 h-3.5" />
            {isBroadcasting ? 'Yuborilmoqda...' : '📢 Eslatma Yuborish (Test)'}
          </button>

          <button
            onClick={() => onNavigateTab('health')}
            className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-300 dark:border-slate-700 transition-colors cursor-pointer"
          >
            Batafsil Monitoring
          </button>
        </div>
      </div>

      {/* Mahalla Targets Cards Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Target className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Mahallalar & Ovoz Berish Rejasi
          </h3>
          <button
            onClick={() => onNavigateTab('bots')}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-semibold flex items-center gap-1 cursor-pointer"
          >
            Barchasini ko'rish <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.bots.map((bot) => {
            const percentage = Math.min(100, Math.round((bot.currentVotes / (bot.targetVotes || 5000)) * 100 * 10) / 10);
            const remaining = Math.max(0, (bot.targetVotes || 5000) - bot.currentVotes);

            return (
              <div
                key={bot.id}
                className="p-5 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col justify-between shadow-sm dark:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-600/10 dark:bg-indigo-600/20 border border-indigo-500/20 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
                        {bot.mahallaName.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">{bot.mahallaName}</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {bot.botUsername ? `@${bot.botUsername}` : bot.name}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSyncSingleBot(bot.id)}
                        disabled={syncingBotId === bot.id}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition-all active:scale-95 cursor-pointer shadow-sm disabled:opacity-50"
                        title="OpenBudget rasmiy serveri bilan sinxronlash"
                      >
                        <RefreshCw className={`w-3 h-3 ${syncingBotId === bot.id ? 'animate-spin' : ''}`} />
                        <span>{syncingBotId === bot.id ? 'Yangilanmoqda...' : 'Yangilash'}</span>
                      </button>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          bot.status === 'ONLINE'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {bot.status === 'ONLINE' ? '🟢 Online' : '⏸ To\'xtatilgan'}
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1.5 mb-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">🤖 Biz orqali: <b>{formatSum(bot.currentVotes)}</b> ta</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">🌐 OpenBudget: {formatSum(bot.openBudgetVotes || bot.currentVotes)} ta</span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(2, percentage)}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-400 dark:text-slate-500">
                      <span>Reja: {formatSum(bot.targetVotes)} ta ({percentage}%)</span>
                      <span>Qoldi: {formatSum(remaining)} ta</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedBotForVotes(bot)}
                      className="w-full mt-2 py-1.5 px-3 rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 text-xs font-bold border border-indigo-500/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>📋 Ovozlarni Ko'rish</span>
                    </button>
                  </div>
                </div>

                {/* Bottom Rewards & Actions */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Mukofot:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">{formatSum(bot.voteReward || 30000)} so'm</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {bot.botUsername && (
                      <a
                        href={`https://t.me/${bot.botUsername}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="Telegramda ochish"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    <button
                      onClick={() => onOpenEditBot(bot)}
                      className="px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                    >
                      Tahrirlash
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2-Column Split: Pending Votes & Pending Withdrawals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Votes Section */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-md dark:shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Vote className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Kutilayotgan Ovozlar ({stats.pendingVotesCount})</h3>
            </div>
            <button
              onClick={() => onNavigateTab('votes')}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-semibold cursor-pointer"
            >
              Barchasini ko'rish
            </button>
          </div>

          {stats.pendingVotes.length === 0 ? (
            <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs">
              <CheckCircle2 className="w-8 h-8 text-emerald-500/40 mx-auto mb-2" />
              Hozirda kutilayotgan ovozlar yo'q. Barcha ovozlar tasdiqlangan!
            </div>
          ) : (
            <div className="space-y-2">
              {stats.pendingVotes.slice(0, 5).map((vote) => (
                <div
                  key={vote.id}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">+{vote.phone}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {vote.user?.firstName || vote.user?.username || 'Foydalanuvchi'} • {formatTashkentTime(vote.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">+{formatSum(vote.rewardAmount || 30000)} so'm</span>
                    <button
                      onClick={() => onApproveVote(vote.id)}
                      className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm transition-colors cursor-pointer"
                    >
                      Tasdiqlash
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending Withdrawals Section */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-md dark:shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <Wallet className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Pul Yechish So'rovlari ({stats.pendingWithdrawalsCount})</h3>
            </div>
            <button
              onClick={() => onNavigateTab('withdrawals')}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-semibold cursor-pointer"
            >
              Barchasini ko'rish
            </button>
          </div>

          {stats.pendingWithdrawals.length === 0 ? (
            <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs">
              <CheckCircle2 className="w-8 h-8 text-emerald-500/40 mx-auto mb-2" />
              Barcha pul yechish arizalari to'lab berilgan!
            </div>
          ) : (
            <div className="space-y-2">
              {stats.pendingWithdrawals.slice(0, 5).map((w) => (
                <div
                  key={w.id}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <p className="font-bold text-rose-600 dark:text-rose-400">{formatSum(w.amount)} so'm</p>
                    <p className="text-[11px] text-slate-700 dark:text-slate-300 font-mono">
                      {w.paymentMethod}: {w.accountDetails}
                    </p>
                    {w.cardHolder && <p className="text-[10px] text-slate-500 dark:text-slate-400">Egasi: {w.cardHolder}</p>}
                  </div>
                  <button
                    onClick={() => onOpenApproveWithdrawal(w)}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors cursor-pointer"
                  >
                    Chek Yuklash & To'lash
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bot Votes & Captcha Modal */}
      <BotVotesModal
        bot={selectedBotForVotes}
        isOpen={Boolean(selectedBotForVotes)}
        onClose={() => setSelectedBotForVotes(null)}
      />
    </div>
  );
};
