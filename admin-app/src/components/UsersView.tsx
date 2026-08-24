import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  DollarSign,
  Ban,
  UserCheck,
  Download,
  Calendar,
  Clock,
  Sparkles,
} from 'lucide-react';
import { UserItem, BotInstanceItem } from '../types';
import { formatSum, formatShortDateTime, formatTashkentDateTime, toTashkentDateStr, tashkentToday, tashkentYesterday } from '../utils/format';
import { Pagination } from './Pagination';
import { exportToCsv } from '../utils/exportToCsv';
import { EditUserBalanceModal } from './EditUserBalanceModal';
import { SmartFilterBar } from './SmartFilterBar';

interface UsersViewProps {
  users: UserItem[];
  bots?: BotInstanceItem[];
  onUpdateBalance: (userId: number, amount: number, isAddition: boolean) => Promise<void>;
  onToggleBan: (id: number) => void;
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

  // Status'dan tashqari barcha filtrlar (bot, sana, qidiruv) qo'llangan ro'yxat
  const baseFiltered = useMemo(() => {
    const todayStr = tashkentToday();
    const yesterday = tashkentYesterday();

    return users.filter((u) => {
      // Mahalla/Bot filter
      if (selectedBotId !== 'ALL') {
        const bot = bots.find((b) => String(b.id) === selectedBotId);
        if (bot && u.botInstance?.mahallaName !== bot.mahallaName) return false;
      }

      // Date filter (Registration Date)
      const uDate = toTashkentDateStr(u.createdAt);
      if (activePreset === 'TODAY' && uDate !== todayStr) return false;
      if (activePreset === 'YESTERDAY' && uDate !== yesterday) return false;
      if (startDate && uDate < startDate) return false;
      if (endDate && uDate > endDate) return false;

      // Universal Search (Name, Username, Phone, ID, Telegram ID)
      if (search.trim()) {
        const q = search.toLowerCase();
        const nameMatch = u.firstName?.toLowerCase().includes(q) || u.lastName?.toLowerCase().includes(q);
        const userMatch = u.username?.toLowerCase().includes(q);
        const phoneMatch = u.phone?.includes(q);
        const idMatch = String(u.id).includes(q) || String(u.telegramId).includes(q);
        if (!nameMatch && !userMatch && !phoneMatch && !idMatch) return false;
      }

      return true;
    });
  }, [users, selectedBotId, activePreset, startDate, endDate, search, bots]);

  // Tab sonlari — joriy filtrlangan ro'yxat bo'yicha
  const statusCounts = useMemo(() => {
    let active = 0;
    let admin = 0;
    let banned = 0;
    for (const u of baseFiltered) {
      if (u.isBanned) banned++;
      else if (u.role === 'ADMIN') admin++;
      else active++;
    }
    return { all: baseFiltered.length, active, admin, banned };
  }, [baseFiltered]);

