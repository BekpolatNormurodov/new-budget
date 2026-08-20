import React from 'react';
import {
  Building2,
  RotateCcw,
  Sparkles,
  CalendarDays,
} from 'lucide-react';
import { BotInstanceItem } from '../types';
import { ProDropdown, ProDropdownOption } from './ProDropdown';

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
      // Aniq 10 kun: 22-avgustdan 31-avgustgacha
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
    <div className="p-3 sm:p-4 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-slate-800/90 shadow-2xl space-y-3">
      {/* Top Controls: Pro UI Dropdown for Bot + Preset Chips */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* 1. Custom Pro Dropdown */}
        <div className="flex-1 sm:max-w-xs">
          <ProDropdown
            options={botOptions}
            value={selectedBotId}
            onChange={onSelectBotId}
            icon={<Building2 className="w-3.5 h-3.5" />}
          />
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
            <span>10 Kunlik Mavsum (22-31 Avgust)</span>
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

          {totalFilteredCount !== undefined && (
            <span className="text-[11px] text-slate-400 whitespace-nowrap hidden md:inline ml-1 font-medium">
              {totalFilteredLabel}: <b className="text-white font-bold">{totalFilteredCount} ta</b>
            </span>
          )}
        </div>
      </div>

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
