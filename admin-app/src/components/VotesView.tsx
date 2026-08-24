import React, { useState, useMemo } from 'react';
import {
  Vote,
  Search,
  CheckCircle,
  Download,
  Zap,
  Phone,
  Building2,
} from 'lucide-react';
import { VoteItem, BotInstanceItem } from '../types';
import { formatSum, toTashkentDateStr, tashkentToday, tashkentYesterday, formatPhone, formatShortDateTime, formatTashkentDateTime, formatTashkentTime } from '../utils/format';
import { Pagination } from './Pagination';
import { exportToCsv } from '../utils/exportToCsv';
import { SmartFilterBar } from './SmartFilterBar';

interface VotesViewProps {
  pendingVotes: VoteItem[];
  allVotes?: VoteItem[];
  bots: BotInstanceItem[];
  onApproveVote: (id: number) => void;
  onApproveAll: () => void;
}

export const VotesView: React.FC<VotesViewProps> = ({
  pendingVotes,
  allVotes = [],
  bots,
  onApproveVote,
  onApproveAll,
}) => {
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<'PENDING' | 'VERIFIED' | 'REJECTED' | 'ALL'>('ALL');
  const [selectedBotId, setSelectedBotId] = useState<string>('ALL');
  const [activePreset, setActivePreset] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const handleDateChange = (start: string, end: string, presetName: string = 'CUSTOM') => {
    setStartDate(start);
    setEndDate(end);
    setActivePreset(presetName);
    setCurrentPage(1);
  };

  // Combine or select votes based on statusTab
  const combinedVotes = useMemo(() => {
    const list = allVotes.length > 0 ? allVotes : pendingVotes;
    return list;
  }, [allVotes, pendingVotes]);

  // Status'dan tashqari barcha filtrlar (bot, sana, qidiruv) qo'llangan ro'yxat.
  // Tab sonlari ham, ro'yxat ham shundan kelib chiqadi.
  const baseFiltered = useMemo(() => {
    const todayStr = tashkentToday();
    const yesterday = tashkentYesterday();

    return combinedVotes.filter((v) => {
      // Mahalla/Bot filter
      if (selectedBotId !== 'ALL') {
        const bot = bots.find((b) => String(b.id) === selectedBotId);
        if (bot && v.botInstance?.mahallaName !== bot.mahallaName) return false;
      }

      // Date filter (Toshkent vaqti bo'yicha)
      const vDate = toTashkentDateStr(v.createdAt);
      if (activePreset === 'TODAY' && vDate !== todayStr) return false;
      if (activePreset === 'YESTERDAY' && vDate !== yesterday) return false;
      if (startDate && vDate < startDate) return false;
      if (endDate && vDate > endDate) return false;

      // Universal Search (Phone, Name, Username, Mahalla Name, Bot ID)
      if (search.trim()) {
        const q = search.toLowerCase();
        const phoneMatch = v.phone.includes(q);
        const nameMatch = v.user?.firstName?.toLowerCase().includes(q);
        const userMatch = v.user?.username?.toLowerCase().includes(q);
        const mahallaMatch = v.botInstance?.mahallaName?.toLowerCase().includes(q);
        const idMatch = String(v.id).includes(q) || String(v.userId).includes(q);
        if (!phoneMatch && !nameMatch && !userMatch && !mahallaMatch && !idMatch) return false;
      }

      return true;
    });
  }, [combinedVotes, selectedBotId, activePreset, startDate, endDate, search, bots]);

  // Tab sonlari — joriy filtrlangan ro'yxat bo'yicha
  const statusCounts = useMemo(() => {
    let pending = 0;
    let verified = 0;
    let rejected = 0;
    for (const v of baseFiltered) {
      if (v.status === 'PENDING_VERIFICATION') pending++;
      else if (v.status === 'VERIFIED') verified++;
      else if (v.status === 'REJECTED') rejected++;
    }
    return { pending, verified, rejected, all: baseFiltered.length };
  }, [baseFiltered]);

  // Status tabi qo'llangan yakuniy ro'yxat
  const filteredVotes = useMemo(() => {
    if (statusTab === 'PENDING') return baseFiltered.filter((v) => v.status === 'PENDING_VERIFICATION');
    if (statusTab === 'VERIFIED') return baseFiltered.filter((v) => v.status === 'VERIFIED');
    if (statusTab === 'REJECTED') return baseFiltered.filter((v) => v.status === 'REJECTED');
    return baseFiltered;
  }, [baseFiltered, statusTab]);

  // Paginated records
  const paginatedVotes = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredVotes.slice(start, start + pageSize);
  }, [filteredVotes, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredVotes.length / pageSize) || 1;

  const handleExportCsv = () => {
    exportToCsv(
      'OpenBudget_Ovozlar',
      filteredVotes.map((v) => ({
        ID: v.id,
        Telefon: `+${v.phone}`,
        Foydalanuvchi: v.user?.firstName || v.user?.username || 'Foydalanuvchi',
        TelegramID: v.user?.telegramId || '',
        Mahalla: v.botInstance?.mahallaName || 'Bosh Mahalla',
        Mukofot: v.rewardAmount || 30000,
        Holat: v.status === 'VERIFIED' ? 'Tasdiqlangan' : 'Kutilmoqda',
        Sana: new Date(v.createdAt).toLocaleString('uz-UZ'),
      }))
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-300">
      {/* 1. Pro Smart Filter Bar */}
      <SmartFilterBar
        bots={bots}
        selectedBotId={selectedBotId}
        onSelectBotId={(id) => { setSelectedBotId(id); setCurrentPage(1); }}
        startDate={startDate}
        endDate={endDate}
        onDateChange={handleDateChange}
        activePreset={activePreset}
        totalFilteredCount={filteredVotes.length}
        totalFilteredLabel="Filtrlangan Ovozlar"
      />

      {/* 2. Controls & Search Bar */}
      <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-md dark:shadow-xl space-y-3 transition-colors">
        {/* Status Tabs and Quick Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 border-b border-slate-100 dark:border-slate-800/80 pb-3">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 flex-wrap w-full sm:w-auto">
            <button
              onClick={() => { setStatusTab('ALL'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-none cursor-pointer ${
                statusTab === 'ALL'
                  ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Barchasi ({statusCounts.all})
            </button>
            <button
              onClick={() => { setStatusTab('VERIFIED'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-none cursor-pointer ${
                statusTab === 'VERIFIED'
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              ✅ Tasdiqlangan ({statusCounts.verified})
            </button>
            <button
              onClick={() => { setStatusTab('PENDING'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-none cursor-pointer ${
                statusTab === 'PENDING'
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              ⏳ Kutilmoqda ({statusCounts.pending})
            </button>
            {statusCounts.rejected > 0 && (
              <button
                onClick={() => { setStatusTab('REJECTED'); setCurrentPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-none cursor-pointer ${
                  statusTab === 'REJECTED'
                    ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                🚫 Rad etilgan ({statusCounts.rejected})
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>⚡ Avtomatik Tasdiqlash Faol (OpenBudget API)</span>
            </div>

            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 transition-colors flex-shrink-0 cursor-pointer"
              title="Excel / CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>Eksport</span>
            </button>
          </div>
        </div>

        {/* Universal Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            placeholder="Telefon raqami, ism, username yoki mahalla..."
            className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
      </div>

      {/* Main Container: Mobile Case Cards (< md) + Desktop Table (>= md) */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-md dark:shadow-xl overflow-hidden transition-colors">
        {/* Mobile Case Cards View (< md screens) */}
        <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800/80">
          {paginatedVotes.length === 0 ? (
            <div className="py-10 text-center text-slate-400 dark:text-slate-500 text-xs px-4">
              <Vote className="w-7 h-7 mx-auto mb-2 text-slate-400 dark:text-slate-600 opacity-50" />
              Tanlangan sana va filter bo'yicha ovozlar topilmadi.
            </div>
          ) : (
            paginatedVotes.map((vote) => (
              <div key={vote.id} className="p-3.5 space-y-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                {/* Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                      <Phone className="w-3 h-3" />
                    </div>
                    <div>
                      <span className="font-mono font-bold text-slate-900 dark:text-white text-xs">+{vote.phone}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1 font-mono">#{vote.id}</span>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      vote.status === 'VERIFIED'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : vote.status === 'REJECTED'
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                    }`}
                  >
                    {vote.status === 'VERIFIED' ? '✅ Tasdiqlangan' : vote.status === 'REJECTED' ? '🚫 Rad etilgan' : '⏳ Kutilmoqda'}
                  </span>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-1.5 text-xs bg-slate-50 dark:bg-slate-950/60 p-2 rounded-xl border border-slate-200 dark:border-slate-800/80">
                  <div>
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 block">Foydalanuvchi:</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate block text-xs">
                      {vote.user?.firstName || 'Foydalanuvchi'}
                    </span>
                    {vote.user?.username && (
                      <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono">@{vote.user.username}</span>
                    )}
                  </div>

                  <div>
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 block">Mukofot:</span>
                    <span className={`font-bold text-xs ${vote.status === 'REJECTED' ? 'text-slate-400 dark:text-slate-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {vote.status === 'REJECTED' ? "0 so'm" : `+${formatSum(vote.rewardAmount ?? 30000)} so'm`}
                    </span>
                  </div>
                </div>

                {/* Mahalla & Time */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3 h-3 text-slate-400" />
                    <strong className="text-slate-700 dark:text-slate-300">{vote.botInstance?.mahallaName || 'Bosh Mahalla'}</strong>
                  </span>
                  <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">{formatShortDateTime(vote.createdAt)}</span>
                </div>

                {/* Action button if pending */}
                {vote.status === 'PENDING_VERIFICATION' && (
                  <button
                    onClick={() => onApproveVote(vote.id)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-sm transition-colors cursor-pointer"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Ovozni Tasdiqlash (+30 000 so'm)</span>
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Desktop Table View (>= md screens) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-3.5">ID</th>
                <th className="p-3.5">Telefon Raqami</th>
                <th className="p-3.5">Foydalanuvchi</th>
                <th className="p-3.5">Mahalla / Bot</th>
                <th className="p-3.5">Mukofot</th>
                <th className="p-3.5">Ovoz Berilgan Vaqti</th>
                <th className="p-3.5">Holat</th>
                <th className="p-3.5 text-right">Amal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {paginatedVotes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400 dark:text-slate-500 text-xs">
                    <Vote className="w-7 h-7 mx-auto mb-2 text-slate-400 dark:text-slate-600 opacity-50" />
                    Tanlangan sana va filter bo'yicha ovozlar topilmadi.
                  </td>
                </tr>
              ) : (
                paginatedVotes.map((vote) => (
                  <tr key={vote.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="p-3.5 font-mono text-slate-400 dark:text-slate-500">#{vote.id}</td>

                    <td className="p-3.5">
                      <span className="font-mono font-bold text-slate-900 dark:text-white tracking-wide">{formatPhone(vote.phone)}</span>
                    </td>

                    <td className="p-3.5">
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                          {vote.user?.firstName || 'Foydalanuvchi'}
                        </p>
                        {vote.user?.username && (
                          <p className="text-[11px] text-indigo-600 dark:text-indigo-400">@{vote.user.username}</p>
                        )}
                      </div>
                    </td>

                    <td className="p-3.5">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-medium">
                        {vote.botInstance?.mahallaName || 'Bosh Mahalla'}
                      </span>
                    </td>

                    <td className="p-3.5">
                      <span className={`font-bold ${vote.status === 'REJECTED' ? 'text-slate-400 dark:text-slate-500 text-xs' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {vote.status === 'REJECTED' ? "0 so'm" : `+${formatSum(vote.rewardAmount ?? 30000)} so'm`}
                      </span>
                    </td>

                    <td className="p-3.5 whitespace-nowrap">
                      <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {formatShortDateTime(vote.createdAt)}
                      </span>
                    </td>

                    <td className="p-3.5">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          vote.status === 'VERIFIED'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            : vote.status === 'REJECTED'
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                        }`}
                      >
                        {vote.status === 'VERIFIED' ? '✅ Tasdiqlangan' : vote.status === 'REJECTED' ? '🚫 Rad etilgan' : '⏳ Kutilmoqda'}
                      </span>
                    </td>

                    <td className="p-3.5 text-right">
                      {vote.status === 'VERIFIED' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                          <span>✓ Tasdiqlangan</span>
                        </span>
                      ) : vote.status === 'REJECTED' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-lg border border-rose-500/20" title={vote.errorMessage || 'Rad etilgan'}>
                          <span>🚫 Qabul qilinmadi</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                          <span>Avto-tekshirilmoqda</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredVotes.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(newSize) => { setPageSize(newSize); setCurrentPage(1); }}
        />
      </div>
    </div>
  );
};
