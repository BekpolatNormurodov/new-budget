import React, { useState, useMemo } from 'react';
import {
  CalendarRange,
  Calendar,
  Filter,
  Download,
  TrendingUp,
  Vote,
  Wallet,
  Users,
  Building2,
  CheckCircle2,
  Hourglass,
  ArrowUpRight,
  Sparkles,
  BarChart3,
  RotateCcw,
} from 'lucide-react';
import { BotInstanceItem, VoteItem, WithdrawalItem, UserItem, DashboardStats } from '../types';
import { formatSum } from '../utils/format';
import { exportToCsv } from '../utils/exportToCsv';

interface AnalyticsViewProps {
  stats: DashboardStats | null;
  bots: BotInstanceItem[];
  votes: VoteItem[];
  withdrawals: WithdrawalItem[];
  users: UserItem[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  stats,
  bots,
  votes,
  withdrawals,
  users,
}) => {
  // Filters State
  const [selectedBotId, setSelectedBotId] = useState<string>('ALL');
  const [datePreset, setDatePreset] = useState<'TODAY' | 'YESTERDAY' | 'LAST_7' | 'LAST_30' | 'THIS_MONTH' | 'ALL' | 'CUSTOM'>('ALL');
  
  // Custom Date Range
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Handle Preset Selection
  const applyPreset = (preset: 'TODAY' | 'YESTERDAY' | 'LAST_7' | 'LAST_30' | 'THIS_MONTH' | 'ALL') => {
    setDatePreset(preset);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (preset === 'TODAY') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'YESTERDAY') {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      setStartDate(yesterday);
      setEndDate(yesterday);
    } else if (preset === 'LAST_7') {
      const past7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      setStartDate(past7);
      setEndDate(todayStr);
    } else if (preset === 'LAST_30') {
      const past30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      setStartDate(past30);
      setEndDate(todayStr);
    } else if (preset === 'THIS_MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      setStartDate(firstDay);
      setEndDate(todayStr);
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  const handleResetFilters = () => {
    setSelectedBotId('ALL');
    setDatePreset('ALL');
    setStartDate('');
    setEndDate('');
  };

  // Filtered Datasets based on Date Range and Mahalla
  const filteredData = useMemo(() => {
    const selectedBot = selectedBotId !== 'ALL' ? bots.find((b) => String(b.id) === selectedBotId) : null;

    // Filter Votes
    const filteredVotes = votes.filter((v) => {
      if (selectedBot && v.botInstance?.mahallaName !== selectedBot.mahallaName) return false;
      const vDate = v.createdAt.slice(0, 10);
      if (startDate && vDate < startDate) return false;
      if (endDate && vDate > endDate) return false;
      return true;
    });

    // Filter Withdrawals
    const filteredWithdrawals = withdrawals.filter((w) => {
      const wDate = w.createdAt.slice(0, 10);
      if (startDate && wDate < startDate) return false;
      if (endDate && wDate > endDate) return false;
      return true;
    });

    // Filter Users
    const filteredUsers = users.filter((u) => {
      if (selectedBot && u.botInstance?.mahallaName !== selectedBot.mahallaName) return false;
      if (u.createdAt) {
        const uDate = u.createdAt.slice(0, 10);
        if (startDate && uDate < startDate) return false;
        if (endDate && uDate > endDate) return false;
      }
      return true;
    });

    return {
      votes: filteredVotes,
      withdrawals: filteredWithdrawals,
      users: filteredUsers,
    };
  }, [votes, withdrawals, users, selectedBotId, startDate, endDate, bots]);

  // Aggregate Metrics for Selected Range
  const totalRangeVotes = filteredData.votes.length;
  const verifiedRangeVotes = filteredData.votes.filter((v) => v.status === 'VERIFIED').length;
  const pendingRangeVotes = filteredData.votes.filter((v) => v.status === 'PENDING_VERIFICATION').length;

  const totalRangePaid = filteredData.withdrawals
    .filter((w) => w.status === 'APPROVED')
    .reduce((acc, w) => acc + w.amount, 0);

  const pendingRangePaid = filteredData.withdrawals
    .filter((w) => w.status === 'PENDING')
    .reduce((acc, w) => acc + w.amount, 0);

  const totalRangeUsers = filteredData.users.length;

  // Daily Breakdown Timeline Map
  const dailyBreakdown = useMemo(() => {
    const map = new Map<string, { date: string; votes: number; paid: number; users: number }>();

    filteredData.votes.forEach((v) => {
      const d = v.createdAt.slice(0, 10);
      const entry = map.get(d) || { date: d, votes: 0, paid: 0, users: 0 };
      entry.votes++;
      map.set(d, entry);
    });

    filteredData.withdrawals.forEach((w) => {
      if (w.status === 'APPROVED') {
        const d = w.createdAt.slice(0, 10);
        const entry = map.get(d) || { date: d, votes: 0, paid: 0, users: 0 };
        entry.paid += w.amount;
        map.set(d, entry);
      }
    });

    filteredData.users.forEach((u) => {
      if (u.createdAt) {
        const d = u.createdAt.slice(0, 10);
        const entry = map.get(d) || { date: d, votes: 0, paid: 0, users: 0 };
        entry.users++;
        map.set(d, entry);
      }
    });

    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredData]);

  // Export Entire Range Summary
  const handleExportRangeReport = () => {
    const rangeTitle = startDate && endDate ? `${startDate}_to_${endDate}` : 'barcha_davr';
    exportToCsv(
      `hisobot_${rangeTitle}`,
      dailyBreakdown.map((row) => ({
        Sana: row.date,
        OvozlarSoni: row.votes,
        TolovSummasi: row.paid,
        YangiFoydalanuvchilar: row.users,
      }))
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Universal Calendar & Mahalla Filter Control Panel */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <CalendarRange className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Universal Kalendar & Mahalla Filtrlari
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Real-vaqt Tahlili
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Istalgan sana oralig'i va mahalla bo'yicha umumiy oqim va statistikani ko'rish
              </p>
            </div>
          </div>

          {/* Quick Actions (Reset & Export) */}
          <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
            <button
              onClick={handleResetFilters}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition-colors"
              title="Filtrlarni tozalash"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Tozalash</span>
            </button>

            <button
              onClick={handleExportRangeReport}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Davr Hisobotini Yuklash</span>
            </button>
          </div>
        </div>

        {/* Filter Selection Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {/* 1. Mahalla / Bot Selector */}
          <div>
            <label className="text-[11px] font-semibold text-slate-400 mb-1.5 block flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-indigo-400" />
              Mahalla / Bot bo'yicha
            </label>
            <select
              value={selectedBotId}
              onChange={(e) => setSelectedBotId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900">Barcha Mahallalar ({bots.length} ta)</option>
              {bots.map((b) => (
                <option key={b.id} value={String(b.id)} className="bg-slate-900">
                  {b.mahallaName} ({b.name})
                </option>
              ))}
            </select>
          </div>

          {/* 2. Start Date (Dan) */}
          <div>
            <label className="text-[11px] font-semibold text-slate-400 mb-1.5 block flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              Boshlanish sanasi (Dan):
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setDatePreset('CUSTOM');
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
            />
          </div>

          {/* 3. End Date (Gacha) */}
          <div>
            <label className="text-[11px] font-semibold text-slate-400 mb-1.5 block flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              Tugash sanasi (Gacha):
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setDatePreset('CUSTOM');
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
            />
          </div>

          {/* 4. Active Date Interval Info */}
          <div className="flex flex-col justify-end">
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300">
              <span className="text-[10px] text-slate-500 block">Tanlangan davr:</span>
              <span className="font-semibold text-white">
                {startDate ? startDate : 'Boshidan'} ➔ {endDate ? endDate : 'Hozirgacha'}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Date Range Preset Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-800/60">
          <span className="text-[11px] text-slate-400 mr-1 font-medium">Tezkor oraliq:</span>
          {[
            { key: 'ALL', label: 'Barcha Vaqt' },
            { key: 'TODAY', label: 'Bugun' },
            { key: 'YESTERDAY', label: 'Kecha' },
            { key: 'LAST_7', label: 'Oxirgi 7 kun' },
            { key: 'LAST_30', label: 'Oxirgi 30 kun' },
            { key: 'THIS_MONTH', label: 'Shu oy' },
          ].map((preset) => (
            <button
              key={preset.key}
              onClick={() => applyPreset(preset.key as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                datePreset === preset.key
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 border border-slate-800'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Range Specific KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Range Total Votes */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Tanlangan Davrdagi Ovozlar</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Vote className="w-4 h-4" />
            </div>
          </div>
          <h4 className="text-2xl font-black text-white">{formatSum(totalRangeVotes)} ta</h4>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80">
            <span className="text-emerald-400 font-medium">✅ {formatSum(verifiedRangeVotes)} tasdiqlangan</span>
            <span className="text-amber-400 font-medium">⏳ {formatSum(pendingRangeVotes)} kutilmoqda</span>
          </div>
        </div>

        {/* 2. Range Total Paid */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">To'lab Berilgan Mablag'</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <h4 className="text-2xl font-black text-emerald-400">{formatSum(totalRangePaid)} so'm</h4>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80">
            <span className="text-slate-400">Kutilayotgan:</span>
            <span className="text-amber-400 font-bold">{formatSum(pendingRangePaid)} so'm</span>
          </div>
        </div>

        {/* 3. Range Active Users */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Yangi / Faol Mijozlar</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <h4 className="text-2xl font-black text-white">{formatSum(totalRangeUsers)} ta</h4>
          <p className="text-xs text-purple-300 font-medium pt-1 border-t border-slate-800/80">
            Tanlangan sana va mahalla bo'yicha
          </p>
        </div>

        {/* 4. Daily Average */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">O'rtacha Kunlik Natija</span>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <h4 className="text-2xl font-black text-cyan-400">
            {dailyBreakdown.length > 0 ? Math.round(totalRangeVotes / dailyBreakdown.length) : totalRangeVotes} ta / kun
          </h4>
          <p className="text-xs text-slate-400 pt-1 border-t border-slate-800/80">
            Jami {dailyBreakdown.length} faol kun bo'yicha
          </p>
        </div>
      </div>

      {/* 2-Column Split: Daily Timeline Table & Mahalla Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Timeline Breakdown Table (2 Columns) */}
        <div className="lg:col-span-2 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-400" />
              <h4 className="text-sm font-bold text-white">Kunlik Xronologiya & Dinamika</h4>
            </div>
            <span className="text-xs text-slate-400 font-medium">Jami: {dailyBreakdown.length} kun</span>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/80 text-slate-400 font-semibold uppercase text-[10px]">
                <tr>
                  <th className="p-3.5">Sana</th>
                  <th className="p-3.5">Yig'ilgan Ovozlar</th>
                  <th className="p-3.5">To'langan Mablag'</th>
                  <th className="p-3.5">Yangi Mijozlar</th>
                  <th className="p-3.5 text-right">O'rtacha Narx</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {dailyBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-500">
                      Tanlangan sanada ma'lumotlar mavjud emas.
                    </td>
                  </tr>
                ) : (
                  dailyBreakdown.map((row) => (
                    <tr key={row.date} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3.5 font-semibold text-white flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                        {row.date}
                      </td>
                      <td className="p-3.5">
                        <span className="font-bold text-white">{formatSum(row.votes)} ta</span>
                      </td>
                      <td className="p-3.5">
                        <span className="font-bold text-emerald-400">{formatSum(row.paid)} so'm</span>
                      </td>
                      <td className="p-3.5 font-medium text-slate-300">{row.users} ta</td>
                      <td className="p-3.5 text-right text-slate-400">
                        {row.votes > 0 ? `${formatSum(Math.round(row.paid / row.votes))} so'm` : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mahalla Comparison Card (1 Column) */}
        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-800 bg-slate-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-purple-400" />
              <h4 className="text-sm font-bold text-white">Mahallalar Ulushi</h4>
            </div>
          </div>

          <div className="p-4 space-y-4 flex-1 overflow-y-auto">
            {bots.map((bot) => {
              const botVotes = filteredData.votes.filter((v) => v.botInstance?.mahallaName === bot.mahallaName).length;
              const percentage = Math.min(100, Math.round((bot.currentVotes / (bot.targetVotes || 5000)) * 100 * 10) / 10);

              return (
                <div key={bot.id} className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="text-xs font-bold text-white">{bot.mahallaName}</h5>
                      <p className="text-[10px] text-slate-400">{bot.name}</p>
                    </div>
                    <span className="text-xs font-bold text-indigo-400">{percentage}%</span>
                  </div>

                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                      style={{ width: `${Math.max(3, percentage)}%` }}
                    ></div>
                  </div>

                  <div className="flex justify-between text-[11px] text-slate-400 pt-1">
                    <span>Tanlangan davrda: <b className="text-white font-medium">{formatSum(botVotes)}</b> ta</span>
                    <span>Jami: <b className="text-white font-medium">{formatSum(bot.currentVotes)}</b> ta</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
