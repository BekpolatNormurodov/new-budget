import React from 'react';
import {
  Clock,
  RefreshCw,
  PlusCircle,
  Search,
  Menu,
  Sun,
  Moon,
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
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
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
  theme = 'dark',
  onToggleTheme,
}) => {
  return (
    <header className="sticky top-0 z-30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:px-6 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 transition-colors">
      {/* Mobile Top Bar with Hamburger & Title */}
      <div className="flex items-center justify-between gap-3 w-full sm:w-auto">
        <div className="flex items-center gap-3">
          {/* Mobile Hamburger Button */}
          <button
            onClick={onOpenMobileMenu}
            className="p-2 -ml-1 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 transition-colors lg:hidden flex-shrink-0"
            title="Menyuni ochish"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div>
            <h2 className="text-sm sm:text-base md:text-lg font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <span className="truncate">{activeTabTitle}</span>
              <span className="hidden xs:inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Jonli
              </span>
            </h2>
            {activeTabSubtitle && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium hidden sm:block truncate">{activeTabSubtitle}</p>
            )}
          </div>
        </div>

        {/* Quick Actions on Mobile (Theme + Add Bot) */}
        <div className="flex items-center gap-2 sm:hidden">
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all flex-shrink-0"
              title={theme === 'dark' ? "Yorug' rejim" : "Qorong'i rejim"}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
            </button>
          )}

          <button
            onClick={onOpenAddBot}
            className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 flex-shrink-0"
            title="Yangi bot qo'shish"
          >
            <PlusCircle className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Actions & Utilities */}
      <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
        {/* Universal Search Bar */}
        <div className="relative flex-1 sm:w-60 md:w-72">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Qidirish (ism, tel, karta)..."
            className="w-full bg-slate-100 dark:bg-slate-950/90 border border-slate-300 dark:border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Live Clock (Desktop) */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex-shrink-0">
          <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>{currentTime}</span>
        </div>

        {/* Dark / Light Mode Switcher (Desktop/Tablet) */}
        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            className="hidden sm:flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-all flex-shrink-0 cursor-pointer shadow-sm"
            title={theme === 'dark' ? "Yorug' rejimga o'tish" : "Qorong'i rejimga o'tish"}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-4 h-4 text-amber-400 transition-transform hover:rotate-45" />
                <span className="hidden md:inline">Yorug'</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-indigo-600 transition-transform hover:-rotate-12" />
                <span className="hidden md:inline">Qorong'i</span>
              </>
            )}
          </button>
        )}

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all disabled:opacity-50 flex-shrink-0 cursor-pointer shadow-sm"
          title="Ma'lumotlarni yangilash"
        >
          <RefreshCw className={`w-4 h-4 text-indigo-600 dark:text-indigo-400 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline">Yangilash</span>
        </button>

        {/* Add Bot Action Button (Tablet & Desktop) */}
        <button
          onClick={onOpenAddBot}
          className="hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all active:scale-95 flex-shrink-0 cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span className="whitespace-nowrap">Yangi Bot</span>
        </button>
      </div>
    </header>
  );
};
