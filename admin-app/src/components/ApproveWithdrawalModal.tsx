import React, { useState, useRef } from 'react';
import { CheckCircle, Upload, Image, Trash2, CreditCard, User, DollarSign } from 'lucide-react';
import { WithdrawalItem } from '../types';
import { formatMoney } from '../utils/format';
import { Modal, ModalCancelButton } from './Modal';

interface ApproveWithdrawalModalProps {
  isOpen: boolean;
  onClose: () => void;
  withdrawal: WithdrawalItem | null;
  onConfirm: (id: number, receiptImage?: string, note?: string) => void;
}

export const ApproveWithdrawalModal: React.FC<ApproveWithdrawalModalProps> = ({
  isOpen,
  onClose,
  withdrawal,
  onConfirm,
}) => {
  const [receiptImage, setReceiptImage] = useState<string>('');
  const [note, setNote] = useState<string>('To\'lov muvaffaqiyatli amalga oshirildi');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen || !withdrawal) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('Rasm hajmi 5MB dan oshmasligi kerak');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        setReceiptImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    onConfirm(withdrawal.id, receiptImage || undefined, note);
  };

  const formattedCard = withdrawal.accountDetails?.length === 16
    ? withdrawal.accountDetails.replace(/(\d{4})/g, '$1 ').trim()
    : withdrawal.accountDetails;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="To'lovni Tasdiqlash & Chek Yuklash"
      icon={<CheckCircle className="w-5 h-5" />}
      accent="emerald"
      size="md"
      onSubmit={handleSubmit}
      bodyClassName="space-y-4"
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <button
            type="submit"
            disabled={isSubmitting}
            className={`px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:opacity-95 text-white rounded-xl font-bold text-xs shadow-lg cursor-pointer transition flex items-center gap-1.5 ${
              isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <CheckCircle className="w-4 h-4" />
            <span>{isSubmitting ? 'Tasdiqlanmoqda...' : 'To\'lovni Tasdiqlash & Yuborish'}</span>
          </button>
        </>
      }
    >
        {/* Withdrawal details summary card */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
          <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Foydalanuvchi:</span>
            </span>
            <span className="font-bold text-slate-900 dark:text-white">
              {withdrawal.user?.firstName} (@{withdrawal.user?.username || 'yoq'})
            </span>
          </div>

          <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Summa:</span>
            </span>
            <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
              {formatMoney(withdrawal.amount)}
            </span>
          </div>

          <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span>Karta / Hisob ({withdrawal.paymentMethod}):</span>
            </span>
            <span className="font-mono font-bold text-cyan-600 dark:text-cyan-300">
              {formattedCard}
            </span>
          </div>

          {(withdrawal as any).cardHolder && (
            <div className="flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400">Karta Egasi:</span>
              <span className="font-bold text-slate-900 dark:text-white uppercase">
                {(withdrawal as any).cardHolder}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-3.5 text-xs">
          {/* Chek rasmini yuklash */}
          <div className="space-y-2">
            <label className="block text-slate-700 dark:text-slate-300 font-bold flex items-center gap-1.5">
              <Image className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>To'lov Cheki Skrinshotini Yuklash (Mijozga boradi)</span>
            </label>

            {receiptImage ? (
              <div className="relative rounded-2xl overflow-hidden border border-emerald-500/40 bg-slate-100 dark:bg-slate-900 p-2">
                <img
                  src={receiptImage}
                  alt="Chek rasmi"
                  className="max-h-48 w-full object-contain rounded-xl"
                />
                <button
                  type="button"
                  onClick={() => setReceiptImage('')}
                  className="absolute top-4 right-4 p-2 bg-rose-600/90 hover:bg-rose-600 text-white rounded-xl shadow-lg cursor-pointer transition"
                  title="Rasmni o'chirish"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500/60 rounded-2xl p-6 text-center cursor-pointer transition bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-100/80 dark:hover:bg-slate-900/80 space-y-2"
              >
                <Upload className="w-8 h-8 text-indigo-500 dark:text-indigo-400 mx-auto" />
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  Chek rasmini yuklash uchun bu yerga bosing
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  (JPG, PNG, WebP — Payme / Click / Bank cheki)
                </p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Izoh (Mijozga xabarda ko'rinadi)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3.5 py-2.5 glass-input rounded-xl"
              placeholder="To'lov muvaffaqiyatli amalga oshirildi"
            />
          </div>

        </div>
    </Modal>
  );
};
