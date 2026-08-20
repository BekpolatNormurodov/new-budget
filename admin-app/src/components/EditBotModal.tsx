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
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
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
      setDescription(bot.description || '');
      setAvatarUrl(bot.avatarUrl || '/assets/open_budget_avatar.jpg');
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
      description,
      avatarUrl,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900/98 border border-slate-800 rounded-3xl p-5 sm:p-6 max-w-lg w-full space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Bot va Mahalla Sozlamalarini Tahrirlash</h3>
              <p className="text-[11px] text-slate-400">#{bot.id} • {bot.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Bot Avatar Section */}
        <div className="p-3.5 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src={avatarUrl || '/assets/open_budget_avatar.jpg'}
              alt="Bot Avatar"
              className="w-12 h-12 rounded-2xl object-cover border-2 border-indigo-500/30 shadow-lg shrink-0"
            />
            <div>
              <h4 className="text-xs font-bold text-white flex items-center gap-1">
                <Image className="w-3.5 h-3.5 text-indigo-400" />
                <span>Bot Profil Rasmi</span>
              </h4>
              <p className="text-[11px] text-slate-400">Individual profil rasmi</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-[11px] transition flex items-center gap-1 shadow-sm"
            >
              <Upload className="w-3 h-3" />
              <span>O'zgartirish</span>
            </button>
            {avatarUrl !== '/assets/open_budget_avatar.jpg' && (
              <button
                type="button"
                onClick={() => setAvatarUrl('/assets/open_budget_avatar.jpg')}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
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
            <label className="block text-slate-300 font-semibold mb-1">Bot Nomi</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Masalan: Navbahor MFY Boti"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-bold"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1">
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span>Telegram Bot Token</span>
            </label>
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono text-[11px]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                <span>Mahalla Nomi</span>
              </label>
              <input
                type="text"
                value={mahallaName}
                onChange={(e) => setMahallaName(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-bold"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Mahalla ID (12 ta raqam)</label>
              <input
                type="text"
                value={mahallaId}
                onChange={(e) => setMahallaId(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Open Budget Havolasi (URL)</label>
            <input
              type="text"
              value={openBudgetUrl}
              onChange={(e) => setOpenBudgetUrl(e.target.value)}
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 text-[11px]"
            />
          </div>

          {/* Izoh / Eslatma (Ixtiyoriy) */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                <span>Izoh / Qo'shimcha Eslatma (Ixtiyoriy)</span>
              </span>
              <span className="text-[10px] text-slate-500">Ixtiyoriy</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Masalan: 14-maktab yo'li loyihasi uchun, shtab rahbari: Alisher aka..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 resize-none"
            />
          </div>

          {/* Ovoz Limiti (Target Votes) */}
          <div className="p-3 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 space-y-1.5">
            <label className="block text-indigo-300 font-bold flex items-center gap-1.5 text-xs">
              <Target className="w-4 h-4 text-cyan-400" />
              <span>Ovoz Yig'ish Rejasi (Target Limiti)</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="10"
                step="10"
                value={targetVotes}
                onChange={(e) => setTargetVotes(parseInt(e.target.value, 10))}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-cyan-300 font-mono font-bold text-xs"
              />
              <span className="text-slate-400 font-semibold shrink-0 text-xs">ta ovoz</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                <span>Ovoz Mukofoti (so'm)</span>
              </label>
              <input
                type="number"
                value={voteReward}
                onChange={(e) => setVoteReward(parseInt(e.target.value, 10))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-bold text-xs"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1">
                <Gift className="w-3.5 h-3.5 text-indigo-400" />
                <span>Referal Bonusi (so'm)</span>
              </label>
              <input
                type="number"
                value={refBonus}
                onChange={(e) => setRefBonus(parseInt(e.target.value, 10))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-bold text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/30 transition"
            >
              Saqlash & Yangilash
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
