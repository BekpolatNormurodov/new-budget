import React from 'react';
import {
  Building2,
  RotateCcw,
  Sparkles,
  CalendarDays,
} from 'lucide-react';
import { BotInstanceItem } from '../types';
import { ProDropdown, ProDropdownOption } from './ProDropdown';
import { tashkentToday, tashkentYesterday } from '../utils/format';

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
  // Bot/Mahalla dropdown'ni ko'rsatish. Ma'lumotda mahalla bog'lanishi
  // bo'lmagan sahifalarda (masalan Withdrawals) false qilinadi.
  showBotFilter?: boolean;
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
  showBotFilter = true,
}) => {
  const handleApplyPreset = (preset: string) => {
    const todayStr = tashkentToday();
    const yesterdayStr = tashkentYesterday();

    if (preset === 'ALL') {
      onDateChange('', '', 'ALL');
    } else if (preset === 'TODAY') {
      onDateChange(todayStr, todayStr, 'TODAY');
    } else if (preset === 'YESTERDAY') {
      onDateChange(yesterdayStr, yesterdayStr, 'YESTERDAY');
    } else if (preset === 'SEASON') {
      onDateChange('2026-08-22', '2026-08-31', 'SEASON');
    }
  };

  const handleSelectDay = (dateStr: string) => {
    if (startDate === dateStr && endDate === dateStr) {
      onDateChange('', '', 'ALL');
    } else {
      onDateChange(dateStr, dateStr, `DAY_${dateStr}`);
    }
  };

  const handleReset = () => {
    onSelectBotId('ALL');
    onDateChange('', '', 'ALL');
  };

  const isSeasonActive =
    activePreset === 'SEASON' || (startDate === '2026-08-22' && endDate === '2026-08-31');

  // Build options for custom ProDropdown
  const botOptions: ProDropdownOption[] = [
    {
      value: 'ALL',
      label: 'Barcha Botlar & Mahallalar',
      sublabel: `Jami ${bots.length} ta faol bot`,
      badge: `${bots.length} ta`,
    },
    ...bots.map((b) => ({
      value: String(b.id),
      label: `${b.mahallaName} (${b.name})`,
      sublabel: `#${b.id} • Mahalla ID: ${b.mahallaId}`,
      badge: `${b.currentVotes} ovoz`,
    })),
  ];

  return (
    <div className="p-3 sm:p-4 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-800/90 shadow-xl dark:shadow-2xl space-y-3 transition-colors">
      {/* Top Controls: Pro UI Dropdown for Bot + Preset Chips */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* 1. Custom Pro Dropdown */}
        {showBotFilter && (
          <div className="flex-1 sm:max-w-xs">
            <ProDropdown
              options={botOptions}
              value={selectedBotId}
              onChange={onSelectBotId}
              icon={<Building2 className="w-3.5 h-3.5" />}
            />
          </div>
        )}

        {/* 2. Quick Preset Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            type="button"
            onClick={() => handleApplyPreset('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activePreset === 'ALL' && !startDate && !endDate
                ? 'bg-slate-800 dark:bg-slate-700 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/40'
            }`}
          >
            Barchasi
          </button>

          <button
            type="button"
            onClick={() => handleApplyPreset('TODAY')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activePreset === 'TODAY'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/40'
            }`}
          >
            🟢 Bugun
          </button>

          <button
            type="button"
            onClick={() => handleApplyPreset('YESTERDAY')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activePreset === 'YESTERDAY'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/40'
            }`}
          >
            Kecha
          </button>

          <button
            type="button"
            onClick={() => handleApplyPreset('SEASON')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1 transition-all cursor-pointer ${
              isSeasonActive
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-orange-500/25 ring-1 ring-amber-400/50'
                : 'bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/20'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Mavsum (22–31-Avg)</span>
          </button>

          {(selectedBotId !== 'ALL' || startDate || endDate) && (
            <button
              type="button"
              onClick={handleReset}
              className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-slate-200 dark:border-slate-700 transition-colors flex-shrink-0 cursor-pointer"
              title="Filtrlarni tozalash"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Bottom Timeline: 10 Daily Season Buttons (22-31 August 2026) */}
      <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80 space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
            <CalendarDays className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Ovoz Berish Mavsumi (Avgust 2026):</span>
          </div>
          {totalFilteredCount !== undefined && (
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {totalFilteredLabel}: <strong className="text-indigo-600 dark:text-indigo-400 font-mono">{totalFilteredCount}</strong>
            </span>
          )}
        </div>

        {/* 10-day Pills Grid */}
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-1 sm:gap-1.5">
          {SEASON_DAYS.map((day) => {
            const isSelected = startDate === day.date && endDate === day.date;

            return (
              <button
                key={day.date}
                type="button"
                onClick={() => handleSelectDay(day.date)}
                className={`flex flex-col items-center justify-center p-1.5 sm:py-2 rounded-xl transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-tr from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-600/30 scale-102 ring-2 ring-indigo-400/40'
                    : 'bg-slate-100/90 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/70 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <span className={`text-[11px] font-bold ${isSelected ? 'text-white' : 'text-slate-800 dark:text-slate-300'}`}>
                  {day.label}
                </span>
                <span className={`text-[9px] font-mono ${isSelected ? 'text-indigo-200' : 'text-slate-400 dark:text-slate-500'}`}>
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
