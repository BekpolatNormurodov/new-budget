import React, { useRef, useState } from 'react';
import {
  X,
  PlusCircle,
  Target,
  DollarSign,
  Gift,
  MapPin,
  Image,
  Upload,
  Trash2,
  Key,
  FileText,
  Search,
  Sparkles,
  CheckCircle2,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { formatSum } from '../utils/format';

interface AddBotModalProps {
  isOpen: boolean;
  onClose: () => void;
  newBot: any;
  setNewBot: (bot: any) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const AddBotModal: React.FC<AddBotModalProps> = ({
  isOpen,
  onClose,
  newBot,
  setNewBot,
  onSubmit,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lookupQuery, setLookupQuery] = useState<string>('');
  const [isLookingUp, setIsLookingUp] = useState<boolean>(false);
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [lookupError, setLookupError] = useState<string>('');

  if (!isOpen) return null;

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('Rasm hajmi 5MB dan oshmasligi kerak');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        setNewBot({ ...newBot, avatarUrl: event.target?.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  // 1-Click Auto Lookup via OpenBudget Backend API (Proxy orqali)
  const handleAutoLookup = async () => {
    const q = lookupQuery.trim() || newBot.mahallaId?.trim() || newBot.openBudgetUrl?.trim();
    if (!q) {
      alert('Iltimos, Mahalla ID (12 ta raqam) yoki OpenBudget havolasini kiriting!');
      return;
    }

    setIsLookingUp(true);
    setLookupError('');
    setLookupResult(null);

    try {
      const res = await fetch('/api/admin/bots/lookup-mahalla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });

      const data = await res.json();
      if (data.success) {
        setLookupResult(data);
        setNewBot({
          ...newBot,
          mahallaName: data.mahallaName || newBot.mahallaName,
          mahallaId: data.mahallaId || newBot.mahallaId,
          openBudgetUrl: data.openBudgetUrl || newBot.openBudgetUrl,
          name: newBot.name || `${data.quarterTitle || data.mahallaName} Boti`,
          targetVotes: data.targetVotes || newBot.targetVotes || 5000,
          description: data.description || newBot.description,
        });
      } else {
        setLookupError(data.error || 'Loyiha ma\'lumotlari topilmadi');
      }
    } catch (e: any) {
      setLookupError(e.message || 'Serverga ulanishda xatolik');
    } finally {
      setIsLookingUp(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 max-w-lg w-full space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 transition-colors">
        <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <PlusCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Yangi Bot & Mahalla Qo'shish</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">OpenBudget bilan avtomatik integratsiya</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ⚡️ SMART AUTO-LOOKUP BOX (Proxy orqali) */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-500/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-spin" />
              <span>Avtomatik Mahalla Qidiruv (12 xonali ID yoki Havola)</span>
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-mono font-bold">
              Proxy 🛡
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={lookupQuery}
                onChange={(e) => setLookupQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAutoLookup())}
                placeholder="Masalan: 055495798013 yoki OpenBudget havolasi..."
                className="w-full bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-mono text-[11px]"
              />
            </div>
            <button
              type="button"
              onClick={handleAutoLookup}
              disabled={isLookingUp}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50 shadow-sm"
            >
              {isLookingUp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>{isLookingUp ? 'Yuklanmoqda...' : 'Tortib Olish'}</span>
            </button>
          </div>

          {/* Success Banner */}
          {lookupResult && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-[11px] space-y-1 animate-in fade-in">
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{lookupResult.mahallaName}</span>
                </span>
                <span className="font-mono bg-emerald-500/20 px-1.5 py-0.5 rounded text-[10px]">
                  Joriy ovoz: {lookupResult.currentVotes} ta
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                📍 {lookupResult.regionTitle}, {lookupResult.districtTitle} (Mavsum #{lookupResult.boardId})
              </p>
            </div>
          )}

          {/* Error Banner */}
          {lookupError && (
            <p className="text-[11px] text-rose-500 font-semibold px-1">
              ❌ {lookupError}
            </p>
          )}
        </div>

        {/* Bot Profile Image Upload */}
        <div className="p-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src={newBot.avatarUrl || '/assets/open_budget_avatar.jpg'}
              alt="Bot Avatar"
              className="w-12 h-12 rounded-2xl object-cover border-2 border-indigo-500/30 shadow-lg shrink-0"
            />
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1">
                <Image className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Bot Profil Rasmi</span>
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Ixtiyoriy bot avatari</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-[11px] transition flex items-center gap-1 shadow-sm cursor-pointer"
            >
              <Upload className="w-3 h-3" />
              <span>Yuklash</span>
            </button>
            {newBot.avatarUrl && (
              <button
                type="button"
                onClick={() => setNewBot({ ...newBot, avatarUrl: '' })}
                className="p-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl cursor-pointer"
                title="Standart rasmga qaytarish"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>

        <form onSubmit={onSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Bot Nomi</label>
            <input
              type="text"
              placeholder="Masalan: Do'stlik MFY Boti"
              value={newBot.name || ''}
              onChange={(e) => setNewBot({ ...newBot, name: e.target.value })}
              required
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold"
            />
          </div>

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1 flex items-center gap-1">
              <Key className="w-3.5 h-3.5 text-amber-500" />
              <span>Telegram Bot Token (BotFather dan)</span>
            </label>
            <input
              type="text"
              placeholder="1234567890:ABCdefGHIjklMNO..."
              value={newBot.token || ''}
              onChange={(e) => setNewBot({ ...newBot, token: e.target.value })}
              required
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-mono text-[11px]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                <span>Mahalla Nomi</span>
              </label>
              <input
                type="text"
                placeholder="Do'stlik MFY"
                value={newBot.mahallaName || ''}
                onChange={(e) => setNewBot({ ...newBot, mahallaName: e.target.value })}
                required
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold"
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Mahalla ID (12 ta raqam)</label>
              <input
                type="text"
                placeholder="055538434014"
                value={newBot.mahallaId || ''}
                onChange={(e) => setNewBot({ ...newBot, mahallaId: e.target.value })}
                required
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Open Budget Havolasi (URL)</label>
            <input
              type="text"
              placeholder="https://new.openbudget.uz/uz/initiative-budget/active-initiatives/55/..."
              value={newBot.openBudgetUrl || ''}
              onChange={(e) => setNewBot({ ...newBot, openBudgetUrl: e.target.value })}
              required
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 text-[11px]"
            />
          </div>

          {/* Izoh / Eslatma (Ixtiyoriy) */}
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Izoh / Qo'shimcha Eslatma (Ixtiyoriy)</span>
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Ixtiyoriy</span>
            </label>
            <textarea
              rows={2}
              value={newBot.description || ''}
              onChange={(e) => setNewBot({ ...newBot, description: e.target.value })}
              placeholder="Masalan: Bog'cha ta'miri loyihasi..."
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 placeholder-slate-400 dark:placeholder-slate-600 resize-none"
            />
          </div>

          {/* Ovoz Limiti & Mukofotlar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1 flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                <span>Reja (Ovoz)</span>
              </label>
              <input
                type="number"
                placeholder="5000"
                value={newBot.targetVotes || 5000}
                onChange={(e) => setNewBot({ ...newBot, targetVotes: parseInt(e.target.value, 10) || 0 })}
                required
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold"
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Ovoz Mukofoti</span>
              </label>
              <input
                type="number"
                placeholder="30000"
                value={newBot.voteReward || 30000}
                onChange={(e) => setNewBot({ ...newBot, voteReward: parseInt(e.target.value, 10) || 0 })}
                required
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold text-emerald-600 dark:text-emerald-400"
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1 flex items-center gap-1">
                <Gift className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>Referal Bonusi</span>
              </label>
              <input
                type="number"
                placeholder="5000"
                value={newBot.refBonus || 5000}
                onChange={(e) => setNewBot({ ...newBot, refBonus: parseInt(e.target.value, 10) || 0 })}
                required
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold text-purple-600 dark:text-purple-400"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl transition cursor-pointer"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition active:scale-95 cursor-pointer flex items-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Botni Saqlash & Ishga Tushirish</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
