import React, { useRef } from 'react';
import { X, PlusCircle, Sparkles, Target, DollarSign, Gift, MapPin, Image, Upload, Trash2 } from 'lucide-react';

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

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-modal rounded-3xl p-6 max-w-lg w-full space-y-4 border border-indigo-500/30 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-indigo-400" />
            <span>Yangi Bot & Mahalla Biriktirish</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Bot Profile Image & Avatar Upload / Preview */}
        <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src={newBot.avatarUrl || '/assets/open_budget_avatar.jpg'}
              alt="Bot Avatar"
              className="w-14 h-14 rounded-2xl object-cover shadow-lg border-2 border-cyan-400/40 shrink-0"
            />
            <div>
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Image className="w-3.5 h-3.5 text-cyan-400" />
                <span>Bot Profil Rasmi (Avatar)</span>
              </h4>
              <p className="text-[11px] text-slate-300 leading-tight">
                Standart 3D logo yoki o'z rasmingizni yuklang
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-indigo-600/60 hover:bg-indigo-600 text-white rounded-xl font-bold text-[11px] transition cursor-pointer flex items-center gap-1"
            >
              <Upload className="w-3 h-3" />
              <span>Yuklash</span>
            </button>
            {newBot.avatarUrl && (
              <button
                type="button"
                onClick={() => setNewBot({ ...newBot, avatarUrl: '' })}
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

        <form onSubmit={onSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Bot Nomi</label>
            <input
              type="text"
              placeholder="Do'stlik MFY Boti"
              value={newBot.name}
              onChange={(e) => setNewBot({ ...newBot, name: e.target.value })}
              required
              className="w-full px-3.5 py-2.5 glass-input rounded-xl text-white font-bold"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Telegram Bot Token (BotFather dan)</label>
            <input
              type="text"
              placeholder="1234567890:ABCdefGHIjklMNO..."
              value={newBot.token}
              onChange={(e) => setNewBot({ ...newBot, token: e.target.value })}
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
                placeholder="Do'stlik MFY"
                value={newBot.mahallaName}
                onChange={(e) => setNewBot({ ...newBot, mahallaName: e.target.value })}
                required
                className="w-full px-3.5 py-2.5 glass-input rounded-xl text-white font-bold"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Mahalla ID (12 ta raqam)</label>
              <input
                type="text"
                placeholder="055538434014"
                value={newBot.mahallaId}
                onChange={(e) => setNewBot({ ...newBot, mahallaId: e.target.value })}
                required
                className="w-full px-3.5 py-2.5 glass-input rounded-xl text-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Open Budget Havolasi (URL)</label>
            <input
              type="text"
              placeholder="https://openbudget.uz/boards/initiatives/initiative/55/831adc38..."
              value={newBot.openBudgetUrl}
              onChange={(e) => setNewBot({ ...newBot, openBudgetUrl: e.target.value })}
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
                value={newBot.targetVotes || 5000}
                onChange={(e) => setNewBot({ ...newBot, targetVotes: parseInt(e.target.value, 10) })}
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
                value={newBot.voteReward || 30000}
                onChange={(e) => setNewBot({ ...newBot, voteReward: parseInt(e.target.value, 10) })}
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
                value={newBot.refBonus || 5000}
                onChange={(e) => setNewBot({ ...newBot, refBonus: parseInt(e.target.value, 10) })}
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
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white rounded-xl font-bold shadow-lg cursor-pointer hover:opacity-95 transition"
            >
              Yaratish & Ishga tushirish
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
