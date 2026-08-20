import React, { useState, useEffect, useRef } from 'react';
import { X, Sliders, Target, DollarSign, Gift, MapPin, Key, Image, Upload, Trash2, Sparkles } from 'lucide-react';
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
      avatarUrl,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-modal rounded-3xl p-6 max-w-lg w-full space-y-4 border border-indigo-500/30 shadow-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
        <div className="flex justify-between items-center">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-400" />
            <span>Bot va Mahalla Sozlamalarini Tahrirlash</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Bot Avatar Section */}
        <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src={avatarUrl || '/assets/open_budget_avatar.jpg'}
              alt="Bot Avatar"
              className="w-14 h-14 rounded-2xl object-cover border-2 border-cyan-400/40 shadow-lg shrink-0"
            />
            <div>
              <h4 className="text-xs font-bold text-white flex items-center gap-1">
                <Image className="w-3.5 h-3.5 text-cyan-400" />
                <span>Bot Profil Rasmi (Avatar)</span>
              </h4>
              <p className="text-[11px] text-slate-400">Har bir bot uchun individual rasm</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-indigo-600/60 hover:bg-indigo-600 text-white rounded-xl font-bold text-[11px] transition cursor-pointer flex items-center gap-1"
            >
              <Upload className="w-3 h-3" />
              <span>O'zgartirish</span>
            </button>
            {avatarUrl !== '/assets/open_budget_avatar.jpg' && (
              <button
                type="button"
                onClick={() => setAvatarUrl('/assets/open_budget_avatar.jpg')}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl cursor-pointer"
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
              className="w-full px-3.5 py-2.5 glass-input rounded-xl text-white font-bold"
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
              className="w-full px-3.5 py-2.5 glass-input rounded-xl text-white font-mono text-[11px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
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
                className="w-full px-3.5 py-2.5 glass-input rounded-xl text-white font-bold"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Mahalla ID (12 ta raqam)</label>
              <input
                type="text"
                value={mahallaId}
                onChange={(e) => setMahallaId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 glass-input rounded-xl text-white font-mono"
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
              className="w-full px-3.5 py-2.5 glass-input rounded-xl text-white text-[11px]"
            />
          </div>

          {/* Ovoz Limiti (Target Votes) */}
          <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 space-y-1.5">
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
                className="w-full px-3.5 py-2.5 glass-input rounded-xl text-cyan-300 font-mono font-bold"
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
                className="w-full px-3.5 py-2.5 glass-input rounded-xl text-white font-bold"
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
                className="w-full px-3.5 py-2.5 glass-input rounded-xl text-white font-bold"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold cursor-pointer hover:bg-slate-700 transition"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white rounded-xl font-bold shadow-lg cursor-pointer hover:opacity-95 transition"
            >
              Saqlash & Yangilash
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
