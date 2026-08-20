import React, { useState, useMemo } from 'react';
import {
  Vote,
  Search,
  CheckCircle,
  Clock,
  Download,
  Zap,
} from 'lucide-react';
import { VoteItem, BotInstanceItem } from '../types';
import { formatSum } from '../utils/format';
import { Pagination } from './Pagination';
import { exportToCsv } from '../utils/exportToCsv';
import { SeasonCalendarFilter } from './SeasonCalendarFilter';

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
  const [statusTab, setStatusTab] = useState<'PENDING' | 'VERIFIED' | 'ALL'>('PENDING');
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

  const filteredVotes = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    return combinedVotes.filter((v) => {
      // Status filter
      if (statusTab === 'PENDING' && v.status !== 'PENDING_VERIFICATION') return false;
      if (statusTab === 'VERIFIED' && v.status !== 'VERIFIED') return false;

      // Mahalla/Bot filter
      if (selectedBotId !== 'ALL') {
        const bot = bots.find((b) => String(b.id) === selectedBotId);
        if (bot && v.botInstance?.mahallaName !== bot.mahallaName) return false;
      }

      // Date filter
      const vDate = v.createdAt.slice(0, 10);
      if (activePreset === 'TODAY' && !v.createdAt.startsWith(todayStr)) return false;
      if (activePreset === 'YESTERDAY' && !v.createdAt.startsWith(yesterday)) return false;
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
  }, [combinedVotes, statusTab, selectedBotId, activePreset, startDate, endDate, search, bots]);

  // Paginated records
  const paginatedVotes = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredVotes.slice(start, start + pageSize);
  }, [filteredVotes, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredVotes.length / pageSize) || 1;

  const handleExportCsv = () => {
    exportToCsv(
      'ovozlar_royxati',
      filteredVotes.map((v) => ({
        ID: v.id,
        Telefon: `+${v.phone}`,
        Foydalanuvchi: v.user?.firstName || v.user?.username || 'Foydalanuvchi',
        Mahalla: v.botInstance?.mahallaName || 'Bosh Mahalla',
        Mukofot: v.rewardAmount || 30000,
        Holat: v.status,
        Vaqt: new Date(v.createdAt).toLocaleString('uz-UZ'),
      }))
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-300">
      {/* 1. Pro Season Calendar & Bot Filter Component */}
      <SeasonCalendarFilter
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

      {/* 2. Status Tabs, Search Bar and Actions */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        {/* Status Tabs and Quick Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 flex-wrap">
            <button
              onClick={() => { setStatusTab('PENDING'); setCurrentPage(1); }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                statusTab === 'PENDING'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ⏳ Kutilmoqda ({pendingVotes.length})
            </button>
            <button
              onClick={() => { setStatusTab('VERIFIED'); setCurrentPage(1); }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                statusTab === 'VERIFIED'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ✅ Tasdiqlangan
            </button>
            <button
              onClick={() => { setStatusTab('ALL'); setCurrentPage(1); }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                statusTab === 'ALL'
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Barchasi
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {pendingVotes.length > 0 && (
              <button
                onClick={onApproveAll}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
              >
                <Zap className="w-4 h-4 fill-current" />
                <span>Barchasini Tasdiqlash ({pendingVotes.length})</span>
              </button>
            )}

            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition-colors"
              title="Excel / CSV ga yuklab olish"
            >
              <Download className="w-4 h-4 text-slate-400" />
              <span>Eksport</span>
            </button>
          </div>
        </div>

        {/* Universal Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            placeholder="Telefon raqami, ism, username yoki mahalla nomi bo'yicha qidirish..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Table Card */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/80 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-4">ID</th>
                <th className="p-4">Telefon Raqami</th>
                <th className="p-4">Foydalanuvchi</th>
                <th className="p-4">Mahalla / Bot</th>
                <th className="p-4">Mukofot</th>
                <th className="p-4">Sana & Vaqt</th>
                <th className="p-4">Holat</th>
                <th className="p-4 text-right">Amal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {paginatedVotes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 text-xs">
                    <Vote className="w-8 h-8 mx-auto mb-2 text-slate-600 opacity-50" />
                    Tanlangan sana va filter bo'yicha ovozlar topilmadi.
                  </td>
                </tr>
              ) : (
                paginatedVotes.map((vote) => (
                  <tr key={vote.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-4 font-mono text-slate-500">#{vote.id}</td>

                    <td className="p-4">
                      <span className="font-mono font-bold text-white tracking-wide">+{vote.phone}</span>
                    </td>

                    <td className="p-4">
                      <div>
                        <p className="font-semibold text-slate-200">
                          {vote.user?.firstName || 'Foydalanuvchi'}
                        </p>
                        {vote.user?.username && (
                          <p className="text-[11px] text-indigo-400">@{vote.user.username}</p>
                        )}
                      </div>
                    </td>

                    <td className="p-4">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-medium">
                        {vote.botInstance?.mahallaName || 'Bosh Mahalla'}
                      </span>
                    </td>

                    <td className="p-4">
                      <span className="font-bold text-emerald-400">+{formatSum(vote.rewardAmount || 30000)} so'm</span>
                    </td>

                    <td className="p-4 text-slate-400 text-[11px]">
                      {new Date(vote.createdAt).toLocaleString('uz-UZ')}
                    </td>

                    <td className="p-4">
                      <span
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                          vote.status === 'VERIFIED'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}
                      >
                        {vote.status === 'VERIFIED' ? '✅ Tasdiqlangan' : '⏳ Kutilmoqda'}
                      </span>
                    </td>

                    <td className="p-4 text-right">
                      {vote.status !== 'VERIFIED' ? (
                        <button
                          onClick={() => onApproveVote(vote.id)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                        >
                          Tasdiqlash
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-500 font-medium">Bajarilgan</span>
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
