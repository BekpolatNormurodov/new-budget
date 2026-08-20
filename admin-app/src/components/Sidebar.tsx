import React from 'react';
import {
  LayoutDashboard,
  Bot,
  Vote,
  Wallet,
  Users,
  Activity,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Zap,
  X,
} from 'lucide-react';
import { AdminUser, DashboardStats } from '../types';

interface SidebarProps {
  activeTab: 'dashboard' | 'bots' | 'votes' | 'withdrawals' | 'users' | 'health';
  setActiveTab: (tab: 'dashboard' | 'bots' | 'votes' | 'withdrawals' | 'users' | 'health') => void;
  stats: DashboardStats | null;
  adminUser: AdminUser | null;
  onLogout: () => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  stats,
  adminUser,
  onLogout,
  isCollapsed,
  setIsCollapsed,
  isMobileOpen,
  setIsMobileOpen,
}) => {
  const menuItems = [
    {
      id: 'dashboard',
      label: 'Boshqaruv Paneli',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'bots',
      label: 'Botlar Menejeri',
      icon: Bot,
      badge: stats ? `${stats.onlineBotsCount}/${stats.totalBotsCount}` : null,
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    },
    {
      id: 'votes',
      label: 'Ovozlar Ro\'yxati',
      icon: Vote,
      badge: stats?.pendingVotesCount ? stats.pendingVotesCount : null,
      badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    },
    {
      id: 'withdrawals',
      label: 'Pul Yechish So\'rovlari',
      icon: Wallet,
      badge: stats?.pendingWithdrawalsCount ? stats.pendingWithdrawalsCount : null,
      badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    },
    {
      id: 'users',
      label: 'Foydalanuvchilar',
      icon: Users,
      badge: stats?.totalUsers ? stats.totalUsers : null,
      badgeColor: 'bg-slate-800 text-slate-400 border-slate-700',
    },
    {
      id: 'health',
      label: 'Tizim Monitoringi',
      icon: Activity,
      badge: stats?.health?.status === 'HEALTHY' ? 'OK' : (stats?.health?.status || 'OK'),
      badgeColor: stats?.health?.status === 'UNHEALTHY'
        ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    },
  ];

  const handleSelectTab = (id: any) => {
    setActiveTab(id);
    setIsMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm lg:hidden animate-in fade-in duration-200"
        />
      )}

      {/* Sidebar Drawer Container */}
      <aside
        className={`fixed top-0 left-0 z-50 h-screen transition-all duration-300 ease-in-out bg-slate-900/98 lg:bg-slate-900/95 backdrop-blur-2xl border-r border-slate-800 flex flex-col justify-between ${
          isMobileOpen ? 'translate-x-0 w-72 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        } ${isCollapsed ? 'lg:w-20' : 'lg:w-64'}`}
      >
        {/* Brand Header */}
        <div>
          <div className="flex items-center justify-between p-4 border-b border-slate-800">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 flex-shrink-0">
                <Zap className="w-5 h-5 fill-current" />
              </div>
              <div className="overflow-hidden">
                <h1 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
                  Open Budget <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">PRO</span>
                </h1>
                <p className="text-[11px] text-slate-400 font-medium">Boshqaruv Paneli</p>
              </div>
            </div>

            {/* Desktop Collapse Button */}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors hidden lg:block"
              title={isCollapsed ? 'Kengaytirish' : 'Kichraytirish'}
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>

            {/* Mobile Close Button */}
            <button
              onClick={() => setIsMobileOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors lg:hidden"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Menu */}
          <nav className="p-3 space-y-1.5 overflow-y-auto max-h-[calc(100vh-190px)]">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectTab(item.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-semibold transition-all group ${
                    isActive
                      ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <Icon
                      className={`w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-110 ${
                        isActive ? 'text-white' : 'text-slate-400 group-hover:text-indigo-400'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </div>

                  {item.badge !== null && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        isActive ? 'bg-white/20 text-white border-white/30' : item.badgeColor
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer Profile & Logout */}
        <div className="p-3 border-t border-slate-800 bg-slate-900/50">
          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-800/40 border border-slate-800/80 mb-2">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0 font-bold text-xs">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-white truncate">{adminUser?.name || 'Administrator'}</p>
                <p className="text-[10px] text-emerald-400 font-medium truncate">🟢 Online (Admin)</p>
              </div>
            </div>

            <button
              onClick={onLogout}
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors flex-shrink-0"
              title="Tizimdan chiqish"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          <div className="text-center">
            <p className="text-[10px] text-slate-500">Open Budget Pro Server v2.6.0</p>
          </div>
        </div>
      </aside>
    </>
  );
};
