import React, { useState } from 'react';
import { X, DollarSign, PlusCircle, MinusCircle, User } from 'lucide-react';
import { UserItem } from '../types';
import { formatSum } from '../utils/format';

interface EditUserBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserItem | null;
  onSave: (userId: number, amount: number, isAddition: boolean) => Promise<void>;
}

export const EditUserBalanceModal: React.FC<EditUserBalanceModalProps> = ({
  isOpen,
  onClose,
  user,
  onSave,
}) => {
  const [amount, setAmount] = useState<string>('30000');
  const [isAddition, setIsAddition] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(amount.replace(/[^0-9]/g, ''), 10);
    if (isNaN(num) || num <= 0) return;

    setLoading(true);
    try {
      await onSave(user.id, num, isAddition);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const quickAmounts = [10000, 30000, 50000, 100000];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-600 dark:text-indigo-400">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Balansni Tahrirlash</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                #{user.id} • {user.firstName || user.username || 'Foydalanuvchi'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* User summary card */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 font-semibold text-xs">
                {user.firstName ? user.firstName.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-900 dark:text-white">{user.firstName || `@${user.username}` || 'Foydalanuvchi'}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">ID: {user.telegramId} {user.phone ? `• +${user.phone}` : ''}</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Joriy balans:</span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{formatSum(user.balance)} so'm</span>
            </div>
          </div>

          {/* Operation type toggle */}
          <div>
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">Amal turi</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsAddition(true)}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  isAddition
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <PlusCircle className="w-4 h-4" />
                Balansga qo'shish (+)
              </button>
              <button
                type="button"
                onClick={() => setIsAddition(false)}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  !isAddition
                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <DollarSign className="w-4 h-4" />
                Aniq belgilash (=)
              </button>
            </div>
          </div>

          {/* Amount input */}
          <div>
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">Summa (so'm)</label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="1000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="30000"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                required
              />
              <span className="absolute right-3.5 top-2.5 text-xs text-slate-400">so'm</span>
            </div>
          </div>

          {/* Quick Amount presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {quickAmounts.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setAmount(String(q))}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
              >
                +{formatSum(q)}
              </button>
            ))}
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-600/30 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {loading ? 'Saqlanmoqda...' : 'Tasdiqlash'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
