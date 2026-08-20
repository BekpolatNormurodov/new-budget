import React, { useState, useEffect } from 'react';
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
import { DashboardView } from './components/DashboardView';
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

  const [activeTab, setActiveTab] = useState<'dashboard' | 'bots' | 'votes' | 'withdrawals' | 'users' | 'health'>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
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
      const data = await res.json();
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Smart Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        stats={stats}
        adminUser={adminUser}
        onLogout={handleLogout}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
      />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? 'pl-20' : 'pl-64'
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
          globalSearch={globalSearch}
          setGlobalSearch={setGlobalSearch}
        />

        {/* Dynamic Tab Views */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'dashboard' && (
            <DashboardView
              stats={stats}
              onNavigateTab={setActiveTab}
              onApproveVote={handleApproveVote}
              onOpenApproveWithdrawal={setApprovingWithdrawal}
              onOpenEditBot={setEditingBot}
            />
          )}

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
              onOpenApproveModal={setApprovingWithdrawal}
              onRejectWithdrawal={handleRejectWithdrawal}
            />
          )}

          {activeTab === 'users' && (
            <UsersView
              users={users}
              onUpdateBalance={handleUpdateUserBalance}
              onToggleBan={handleToggleBan}
            />
          )}

          {activeTab === 'health' && (
            <HealthView token={token} showToast={showToast} />
          )}
        </main>
      </div>

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
