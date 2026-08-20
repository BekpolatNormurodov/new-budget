import React, { useState } from 'react';
import {
  Calendar,
  Building2,
  RotateCcw,
  Sparkles,
  ChevronDown,
  Clock,
  CalendarDays,
} from 'lucide-react';
import { BotInstanceItem } from '../types';

export interface SmartFilterBarProps {
  bots: BotInstanceItem[];
  selectedBotId: string;
  onSelectBotId: (id: string) => void;
  startDate: string;
  endDate: string;
  onDateChange: (start: string, end: string, presetName?: string) => void;
  activePreset: string;
  totalFilteredCount?: number;
  totalFilteredLabel?: string;
}

// Open Budget 2026: Aniq 10 kunlik ovoz berish davri (22-avgustdan 31-avgustgacha)
export const SEASON_DAYS = [
  { date: '2026-08-22', label: '22-Avg', dayNum: '1-kun' },
  { date: '2026-08-23', label: '23-Avg', dayNum: '2-kun' },
  { date: '2026-08-24', label: '24-Avg', dayNum: '3-kun' },
  { date: '2026-08-25', label: '25-Avg', dayNum: '4-kun' },
  { date: '2026-08-26', label: '26-Avg', dayNum: '5-kun' },
  { date: '2026-08-27', label: '27-Avg', dayNum: '6-kun' },
  { date: '2026-08-28', label: '28-Avg', dayNum: '7-kun' },
  { date: '2026-08-29', label: '29-Avg', dayNum: '8-kun' },
  { date: '2026-08-30', label: '30-Avg', dayNum: '9-kun' },
  { date: '2026-08-31', label: '31-Avg', dayNum: '10-kun' },
];

