import React, { useState } from 'react';
import { DollarSign, PlusCircle, User } from 'lucide-react';
import { UserItem } from '../types';
import { formatSum } from '../utils/format';
import { Modal, ModalCancelButton } from './Modal';

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Balansni Tahrirlash"
      subtitle={`#${user.id} • ${user.firstName || user.username || 'Foydalanuvchi'}`}
      icon={<DollarSign className="w-5 h-5" />}
      accent="indigo"
      size="sm"
      onSubmit={handleSubmit}
      bodyClassName="space-y-4"
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-600/30 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {loading ? 'Saqlanmoqda...' : 'Tasdiqlash'}
          </button>
        </>
      }
    >
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
    </Modal>
  );
};
