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
} from 'lucide-react';
import { BotInstanceItem } from '../types';
import { formatSum } from '../utils/format';
import { ProDropdown } from './ProDropdown';

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
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  const handleTestMarketingBroadcast = async () => {
    if (!confirm("Barcha bot foydalanuvchilariga test eslatma xabari yuborilsinmi?")) return;
    setIsBroadcasting(true);
    try {
      const res = await fetch('/api/admin/broadcast/marketing-trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot: 'TEST' }),
      });
      const data = await res.json();
      alert(`📢 Test Eslatma Xabarnomasi yakunlandi!\n\nJami yuborildi: ${data.sentCount || 0} ta xabar\nBloklangan/Nofaol: ${data.failedCount || 0} ta\nVaqt: ${data.durationMs || 0}ms`);
    } catch (e) {
      alert('Xabar yuborishda xatolik yuz berdi.');
    } finally {
      setIsBroadcasting(false);
    }
  };

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

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Controls & Filters Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-md dark:shadow-xl flex flex-col md:flex-row items-center justify-between gap-4 transition-colors">
        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
          {/* Search Input */}
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Bot yoki mahalla qidirish..."
              className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Status Filter ProDropdown */}
          <div className="w-48">
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

        {/* View Mode & Add Bot Button */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          {/* View Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-1 text-slate-500 dark:text-slate-400">
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

          {/* Marketing Broadcast Test Button */}
          <button
            onClick={handleTestMarketingBroadcast}
            disabled={isBroadcasting}
            className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-orange-500/20 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            title="Barcha bot foydalanuvchilariga eslatma xabari yuborish (Test)"
          >
            <Send className={`w-3.5 h-3.5 ${isBroadcasting ? 'animate-spin' : ''}`} />
            <span>{isBroadcasting ? 'Yuborilmoqda...' : '📢 Eslatma Yuborish (Test)'}</span>
          </button>

          <button
            onClick={onOpenAddBot}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition-all active:scale-95 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Yangi Bot Yaratish</span>
          </button>
        </div>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredBots.map((bot) => {
            const percentage = Math.min(100, Math.round((bot.currentVotes / (bot.targetVotes || 5000)) * 100 * 10) / 10);
            const remaining = Math.max(0, (bot.targetVotes || 5000) - bot.currentVotes);

            return (
              <div
                key={bot.id}
                className="p-5 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-md dark:shadow-xl transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Top Avatar & Status */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white font-bold text-base shadow-md">
                        {bot.mahallaName.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">{bot.mahallaName}</h4>
                        <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                          {bot.botUsername ? `@${bot.botUsername}` : bot.name}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">ID: {bot.mahallaId}</p>
                        {bot.description && (
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700/60 mt-1 line-clamp-1 italic">
                            💬 {bot.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                        bot.status === 'ONLINE'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 shadow-sm shadow-emerald-500/10'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                      }`}
                    >
                      {bot.status === 'ONLINE' ? '🟢 Online' : '⏸ To\'xtatilgan'}
                    </span>
                  </div>

                  {/* Progress & Target Section */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800/80 space-y-2 mb-4">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        Reja bajarilishi:
                      </span>
                      <span className="text-slate-900 dark:text-white font-bold">{percentage}%</span>
                    </div>

                    <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(3, percentage)}%` }}
                      ></div>
                    </div>

                    <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                      <span>Yig'ildi: <b className="text-slate-900 dark:text-white font-bold">{formatSum(bot.currentVotes)}</b> ta</span>
                      <span>Reja: <b className="text-slate-900 dark:text-white font-bold">{formatSum(bot.targetVotes)}</b> ta</span>
                    </div>
                  </div>

                  {/* Financial settings pills */}
                  <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">1 Ovoz mukofoti:</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatSum(bot.voteReward || 30000)} so'm</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Referal:</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                          bot.isRefActive !== false
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        }`}>
                          {bot.isRefActive !== false ? '🟢 Faol' : "⚪️ To'xtatilgan"}
                        </span>
                      </div>
                      <span className="font-bold text-purple-600 dark:text-purple-400">+{formatSum(bot.refBonus || 5000)} so'm</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Buttons */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {bot.status === 'ONLINE' ? (
                      <button
                        onClick={() => onStopBot(bot.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-colors cursor-pointer"
                        title="Botni to'xtatish"
                      >
                        <Square className="w-3.5 h-3.5" />
                        To'xtatish
                      </button>
                    ) : (
                      <button
                        onClick={() => onStartBot(bot.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors cursor-pointer"
                        title="Botni ishga tushirish"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Ishga tushirish
                      </button>
                    )}

                    <button
                      onClick={() => onOpenEditBot(bot)}
                      className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                      title="Tahrirlash"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => onDeleteBot(bot.id, bot.mahallaName)}
                      className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
                      title="O'chirish"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {bot.botUsername && (
                    <a
                      href={`https://t.me/${bot.botUsername}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-medium"
                    >
                      <span>Bot</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
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
    </div>
  );
};
