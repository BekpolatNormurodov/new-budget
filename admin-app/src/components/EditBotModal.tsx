import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sliders,
  Target,
  DollarSign,
  Gift,
  MapPin,
  Key,
  Image,
  Upload,
  Trash2,
  FileText,
  Search,
  Sparkles,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { BotInstanceItem } from '../types';

interface EditBotModalProps {
  isOpen: boolean;
  onClose: () => void;
  bot: BotInstanceItem | null;
  onSave: (id: number, updated: Partial<BotInstanceItem>) => void;
}

export const EditBotModal: React.FC<EditBotModalProps> = ({
  isOpen,
  onClose,
  bot,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [mahallaName, setMahallaName] = useState('');
  const [mahallaId, setMahallaId] = useState('');
  const [openBudgetUrl, setOpenBudgetUrl] = useState('');
  const [targetVotes, setTargetVotes] = useState(5000);
  const [voteReward, setVoteReward] = useState(30000);
  const [refBonus, setRefBonus] = useState(5000);
  const [isRefActive, setIsRefActive] = useState<boolean>(true);
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');

  const [lookupQuery, setLookupQuery] = useState<string>('');
  const [isLookingUp, setIsLookingUp] = useState<boolean>(false);
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [lookupError, setLookupError] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (bot) {
      setName(bot.name || '');
      setToken(bot.token || '');
      setMahallaName(bot.mahallaName || '');
      setMahallaId(bot.mahallaId || '');
      setOpenBudgetUrl(bot.openBudgetUrl || '');
      setTargetVotes(bot.targetVotes || 5000);
      setVoteReward(bot.voteReward || 30000);
      setRefBonus(bot.refBonus || 5000);
      setIsRefActive(bot.isRefActive !== false);
      setDescription(bot.description || '');
      setAvatarUrl(bot.avatarUrl || '/assets/open_budget_avatar.jpg');
      setLookupQuery(bot.mahallaId || '');
      setLookupResult(null);
      setLookupError('');
    }
  }, [bot, isOpen]);

  if (!isOpen || !bot) return null;

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('Rasm hajmi 5MB dan oshmasligi kerak');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        setAvatarUrl(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // 1-Click Auto Lookup via OpenBudget Backend API (Proxy orqali)
  const handleAutoLookup = async () => {
    const q = lookupQuery.trim() || mahallaId.trim() || openBudgetUrl.trim();
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
        if (data.mahallaName) setMahallaName(data.mahallaName);
        if (data.mahallaId) setMahallaId(data.mahallaId);
        if (data.openBudgetUrl) setOpenBudgetUrl(data.openBudgetUrl);
        if (data.targetVotes) setTargetVotes(data.targetVotes);
        if (data.description) setDescription(data.description);
      } else {
        setLookupError(data.error || 'Loyiha ma\'lumotlari topilmadi');
      }
    } catch (e: any) {
      setLookupError(e.message || 'Serverga ulanishda xatolik');
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(bot.id, {
      name,
      token,
      mahallaName,
      mahallaId,
      openBudgetUrl,
      targetVotes: Number(targetVotes),
      voteReward: Number(voteReward),
      refBonus: Number(refBonus),
      isRefActive,
      description,
      avatarUrl,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 max-w-lg w-full space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 transition-colors">
        <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Bot Sozlamalarini Tahrirlash</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">#{bot.id} - {bot.name}</p>
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
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Mahallani Qayta Yangilash / Qidiruv</span>
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
                placeholder="12 xonali Mahalla ID yoki Havola..."
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
              <span>{isLookingUp ? 'Yuklanmoqda...' : 'Yangilash'}</span>
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
              src={avatarUrl || '/assets/open_budget_avatar.jpg'}
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
            {avatarUrl && (
              <button
                type="button"
                onClick={() => setAvatarUrl('/assets/open_budget_avatar.jpg')}
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

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Bot Nomi</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold"
            />
          </div>

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1 flex items-center gap-1">
              <Key className="w-3.5 h-3.5 text-amber-500" />
              <span>Telegram Bot Token</span>
            </label>
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
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
                value={mahallaName}
                onChange={(e) => setMahallaName(e.target.value)}
                required
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold"
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Mahalla ID (12 ta raqam)</label>
              <input
                type="text"
                value={mahallaId}
                onChange={(e) => setMahallaId(e.target.value)}
                required
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Open Budget Havolasi (URL)</label>
            <input
              type="text"
              value={openBudgetUrl}
              onChange={(e) => setOpenBudgetUrl(e.target.value)}
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
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
                value={targetVotes}
                onChange={(e) => setTargetVotes(parseInt(e.target.value, 10) || 0)}
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
                value={voteReward}
                onChange={(e) => setVoteReward(parseInt(e.target.value, 10) || 0)}
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
                value={refBonus}
                onChange={(e) => setRefBonus(parseInt(e.target.value, 10) || 0)}
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
              <CheckCircle2 className="w-4 h-4" />
              <span>O'zgarishlarni Saqlash</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
