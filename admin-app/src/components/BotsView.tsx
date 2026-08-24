import React, { useState } from 'react';
import {
  Bot,
  PlusCircle,
  Play,
  Square,
  Edit2,
  Trash2,
  ExternalLink,
  Search,
  Filter,
  LayoutGrid,
  List,
  Target,
  Image,
  Sparkles,
  Send,
  RefreshCw,
  Eye,
  Vote,
} from 'lucide-react';
import { BotInstanceItem } from '../types';
import { formatSum } from '../utils/format';
import { ProDropdown } from './ProDropdown';
import { MarketingBroadcastModal } from './MarketingBroadcastModal';
import { BotVotesModal } from './BotVotesModal';

interface BotsViewProps {
  bots: BotInstanceItem[];
  onOpenAddBot: () => void;
  onOpenEditBot: (bot: BotInstanceItem) => void;
  onStartBot: (id: number) => void;
  onStopBot: (id: number) => void;
  onDeleteBot: (id: number, name: string) => void;
}

export const BotsView: React.FC<BotsViewProps> = ({
  bots,
  onOpenAddBot,
  onOpenEditBot,
  onStartBot,
  onStopBot,
  onDeleteBot,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ONLINE' | 'STOPPED'>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [selectedBotForVotes, setSelectedBotForVotes] = useState<BotInstanceItem | null>(null);
  const [syncingBotId, setSyncingBotId] = useState<number | null>(null);

  const filteredBots = bots.filter((b) => {
    const matchesSearch =
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.mahallaName.toLowerCase().includes(search.toLowerCase()) ||
      (b.botUsername && b.botUsername.toLowerCase().includes(search.toLowerCase())) ||
      b.mahallaId.includes(search);

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ONLINE' && b.status === 'ONLINE') ||
      (statusFilter === 'STOPPED' && b.status !== 'ONLINE');

    return matchesSearch && matchesStatus;
  });

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncVotes = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/admin/bots/sync-votes', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        window.location.reload();
      }
    } catch (e) {
      alert('Sinxronlashda xatolik yuz berdi');
    } finally {
      setIsSyncing(false);
    }
  };

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

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Controls & Filters Bar */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-md dark:shadow-xl space-y-3 transition-colors">
        {/* Row 1: Search & Filter */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
          <div className="relative sm:col-span-7">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Bot yoki mahalla qidirish..."
              className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div className="sm:col-span-5">
            <ProDropdown
              options={[
                { value: 'ALL', label: 'Barcha Holatlar', badge: `${bots.length}` },
                { value: 'ONLINE', label: '🟢 Faol (Online)', badge: `${bots.filter(b => b.status === 'ONLINE').length}` },
                { value: 'STOPPED', label: '⏸ To\'xtatilgan', badge: `${bots.filter(b => b.status !== 'ONLINE').length}` },
              ]}
              value={statusFilter}
              onChange={(val) => setStatusFilter(val as any)}
              icon={<Filter className="w-3.5 h-3.5" />}
            />
          </div>
        </div>

        {/* Row 2: Action Buttons (Responsive Horizontal Scroll on Mobile) */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none pt-1 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Add Bot Button */}
            <button
              onClick={onOpenAddBot}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-600/30 transition-all active:scale-95 cursor-pointer flex-shrink-0"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Yangi Bot</span>
            </button>

            {/* Marketing & Ad Broadcast Button */}
            <button
              onClick={() => setIsBroadcastModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-bold rounded-xl shadow-md shadow-orange-500/20 transition-all active:scale-95 cursor-pointer flex-shrink-0"
              title="Barcha bot foydalanuvchilariga xabar yuborish"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Reklama</span>
            </button>

            {/* 15-Minute Live Vote Sync Trigger */}
            <button
              onClick={handleSyncVotes}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 transition cursor-pointer disabled:opacity-50 flex-shrink-0"
              title="Har 15 minutda avtomatik olinadigan ovozlar sonini yangilash"
            >
              <Sparkles className={`w-3.5 h-3.5 text-indigo-500 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Yangilanmoqda...' : '15m Yangilash'}</span>
            </button>
          </div>

          {/* View Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-1 text-slate-500 dark:text-slate-400 flex-shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Kataklar ko'rinishi"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'table' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Jadval ko'rinishi"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBots.map((bot) => {
            const target = bot.targetVotes || 5000;
            const percentage = Math.min(100, Math.round((bot.currentVotes / target) * 100 * 10) / 10);
            const isOnline = bot.status === 'ONLINE';

            return (
              <div
                key={bot.id}
                className="group relative rounded-3xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 shadow-lg hover:shadow-2xl transition-all duration-300 flex flex-col justify-between overflow-hidden p-5"
              >
                {/* Top Subtle Ambient Glow */}
                <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl pointer-events-none transition-opacity duration-500 ${
                  isOnline ? 'bg-emerald-500/15 group-hover:bg-emerald-500/25' : 'bg-rose-500/10'
                }`} />

                <div>
                  {/* Header: Avatar, Name, Status */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="relative shrink-0">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 flex items-center justify-center text-white font-black text-lg shadow-md shadow-indigo-500/20">
                          {bot.mahallaName.charAt(0)}
                        </div>
                        <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-900 ${
                          isOnline ? 'bg-emerald-500' : 'bg-slate-400'
                        }`} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {bot.mahallaName}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400 truncate">
                            {bot.botUsername ? `@${bot.botUsername}` : bot.name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            • #{bot.mahallaId?.slice(-6) || bot.id}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5">
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

                      <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${
                        isOnline
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 shadow-sm shadow-emerald-500/10'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                        <span>{isOnline ? 'Online' : "To'xtatilgan"}</span>
                      </div>
                    </div>
                  </div>

                  {/* 📜 Loyiha Nomi & OpenBudget Ajratilgan Summasi */}
                  {bot.description && (
                    <div className="mb-4 p-3 rounded-2xl bg-indigo-50/50 dark:bg-slate-950/70 border border-indigo-100 dark:border-indigo-900/30 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                          <span>🏛 Loyiha Maqsadi:</span>
                        </span>
                        {bot.grantedAmount ? (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            💰 {formatSum(bot.grantedAmount)} so'm
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                        {bot.description}
                      </p>
                    </div>
                  )}

                  {/* 🎯 Progress & Goal Card */}
                  <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/60 space-y-2.5 mb-4">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          Reja: <b className="font-bold font-mono text-slate-900 dark:text-white">{formatSum(bot.targetVotes || 5000)}</b> ta
                        </span>
                      </div>
                      <span className="font-mono font-extrabold text-sm text-indigo-600 dark:text-indigo-400">
                        {percentage}%
                      </span>
                    </div>

                    {/* Enhanced Gradient Progress Bar */}
                    <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800/80 overflow-hidden p-0.5">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 rounded-full transition-all duration-700 shadow-sm"
                        style={{ width: `${Math.max(4, percentage)}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 pt-0.5 text-center text-xs">
                      <div className="bg-white dark:bg-slate-900/80 p-2 rounded-xl border border-slate-200/70 dark:border-slate-800/80">
                        <span className="text-[9px] uppercase tracking-wider block font-semibold text-slate-400 dark:text-slate-500">🎯 Reja</span>
                        <b className="text-slate-900 dark:text-white font-bold font-mono text-xs">{formatSum(bot.targetVotes || 5000)} ta</b>
                      </div>
                      <div className="bg-white dark:bg-slate-900/80 p-2 rounded-xl border border-slate-200/70 dark:border-slate-800/80">
                        <span className="text-[9px] uppercase tracking-wider block font-semibold text-indigo-500 dark:text-indigo-400">🤖 Biz orqali</span>
                        <b className="text-indigo-600 dark:text-indigo-400 font-bold font-mono text-xs">{formatSum(bot.currentVotes)} ta</b>
                      </div>
                      <div className="bg-white dark:bg-slate-900/80 p-2 rounded-xl border border-slate-200/70 dark:border-slate-800/80">
                        <span className="text-[9px] uppercase tracking-wider block font-semibold text-emerald-500 dark:text-emerald-400">🌐 OpenBudget</span>
                        <b className="text-emerald-600 dark:text-emerald-400 font-bold font-mono text-xs">{formatSum(bot.openBudgetVotes || bot.currentVotes)} ta</b>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedBotForVotes(bot)}
                      className="w-full mt-1 py-2 px-3 rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 text-xs font-bold border border-indigo-500/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Ovozlarni Ko'rish (Captcha & Ro'yxat)</span>
                    </button>
                  </div>

                  {/* 💰 Financial Configuration Grid */}
                  <div className="grid grid-cols-2 gap-2.5 mb-4 text-xs">
                    <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/60">
                      <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                        <span className="font-semibold text-[10px]">1 Ovoz mukofoti:</span>
                      </div>
                      <span className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                        {formatSum(bot.voteReward || 30000)} so'm
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/60">
                      <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                        <span className="font-semibold text-[10px]">Referal:</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md ${
                          bot.isRefActive !== false
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                        }`}>
                          {bot.isRefActive !== false ? 'Faol' : "To'xtatilgan"}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-sm text-purple-600 dark:text-purple-400">
                        +{formatSum(bot.refBonus || 5000)} so'm
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div className="pt-3.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {isOnline ? (
                      <button
                        onClick={() => onStopBot(bot.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all active:scale-95 cursor-pointer shadow-sm"
                        title="Botni to'xtatish"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                        <span>To'xtatish</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => onStartBot(bot.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all active:scale-95 cursor-pointer shadow-sm"
                        title="Botni ishga tushirish"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Ishga tushirish</span>
                      </button>
                    )}

                    <button
                      onClick={() => onOpenEditBot(bot)}
                      className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 transition-all active:scale-95 cursor-pointer shadow-sm"
                      title="Sozlamalarni tahrirlash"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => onDeleteBot(bot.id, bot.mahallaName)}
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all active:scale-95 cursor-pointer"
                      title="O'chirish"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div>
                    {bot.botUsername && (
                      <a
                        href={`https://t.me/${bot.botUsername}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                      >
                        <span>Bot</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-md dark:shadow-xl overflow-hidden transition-colors">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-4">Mahalla / Bot</th>
                  <th className="p-4">Holat</th>
                  <th className="p-4">Ovozlar</th>
                  <th className="p-4">Reja (Maqsad)</th>
                  <th className="p-4">Ovoz Mukofoti</th>
                  <th className="p-4">Referal Bonusi</th>
                  <th className="p-4 text-right">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredBots.map((bot) => {
                  const percentage = Math.min(100, Math.round((bot.currentVotes / (bot.targetVotes || 5000)) * 100 * 10) / 10);

                  return (
                    <tr key={bot.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-indigo-600/10 dark:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                            {bot.mahallaName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">{bot.mahallaName}</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">{bot.botUsername ? `@${bot.botUsername}` : bot.name}</p>
                            {bot.description && (
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 italic mt-0.5">💬 {bot.description}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="p-4">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            bot.status === 'ONLINE'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                          }`}
                        >
                          {bot.status === 'ONLINE' ? '🟢 Online' : '⏸ To\'xtatilgan'}
                        </span>
                      </td>

                      <td className="p-4">
                        <div className="space-y-1">
                          <span className="font-bold text-slate-900 dark:text-white">{formatSum(bot.currentVotes)} ta ({percentage}%)</span>
                          <div className="w-24 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${percentage}%` }}></div>
                          </div>
                        </div>
                      </td>

                      <td className="p-4 font-semibold text-slate-800 dark:text-slate-200">{formatSum(bot.targetVotes)} ta</td>
                      <td className="p-4 font-bold text-emerald-600 dark:text-emerald-400">{formatSum(bot.voteReward || 30000)} so'm</td>
                      <td className="p-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-purple-600 dark:text-purple-400">+{formatSum(bot.refBonus || 5000)} so'm</span>
                          <span className={`text-[9px] font-semibold ${
                            bot.isRefActive !== false ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
                          }`}>
                            {bot.isRefActive !== false ? '🟢 Faol' : "⚪️ To'xtatilgan"}
                          </span>
                        </div>
                      </td>

                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {bot.status === 'ONLINE' ? (
                            <button
                              onClick={() => onStopBot(bot.id)}
                              className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              title="To'xtatish"
                            >
                              <Square className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => onStartBot(bot.id)}
                              className="p-1.5 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                              title="Ishga tushirish"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          )}

                          <button
                            onClick={() => onOpenEditBot(bot)}
                            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                            title="Tahrirlash"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => onDeleteBot(bot.id, bot.mahallaName)}
                            className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title="O'chirish"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Marketing Broadcast Modal */}
      <MarketingBroadcastModal
        isOpen={isBroadcastModalOpen}
        onClose={() => setIsBroadcastModalOpen(false)}
        bots={bots}
      />

      {/* Bot Votes & Captcha Modal */}
      <BotVotesModal
        bot={selectedBotForVotes}
        isOpen={Boolean(selectedBotForVotes)}
        onClose={() => setSelectedBotForVotes(null)}
      />
    </div>
  );
};
