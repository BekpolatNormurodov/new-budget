import React, { useState, useMemo } from 'react';
import {
  Wallet,
  Search,
  CheckCircle,
  XCircle,
  Copy,
  Check,
  Download,
  FileCheck,
} from 'lucide-react';
import { WithdrawalItem, BotInstanceItem } from '../types';
import { formatSum } from '../utils/format';
import { Pagination } from './Pagination';
import { exportToCsv } from '../utils/exportToCsv';
import { ReceiptViewerModal } from './ReceiptViewerModal';
import { SmartFilterBar } from './SmartFilterBar';

interface WithdrawalsViewProps {
  withdrawals: WithdrawalItem[];
  bots?: BotInstanceItem[];
  onOpenApproveModal: (item: WithdrawalItem) => void;
  onRejectWithdrawal: (id: number) => void;
}

export const WithdrawalsView: React.FC<WithdrawalsViewProps> = ({
  withdrawals,
  bots = [],
  onOpenApproveModal,
  onRejectWithdrawal,
}) => {
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');
  const [selectedBotId, setSelectedBotId] = useState<string>('ALL');
  const [activePreset, setActivePreset] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [copiedCard, setCopiedCard] = useState<string | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<WithdrawalItem | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text.replace(/\s+/g, ''));
    setCopiedCard(text);
    setTimeout(() => setCopiedCard(null), 2000);
  };

  const handleDateChange = (start: string, end: string, presetName: string = 'CUSTOM') => {
    setStartDate(start);
    setEndDate(end);
    setActivePreset(presetName);
    setCurrentPage(1);
  };

  const filteredWithdrawals = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    return withdrawals.filter((w) => {
      // Status filter
      if (statusTab !== 'ALL' && w.status !== statusTab) return false;

      // Date filter
      const wDate = w.createdAt.slice(0, 10);
      if (activePreset === 'TODAY' && !w.createdAt.startsWith(todayStr)) return false;
      if (activePreset === 'YESTERDAY' && !w.createdAt.startsWith(yesterday)) return false;
      if (startDate && wDate < startDate) return false;
      if (endDate && wDate > endDate) return false;

      // Search query (Card Number, User Name, Username, Card Holder, Phone, ID)
      if (search.trim()) {
        const q = search.toLowerCase();
        const cardMatch = w.accountDetails.toLowerCase().includes(q);
        const nameMatch = w.user?.firstName?.toLowerCase().includes(q);
        const userMatch = w.user?.username?.toLowerCase().includes(q);
        const cardHolderMatch = w.cardHolder?.toLowerCase().includes(q);
        const phoneMatch = w.user?.phone?.includes(q);
        const idMatch = String(w.id).includes(q);
        if (!cardMatch && !nameMatch && !userMatch && !cardHolderMatch && !phoneMatch && !idMatch) return false;
      }

      return true;
    });
  }, [withdrawals, statusTab, activePreset, startDate, endDate, search]);

  const paginatedWithdrawals = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredWithdrawals.slice(start, start + pageSize);
  }, [filteredWithdrawals, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredWithdrawals.length / pageSize) || 1;

  const pendingCount = withdrawals.filter((w) => w.status === 'PENDING').length;
  const approvedCount = withdrawals.filter((w) => w.status === 'APPROVED').length;
  const rejectedCount = withdrawals.filter((w) => w.status === 'REJECTED').length;

  const handleExportCsv = () => {
    exportToCsv(
      'pul_yechish_arizalari',
      filteredWithdrawals.map((w) => ({
        ID: w.id,
        Foydalanuvchi: w.user?.firstName || w.user?.username || 'Foydalanuvchi',
        Telefon: w.user?.phone ? `+${w.user.phone}` : '',
        Summa: w.amount,
        Usul: w.paymentMethod,
        Karta: w.accountDetails,
        KartaEgasi: w.cardHolder || '',
        Holat: w.status,
        Izoh: w.adminNote || '',
        Sana: new Date(w.createdAt).toLocaleString('uz-UZ'),
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
        totalFilteredCount={filteredWithdrawals.length}
        totalFilteredLabel="Arizalar"
      />

      {/* 2. Status Tabs, Search and Actions */}
      <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-md dark:shadow-xl space-y-3 transition-colors">
        {/* Status Tabs and Export Action */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 border-b border-slate-100 dark:border-slate-800/80 pb-3">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 flex-wrap w-full sm:w-auto">
            <button
              onClick={() => { setStatusTab('PENDING'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-none cursor-pointer ${
                statusTab === 'PENDING'
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              ⏳ Kutilmoqda ({pendingCount})
            </button>
            <button
              onClick={() => { setStatusTab('APPROVED'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-none cursor-pointer ${
                statusTab === 'APPROVED'
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              ✅ To'langan ({approvedCount})
            </button>
            <button
              onClick={() => { setStatusTab('REJECTED'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-none cursor-pointer ${
                statusTab === 'REJECTED'
                  ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              ❌ Rad etilgan ({rejectedCount})
            </button>
            <button
              onClick={() => { setStatusTab('ALL'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-none cursor-pointer ${
                statusTab === 'ALL'
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Barchasi ({withdrawals.length})
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
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
            placeholder="Karta raqami (masalan: 8600...), karta egasi, ism yoki telefon..."
            className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
          />
        </div>
      </div>

      {/* Main Container: Mobile Case Cards (< md) + Desktop Table (>= md) */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-md dark:shadow-xl overflow-hidden transition-colors">
        {/* Mobile Case Cards View (< md screens) */}
        <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800/80">
          {paginatedWithdrawals.length === 0 ? (
            <div className="py-10 text-center text-slate-400 dark:text-slate-500 text-xs px-4">
              <Wallet className="w-7 h-7 mx-auto mb-2 text-slate-400 dark:text-slate-600 opacity-50" />
              Tanlangan sana va filter bo'yicha pul yechish arizalari topilmadi.
            </div>
          ) : (
            paginatedWithdrawals.map((w) => {
              const formattedCard = w.accountDetails.length === 16
                ? w.accountDetails.replace(/(\d{4})/g, '$1 ').trim()
                : w.accountDetails;

              return (
                <div key={w.id} className="p-3.5 space-y-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  {/* Card Header: Amount & Status */}
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-sm font-black text-rose-600 dark:text-rose-400">{formatSum(w.amount)} so'm</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1 font-mono">#{w.id}</span>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        w.status === 'APPROVED'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                          : w.status === 'REJECTED'
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                      }`}
                    >
                      {w.status === 'APPROVED'
                        ? '✅ To\'langan'
                        : w.status === 'REJECTED'
                        ? '❌ Rad etilgan'
                        : '⏳ Kutilmoqda'}
                    </span>
                  </div>

                  {/* Card Body: User, Card Details & Holder */}
                  <div className="space-y-1.5 bg-slate-50 dark:bg-slate-950/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800/80 text-xs">
                    {/* Card Number Row with 1-Touch Copy */}
                    <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-200 dark:border-slate-800/60">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[9px] font-bold text-slate-700 dark:text-slate-300 uppercase">
                          {w.paymentMethod}
                        </span>
                        <span className="font-mono font-bold text-slate-900 dark:text-white text-xs tracking-wider">
                          {formattedCard}
                        </span>
                      </div>

                      <button
                        onClick={() => copyToClipboard(w.accountDetails)}
                        className="p-1 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1 text-[10px] cursor-pointer"
                        title="Karta raqamidan nusxa olish"
                      >
                        {copiedCard === w.accountDetails ? (
                          <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedCard === w.accountDetails ? 'Nusxa olindi' : 'Nusxa'}</span>
                      </button>
                    </div>

                    {/* User & Card Holder Info */}
                    <div className="grid grid-cols-2 gap-1.5 pt-0.5 text-[10px]">
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block">Mijoz:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200 truncate block text-xs">
                          {w.user?.firstName || 'Foydalanuvchi'}
                        </span>
                        {w.user?.phone && (
                          <span className="text-slate-500 dark:text-slate-400 font-mono">+{w.user.phone}</span>
                        )}
                      </div>

                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block">Karta Egasi:</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300 truncate block text-xs">
                          {w.cardHolder || '-'}
                        </span>
                      </div>
                    </div>

                    {/* Time & Receipt Link */}
                    <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 pt-1 border-t border-slate-200 dark:border-slate-800/60">
                      <span>{new Date(w.createdAt).toLocaleString('uz-UZ')}</span>
                      {w.receiptUrl && (
                        <button
                          onClick={() => setViewingReceipt(w)}
                          className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <FileCheck className="w-3 h-3" />
                          Chekni Ko'rish
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Card Actions for Pending */}
                  {w.status === 'PENDING' && (
                    <div className="flex items-center gap-2 pt-0.5">
                      <button
                        onClick={() => onOpenApproveModal(w)}
                        className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <FileCheck className="w-3.5 h-3.5" />
                        <span>Chek Yuklash & To'lash</span>
                      </button>

                      <button
                        onClick={() => onRejectWithdrawal(w.id)}
                        className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl border border-rose-500/20 transition-colors flex items-center justify-center cursor-pointer"
                        title="Rad etish"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table View (>= md screens) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-3.5">ID</th>
                <th className="p-3.5">Foydalanuvchi</th>
                <th className="p-3.5">Summa</th>
                <th className="p-3.5">To'lov Usuli & Karta</th>
                <th className="p-3.5">Karta Egasi</th>
                <th className="p-3.5">Sana & Vaqt</th>
                <th className="p-3.5">Holat</th>
                <th className="p-3.5 text-right">Amal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {paginatedWithdrawals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400 dark:text-slate-500 text-xs">
                    <Wallet className="w-7 h-7 mx-auto mb-2 text-slate-400 dark:text-slate-600 opacity-50" />
                    Tanlangan sana va filter bo'yicha pul yechish arizalari topilmadi.
                  </td>
                </tr>
              ) : (
                paginatedWithdrawals.map((w) => {
                  const formattedCard = w.accountDetails.length === 16
                    ? w.accountDetails.replace(/(\d{4})/g, '$1 ').trim()
                    : w.accountDetails;

                  return (
                    <tr key={w.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="p-3.5 font-mono text-slate-400 dark:text-slate-500">#{w.id}</td>

                      <td className="p-3.5">
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            {w.user?.firstName || 'Foydalanuvchi'}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                            {w.user?.phone ? `+${w.user.phone}` : (w.user?.username ? `@${w.user.username}` : `TG: ${w.user?.telegramId}`)}
                          </p>
                        </div>
                      </td>

                      <td className="p-3.5">
                        <span className="font-black text-rose-600 dark:text-rose-400 text-sm">
                          {formatSum(w.amount)} so'm
                        </span>
                      </td>

                      <td className="p-3.5">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-300">
                            {w.paymentMethod}
                          </span>
                          <span className="font-mono font-bold text-slate-900 dark:text-white tracking-wider">
                            {formattedCard}
                          </span>
                          <button
                            onClick={() => copyToClipboard(w.accountDetails)}
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
                            title="Nusxa olish"
                          >
                            {copiedCard === w.accountDetails ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="p-3.5">
                        <span className="text-slate-700 dark:text-slate-300 font-medium">
                          {w.cardHolder || '-'}
                        </span>
                      </td>

                      <td className="p-3.5 text-slate-500 dark:text-slate-400 text-[11px]">
                        {new Date(w.createdAt).toLocaleString('uz-UZ')}
                      </td>

                      <td className="p-3.5">
                        <div className="space-y-1">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              w.status === 'APPROVED'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                : w.status === 'REJECTED'
                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                            }`}
                          >
                            {w.status === 'APPROVED'
                              ? '✅ To\'langan'
                              : w.status === 'REJECTED'
                              ? '❌ Rad etilgan'
                              : '⏳ Kutilmoqda'}
                          </span>
                          {w.receiptUrl && (
                            <button
                              onClick={() => setViewingReceipt(w)}
                              className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline block font-semibold cursor-pointer"
                            >
                              🧾 Chekni ko'rish
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="p-3.5 text-right">
                        {w.status === 'PENDING' ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => onOpenApproveModal(w)}
                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
                            >
                              Chek & To'lash
                            </button>
                            <button
                              onClick={() => onRejectWithdrawal(w.id)}
                              className="p-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg border border-rose-500/20 transition-colors cursor-pointer"
                              title="Rad etish"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">Bajarilgan</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredWithdrawals.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(newSize) => { setPageSize(newSize); setCurrentPage(1); }}
        />
      </div>

      {/* Receipt Viewer Modal */}
      {viewingReceipt && (
        <ReceiptViewerModal
          isOpen={!!viewingReceipt}
          onClose={() => setViewingReceipt(null)}
          receiptUrl={viewingReceipt.receiptUrl || ''}
          amount={viewingReceipt.amount}
          card={viewingReceipt.accountDetails}
          userName={viewingReceipt.user?.firstName || 'Foydalanuvchi'}
        />
      )}
    </div>
  );
};
