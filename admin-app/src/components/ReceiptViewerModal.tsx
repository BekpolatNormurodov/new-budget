import React from 'react';
import { Download, ExternalLink, FileCheck } from 'lucide-react';
import { formatSum } from '../utils/format';
import { Modal } from './Modal';

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

  const subtitle = [
    amount ? `${formatSum(amount)} so'm` : '',
    userName || '',
    card || '',
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="To'lov Cheki (Kvitansiya)"
      subtitle={subtitle}
      icon={<FileCheck className="w-5 h-5" />}
      accent="emerald"
      size="lg"
      bodyClassName="!p-4 flex items-center justify-center bg-slate-100 dark:bg-slate-950/50"
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
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
      }
    >
      <img
        src={fullUrl}
        alt="To'lov cheki"
        className="max-w-full max-h-[60vh] object-contain rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg"
      />
    </Modal>
  );
};
