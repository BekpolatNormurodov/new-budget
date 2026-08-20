import React from 'react';
import {
  Clock,
  RefreshCw,
  PlusCircle,
  Activity,
  Search,
  Sparkles,
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
  globalSearch,
  setGlobalSearch,
}) => {
  return (
    <header className="sticky top-0 z-30 flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 md:px-6 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800">
      {/* Title & Subtitle */}
      <div>
        <h2 className="text-base md:text-lg font-bold text-white tracking-tight flex items-center gap-2">
          {activeTabTitle}
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Jonli Tizim
          </span>
        </h2>
        {activeTabSubtitle && (
          <p className="text-xs text-slate-400 font-medium">{activeTabSubtitle}</p>
        )}
      </div>

      {/* Actions & Utilities */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Universal Search Bar */}
        <div className="relative min-w-[200px] sm:min-w-[260px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Qidirish (ism, tel, karta, mahalla)..."
            className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Live Clock */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-800 text-xs font-medium text-slate-300">
          <Clock className="w-4 h-4 text-indigo-400" />
          <span>{currentTime}</span>
        </div>

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 hover:border-slate-600 transition-all disabled:opacity-50"
          title="Ma'lumotlarni yangilash"
        >
          <RefreshCw className={`w-4 h-4 text-indigo-400 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Yangilash</span>
        </button>

        {/* Add Bot Action Button */}
        <button
          onClick={onOpenAddBot}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Yangi Bot Qo'shish</span>
        </button>
      </div>
    </header>
  );
};
