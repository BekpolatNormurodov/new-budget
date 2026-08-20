import React, { useState, useMemo } from 'react';
import {
  Wallet,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Copy,
  Check,
  Download,
  FileCheck,
  Eye,
  CreditCard,
  User,
  Calendar,
} from 'lucide-react';
import { WithdrawalItem } from '../types';
import { formatSum } from '../utils/format';
import { Pagination } from './Pagination';
import { exportToCsv } from '../utils/exportToCsv';
import { ReceiptViewerModal } from './ReceiptViewerModal';

interface WithdrawalsViewProps {
  withdrawals: WithdrawalItem[];
  onOpenApproveModal: (item: WithdrawalItem) => void;
  onRejectWithdrawal: (id: number) => void;
}

export const WithdrawalsView: React.FC<WithdrawalsViewProps> = ({
  withdrawals,
  onOpenApproveModal,
  onRejectWithdrawal,
}) => {
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'YESTERDAY'>('ALL');
  const [copiedCard, setCopiedCard] = useState<string | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<WithdrawalItem | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text.replace(/\s+/g, ''));
    setCopiedCard(text);
    setTimeout(() => setCopiedCard(null), 2000);
  };

  const filteredWithdrawals = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    return withdrawals.filter((w) => {
      // Status filter
      if (statusTab !== 'ALL' && w.status !== statusTab) return false;

      // Payment Method filter
      if (methodFilter !== 'ALL' && w.paymentMethod !== methodFilter) return false;

      // Date filter
      if (dateFilter === 'TODAY' && !w.createdAt.startsWith(todayStr)) return false;
      if (dateFilter === 'YESTERDAY' && !w.createdAt.startsWith(yesterday)) return false;

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const cardMatch = w.accountDetails.toLowerCase().includes(q);
        const nameMatch = w.user?.firstName?.toLowerCase().includes(q);
        const userMatch = w.user?.username?.toLowerCase().includes(q);
        const cardHolderMatch = w.cardHolder?.toLowerCase().includes(q);
        const phoneMatch = w.user?.phone?.includes(q);
        if (!cardMatch && !nameMatch && !userMatch && !cardHolderMatch && !phoneMatch) return false;
      }

      return true;
    });
  }, [withdrawals, statusTab, methodFilter, dateFilter, search]);

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
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Filter and Controls Bar */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        {/* Status Tabs and Export Action */}
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
              ⏳ Kutilmoqda ({pendingCount})
            </button>
            <button
              onClick={() => { setStatusTab('APPROVED'); setCurrentPage(1); }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                statusTab === 'APPROVED'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ✅ To'langan ({approvedCount})
            </button>
            <button
              onClick={() => { setStatusTab('REJECTED'); setCurrentPage(1); }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                statusTab === 'REJECTED'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ❌ Rad etilgan ({rejectedCount})
            </button>
            <button
              onClick={() => { setStatusTab('ALL'); setCurrentPage(1); }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                statusTab === 'ALL'
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Barchasi ({withdrawals.length})
            </button>
          </div>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition-colors"
            title="Excel / CSV ga yuklab olish"
          >
            <Download className="w-4 h-4 text-slate-400" />
            <span>Eksport</span>
          </button>
        </div>

        {/* Search & Dropdown Filters Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Universal Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder="Karta raqami, ism yoki tel..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Payment Method Dropdown */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300">
            <CreditCard className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
            <select
              value={methodFilter}
              onChange={(e) => { setMethodFilter(e.target.value); setCurrentPage(1); }}
              className="w-full bg-transparent text-white focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900">Barcha To'lov Usullari</option>
              <option value="UZCARD" className="bg-slate-900">UZCARD</option>
              <option value="HUMO" className="bg-slate-900">HUMO</option>
              <option value="PAYNET" className="bg-slate-900">PAYNET</option>
            </select>
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
            <select
              value={dateFilter}
              onChange={(e) => { setDateFilter(e.target.value as any); setCurrentPage(1); }}
              className="w-full bg-transparent text-white focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900">Barcha Sanalar</option>
              <option value="TODAY" className="bg-slate-900">Bugungi arizalar</option>
              <option value="YESTERDAY" className="bg-slate-900">Kecha berilgan</option>
            </select>
          </div>

          {/* Records summary counter */}
          <div className="flex items-center justify-end px-3 py-2 text-xs text-slate-400 font-medium">
            Topildi: <b className="text-white ml-1 font-bold">{filteredWithdrawals.length} ta</b>
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/80 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-4">ID</th>
                <th className="p-4">Foydalanuvchi</th>
                <th className="p-4">Summa</th>
                <th className="p-4">To'lov Usuli & Karta</th>
                <th className="p-4">Karta Egasi</th>
                <th className="p-4">Sana & Vaqt</th>
                <th className="p-4">Holat</th>
                <th className="p-4 text-right">Amal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {paginatedWithdrawals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 text-xs">
                    <Wallet className="w-8 h-8 mx-auto mb-2 text-slate-600 opacity-50" />
                    Mos keladigan pul yechish arizalari topilmadi.
                  </td>
                </tr>
              ) : (
                paginatedWithdrawals.map((w) => {
                  const formattedCard = w.accountDetails.length === 16
                    ? w.accountDetails.replace(/(\d{4})/g, '$1 ').trim()
                    : w.accountDetails;

                  return (
                    <tr key={w.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-4 font-mono text-slate-500">#{w.id}</td>

                      <td className="p-4">
                        <div>
                          <p className="font-semibold text-slate-200">{w.user?.firstName || 'Foydalanuvchi'}</p>
                          <p className="text-[11px] text-slate-400">
                            {w.user?.username ? `@${w.user.username}` : ''} {w.user?.phone ? `• +${w.user.phone}` : ''}
                          </p>
                        </div>
                      </td>

                      <td className="p-4">
                        <span className="font-black text-rose-400 text-sm">{formatSum(w.amount)} so'm</span>
                      </td>

                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-bold text-slate-300 uppercase">
                            {w.paymentMethod}
                          </span>
                          <span className="font-mono text-white tracking-wider">{formattedCard}</span>
                          <button
                            onClick={() => copyToClipboard(w.accountDetails)}
                            className="p-1 rounded text-slate-500 hover:text-white transition-colors"
                            title="Karta raqamidan nusxa olish"
                          >
                            {copiedCard === w.accountDetails ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="p-4">
                        <span className="text-slate-300 font-medium">{w.cardHolder || '-'}</span>
                      </td>

                      <td className="p-4 text-slate-400 text-[11px]">
                        {new Date(w.createdAt).toLocaleString('uz-UZ')}
                      </td>

                      <td className="p-4">
                        <div className="space-y-1">
                          <span
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-full border inline-block ${
                              w.status === 'APPROVED'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : w.status === 'REJECTED'
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
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
                              className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 font-medium"
                            >
                              <FileCheck className="w-3 h-3" />
                              Chekni ko'rish
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="p-4 text-right">
                        {w.status === 'PENDING' ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => onOpenApproveModal(w)}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                            >
                              Chek Yuklash & To'lash
                            </button>

                            <button
                              onClick={() => onRejectWithdrawal(w.id)}
                              className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg border border-slate-800 transition-colors"
                              title="Rad etish"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        ) : w.receiptUrl ? (
                          <button
                            onClick={() => setViewingReceipt(w)}
                            className="px-2.5 py-1 text-[11px] text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors"
                          >
                            Chek
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-500">-</span>
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
      {viewingReceipt && viewingReceipt.receiptUrl && (
        <ReceiptViewerModal
          isOpen={!!viewingReceipt}
          onClose={() => setViewingReceipt(null)}
          receiptUrl={viewingReceipt.receiptUrl}
          amount={viewingReceipt.amount}
          userName={viewingReceipt.user?.firstName || viewingReceipt.cardHolder}
          card={viewingReceipt.accountDetails}
        />
      )}
    </div>
  );
};
