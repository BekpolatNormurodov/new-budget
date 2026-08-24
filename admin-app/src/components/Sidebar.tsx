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
  X,
  Zap,
  Sun,
  Moon,
} from 'lucide-react';
import { TabType, DashboardStats } from '../types';

interface SidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  stats: DashboardStats | null;
  onLogout: () => void;
  isCollapsed: boolean;
  setIsCollapsed: (val: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (val: boolean) => void;
  adminUser?: any;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  stats,
  onLogout,
  isCollapsed,
  setIsCollapsed,
  isMobileOpen,
  setIsMobileOpen,
  adminUser,
  theme = 'dark',
  onToggleTheme,
}) => {
  const menuItems = [
    {
      id: 'bots' as TabType,
      label: 'Botlar & Mahallalar',
      icon: Bot,
      badge: stats?.bots?.length ? `${stats.bots.length} ta` : null,
      badgeColor: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    },
    {
      id: 'agents' as TabType,
      label: 'Agentlar Tizimi',
      icon: Users,
      badge: null,
      badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    },
    {
      id: 'votes' as TabType,
      label: 'Ovozlar Nazorati',
      icon: Vote,
      badge: stats?.pendingVotesCount ? stats.pendingVotesCount : null,
      badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    },
    {
      id: 'withdrawals' as TabType,
      label: 'Pul Yechish So\'rovlari',
      icon: Wallet,
      badge: stats?.pendingWithdrawalsCount ? stats.pendingWithdrawalsCount : null,
      badgeColor: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    },
    {
      id: 'users' as TabType,
      label: 'Foydalanuvchilar',
      icon: Users,
      badge: stats?.totalUsers ? stats.totalUsers : null,
      badgeColor: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
    },
  ];

  const handleSelectTab = (id: TabType) => {
    setActiveTab(id);
    setIsMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 dark:bg-black/80 backdrop-blur-sm lg:hidden animate-in fade-in duration-200"
        />
      )}

      {/* Sidebar Drawer Container */}
      <aside
        className={`fixed top-0 left-0 z-50 h-screen transition-all duration-300 ease-in-out bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-2xl ${
          isMobileOpen ? 'translate-x-0 w-72' : '-translate-x-full lg:translate-x-0'
        } ${isCollapsed ? 'lg:w-20' : 'lg:w-64'}`}
      >
        {/* Top Header & Navigation */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Brand Header */}
          <div className={`flex items-center p-4 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-950/60 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 flex-shrink-0">
                <Zap className="w-5 h-5 fill-current" />
              </div>
              {!isCollapsed && (
                <div className="overflow-hidden animate-in fade-in duration-200">
                  <h1 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide flex items-center gap-1.5">
                    Open Budget <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">PRO</span>
                  </h1>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Boshqaruv Paneli</p>
                </div>
              )}
            </div>

            {/* Desktop Collapse Button */}
            {!isCollapsed && (
              <button
                onClick={() => setIsCollapsed(true)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors hidden lg:block cursor-pointer"
                title="Kichraytirish"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}

            {/* Mobile Close Button */}
            <button
              onClick={() => setIsMobileOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors lg:hidden cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Expand button when collapsed */}
          {isCollapsed && (
            <div className="hidden lg:flex justify-center pt-2">
              <button
                onClick={() => setIsCollapsed(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Kengaytirish"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Navigation Menu */}
          <nav className="p-3 space-y-1.5 overflow-y-auto flex-1 bg-white dark:bg-slate-900">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectTab(item.id)}
                  className={`w-full flex items-center p-3 rounded-xl text-xs font-bold transition-all group cursor-pointer ${
                    isCollapsed ? 'justify-center' : 'justify-between'
                  } ${
                    isActive
                      ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-600/30'
                      : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80'
                  }`}
                  title={isCollapsed ? item.label : undefined}
                >
                  <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : ''}`}>
                    <Icon
                      className={`w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-110 ${
                        isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400'
                      }`}
                    />
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                  </div>

                  {!isCollapsed && item.badge !== null && (
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

        {/* Bottom Section: 1m Live Health Widget & Admin Profile */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-950/60 space-y-2">
          {/* 1-Minute Live Health Status Widget */}
          <button
            onClick={() => handleSelectTab('health')}
            className={`w-full p-2.5 rounded-xl border transition-all cursor-pointer flex items-center ${
              isCollapsed ? 'justify-center' : 'justify-between'
            } ${
              activeTab === 'health'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
            }`}
            title="Tizim Salomatligi (Har 1 daqiqada yangilanadi)"
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              {!isCollapsed && (
                <div className="text-left overflow-hidden">
                  <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1">
                    <span>Tizim A'lo</span>
                    <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-mono">1m Live</span>
                  </p>
                  <p className="text-[9px] text-slate-500 dark:text-slate-400 truncate">400 Proxy & Botlar faol</p>
                </div>
              )}
            </div>
            {!isCollapsed && (
              <Activity className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 animate-pulse" />
            )}
          </button>

          {/* Profile & Controls */}
          <div className={`flex items-center p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 ${
            isCollapsed ? 'justify-center flex-col gap-2' : 'justify-between'
          }`}>
            <div className={`flex items-center gap-2 overflow-hidden ${isCollapsed ? 'justify-center' : ''}`}>
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 flex-shrink-0 font-bold text-xs">
                <ShieldCheck className="w-4 h-4" />
              </div>
              {!isCollapsed && (
                <div className="overflow-hidden">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{adminUser?.name || 'Administrator'}</p>
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium truncate">🟢 Online (Admin)</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1">
              {onToggleTheme && (
                <button
                  onClick={onToggleTheme}
                  className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex-shrink-0 cursor-pointer"
                  title={theme === 'dark' ? "Yorug' rejim" : "Qorong'i rejim"}
                >
                  {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-indigo-600" />}
                </button>
              )}

              <button
                onClick={onLogout}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors flex-shrink-0 cursor-pointer"
                title="Tizimdan chiqish"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
