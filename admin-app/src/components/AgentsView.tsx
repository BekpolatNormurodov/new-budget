import React, { useState, useMemo } from 'react';
import {
  Users,
  PlusCircle,
  DollarSign,
  Search,
  ExternalLink,
  Copy,
  CheckCircle2,
  Trash2,
  Receipt,
  Upload,
  Phone,
  Send,
  UserCheck,
  Building2,
  Clock,
  TrendingUp,
  Share2,
  Eye,
  Sparkles,
} from 'lucide-react';
import { AgentItem, BotInstanceItem } from '../types';
import { formatSum } from '../utils/format';
import { Pagination } from './Pagination';

interface AgentsViewProps {
  agents: AgentItem[];
  bots: BotInstanceItem[];
  onRefresh: () => void;
  onAddAgent: (data: any) => Promise<void>;
  onPayoutAgent: (id: number, amount: number, receiptImageBase64?: string) => Promise<void>;
  onDeleteAgent: (id: number) => Promise<void>;
}

export const AgentsView: React.FC<AgentsViewProps> = ({
  agents,
  bots,
  onRefresh,
  onAddAgent,
  onPayoutAgent,
  onDeleteAgent,
}) => {
  const [search, setSearch] = useState('');
  const [selectedBotId, setSelectedBotId] = useState<string>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [payoutAgentItem, setPayoutAgentItem] = useState<AgentItem | null>(null);
  const [payoutAmount, setPayoutAmount] = useState<string>('');
  const [payoutReceiptBase64, setPayoutReceiptBase64] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [previewAgent, setPreviewAgent] = useState<AgentItem | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // New Agent Form state
  const [newAgent, setNewAgent] = useState({
    botInstanceId: bots[0]?.id || 1,
    name: '',
    phone: '',
    username: '',
    telegramId: '',
    rewardPerVote: 5000,
  });

  const getFullReferralLink = (agent: AgentItem) => {
    if (agent.referralLink && agent.referralLink.startsWith('http')) {
      return agent.referralLink;
    }
    const bot = bots.find((b) => b.id === agent.botInstanceId) || agent.botInstance;
    const botUsername = bot?.botUsername?.replace(/^@/, '');
    if (botUsername) {
      return `https://t.me/${botUsername}?start=${agent.code}`;
    }
    return `https://t.me/openbudjet_ishonch_2026_bot?start=${agent.code}`;
  };

  const filteredAgents = useMemo(() => {
    return agents.filter((a) => {
      if (selectedBotId !== 'ALL' && String(a.botInstanceId) !== selectedBotId) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const nameMatch = a.name.toLowerCase().includes(q);
        const codeMatch = a.code.toLowerCase().includes(q);
        const userMatch = a.telegramUser?.toLowerCase().includes(q);
        const phoneMatch = a.phone?.includes(q);
        const mahallaMatch = a.botInstance?.mahallaName?.toLowerCase().includes(q);
        if (!nameMatch && !codeMatch && !userMatch && !phoneMatch && !mahallaMatch) return false;
      }
      return true;
    });
  }, [agents, selectedBotId, search]);

  const paginatedAgents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAgents.slice(start, start + pageSize);
  }, [filteredAgents, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredAgents.length / pageSize) || 1;

  const handleCopyLink = (link: string, code: string) => {
    // 100% Reliable copy to clipboard across all browsers / HTTP/HTTPS
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(link).then(() => {
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2500);
      }).catch(() => fallbackCopy(link, code));
    } else {
      fallbackCopy(link, code);
    }
  };

  const fallbackCopy = (text: string, code: string) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2500);
    } catch (err) {
      prompt("Havolani nusxalang:", text);
    }
    document.body.removeChild(textArea);
  };

  const handleCreateAgentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgent.name.trim()) return alert('Agent ismi kiritilishi shart!');
    setIsSubmitting(true);
    try {
      await onAddAgent({
        ...newAgent,
        botInstanceId: Number(newAgent.botInstanceId),
        rewardPerVote: Number(newAgent.rewardPerVote) || 5000,
      });
      setShowAddModal(false);
      setNewAgent({
        botInstanceId: bots[0]?.id || 1,
        name: '',
        phone: '',
        username: '',
        telegramId: '',
        rewardPerVote: 5000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePayoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payoutAgentItem) return;
    const amt = parseInt(payoutAmount.replace(/\s+/g, ''), 10);
    if (!amt || amt <= 0) return alert("To'g'ri to'lov summasini kiriting!");
    setIsSubmitting(true);
    try {
      await onPayoutAgent(payoutAgentItem.id, amt, payoutReceiptBase64);
      setPayoutAgentItem(null);
      setPayoutAmount('');
      setPayoutReceiptBase64('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReceiptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setPayoutReceiptBase64(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Controls Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
          {/* Search Input */}
          <div className="relative flex-1 md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder="Agent ismi, referral kod, telefon..."
              className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 shadow-sm"
            />
          </div>

          {/* Bot/Mahalla Filter */}
          <select
            value={selectedBotId}
            onChange={(e) => { setSelectedBotId(e.target.value); setCurrentPage(1); }}
            className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 shadow-sm"
          >
            <option value="ALL">Barcha Botlar & Mahallalar</option>
            {bots.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.mahallaName} ({b.name})
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="w-full md:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Yangi Agent Qo'shish</span>
        </button>
      </div>

      {/* Agents Table */}
      <div className="bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-950 text-[11px] font-bold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3.5">Agent</th>
                <th className="p-3.5">Bot / Mahalla</th>
                <th className="p-3.5">Shaxsiy Havola (Referral Link)</th>
                <th className="p-3.5 text-center">Ovozlar / Kirganlar</th>
                <th className="p-3.5 text-right">Ishlagan Summa</th>
                <th className="p-3.5 text-right">To'langan</th>
                <th className="p-3.5 text-right">Qoldiq Balans</th>
                <th className="p-3.5 text-center">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {paginatedAgents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-400 space-y-2">
                    <Users className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
                    <p className="font-semibold">Hech qanday agent topilmadi</p>
                    <p className="text-[11px] text-slate-400">Yangi agent qo'shish uchun yuqoridagi tugmani bosing.</p>
                  </td>
                </tr>
              ) : (
                paginatedAgents.map((agent) => {
                  const fullLink = getFullReferralLink(agent);
                  const isCopied = copiedCode === agent.code;

                  return (
                    <tr key={agent.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                      {/* Agent Info */}
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>{agent.name}</span>
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                            #{agent.id}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                          {agent.telegramUser && <span className="font-medium text-slate-500">@{agent.telegramUser}</span>}
                          {agent.phone && <span>+{agent.phone}</span>}
                        </div>
                      </td>

                      {/* Bot Info */}
                      <td className="p-3.5">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {agent.botInstance?.mahallaName || 'Mahalla'}
                        </span>
                        <div className="text-[10px] text-slate-400 font-mono">
                          @{agent.botInstance?.botUsername || 'bot'}
                        </div>
                      </td>

                      {/* 🔗 IDEAL SMART REFERRAL LINK BOX */}
                      <td className="p-3.5">
                        <div className="flex flex-col gap-1.5 max-w-[280px]">
                          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950/90 border border-indigo-200 dark:border-indigo-900/40 rounded-xl p-1 shadow-inner">
                            <input
                              type="text"
                              readOnly
                              value={fullLink}
                              onClick={(e) => (e.target as HTMLInputElement).select()}
                              className="bg-transparent text-[11px] font-mono text-indigo-600 dark:text-indigo-300 flex-1 px-2 focus:outline-none select-all truncate"
                            />
                            <button
                              onClick={() => handleCopyLink(fullLink, agent.code)}
                              title={isCopied ? "Nusxalandi!" : "Havolani nusxalash"}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0 ${
                                isCopied
                                  ? 'bg-emerald-600 text-white shadow-sm'
                                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                              }`}
                            >
                              {isCopied ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Nusxalandi</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
                            <span className="font-mono font-bold text-slate-500 dark:text-slate-400">
                              Kod: {agent.code}
                            </span>
                            <a
                              href={fullLink}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-500 hover:underline flex items-center gap-0.5"
                            >
                              <span>Ochish</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        </div>
                      </td>

                      {/* Votes & Users */}
                      <td className="p-3.5 text-center">
                        <div className="font-bold text-slate-900 dark:text-white">
                          🗳 {agent.totalVotes || 0} ta
                        </div>
                        <div className="text-[10px] text-slate-400">
                          👥 {agent.referredUsersCount || 0} ta a'zo
                        </div>
                      </td>

                      {/* Earned */}
                      <td className="p-3.5 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {formatSum(agent.totalEarned)} so'm
                        <div className="text-[10px] text-slate-400 font-normal">
                          Har ovozga: {formatSum(agent.rewardPerVote)} so'm
                        </div>
                      </td>

                      {/* Paid */}
                      <td className="p-3.5 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatSum(agent.totalPaid)} so'm
                      </td>

                      {/* Balance */}
                      <td className="p-3.5 text-right">
                        <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-sm">
                          {formatSum(agent.balance)} so'm
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              setPayoutAgentItem(agent);
                              setPayoutAmount(String(agent.balance || ''));
                            }}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm cursor-pointer"
                            title="To'lov qilish"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                            <span>To'lash</span>
                          </button>
                          <button
                            onClick={() => onDeleteAgent(agent.id)}
                            className="p-1.5 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                            title="O'chirish"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredAgents.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>

      {/* ➕ MODAL: Yangi Agent Qo'shish */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-indigo-500" />
                <span>Yangi Agent Qo'shish</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAgentSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Qaysi Bot / Mahalla uchun?
                </label>
                <select
                  value={newAgent.botInstanceId}
                  onChange={(e) => setNewAgent({ ...newAgent, botInstanceId: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-bold"
                >
                  {bots.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.mahallaName} ({b.name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Agent Ismi (Majburiy) *
                </label>
                <input
                  type="text"
                  placeholder="Masalan: Sardor Rahimov"
                  value={newAgent.name}
                  onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
                  required
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Telegram Username (Ixtiyoriy)
                  </label>
                  <input
                    type="text"
                    placeholder="username"
                    value={newAgent.username}
                    onChange={(e) => setNewAgent({ ...newAgent, username: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Telefon (Ixtiyoriy)
                  </label>
                  <input
                    type="text"
                    placeholder="998901234567"
                    value={newAgent.phone}
                    onChange={(e) => setNewAgent({ ...newAgent, phone: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono text-[11px]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Har bir tasdiqlangan ovoz uchun Agent haqi (so'm)
                </label>
                <input
                  type="number"
                  value={newAgent.rewardPerVote}
                  onChange={(e) => setNewAgent({ ...newAgent, rewardPerVote: Number(e.target.value) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-bold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:bg-slate-800 cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Qo\'shilmoqda...' : 'Yaratish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 💸 MODAL: Agentga To'lov Qilish (Chek bilan) */}
      {payoutAgentItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-500" />
                <span>Agentga To'lov Qilish ({payoutAgentItem.name})</span>
              </h3>
              <button
                onClick={() => setPayoutAgentItem(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePayoutSubmit} className="space-y-3.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Joriy qoldiq balans:</span>
                  <span className="font-bold font-mono text-amber-500">{formatSum(payoutAgentItem.balance)} so'm</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Jami ishlagan:</span>
                  <span className="font-mono text-slate-300">{formatSum(payoutAgentItem.totalEarned)} so'm</span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  To'lanayotgan Summa (so'm)
                </label>
                <input
                  type="number"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                  placeholder="Summani kiriting..."
                  required
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono text-sm font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Receipt className="w-3.5 h-3.5 text-indigo-400" />
                  <span>To'lov Cheki Rasmi (Ixtiyoriy)</span>
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleReceiptUpload}
                  className="w-full text-[11px] text-slate-400 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
                />
                {payoutReceiptBase64 && (
                  <div className="mt-2 text-[10px] text-emerald-500 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Chek rasmi biriktirildi</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setPayoutAgentItem(null)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:bg-slate-800 cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Bajarilmoqda...' : 'To\'lovni Tasdiqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