export const SmartFilterBar: React.FC<SmartFilterBarProps> = ({
  bots,
  selectedBotId,
  onSelectBotId,
  startDate,
  endDate,
  onDateChange,
  activePreset,
  totalFilteredCount,
  totalFilteredLabel = 'Jami',
}) => {
  const [showCustomDates, setShowCustomDates] = useState(false);

  const handleApplyPreset = (preset: string) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    if (preset === 'ALL') {
      onDateChange('', '', 'ALL');
      setShowCustomDates(false);
    } else if (preset === 'TODAY') {
      onDateChange(todayStr, todayStr, 'TODAY');
      setShowCustomDates(false);
    } else if (preset === 'YESTERDAY') {
      onDateChange(yesterdayStr, yesterdayStr, 'YESTERDAY');
      setShowCustomDates(false);
    } else if (preset === 'SEASON') {
      // Aniq 10 kun: 22-avgustdan 31-avgustgacha
      onDateChange('2026-08-22', '2026-08-31', 'SEASON');
      setShowCustomDates(false);
    }
  };

  const handleSelectDay = (dateStr: string) => {
    if (startDate === dateStr && endDate === dateStr) {
      // Toggle off to ALL if clicked again
      onDateChange('', '', 'ALL');
    } else {
      onDateChange(dateStr, dateStr, `DAY_${dateStr}`);
    }
    setShowCustomDates(false);
  };

  const handleReset = () => {
    onSelectBotId('ALL');
    onDateChange('', '', 'ALL');
    setShowCustomDates(false);
  };

  const isSeasonActive =
    activePreset === 'SEASON' || (startDate === '2026-08-22' && endDate === '2026-08-31');

  return (
    <div className="p-3 sm:p-4 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-slate-800/90 shadow-2xl space-y-3">
      {/* Top Controls: Bot Selector + Segmented Date Control */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* 1. Bot & Mahalla Dropdown with Glassmorphic Styling */}
        <div className="relative flex-1 sm:max-w-xs">
          <div className="absolute left-3 top-2.5 flex items-center gap-1 pointer-events-none text-indigo-400">
            <Building2 className="w-3.5 h-3.5" />
          </div>
          <select
            value={selectedBotId}
            onChange={(e) => onSelectBotId(e.target.value)}
            className="w-full bg-slate-950/90 border border-slate-800 hover:border-slate-700 rounded-xl pl-8 pr-8 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium cursor-pointer appearance-none truncate transition-colors shadow-inner"
          >
            <option value="ALL" className="bg-slate-900">
              🌐 Barcha Botlar ({bots.length} ta)
            </option>
            {bots.map((b) => (
              <option key={b.id} value={String(b.id)} className="bg-slate-900">
                #{b.id} • {b.mahallaName} ({b.name})
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-2.5 pointer-events-none" />
        </div>

        {/* 2. Quick Preset Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            type="button"
            onClick={() => handleApplyPreset('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activePreset === 'ALL' && !startDate && !endDate
                ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            Barchasi
          </button>

          <button
            type="button"
            onClick={() => handleApplyPreset('TODAY')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activePreset === 'TODAY'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            🟢 Bugun
          </button>

          <button
            type="button"
            onClick={() => handleApplyPreset('YESTERDAY')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activePreset === 'YESTERDAY'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            ⏳ Kecha
          </button>

          {/* 10-Day Season Preset (22-31 Avgust) */}
          <button
            type="button"
            onClick={() => handleApplyPreset('SEASON')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              isSeasonActive
                ? 'bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 text-white shadow-md shadow-amber-500/25 scale-102'
                : 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/30'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 fill-current text-amber-300" />
            <span>Mavsum (22-31 Avgust)</span>
          </button>

          {/* Custom Date Range Picker Toggle */}
          <button
            type="button"
            onClick={() => setShowCustomDates(!showCustomDates)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
              showCustomDates || activePreset === 'CUSTOM'
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
            title="Maxsus sana oralig'ini tanlash"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Kalendar</span>
          </button>

          {/* Reset Filters */}
          {(selectedBotId !== 'ALL' || startDate || endDate) && (
            <button
              type="button"
              onClick={handleReset}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all flex-shrink-0"
              title="Filtrni tozalash"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Custom Date Pickers (Dan - Gacha) */}
      {(showCustomDates || activePreset === 'CUSTOM') && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 animate-in fade-in duration-200">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-indigo-400" />
              Boshlanish (Dan):
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => onDateChange(e.target.value, endDate, 'CUSTOM')}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-indigo-400" />
              Tugash (Gacha):
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onDateChange(startDate, e.target.value, 'CUSTOM')}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
            />
          </div>

          <div className="col-span-2 flex items-center justify-between sm:justify-end gap-2 self-end pt-1 sm:pt-0">
            {totalFilteredCount !== undefined && (
              <div className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400">
                {totalFilteredLabel}: <b className="text-white font-bold">{totalFilteredCount} ta</b>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 10-Kunlik Kunma-Kun Interaktiv Lenta (22-avgustdan 31-avgustgacha) */}
      <div className="pt-2 border-t border-slate-800/70">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-slate-500 whitespace-nowrap mr-1.5 flex-shrink-0">
            <CalendarDays className="w-3.5 h-3.5 text-indigo-400" />
            <span>10 KUN:</span>
          </div>

          {SEASON_DAYS.map((day) => {
            const isSelected = startDate === day.date && endDate === day.date;

            return (
              <button
                key={day.date}
                type="button"
                onClick={() => handleSelectDay(day.date)}
                className={`flex flex-col items-center justify-center px-2.5 py-1 rounded-xl text-center transition-all flex-shrink-0 min-w-[58px] border ${
                  isSelected
                    ? 'bg-gradient-to-b from-indigo-600 to-indigo-700 text-white border-indigo-400/80 shadow-md shadow-indigo-600/30 scale-105'
                    : 'bg-slate-950/70 hover:bg-slate-800 text-slate-400 hover:text-white border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <span className="text-[11px] font-bold tracking-tight">{day.label}</span>
                <span className={`text-[9px] ${isSelected ? 'text-indigo-200' : 'text-slate-500'}`}>
                  {day.dayNum}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
