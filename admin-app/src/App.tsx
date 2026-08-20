import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Clock,
  LogOut,
  PlusCircle,
  RefreshCw,
  Bot,
  CheckCircle,
  Hourglass,
  Wallet,
  ExternalLink,
  Layers,
  Server,
  Sliders,
  Target,
  Image,
  Download,
} from 'lucide-react';
import { BotInstanceItem, VoteItem, WithdrawalItem, UserItem, DashboardStats, ToastItem, AdminUser } from './types';
import { formatSum, formatMoney } from './utils/format';
import { ToastContainer } from './components/ToastContainer';
import { ConfirmModal } from './components/ConfirmModal';
import { PromptModal } from './components/PromptModal';
import { AddBotModal } from './components/AddBotModal';
import { EditBotModal } from './components/EditBotModal';
import { ApproveWithdrawalModal } from './components/ApproveWithdrawalModal';
import { LoginScreen } from './components/LoginScreen';

export function App() {
  const [token, setToken] = useState<string>(() => localStorage.getItem('ob_admin_token') || '');
  const [adminUser, setAdminUser] = useState<AdminUser | null>(() => {
    const saved = localStorage.getItem('ob_admin_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [activeTab, setActiveTab] = useState<'dashboard' | 'bots' | 'votes' | 'withdrawals' | 'users'>('dashboard');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [bots, setBots] = useState<BotInstanceItem[]>([]);
  const [pendingVotes, setPendingVotes] = useState<VoteItem[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [showAddBotModal, setShowAddBotModal] = useState(false);
  const [editingBot, setEditingBot] = useState<BotInstanceItem | null>(null);
  const [approvingWithdrawal, setApprovingWithdrawal] = useState<WithdrawalItem | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString('uz-UZ'));

  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: 'danger' | 'warning' | 'success' | 'info';
    confirmText?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'warning',
    onConfirm: () => {},
  });

  const [promptModal, setPromptModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    placeholder?: string;
    defaultValue?: string;
    confirmText?: string;
    onConfirm: (val: string) => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const [newBot, setNewBot] = useState({
    name: '',
    token: '',
    mahallaId: '',
    mahallaName: '',
    openBudgetUrl: '',
    targetVotes: 5000,
    voteReward: 30000,
    refBonus: 5000,
  });

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('uz-UZ'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (token) {
      loadAllData();
      const interval = setInterval(loadAllData, 10000);
      return () => clearInterval(interval);
    }
  }, [token]);

  const loadAllData = async () => {
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      setStats(data);
      setBots(data.bots || []);
      setPendingVotes(data.pendingVotes || []);
      setWithdrawals(data.pendingWithdrawals || []);
      loadUsers();
    } catch (err) {
      console.error(err);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(userSearch)}`);
      const data = await res.json();
      setUsers(data.users || []);
    } catch (e) {}
  };

  const handleLogout = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Tizimdan chiqish',
      message: 'Haqiqatan ham boshqaruv panelidan chiqmoqchimisiz?',
      type: 'warning',
      confirmText: 'Ha, chiqish',
      onConfirm: () => {
        setToken('');
        setAdminUser(null);
        localStorage.removeItem('ob_admin_token');
        localStorage.removeItem('ob_admin_user');
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        showToast('Tizimdan chiqildi', 'info');
      },
    });
  };

  const handleAddBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBot.token || !newBot.mahallaId || !newBot.mahallaName || !newBot.openBudgetUrl) {
      showToast('Barcha majburiy maydonlarni to\'ldiring!', 'error');
      return;
    }

    try {
      const res = await fetch('/api/admin/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBot),
      });
      if (!res.ok) throw new Error();
      showToast(`✅ "${newBot.name}" muvaffaqiyatli ishga tushirildi!`, 'success');
      setShowAddBotModal(false);
      setNewBot({
        name: '',
        token: '',
        mahallaId: '',
        mahallaName: '',
        openBudgetUrl: '',
        targetVotes: 5000,
        voteReward: 30000,
        refBonus: 5000,
      });
      loadAllData();
    } catch (err) {
      showToast('Bot qo\'shishda xatolik yuz berdi', 'error');
    }
  };

  const handleSaveBotSettings = async (id: number, updatedData: Partial<BotInstanceItem>) => {
    try {
      const res = await fetch(`/api/admin/bots/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      showToast(`✅ Mahalla sozlamalari yangilandi! Yangi limit: ${formatSum(data.bot?.targetVotes)} ta`, 'success');
      setEditingBot(null);
      loadAllData();
    } catch (e) {
      showToast('Sozlamalarni saqlashda xatolik yuz berdi', 'error');
    }
  };

  const handleStopBot = (bot: BotInstanceItem) => {
    setConfirmModal({
      isOpen: true,
      title: 'Botni to\'xtatish',
      message: `Haqiqatan ham "${bot.name}" (@${bot.botUsername || bot.mahallaName}) botini to'xtatmoqchimisiz?`,
      type: 'warning',
      confirmText: 'Ha, to\'xtatilsin',
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        await fetch(`/api/admin/bots/${bot.id}/stop`, { method: 'POST' });
        showToast(`🛑 "${bot.name}" to'xtatildi`, 'info');
        loadAllData();
      },
    });
  };

  const handleStartBot = async (id: number, name: string) => {
    await fetch(`/api/admin/bots/${id}/start`, { method: 'POST' });
    showToast(`🟢 "${name}" muvaffaqiyatli ishga tushdi!`, 'success');
    loadAllData();
  };

  const handleDeleteBot = (bot: BotInstanceItem) => {
    setConfirmModal({
      isOpen: true,
      title: 'Botni o\'chirish',
      message: `Diqqat! "${bot.name}" boti va unga tegishli sozlamalar tizimdan butunlay o'chiriladi. Ushbu amalni tasdiqlaysizmi?`,
      type: 'danger',
      confirmText: 'Ha, o\'chirilsin',
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        await fetch(`/api/admin/bots/${bot.id}`, { method: 'DELETE' });
        showToast(`🗑 "${bot.name}" o'chirildi`, 'info');
        loadAllData();
      },
    });
  };

  const handleApproveVote = (v: VoteItem) => {
    setConfirmModal({
      isOpen: true,
      title: 'Ovozni tasdiqlash',
      message: `+${v.phone} raqami orqali berilgan ovozni tasdiqlab, foydalanuvchiga +30 000 so'm mukofot yozilsinmi?`,
      type: 'success',
      confirmText: 'Ha, tasdiqlansin',
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        await fetch(`/api/admin/votes/${v.id}/approve`, { method: 'POST' });
        showToast('✅ Ovoz tasdiqlandi va +30 000 so\'m yozildi!', 'success');
        loadAllData();
      },
    });
  };

  const handleApproveAllVotes = () => {
    if (pendingVotes.length === 0) {
      showToast('Kutilayotgan ovozlar mavjud emas', 'info');
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Barcha ovozlarni ommaviy tasdiqlash',
      message: `Hozirda kutilayotgan barcha ${formatSum(pendingVotes.length)} ta ovozni bir zumda tasdiqlashni va har biriga +30 000 so'mdan mukofot to'lashni tasdiqlaysizmi?`,
      type: 'success',
      confirmText: `Ha, barchasini tasdiqlash (${formatMoney(pendingVotes.length * 30000)})`,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        const res = await fetch('/api/admin/votes/approve-all', { method: 'POST' });
        const data = await res.json();
        showToast(`🎉 Jami ${formatSum(data.count)} ta ovoz tasdiqlandi va to'lab berildi!`, 'success');
        loadAllData();
      },
    });
  };

  const handleApproveWithdrawal = (w: WithdrawalItem) => {
    setApprovingWithdrawal(w);
  };

  const handleConfirmApproveWithdrawal = async (id: number, receiptImage?: string, note?: string) => {
    try {
      const res = await fetch(`/api/admin/withdrawals/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptImage, note }),
      });
      if (!res.ok) throw new Error();
      showToast(`✅ #${id} arizaga to'lov tasdiqlandi va chek mijozga yuborildi!`, 'success');
      setApprovingWithdrawal(null);
      loadAllData();
    } catch (e) {
      showToast('To\'lovni tasdiqlashda xatolik yuz berdi', 'error');
    }
  };

  const handleRejectWithdrawal = (w: WithdrawalItem) => {
    setPromptModal({
      isOpen: true,
      title: 'Pul yechish arizasini rad etish',
      message: `Foydalanuvchiga nima sababdan rad etilganligi haqida xabar yuboriladi va mablag' (${formatMoney(w.amount)}) uning balansiga qaytariladi:`,
      placeholder: 'Rad etish sababi...',
      defaultValue: 'Admin tomonidan rad etildi',
      confirmText: 'Rad etish va Mablag\'ni qaytarish',
      onConfirm: async (note) => {
        setPromptModal((prev) => ({ ...prev, isOpen: false }));
        await fetch(`/api/admin/withdrawals/${w.id}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note }),
        });
        showToast(`❌ #${w.id} ariza rad etildi va mablag' balansga qaytarildi`, 'info');
        loadAllData();
      },
    });
  };

  const handleToggleBan = (u: UserItem) => {
    setConfirmModal({
      isOpen: true,
      title: u.isBanned ? 'Foydalanuvchi blokini ochish' : 'Foydalanuvchini bloklash (Ban)',
      message: `Haqiqatan ham ${u.firstName} foydalanuvchisini ${u.isBanned ? 'blokdan chiqarmoqchimisiz?' : 'botdan chetlashtirmoqchimisiz?'}`,
      type: u.isBanned ? 'success' : 'danger',
      confirmText: u.isBanned ? 'Blokdan chiqarish' : 'Bloklash (Ban)',
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        await fetch(`/api/admin/users/${u.id}/toggle-ban`, { method: 'PATCH' });
        showToast(`Holat yangilandi: ${u.isBanned ? 'Blokdan ochildi' : 'Bloklandi'}`, 'info');
        loadUsers();
      },
    });
  };

  if (!token) {
    return (
      <LoginScreen
        onLoginSuccess={(tok, admin) => {
          setToken(tok);
          setAdminUser(admin);
          showToast('Xush kelibsiz, Administrator!', 'success');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <ToastContainer toasts={toasts} />

      {/* Top Bar */}
      <header className="sticky top-0 z-40 glass-panel border-b border-slate-800/80 px-4 md:px-8 py-3.5 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-500 text-white shadow-md">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-white text-base tracking-tight">Open Budget</span>
              <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-400 font-mono text-[10px] font-bold border border-indigo-500/30">
                MASTER V3.2
              </span>
            </div>
            <p className="text-[11px] text-slate-400">10-Min Session & Dynamic Mahalla Limits</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono text-slate-300">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span>{currentTime}</span>
          </div>

          <div className="flex items-center space-x-2 pl-2 border-l border-slate-800">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-white leading-tight">{adminUser?.name || 'Administrator'}</p>
              <p className="text-[10px] font-mono text-cyan-400">{adminUser?.phone || '+998901234567'}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Chiqish"
              className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition cursor-pointer flex items-center gap-1 text-xs font-bold"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden md:inline">Chiqish</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 space-y-6">
        {/* Welcome Banner */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-indigo-950/50 via-slate-900/60 to-cyan-950/40 p-5 rounded-3xl border border-indigo-500/20">
          <div className="space-y-1">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <span>Assalomu alaykum, Administrator!</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            </h2>
            <p className="text-xs text-slate-400">
              Mahalla limitlari, 10 daqiqalik ovoz berish sessiyalari va yagona MySQL bazasi to'liq avtomatlashtirilgan.
            </p>
          </div>

          <div className="flex items-center space-x-2 w-full md:w-auto">
            <button
              onClick={() => setShowAddBotModal(true)}
              className="flex-1 md:flex-initial px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:opacity-95 text-white font-bold text-xs rounded-2xl shadow-lg transition flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Yangi Bot & Mahalla</span>
            </button>
            <button
              onClick={() => {
                loadAllData();
                showToast('Ma\'lumotlar yangilandi', 'info');
              }}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl transition cursor-pointer"
              title="Yangilash"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-panel rounded-3xl p-5 border-l-4 border-l-indigo-500">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Faol Botlar</span>
              <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400"><Bot className="w-4 h-4" /></span>
            </div>
            <div className="flex items-baseline space-x-2 mt-2">
              <h3 className="text-3xl font-black text-white">{stats?.onlineBotsCount || 0}</h3>
              <span className="text-xs text-slate-400">/ {stats?.totalBotsCount || 0} ta</span>
            </div>
            <div className="mt-2 text-[11px] font-bold text-emerald-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>100% Online</span>
            </div>
          </div>

          <div className="glass-panel rounded-3xl p-5 border-l-4 border-l-emerald-500">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tasdiqlangan</span>
              <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400"><CheckCircle className="w-4 h-4" /></span>
            </div>
            <div className="flex items-baseline space-x-2 mt-2">
              <h3 className="text-3xl font-black text-emerald-400">{formatSum(stats?.totalVotes || 0)}</h3>
              <span className="text-xs text-slate-400">ovoz</span>
            </div>
            <div className="mt-2 text-[11px] text-slate-400 font-medium">Har bir ovoz: 30 000 so'm</div>
          </div>

          <div className="glass-panel rounded-3xl p-5 border-l-4 border-l-cyan-500">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tekshiruvda (2-24s)</span>
              <span className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400"><Hourglass className="w-4 h-4" /></span>
            </div>
            <div className="flex items-baseline space-x-2 mt-2">
              <h3 className="text-3xl font-black text-cyan-400">{formatSum(stats?.pendingVotesCount || 0)}</h3>
              <span className="text-xs text-slate-400">kutilmoqda</span>
            </div>
            <div className="mt-2 text-[11px] text-cyan-300 font-medium">
              {stats?.pendingVotesCount ? `${formatMoney(stats.pendingVotesCount * 30000)} to'lanadi` : 'Navbat bo\'sh'}
            </div>
          </div>

          <div className="glass-panel rounded-3xl p-5 border-l-4 border-l-amber-500">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">To'langan Summa</span>
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400"><Wallet className="w-4 h-4" /></span>
            </div>
            <div className="flex items-baseline space-x-2 mt-2">
              <h3 className="text-2xl font-black text-amber-400">{formatMoney(stats?.totalPaid || 0)}</h3>
            </div>
            <div className="mt-2 text-[11px] text-amber-300 font-medium">{stats?.pendingWithdrawalsCount || 0} ta so'rov kutilmoqda</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-2 border-b border-slate-800 pb-2 overflow-x-auto">
          {[
            { id: 'dashboard', label: '📊 Asosiy Ko\'rinish', count: null },
            { id: 'bots', label: '🤖 Multi-Botlar (Mahallalar)', count: bots.length },
            { id: 'votes', label: '⏳ Kutilayotgan Ovozlar', count: pendingVotes.length },
            { id: 'withdrawals', label: '💳 Pul Yechish', count: withdrawals.length },
            { id: 'users', label: '👥 Foydalanuvchilar', count: stats?.totalUsers || 0 },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center space-x-2 shrink-0 cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-indigo-600 to-brand-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== null && (
                <span className="px-1.5 py-0.5 rounded-full bg-slate-800/80 text-[10px]">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="glass-panel rounded-3xl p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    <span>Faol Botlar va Mahallalar Xaritasi</span>
                  </h3>
                  <button onClick={() => setActiveTab('bots')} className="text-xs text-indigo-400 hover:underline font-bold cursor-pointer">
                    Barchasini ko'rish →
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {bots.slice(0, 4).map((bot) => (
                    <div key={bot.id} className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2.5">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="text-xs font-bold text-white">{bot.name}</h4>
                          <p className="text-[11px] text-indigo-400">@{bot.botUsername || 'running'}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          bot.isTargetReached
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}>
                          {bot.isTargetReached ? '🎯 Limitga yetdi' : '🟢 Yig\'ilmoqda'}
                        </span>
                      </div>

                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Mahalla:</span>
                        <span className="font-bold text-slate-200">{bot.mahallaName}</span>
                      </div>

                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-400">Ovozlar:</span>
                        <span className="font-bold text-emerald-400">
                          {formatSum(bot.currentVotes || 0)} / {formatSum(bot.targetVotes || 5000)}
                        </span>
                      </div>

                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            bot.isTargetReached ? 'bg-amber-500' : 'bg-gradient-to-r from-indigo-500 to-emerald-400'
                          }`}
                          style={{ width: `${bot.percentage || Math.min(100, Math.round(((bot.currentVotes || 0) / (bot.targetVotes || 5000)) * 100))}%` }}
                        ></div>
                      </div>

                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Progress: {bot.percentage || 0}%</span>
                        <span className="text-cyan-300 font-bold">Qolgan: {formatSum(bot.remainingVotes ?? Math.max(0, (bot.targetVotes || 5000) - (bot.currentVotes || 0)))} ta</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pending Votes Widget */}
              <div className="glass-panel rounded-3xl p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <Hourglass className="w-4 h-4 text-cyan-400" />
                    <span>Tekshiruvdagi So'nggi Ovozlar (2-24 soat)</span>
                  </h3>
                  {pendingVotes.length > 0 && (
                    <button onClick={handleApproveAllVotes} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition cursor-pointer">
                      Barchasini tasdiqlash
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider">
                      <tr>
                        <th className="p-3">Telefon</th>
                        <th className="p-3">Mahalla</th>
                        <th className="p-3">Mukofot</th>
                        <th className="p-3 text-right">Amal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {pendingVotes.length === 0 ? (
                        <tr><td colSpan={4} className="p-4 text-center text-slate-500">Kutilayotgan ovozlar yo'q</td></tr>
                      ) : (
                        pendingVotes.slice(0, 5).map((v) => (
                          <tr key={v.id} className="hover:bg-slate-900/50">
                            <td className="p-3 font-mono font-bold text-cyan-300">+{v.phone}</td>
                            <td className="p-3 text-slate-300">{v.botInstance?.mahallaName || 'Asosiy Mahalla'}</td>
                            <td className="p-3 font-bold text-emerald-400">+{formatMoney(v.rewardAmount)}</td>
                            <td className="p-3 text-right">
                              <button onClick={() => handleApproveVote(v)} className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold cursor-pointer">
                                Tasdiqlash
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* DevOps Box */}
            <div className="space-y-6">
              <div className="glass-panel rounded-3xl p-6 space-y-4 border border-cyan-500/20">
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Server className="w-4 h-4 text-cyan-400" />
                  <span>DevOps & Aqlli Algoritm</span>
                </h3>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
                    <span className="text-slate-400">Tirik Sessiya Limiti:</span>
                    <span className="text-indigo-400 font-bold font-mono">⌛️ 10 Daqiqa</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
                    <span className="text-slate-400">SMS Kod Timeout:</span>
                    <span className="text-cyan-400 font-bold font-mono">⏱ 2 Daqiqa (120s)</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
                    <span className="text-slate-400">Mahalla Max Limiti:</span>
                    <span className="text-emerald-400 font-bold font-mono">🎯 Moslashuvchan</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
                    <span className="text-slate-400">Pasport Qoidasi:</span>
                    <span className="text-emerald-400 font-bold font-mono">🟢 1 Pasport = 1 Ovoz</span>
                  </div>
                </div>
              </div>

              {/* Bot Profile Image & Avatar Card */}
              <div className="glass-panel rounded-3xl p-6 space-y-3.5 border border-indigo-500/30">
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Image className="w-4 h-4 text-cyan-400" />
                  <span>Rasmiy Bot Avatari (Profil Rasmi)</span>
                </h3>

                <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-slate-900/90 border border-slate-800">
                  <img
                    src="/assets/open_budget_avatar.jpg"
                    alt="Open Budget 3D Avatar"
                    className="w-16 h-16 rounded-2xl object-cover shadow-xl border-2 border-cyan-400/40 shrink-0"
                  />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-white">Open Budget 2026 3D Shield</p>
                    <p className="text-[11px] text-slate-400">1:1 Ultra-HD 8K Avatar</p>
                    <a
                      href="/assets/open_budget_avatar.jpg"
                      download="open_budget_avatar.jpg"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:opacity-95 text-white font-bold text-[11px] rounded-xl shadow cursor-pointer transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Rasmni Yuklab Olish</span>
                    </a>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-indigo-950/40 border border-indigo-500/20 text-[11px] text-slate-300 space-y-1">
                  <p className="font-bold text-cyan-300">💡 BotFather ga qo'yish yo'riqnomasi:</p>
                  <p>1. Telegramda <b>@BotFather</b> ga kiring va <code>/setuserpic</code> buyrug'ini yuboring.</p>
                  <p>2. O'z botingizni tanlang va yuklab olingan rasmni yuboring.</p>
                  <p>3. Bot profil rasmi Telegramda bir zumda yangilanadi!</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: BOTS */}
        {activeTab === 'bots' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bots.map((bot) => (
                <div key={bot.id} className="glass-panel rounded-3xl p-5 space-y-4 border border-indigo-500/20 relative overflow-hidden">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <img
                        src={bot.avatarUrl || '/assets/open_budget_avatar.jpg'}
                        alt="Bot Avatar"
                        className="w-11 h-11 rounded-2xl object-cover border border-cyan-400/40 shadow shrink-0"
                      />
                      <div>
                        <h3 className="font-extrabold text-white text-sm">{bot.name}</h3>
                        <p className="text-xs text-indigo-400 font-medium">@{bot.botUsername || 'birlanmoqda'}</p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                      bot.isLiveRunning
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}>
                      {bot.isLiveRunning ? '🟢 Online' : '🔴 To\'xtatilgan'}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Mahalla:</span>
                      <span className="font-bold text-slate-200">{bot.mahallaName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Mahalla ID:</span>
                      <span className="font-mono text-cyan-300 font-bold">{bot.mahallaId}</span>
                    </div>

                    {/* Progress with target */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-400 flex items-center gap-1">
                          <Target className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Maksimal Reja:</span>
                        </span>
                        <span className="font-bold text-white">
                          {formatSum(bot.currentVotes || 0)} / {formatSum(bot.targetVotes || 5000)}
                        </span>
                      </div>

                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            bot.isTargetReached ? 'bg-amber-500' : 'bg-gradient-to-r from-indigo-500 to-emerald-400'
                          }`}
                          style={{ width: `${bot.percentage || Math.min(100, Math.round(((bot.currentVotes || 0) / (bot.targetVotes || 5000)) * 100))}%` }}
                        ></div>
                      </div>

                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span className="font-bold text-indigo-300">{bot.percentage || 0}% yig'ildi</span>
                        <span className={`font-bold ${bot.isTargetReached ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {bot.isTargetReached ? '🏁 Limit to\'ldi' : `Qolgan: ${formatSum(bot.remainingVotes ?? Math.max(0, (bot.targetVotes || 5000) - (bot.currentVotes || 0)))} ta`}
                        </span>
                      </div>
                    </div>

                    <div className="pt-1 truncate">
                      <a href={bot.openBudgetUrl} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline text-[11px] flex items-center space-x-1">
                        <span>OpenBudget havolasi</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <div className="space-x-1 flex items-center">
                      {bot.isLiveRunning ? (
                        <button
                          onClick={() => handleStopBot(bot)}
                          className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-xl font-bold text-xs transition cursor-pointer"
                        >
                          To'xtatish
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStartBot(bot.id, bot.name)}
                          className="px-2.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-xl font-bold text-xs transition cursor-pointer"
                        >
                          Ishga tushirish
                        </button>
                      )}

                      <button
                        onClick={() => setEditingBot(bot)}
                        className="px-2.5 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-1"
                        title="Bot, Limit va Avatar sozlamalarini tahrirlash"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Tahrirlash</span>
                      </button>
                    </div>

                    <button
                      onClick={() => handleDeleteBot(bot)}
                      className="px-2 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl font-bold text-xs transition cursor-pointer"
                    >
                      O'chirish
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: VOTES */}
        {activeTab === 'votes' && (
          <div className="glass-panel rounded-3xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">Tekshirilayotgan Ovozlar (2-24 soat)</h2>
                <p className="text-xs text-slate-400">Tasdiqlangach foydalanuvchiga +30 000 so'm yoziladi</p>
              </div>
              <button
                onClick={handleApproveAllVotes}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition shadow-md cursor-pointer"
              >
                Barchasini Bir Zumda Tasdiqlash
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="p-3">ID</th>
                    <th className="p-3">Foydalanuvchi</th>
                    <th className="p-3">Telefon</th>
                    <th className="p-3">Mahalla / Bot</th>
                    <th className="p-3">Mukofot</th>
                    <th className="p-3">Sana</th>
                    <th className="p-3 text-right">Amallar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {pendingVotes.length === 0 ? (
                    <tr><td colSpan={7} className="p-6 text-center text-slate-500">Hozirda tekshirilayotgan ovozlar yo'q</td></tr>
                  ) : (
                    pendingVotes.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-900/50">
                        <td className="p-3 font-mono font-bold text-slate-400">#{v.id}</td>
                        <td className="p-3 font-semibold text-white">{v.user?.firstName} (@{v.user?.username || 'yoq'})</td>
                        <td className="p-3 font-mono text-cyan-300 font-bold">+{v.phone}</td>
                        <td className="p-3 text-slate-300">{v.botInstance?.mahallaName || 'Asosiy Bot'}</td>
                        <td className="p-3 font-bold text-emerald-400">+{formatMoney(v.rewardAmount)}</td>
                        <td className="p-3 text-slate-400">{new Date(v.createdAt).toLocaleString()}</td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleApproveVote(v)}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition cursor-pointer"
                          >
                            Tasdiqlash
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: WITHDRAWALS */}
        {activeTab === 'withdrawals' && (
          <div className="glass-panel rounded-3xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">Kutilayotgan Pul Yechish Arizalari</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="p-3">ID</th>
                    <th className="p-3">Foydalanuvchi</th>
                    <th className="p-3">Summa</th>
                    <th className="p-3">To'lov Turi</th>
                    <th className="p-3">Karta / Telefon</th>
                    <th className="p-3">Karta Egasi</th>
                    <th className="p-3">Sana</th>
                    <th className="p-3 text-right">Amallar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {withdrawals.length === 0 ? (
                    <tr><td colSpan={8} className="p-6 text-center text-slate-500">Kutilayotgan arizalar yo'q</td></tr>
                  ) : (
                    withdrawals.map((w) => (
                      <tr key={w.id} className="hover:bg-slate-900/50">
                        <td className="p-3 font-mono text-slate-400">#{w.id}</td>
                        <td className="p-3 font-semibold text-white">{w.user?.firstName} (@{w.user?.username || 'yoq'})</td>
                        <td className="p-3 font-bold text-emerald-400">{formatMoney(w.amount)}</td>
                        <td className="p-3 font-bold text-slate-300">{w.paymentMethod}</td>
                        <td className="p-3 font-mono text-indigo-300 font-bold">{w.accountDetails}</td>
                        <td className="p-3 text-slate-200 font-semibold">{w.cardHolder || '-'}</td>
                        <td className="p-3 text-slate-400">{new Date(w.createdAt).toLocaleString()}</td>
                        <td className="p-3 text-right space-x-2">
                          <button
                            onClick={() => handleApproveWithdrawal(w)}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold cursor-pointer transition shadow-md"
                          >
                            Tasdiqlash & Chek
                          </button>
                          <button
                            onClick={() => handleRejectWithdrawal(w)}
                            className="px-2.5 py-1 bg-rose-600/80 hover:bg-rose-600 text-white rounded-lg font-bold cursor-pointer transition"
                          >
                            Rad etish
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: USERS */}
        {activeTab === 'users' && (
          <div className="glass-panel rounded-3xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <h2 className="text-lg font-bold text-white">Foydalanuvchilar Bazasi (Yagona Baza)</h2>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="Ism, telefon, username..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="px-3.5 py-2 glass-input rounded-xl text-xs text-white focus:outline-none"
                />
                <button onClick={loadUsers} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs cursor-pointer">
                  Qidirish
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="p-3">ID</th>
                    <th className="p-3">Ism / Username</th>
                    <th className="p-3">Telefon</th>
                    <th className="p-3">Balans</th>
                    <th className="p-3">Takliflar (5k)</th>
                    <th className="p-3">Ovozlar (30k)</th>
                    <th className="p-3">Bot</th>
                    <th className="p-3 text-right">Amallar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-900/50">
                      <td className="p-3 font-mono text-slate-400">#{u.id}</td>
                      <td className="p-3 font-semibold text-white">{u.firstName} (@{u.username || 'yoq'})</td>
                      <td className="p-3 text-slate-300">{u.phone || '-'}</td>
                      <td className="p-3 font-bold text-emerald-400">{formatMoney(u.balance)}</td>
                      <td className="p-3 text-slate-300">{formatSum(u._count?.referrals || 0)} ta</td>
                      <td className="p-3 font-bold text-indigo-400">{formatSum(u.totalVotes || 0)} ta</td>
                      <td className="p-3 text-slate-400">{u.botInstance?.mahallaName || 'Birlamchi'}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleToggleBan(u)}
                          className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                            u.isBanned
                              ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {u.isBanned ? '🔓 Ochish' : '🚫 Ban'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
        confirmText={confirmModal.confirmText}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Prompt Modal */}
      <PromptModal
        isOpen={promptModal.isOpen}
        title={promptModal.title}
        message={promptModal.message}
        placeholder={promptModal.placeholder}
        defaultValue={promptModal.defaultValue}
        confirmText={promptModal.confirmText}
        onConfirm={promptModal.onConfirm}
        onCancel={() => setPromptModal((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Add Bot Modal */}
      <AddBotModal
        isOpen={showAddBotModal}
        onClose={() => setShowAddBotModal(false)}
        newBot={newBot}
        setNewBot={setNewBot}
        onSubmit={handleAddBot}
      />

      {/* Edit Bot Modal (Target & Mahalla Settings) */}
      <EditBotModal
        isOpen={!!editingBot}
        onClose={() => setEditingBot(null)}
        bot={editingBot}
        onSave={handleSaveBotSettings}
      />

      {/* Approve Withdrawal Modal with Receipt Upload */}
      <ApproveWithdrawalModal
        isOpen={!!approvingWithdrawal}
        onClose={() => setApprovingWithdrawal(null)}
        withdrawal={approvingWithdrawal}
        onConfirm={handleConfirmApproveWithdrawal}
      />
    </div>
  );
}
