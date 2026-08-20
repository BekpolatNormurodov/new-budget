import React, { useState } from 'react';
import {
  Calendar,
  Building2,
  RotateCcw,
  Sparkles,
  ChevronDown,
  Filter,
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
  { date: '2026-09-01', label: '1-Sen', dayNum: 'Yakun' },
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
      onDateChange('2026-08-22', '2026-09-01', 'SEASON');
      setShowCustomDates(false);
    }
  };

  const handleSelectDay = (dateStr: string) => {
    onDateChange(dateStr, dateStr, `DAY_${dateStr}`);
    setShowCustomDates(false);
  };

  const handleReset = () => {
    onSelectBotId('ALL');
    onDateChange('', '', 'ALL');
    setShowCustomDates(false);
  };

  return (
    <div className="p-3 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
      {/* Row 1: Bot Filter Dropdown + Quick Date Presets */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Bot & Mahalla Dropdown (Mobile-first full width) */}
        <div className="relative flex-1 sm:max-w-xs">
          <Building2 className="w-3.5 h-3.5 text-indigo-400 absolute left-3 top-2.5 pointer-events-none" />
          <select
            value={selectedBotId}
            onChange={(e) => onSelectBotId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-7 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium cursor-pointer appearance-none truncate"
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
          <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2.5 pointer-events-none" />
        </div>

        {/* Quick Date Presets Row */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            type="button"
            onClick={() => handleApplyPreset('ALL')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              activePreset === 'ALL' && !startDate && !endDate
                ? 'bg-slate-800 text-white border border-slate-700'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            Barchasi
          </button>

          <button
            type="button"
            onClick={() => handleApplyPreset('TODAY')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              activePreset === 'TODAY'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            🟢 Bugun
          </button>

          <button
            type="button"
            onClick={() => handleApplyPreset('YESTERDAY')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              activePreset === 'YESTERDAY'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            ⏳ Kecha
          </button>

          <button
            type="button"
            onClick={() => handleApplyPreset('SEASON')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              activePreset === 'SEASON' || (startDate === '2026-08-22' && endDate === '2026-09-01')
                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-sm'
                : 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/30'
            }`}
          >
            <Sparkles className="w-3 h-3 fill-current" />
            <span>Mavsum (22-avg - 1-sen)</span>
          </button>

          {/* Custom Date Range Toggle */}
          <button
            type="button"
            onClick={() => setShowCustomDates(!showCustomDates)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1 ${
              showCustomDates || activePreset === 'CUSTOM'
                ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Calendar className="w-3 h-3" />
            <span>Kalendar</span>
          </button>

          {/* Reset Button */}
          {(selectedBotId !== 'ALL' || startDate || endDate) && (
            <button
              type="button"
              onClick={handleReset}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors flex-shrink-0"
              title="Filtrni tozalash"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Custom Date Pickers (if opened or active) */}
      {(showCustomDates || activePreset === 'CUSTOM') && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80 animate-in fade-in duration-200">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-400">Boshlanish (Dan):</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => onDateChange(e.target.value, endDate, 'CUSTOM')}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-400">Tugash (Gacha):</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onDateChange(startDate, e.target.value, 'CUSTOM')}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
            />
          </div>

          <div className="col-span-2 flex items-end justify-between sm:justify-end gap-2">
            {totalFilteredCount !== undefined && (
              <span className="text-xs text-slate-400 self-center">
                {totalFilteredLabel}: <b className="text-white">{totalFilteredCount} ta</b>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Row 3: 10-Kunlik Kunma-Kun Lenta (Horizontal Scrollable Chips) */}
      <div className="pt-2 border-t border-slate-800/60 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <span className="text-[10px] uppercase font-bold text-slate-500 whitespace-nowrap mr-1 flex-shrink-0">
          📅 10-KUN:
        </span>
        {SEASON_DAYS.map((day) => {
          const isSelected = startDate === day.date && endDate === day.date;

          return (
            <button
              key={day.date}
              type="button"
              onClick={() => handleSelectDay(day.date)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-center transition-all flex-shrink-0 text-xs border ${
                isSelected
                  ? 'bg-indigo-600 text-white border-indigo-400 font-bold shadow-sm scale-105'
                  : 'bg-slate-950/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-800'
              }`}
            >
              <span className="font-semibold">{day.label}</span>
              <span className={`text-[9px] ${isSelected ? 'text-indigo-200' : 'text-slate-500'}`}>
                ({day.dayNum})
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
