import React from 'react';
import {
  Calendar,
  CalendarRange,
  Building2,
  RotateCcw,
  Sparkles,
  Zap,
  Filter,
} from 'lucide-react';
import { BotInstanceItem } from '../types';

export interface SeasonCalendarFilterProps {
  bots: BotInstanceItem[];
  selectedBotId: string;
  onSelectBotId: (id: string) => void;
  startDate: string;
  endDate: string;
  onDateChange: (start: string, end: string, presetName?: string) => void;
  activePreset: string;
  totalFilteredCount?: number;
  totalFilteredLabel?: string;
  compact?: boolean;
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

export const SeasonCalendarFilter: React.FC<SeasonCalendarFilterProps> = ({
  bots,
  selectedBotId,
  onSelectBotId,
  startDate,
  endDate,
  onDateChange,
  activePreset,
  totalFilteredCount,
  totalFilteredLabel = 'Topildi',
  compact = false,
}) => {
  const handleApplyPreset = (preset: string) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    if (preset === 'ALL') {
      onDateChange('', '', 'ALL');
    } else if (preset === 'TODAY') {
      onDateChange(todayStr, todayStr, 'TODAY');
    } else if (preset === 'YESTERDAY') {
      onDateChange(yesterdayStr, yesterdayStr, 'YESTERDAY');
    } else if (preset === 'SEASON') {
      // 22-avgustdan 1-sentabrgacha bo'lgan to'liq 10 kunlik mavsum
      onDateChange('2026-08-22', '2026-09-01', 'SEASON');
    }
  };

  const handleSelectDay = (dateStr: string) => {
    onDateChange(dateStr, dateStr, `DAY_${dateStr}`);
  };

  const handleReset = () => {
    onSelectBotId('ALL');
    onDateChange('', '', 'ALL');
  };

  return (
    <div className="p-4 rounded-2xl bg-slate-900/95 border border-slate-800 shadow-xl space-y-3.5">
      {/* Top Filter Controls: Bot / Mahalla ID Selector + Date Presets + Custom Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
        {/* 1. Bot & Mahalla ID Filter Selector (5 cols) */}
        <div className="lg:col-span-5 space-y-1">
          <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-indigo-400" />
            Bot & Mahalla ID bo'yicha filter:
          </label>
          <div className="relative">
            <select
              value={selectedBotId}
              onChange={(e) => onSelectBotId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900">
                🌐 Barcha Botlar & Mahallalar ({bots.length} ta)
              </option>
              {bots.map((b) => (
                <option key={b.id} value={String(b.id)} className="bg-slate-900">
                  #{b.id} • {b.name} • {b.mahallaName} (ID: {b.mahallaId})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 2. Start Date (Dan) (2 cols) */}
        <div className="lg:col-span-3 space-y-1">
          <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            Boshlanish (Dan):
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onDateChange(e.target.value, endDate, 'CUSTOM')}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
          />
        </div>

        {/* 3. End Date (Gacha) (2 cols) */}
        <div className="lg:col-span-3 space-y-1">
          <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            Tugash (Gacha):
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onDateChange(startDate, e.target.value, 'CUSTOM')}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
          />
        </div>

        {/* 4. Reset Button (1 col) */}
        <div className="lg:col-span-1">
          <button
            type="button"
            onClick={handleReset}
            className="w-full p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors flex items-center justify-center"
            title="Filtrlarni tozalash"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Season Quick Presets & 10-Day Visual Timeline Pills */}
      <div className="pt-2 border-t border-slate-800/80 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Main Quick Presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => handleApplyPreset('SEASON')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activePreset === 'SEASON' || (startDate === '2026-08-22' && endDate === '2026-09-01')
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/20'
                  : 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/30'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 fill-current" />
              <span>🏆 Mavsum (22-avg - 1-sen)</span>
            </button>

            <button
              type="button"
              onClick={() => handleApplyPreset('TODAY')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activePreset === 'TODAY'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700'
              }`}
            >
              🟢 Bugun
            </button>

            <button
              type="button"
              onClick={() => handleApplyPreset('YESTERDAY')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activePreset === 'YESTERDAY'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700'
              }`}
            >
              ⏳ Kecha
            </button>

            <button
              type="button"
              onClick={() => handleApplyPreset('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activePreset === 'ALL' && !startDate && !endDate
                  ? 'bg-slate-700 text-white border border-slate-600 shadow-sm'
                  : 'bg-slate-800/80 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Barcha Vaqt
            </button>
          </div>

          {/* Records count pill if provided */}
          {totalFilteredCount !== undefined && (
            <div className="text-xs text-slate-400 font-medium">
              {totalFilteredLabel}: <b className="text-white font-bold">{totalFilteredCount} ta</b>
            </div>
          )}
        </div>

        {/* 10-Kunlik Kunma-Kun Lenta (22-avgustdan 1-sentabrgacha) */}
        <div className="pt-1">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5 flex items-center gap-1">
            <span>📅 10 Kunlik Ovoz Berish Davri (Kunma-kun ko'rish):</span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-800">
            {SEASON_DAYS.map((day) => {
              const isSelected = startDate === day.date && endDate === day.date;

              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => handleSelectDay(day.date)}
                  className={`flex flex-col items-center justify-center px-2.5 py-1.5 rounded-xl text-center transition-all flex-shrink-0 min-w-[62px] border ${
                    isSelected
                      ? 'bg-gradient-to-tr from-indigo-600 to-indigo-700 text-white border-indigo-400 shadow-md shadow-indigo-600/30 scale-105'
                      : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800 hover:border-slate-700'
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
    </div>
  );
};