  const filteredUsers = useMemo(() => {
    return baseFiltered.filter((u) => {
      if (statusFilter === 'ACTIVE' && (u.isBanned || u.role === 'ADMIN')) return false;
      if (statusFilter === 'BANNED' && !u.isBanned) return false;
      if (statusFilter === 'ADMIN' && u.role !== 'ADMIN') return false;
      return true;
    });
  }, [baseFiltered, statusFilter]);

  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredUsers.length / pageSize) || 1;

  const handleExportCsv = () => {
    exportToCsv(
      'OpenBudget_Foydalanuvchilar',
      filteredUsers.map((u) => ({
        ID: u.id,
        TelegramID: u.telegramId,
        Ism: u.firstName || '',
        Username: u.username ? `@${u.username}` : '',
        Telefon: u.phone ? `+${u.phone}` : '',
        Balans: u.balance,
        Ovozlar: u.totalVotes || 0,
        Referallar: u._count?.referrals || 0,
        Roli: u.role || 'USER',
        Holati: u.isBanned ? 'Bloklangan' : 'Faol',
        Sana: u.createdAt ? new Date(u.createdAt).toLocaleString('uz-UZ') : '',
      }))
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-300">
      {/* 1. Pro Smart Date Filter */}
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
      <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-md dark:shadow-xl space-y-3 transition-colors">
        {/* Filter Pills and Export Action */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 border-b border-slate-100 dark:border-slate-800/80 pb-3">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 flex-wrap w-full sm:w-auto">
            <button
              onClick={() => { setStatusFilter('ALL'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-none cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Barchasi ({statusCounts.all})
            </button>
            <button
              onClick={() => { setStatusFilter('ACTIVE'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-none cursor-pointer ${
                statusFilter === 'ACTIVE'
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              🟢 Faol ({statusCounts.active})
            </button>
            <button
              onClick={() => { setStatusFilter('ADMIN'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-none cursor-pointer ${
                statusFilter === 'ADMIN'
                  ? 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              👑 Adminlar ({statusCounts.admin})
            </button>
            <button
              onClick={() => { setStatusFilter('BANNED'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-none cursor-pointer ${
                statusFilter === 'BANNED'
                  ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              🚫 Bloklangan ({statusCounts.banned})
            </button>
          </div>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 transition-colors self-end sm:self-auto cursor-pointer"
            title="Excel / CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span>Eksport</span>
          </button>
        </div>

        {/* Universal Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            placeholder="Ism, telefon, username, ID yoki Telegram ID..."
            className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
      </div>

      {/* Main Container: Mobile Case Cards (< md) + Desktop Table (>= md) */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-md dark:shadow-xl overflow-hidden transition-colors">
        {/* Mobile Cards List (< md screens) */}
        <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800/60">
          {paginatedUsers.length === 0 ? (
            <div className="py-10 text-center text-slate-400 dark:text-slate-500 text-xs px-4">
              <Users className="w-7 h-7 mx-auto mb-2 text-slate-400 dark:text-slate-600 opacity-50" />
              Tanlangan sana va filter bo'yicha foydalanuvchilar topilmadi.
            </div>
          ) : (
            paginatedUsers.map((u) => (
              <div key={u.id} className="p-3.5 space-y-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                {/* Header: Name, Telegram, Joined Time & Status */}
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900 dark:text-white text-xs">{u.firstName || 'Foydalanuvchi'}</span>
                      {u.role === 'ADMIN' && (
                        <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-700 dark:text-purple-400 border border-purple-500/30 text-[9px] font-bold">
                          ADMIN
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        {u.username ? `@${u.username}` : `TG: ${u.telegramId}`}
                      </span>
                      <span className="text-slate-300 dark:text-slate-700">•</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                        {formatShortDateTime(u.createdAt)}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      u.isBanned
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    }`}
                  >
                    {u.isBanned ? '🚫 Bloklangan' : '🟢 Faol'}
                  </span>
                </div>

                {/* Body: 3-column stats grid */}
                <div className="grid grid-cols-3 gap-1.5 bg-slate-50 dark:bg-slate-950/60 p-2 rounded-xl border border-slate-200 dark:border-slate-800/80 text-center">
                  <div>
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider block font-semibold">Balans</span>
                    <span className="font-black text-emerald-600 dark:text-emerald-400 text-xs block">{formatSum(u.balance)} so'm</span>
                  </div>

                  <div>
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider block font-semibold">Ovozlar</span>
                    <span className="font-bold text-slate-900 dark:text-white text-xs block">{u.totalVotes || 0} ta</span>
                  </div>

                  <div>
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider block font-semibold">Taklif</span>
                    <span className="font-bold text-purple-600 dark:text-purple-400 text-xs block">{u._count?.referrals || 0} ta</span>
                  </div>
                </div>

                {/* Footer: Phone and Action buttons */}
                <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-slate-100 dark:border-slate-800/60 text-xs">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                    {u.phone ? `+${u.phone}` : 'Tel yo\'q'}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setEditingUserBalance(u)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 rounded-lg border border-indigo-200 dark:border-indigo-500/20 transition-colors cursor-pointer"
                      title="Balansni tahrirlash"
                    >
                      <DollarSign className="w-3 h-3" />
                      <span>Balans</span>
                    </button>

                    <button
                      onClick={() => onToggleBan(u.id)}
                      className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                        u.isBanned
                          ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 border-emerald-500/20'
                          : 'text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 border-rose-500/20'
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
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-3.5">Foydalanuvchi</th>
                <th className="p-3.5">Telefon</th>
                <th className="p-3.5">Qo'shilgan Vaqti</th>
                <th className="p-3.5">Balans</th>
                <th className="p-3.5">Ovozlar</th>
                <th className="p-3.5">Taklif Qilgan</th>
                <th className="p-3.5">Roli & Holati</th>
                <th className="p-3.5 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400 dark:text-slate-500 text-xs">
                    <Users className="w-7 h-7 mx-auto mb-2 text-slate-400 dark:text-slate-600 opacity-50" />
                    Tanlangan sana va filter bo'yicha foydalanuvchilar topilmadi.
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="p-3.5">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {u.firstName || 'Foydalanuvchi'}
                          {u.role === 'ADMIN' && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-700 dark:text-purple-400 border border-purple-500/30 text-[9px] font-bold">
                              ADMIN
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                          {u.username ? `@${u.username}` : `TG: ${u.telegramId}`}
                        </p>
                      </div>
                    </td>

                    <td className="p-3.5">
                      <span className="font-mono text-slate-700 dark:text-slate-300">
                        {u.phone ? `+${u.phone}` : '-'}
                      </span>
                    </td>

                    <td className="p-3.5 whitespace-nowrap">
                      <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {formatShortDateTime(u.createdAt)}
                      </span>
                    </td>

                    <td className="p-3.5">
                      <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">
                        {formatSum(u.balance)} so'm
                      </span>
                    </td>

                    <td className="p-3.5">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {u.totalVotes || 0} ta
                      </span>
                    </td>

                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-purple-700 dark:text-purple-300 font-medium text-[11px]">
                        👥 {u._count?.referrals || 0} ta
                      </span>
                    </td>

                    <td className="p-3.5">
                      <span
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                          u.isBanned
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        }`}
                      >
                        {u.isBanned ? '🚫 Bloklangan' : '🟢 Faol'}
                      </span>
                    </td>

                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setEditingUserBalance(u)}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 rounded-lg border border-indigo-200 dark:border-indigo-500/20 transition-colors cursor-pointer"
                          title="Balansni o'zgartirish"
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                          <span>Balans</span>
                        </button>

                        <button
                          onClick={() => onToggleBan(u.id)}
                          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                            u.isBanned
                              ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 border-emerald-500/20'
                              : 'text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 border-rose-500/20'
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
