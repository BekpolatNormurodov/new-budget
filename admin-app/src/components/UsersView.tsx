import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  DollarSign,
  Ban,
  Download,
  User,
} from 'lucide-react';
import { UserItem, BotInstanceItem } from '../types';
import { formatSum } from '../utils/format';
import { Pagination } from './Pagination';
import { exportToCsv } from '../utils/exportToCsv';
import { EditUserBalanceModal } from './EditUserBalanceModal';
import { SmartFilterBar } from './SmartFilterBar';

interface UsersViewProps {
  users: UserItem[];
  bots?: BotInstanceItem[];
  onUpdateBalance: (userId: number, amount: number, isAddition: boolean) => Promise<void>;
  onToggleBan: (userId: number) => void;
}

export const UsersView: React.FC<UsersViewProps> = ({
  users,
  bots = [],
  onUpdateBalance,
  onToggleBan,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'BANNED' | 'ADMIN'>('ALL');
  const [selectedBotId, setSelectedBotId] = useState<string>('ALL');
  const [activePreset, setActivePreset] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [editingUserBalance, setEditingUserBalance] = useState<UserItem | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const handleDateChange = (start: string, end: string, presetName: string = 'CUSTOM') => {
    setStartDate(start);
    setEndDate(end);
    setActivePreset(presetName);
    setCurrentPage(1);
  };

  const filteredUsers = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    return users.filter((u) => {
      // Status & Role filter
      if (statusFilter === 'ACTIVE' && u.isBanned) return false;
      if (statusFilter === 'BANNED' && !u.isBanned) return false;
      if (statusFilter === 'ADMIN' && u.role !== 'ADMIN') return false;

      // Mahalla / Bot filter
      if (selectedBotId !== 'ALL') {
        const bot = bots.find((b) => String(b.id) === selectedBotId);
        if (bot && u.botInstance?.mahallaName !== bot.mahallaName) return false;
      }

      // Date filter
      if (u.createdAt) {
        const uDate = u.createdAt.slice(0, 10);
        if (activePreset === 'TODAY' && !u.createdAt.startsWith(todayStr)) return false;
        if (activePreset === 'YESTERDAY' && !u.createdAt.startsWith(yesterday)) return false;
        if (startDate && uDate < startDate) return false;
        if (endDate && uDate > endDate) return false;
      }

      // Search query (ID, Telegram ID, Name, Username, Phone)
      if (search.trim()) {
        const q = search.toLowerCase();
        const idMatch = String(u.id).includes(q) || u.telegramId.includes(q);
        const nameMatch = u.firstName?.toLowerCase().includes(q);
        const userMatch = u.username?.toLowerCase().includes(q);
        const phoneMatch = u.phone?.includes(q);
        if (!idMatch && !nameMatch && !userMatch && !phoneMatch) return false;
      }

      return true;
    });
  }, [users, statusFilter, selectedBotId, activePreset, startDate, endDate, search, bots]);

  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredUsers.length / pageSize) || 1;

  const handleExportCsv = () => {
    exportToCsv(
      'foydalanuvchilar_royxati',
      filteredUsers.map((u) => ({
        ID: u.id,
        TelegramID: u.telegramId,
        Ism: u.firstName || '',
        Username: u.username ? `@${u.username}` : '',
        Telefon: u.phone ? `+${u.phone}` : '',
        Balans: u.balance,
        Ovozlar: u.totalVotes,
        Referallar: u._count?.referrals || 0,
        Roli: u.role || 'USER',
        Bloklangan: u.isBanned ? 'HA' : 'YO\'Q',
      }))
    );
  };

  return (
    <div className="space-y-3.5 sm:space-y-4 animate-in fade-in duration-300">
      {/* 1. Mobile-friendly Smart Date & Bot Filter */}
      <SmartFilterBar
        bots={bots}
        selectedBotId={selectedBotId}
        onSelectBotId={(id) => { setSelectedBotId(id); setCurrentPage(1); }}
        startDate={startDate}
        endDate={endDate}
        onDateChange={handleDateChange}
        activePreset={activePreset}
        totalFilteredCount={filteredUsers.length}
        totalFilteredLabel="Mijozlar"
      />

      {/* 2. Status Filters and Search Bar */}
      <div className="p-3 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
        {/* Filter Pills and Export Action */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 flex-wrap w-full sm:w-auto">
            <button
              onClick={() => { setStatusFilter('ALL'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-none ${
                statusFilter === 'ALL'
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Barchasi ({users.length})
            </button>
            <button
              onClick={() => { setStatusFilter('ACTIVE'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-none ${
                statusFilter === 'ACTIVE'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🟢 Faol
            </button>
            <button
              onClick={() => { setStatusFilter('ADMIN'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-none ${
                statusFilter === 'ADMIN'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              👑 Adminlar
            </button>
            <button
              onClick={() => { setStatusFilter('BANNED'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-none ${
                statusFilter === 'BANNED'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🚫 Bloklangan
            </button>
          </div>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition-colors self-end sm:self-auto"
            title="Excel / CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Eksport</span>
          </button>
        </div>

        {/* Universal Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            placeholder="Ism, telefon, username, ID yoki Telegram ID..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Main Container: Mobile Case Cards (< md) + Desktop Table (>= md) */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl overflow-hidden">
        {/* Mobile Case Cards View (< md screens) */}
        <div className="block md:hidden divide-y divide-slate-800/80">
          {paginatedUsers.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-xs px-4">
              <Users className="w-7 h-7 mx-auto mb-2 text-slate-600 opacity-50" />
              Tanlangan sana va filter bo'yicha foydalanuvchilar topilmadi.
            </div>
          ) : (
            paginatedUsers.map((u) => (
              <div key={u.id} className="p-3.5 space-y-2.5 hover:bg-slate-800/30 transition-colors">
                {/* Header: Name, Telegram & Status */}
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white text-xs">{u.firstName || 'Foydalanuvchi'}</span>
                      {u.role === 'ADMIN' && (
                        <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 text-[9px] font-bold">
                          ADMIN
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                      {u.username ? `@${u.username}` : `TG: ${u.telegramId}`}
                    </span>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      u.isBanned
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}
                  >
                    {u.isBanned ? '🚫 Bloklangan' : '🟢 Faol'}
                  </span>
                </div>

                {/* Body: 3-column stats grid */}
                <div className="grid grid-cols-3 gap-1.5 bg-slate-950/60 p-2 rounded-xl border border-slate-800/80 text-center">
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-semibold">Balans</span>
                    <span className="font-black text-emerald-400 text-xs block">{formatSum(u.balance)} so'm</span>
                  </div>

                  <div>
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-semibold">Ovozlar</span>
                    <span className="font-bold text-white text-xs block">{u.totalVotes || 0} ta</span>
                  </div>

                  <div>
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-semibold">Taklif</span>
                    <span className="font-bold text-purple-400 text-xs block">{u._count?.referrals || 0} ta</span>
                  </div>
                </div>

                {/* Footer: Phone and Action buttons */}
                <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-slate-800/60 text-xs">
                  <span className="text-[10px] text-slate-400 font-mono">
                    {u.phone ? `+${u.phone}` : 'Tel yo\'q'}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setEditingUserBalance(u)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-lg border border-indigo-500/20 transition-colors"
                      title="Balansni tahrirlash"
                    >
                      <DollarSign className="w-3 h-3" />
                      <span>Balans</span>
                    </button>

                    <button
                      onClick={() => onToggleBan(u.id)}
                      className={`p-1.5 rounded-lg border transition-colors ${
                        u.isBanned
                          ? 'text-emerald-400 hover:bg-emerald-500/10 border-emerald-500/20'
                          : 'text-rose-400 hover:bg-rose-500/10 border-rose-500/20'
                      }`}
                      title={u.isBanned ? 'Blokdan chiqarish' : 'Bloklash'}
                    >
                      <Ban className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table View (>= md screens) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/80 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-3.5">Foydalanuvchi</th>
                <th className="p-3.5">Telefon</th>
                <th className="p-3.5">Balans</th>
                <th className="p-3.5">Ovozlar</th>
                <th className="p-3.5">Taklif Qilgan</th>
                <th className="p-3.5">Roli & Holati</th>
                <th className="p-3.5 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500 text-xs">
                    <Users className="w-7 h-7 mx-auto mb-2 text-slate-600 opacity-50" />
                    Tanlangan sana va filter bo'yicha foydalanuvchilar topilmadi.
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-3.5">
                      <div>
                        <p className="font-semibold text-white">
                          {u.firstName || 'Foydalanuvchi'}
                          {u.role === 'ADMIN' && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 text-[9px] font-bold">
                              ADMIN
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-400 font-mono">
                          {u.username ? `@${u.username}` : `TG: ${u.telegramId}`}
                        </p>
                      </div>
                    </td>

                    <td className="p-3.5">
                      <span className="font-mono text-slate-300">
                        {u.phone ? `+${u.phone}` : '-'}
                      </span>
                    </td>

                    <td className="p-3.5">
                      <span className="font-black text-emerald-400 text-sm">
                        {formatSum(u.balance)} so'm
                      </span>
                    </td>

                    <td className="p-3.5">
                      <span className="font-semibold text-slate-200">
                        {u.totalVotes || 0} ta
                      </span>
                    </td>

                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-purple-300 font-medium text-[11px]">
                        👥 {u._count?.referrals || 0} ta
                      </span>
                    </td>

                    <td className="p-3.5">
                      <span
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                          u.isBanned
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        }`}
                      >
                        {u.isBanned ? '🚫 Bloklangan' : '🟢 Faol'}
                      </span>
                    </td>

                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setEditingUserBalance(u)}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-lg border border-indigo-500/20 transition-colors"
                          title="Balansni o'zgartirish"
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                          <span>Balans</span>
                        </button>

                        <button
                          onClick={() => onToggleBan(u.id)}
                          className={`p-1.5 rounded-lg border transition-colors ${
                            u.isBanned
                              ? 'text-emerald-400 hover:bg-emerald-500/10 border-emerald-500/20'
                              : 'text-rose-400 hover:bg-rose-500/10 border-rose-500/20'
                          }`}
                          title={u.isBanned ? 'Blokdan chiqarish' : 'Bloklash'}
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      </div>
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
          totalItems={filteredUsers.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(newSize) => { setPageSize(newSize); setCurrentPage(1); }}
        />
      </div>

      {/* Edit User Balance Modal */}
      {editingUserBalance && (
        <EditUserBalanceModal
          isOpen={!!editingUserBalance}
          onClose={() => setEditingUserBalance(null)}
          user={editingUserBalance}
          onSave={onUpdateBalance}
        />
      )}
    </div>
  );
};
