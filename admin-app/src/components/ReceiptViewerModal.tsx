import React from 'react';
import { X, Download, ExternalLink, FileCheck } from 'lucide-react';
import { formatSum } from '../utils/format';

interface ReceiptViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  receiptUrl: string;
  amount?: number;
  userName?: string;
  card?: string;
}

export const ReceiptViewerModal: React.FC<ReceiptViewerModalProps> = ({
  isOpen,
  onClose,
  receiptUrl,
  amount,
  userName,
  card,
}) => {
  if (!isOpen || !receiptUrl) return null;

  const fullUrl = receiptUrl.startsWith('http') || receiptUrl.startsWith('data:')
    ? receiptUrl
    : `${window.location.origin}${receiptUrl}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-600 dark:text-emerald-400">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">To'lov Cheki (Kvitansiya)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {amount ? `${formatSum(amount)} so'm` : ''} {userName ? `• ${userName}` : ''} {card ? `• ${card}` : ''}
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

        {/* Image Preview Container */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-100 dark:bg-slate-950/50">
          <img
            src={fullUrl}
            alt="To'lov cheki"
            className="max-w-full max-h-[60vh] object-contain rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg"
          />
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90">
          <a
            href={fullUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          >
            <ExternalLink className="w-4 h-4" />
            Yangi oynada ochish
          </a>

          <a
            href={fullUrl}
            download={`chek_${Date.now()}.jpg`}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-600/30 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Rasmni yuklab olish
          </a>
        </div>
      </div>
    </div>
  );
};
