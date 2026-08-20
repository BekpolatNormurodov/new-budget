import React from 'react';
import {
  Clock,
  RefreshCw,
  PlusCircle,
  Activity,
  Search,
  Menu,
  Zap,
} from 'lucide-react';
import { DashboardStats } from '../types';

interface HeaderProps {
  activeTabTitle: string;
  activeTabSubtitle?: string;
  currentTime: string;
  stats: DashboardStats | null;
  loading: boolean;
  onRefresh: () => void;
  onOpenAddBot: () => void;
  onOpenMobileMenu: () => void;
  globalSearch: string;
  setGlobalSearch: (val: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTabTitle,
  activeTabSubtitle,
  currentTime,
  stats,
  loading,
  onRefresh,
  onOpenAddBot,
  onOpenMobileMenu,
  globalSearch,
  setGlobalSearch,
}) => {
  return (
    <header className="sticky top-0 z-30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:px-6 bg-slate-900/90 backdrop-blur-xl border-b border-slate-800">
      {/* Mobile Top Bar with Hamburger & Title */}
      <div className="flex items-center justify-between gap-3 w-full sm:w-auto">
        <div className="flex items-center gap-3">
          {/* Mobile Hamburger Button */}
          <button
            onClick={onOpenMobileMenu}
            className="p-2 -ml-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors lg:hidden flex-shrink-0"
            title="Menyuni ochish"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div>
            <h2 className="text-sm sm:text-base md:text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span className="truncate">{activeTabTitle}</span>
              <span className="hidden xs:inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Jonli
              </span>
            </h2>
            {activeTabSubtitle && (
              <p className="text-[11px] text-slate-400 font-medium hidden sm:block truncate">{activeTabSubtitle}</p>
            )}
          </div>
        </div>

        {/* Quick Add Bot on small mobile */}
        <button
          onClick={onOpenAddBot}
          className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 sm:hidden flex-shrink-0"
          title="Yangi bot qo'shish"
        >
          <PlusCircle className="w-5 h-5" />
        </button>
      </div>

      {/* Actions & Utilities */}
      <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
        {/* Universal Search Bar */}
        <div className="relative flex-1 sm:w-60 md:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Qidirish (ism, tel, karta)..."
            className="w-full bg-slate-950/90 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Live Clock (Desktop) */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-800 text-xs font-medium text-slate-300 flex-shrink-0">
          <Clock className="w-4 h-4 text-indigo-400" />
          <span>{currentTime}</span>
        </div>

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 hover:border-slate-600 transition-all disabled:opacity-50 flex-shrink-0"
          title="Ma'lumotlarni yangilash"
        >
          <RefreshCw className={`w-4 h-4 text-indigo-400 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline">Yangilash</span>
        </button>

        {/* Add Bot Action Button (Tablet & Desktop) */}
        <button
          onClick={onOpenAddBot}
          className="hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all active:scale-95 flex-shrink-0"
        >
          <PlusCircle className="w-4 h-4" />
          <span className="whitespace-nowrap">Yangi Bot</span>
        </button>
      </div>
    </header>
  );
};
