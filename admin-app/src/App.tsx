import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Bot,
  Vote,
  Wallet,
  Users,
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
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { BotsView } from './components/BotsView';
import { VotesView } from './components/VotesView';
import { WithdrawalsView } from './components/WithdrawalsView';
import { UsersView } from './components/UsersView';
import { HealthView } from './components/HealthView';

export function App() {
  const [token, setToken] = useState<string>(() => localStorage.getItem('ob_admin_token') || '');
  const [adminUser, setAdminUser] = useState<AdminUser | null>(() => {
    const saved = localStorage.getItem('ob_admin_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('ob_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('ob_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const [activeTab, setActiveTab] = useState<'bots' | 'votes' | 'withdrawals' | 'users' | 'health'>('bots');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [bots, setBots] = useState<BotInstanceItem[]>([]);
  const [pendingVotes, setPendingVotes] = useState<VoteItem[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [globalSearch, setGlobalSearch] = useState('');
  const [loading, setLoading] = useState(false);

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
    avatarImage: undefined as string | undefined,
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
      const interval = setInterval(loadAllData, 15000);
      return () => clearInterval(interval);
    }
  }, [token]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [statsRes, usersRes, withdrawalsRes] = await Promise.all([
        fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/users?limit=100', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/withdrawals', { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
        setBots(statsData.bots || []);
        setPendingVotes(statsData.pendingVotes || []);
      }

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData.users || []);
      }

      if (withdrawalsRes.ok) {
        const withdrawalsData = await withdrawalsRes.json();
        setWithdrawals(withdrawalsData || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(newBot),
      });
      if (!res.ok) throw new Error();
      showToast(`✅ "${newBot.name || newBot.mahallaName}" muvaffaqiyatli ishga tushirildi!`, 'success');
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
        avatarImage: undefined,
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(updatedData),
      });
      if (!res.ok) throw new Error();
      showToast(`✅ Bot sozlamalari yangilandi!`, 'success');
      setEditingBot(null);
      loadAllData();
    } catch (e) {
      showToast('Sozlamalarni saqlashda xatolik yuz berdi', 'error');
    }
  };

  const handleStopBot = (id: number) => {
    const bot = bots.find((b) => b.id === id);
    setConfirmModal({
      isOpen: true,
      title: 'Botni to\'xtatish',
      message: `Haqiqatan ham "${bot?.name || bot?.mahallaName}" botini to'xtatmoqchimisiz?`,
      type: 'warning',
      confirmText: 'Ha, to\'xtatilsin',
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        await fetch(`/api/admin/bots/${id}/stop`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        showToast(`🛑 "${bot?.name}" to'xtatildi`, 'info');
        loadAllData();
      },
    });
  };

  const handleStartBot = async (id: number) => {
    const bot = bots.find((b) => b.id === id);
    await fetch(`/api/admin/bots/${id}/start`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    showToast(`🟢 "${bot?.name || 'Bot'}" muvaffaqiyatli ishga tushdi!`, 'success');
    loadAllData();
  };

  const handleDeleteBot = (id: number, name: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Botni o\'chirish',
      message: `Diqqat! "${name}" boti va unga tegishli sozlamalar tizimdan butunlay o'chiriladi. Ushbu amalni tasdiqlaysizmi?`,
      type: 'danger',
      confirmText: 'Ha, o\'chirilsin',
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        await fetch(`/api/admin/bots/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        showToast(`🗑 "${name}" o'chirildi`, 'info');
        loadAllData();
      },
    });
  };

  const handleApproveVote = (id: number) => {
    const vote = pendingVotes.find((v) => v.id === id);
    setConfirmModal({
      isOpen: true,
      title: 'Ovozni tasdiqlash',
      message: `+${vote?.phone || ''} raqami orqali berilgan ovozni tasdiqlab, foydalanuvchiga +30 000 so'm mukofot yozilsinmi?`,
      type: 'success',
      confirmText: 'Ha, tasdiqlansin',
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        await fetch(`/api/admin/votes/${id}/approve`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
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
        const res = await fetch('/api/admin/votes/approve-all', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        showToast(`🎉 Jami ${formatSum(data.count)} ta ovoz tasdiqlandi va to'lab berildi!`, 'success');
        loadAllData();
      },
    });
  };

  const handleConfirmApproveWithdrawal = async (id: number, receiptImage?: string, note?: string) => {
    try {
      const res = await fetch(`/api/admin/withdrawals/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

  const handleRejectWithdrawal = (id: number) => {
    const w = withdrawals.find((item) => item.id === id);
    setPromptModal({
      isOpen: true,
      title: 'Pul yechish arizasini rad etish',
      message: `Foydalanuvchiga nima sababdan rad etilganligi haqida xabar yuboriladi va mablag' (${formatMoney(w?.amount || 0)}) uning balansiga qaytariladi:`,
      placeholder: 'Rad etish sababi...',
      defaultValue: 'Admin tomonidan rad etildi',
      confirmText: 'Rad etish va Mablag\'ni qaytarish',
      onConfirm: async (note) => {
        setPromptModal((prev) => ({ ...prev, isOpen: false }));
        await fetch(`/api/admin/withdrawals/${id}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ note }),
        });
        showToast(`❌ #${id} ariza rad etildi va mablag' balansga qaytarildi`, 'info');
        loadAllData();
      },
    });
  };

  const handleUpdateUserBalance = async (userId: number, amount: number, isAddition: boolean) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/balance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount, isAddition }),
      });
      if (!res.ok) throw new Error();
      showToast('✅ Foydalanuvchi balansi muvaffaqiyatli yangilandi!', 'success');
      loadAllData();
    } catch (e) {
      showToast('Balansni yangilashda xatolik', 'error');
    }
  };

  const handleToggleBan = (userId: number) => {
    const u = users.find((item) => item.id === userId);
    setConfirmModal({
      isOpen: true,
      title: u?.isBanned ? 'Foydalanuvchi blokini ochish' : 'Foydalanuvchini bloklash (Ban)',
      message: `Haqiqatan ham ${u?.firstName || 'Foydalanuvchi'} hisobini ${u?.isBanned ? 'blokdan chiqarmoqchimisiz?' : 'botdan chetlashtirmoqchimisiz?'}`,
      type: u?.isBanned ? 'success' : 'danger',
      confirmText: u?.isBanned ? 'Blokdan chiqarish' : 'Bloklash (Ban)',
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        await fetch(`/api/admin/users/${userId}/toggle-ban`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
        showToast(`Holat yangilandi: ${u?.isBanned ? 'Blokdan ochildi' : 'Bloklandi'}`, 'info');
        loadAllData();
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

  const getTabTitle = () => {
    switch (activeTab) {
      case 'dashboard': return 'Boshqaruv Paneli & Statistika';
      case 'bots': return 'Botlar Menejeri & Mahallalar';
      case 'votes': return 'Ovozlar Ro\'yxati & Tasdiqlash';
      case 'withdrawals': return 'Pul Yechish So\'rovlari';
      case 'users': return 'Foydalanuvchilar Bazasi';
      case 'health': return '30-Daqiqalik Tizim Monitoringi';
    }
  };

  const getTabSubtitle = () => {
    switch (activeTab) {
      case 'dashboard': return 'Umumiy moliyaviy oqim, ovozlar va mahalla progressi';
      case 'bots': return 'Ko\'p botli orchestrator va mahallalar ovoz yig\'ish rejasi';
      case 'votes': return 'SMS orqali kutilayotgan va tasdiqlangan barcha ovozlar';
      case 'withdrawals': return 'Foydalanuvchilarning pul yechish arizalari va cheklar';
      case 'users': return 'Barcha mijozlar, ularning balansi va referallari';
      case 'health': return 'OpenBudget API, Captcha solver va proxylar salomatligi';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col lg:flex-row pb-16 lg:pb-0 transition-colors">
      {/* Smart Sidebar (Desktop & Mobile Drawer) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        stats={stats}
        adminUser={adminUser}
        onLogout={handleLogout}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ease-in-out pl-0 ${
          isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'
        }`}
      >
        {/* Smart Header */}
        <Header
          activeTabTitle={getTabTitle()}
          activeTabSubtitle={getTabSubtitle()}
          currentTime={currentTime}
          stats={stats}
          loading={loading}
          onRefresh={loadAllData}
          onOpenAddBot={() => setShowAddBotModal(true)}
          onOpenMobileMenu={() => setIsMobileOpen(true)}
          globalSearch={globalSearch}
          setGlobalSearch={setGlobalSearch}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        {/* Dynamic Tab Views */}
        <main className="flex-1 p-3 sm:p-5 lg:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'bots' && (
            <BotsView
              bots={bots}
              onOpenAddBot={() => setShowAddBotModal(true)}
              onOpenEditBot={setEditingBot}
              onStartBot={handleStartBot}
              onStopBot={handleStopBot}
              onDeleteBot={handleDeleteBot}
            />
          )}

          {activeTab === 'votes' && (
            <VotesView
              pendingVotes={pendingVotes}
              allVotes={pendingVotes}
              bots={bots}
              onApproveVote={handleApproveVote}
              onApproveAll={handleApproveAllVotes}
            />
          )}

          {activeTab === 'withdrawals' && (
            <WithdrawalsView
              withdrawals={withdrawals}
              bots={bots}
              onOpenApproveModal={setApprovingWithdrawal}
              onRejectWithdrawal={handleRejectWithdrawal}
            />
          )}

          {activeTab === 'users' && (
            <UsersView
              users={users}
              bots={bots}
              onUpdateBalance={handleUpdateUserBalance}
              onToggleBan={handleToggleBan}
            />
          )}

          {activeTab === 'health' && (
            <HealthView token={token} showToast={showToast} />
          )}
        </main>
      </div>

      {/* Mobile Bottom Quick Bar for Phones (lg:hidden) */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 flex items-center justify-around py-2 px-1 lg:hidden transition-colors">
        {[
          { id: 'bots', label: 'Botlar', icon: Bot, badge: stats ? `${stats.onlineBotsCount}` : null },
          { id: 'votes', label: 'Ovozlar', icon: Vote, badge: stats?.pendingVotesCount || null },
          { id: 'withdrawals', label: 'Yechish', icon: Wallet, badge: stats?.pendingWithdrawalsCount || null },
          { id: 'users', label: 'Mijozlar', icon: Users, badge: stats?.totalUsers || null },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex flex-col items-center justify-center p-1.5 rounded-xl transition-all relative flex-1 cursor-pointer ${
                isActive ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                {tab.badge && (
                  <span className="absolute -top-1.5 -right-2 px-1.5 py-0.2 text-[9px] font-black bg-rose-500 text-white rounded-full">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] tracking-tight mt-0.5">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Modals */}
      {showAddBotModal && (
        <AddBotModal
          isOpen={showAddBotModal}
          onClose={() => setShowAddBotModal(false)}
          onSubmit={handleAddBot}
          newBot={newBot}
          setNewBot={setNewBot}
        />
      )}

      {editingBot && (
        <EditBotModal
          isOpen={!!editingBot}
          onClose={() => setEditingBot(null)}
          bot={editingBot}
          onSave={(id, updated) => handleSaveBotSettings(id, updated)}
        />
      )}

      {approvingWithdrawal && (
        <ApproveWithdrawalModal
          isOpen={!!approvingWithdrawal}
          onClose={() => setApprovingWithdrawal(null)}
          withdrawal={approvingWithdrawal}
          onConfirm={(id, receipt, note) => handleConfirmApproveWithdrawal(id, receipt, note)}
        />
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
        confirmText={confirmModal.confirmText}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />

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

      <ToastContainer toasts={toasts} />
    </div>
  );
}
