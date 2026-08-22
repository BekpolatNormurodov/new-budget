import React from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Modal, ModalCancelButton } from './Modal';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  type?: 'danger' | 'warning' | 'success' | 'info';
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ACCENT = {
  danger: 'rose',
  warning: 'amber',
  success: 'emerald',
  info: 'indigo',
} as const;

const CONFIRM_BTN = {
  danger: 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/30',
  warning: 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/30',
  success: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30',
  info: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30',
} as const;

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  type = 'warning',
  confirmText = 'Tasdiqlash',
  cancelText = 'Bekor qilish',
  onConfirm,
  onCancel,
}) => {
  const icon = {
    danger: <AlertOctagon className="w-5 h-5" />,
    warning: <AlertTriangle className="w-5 h-5" />,
    success: <CheckCircle2 className="w-5 h-5" />,
    info: <Info className="w-5 h-5" />,
  }[type];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      icon={icon}
      accent={ACCENT[type]}
      size="sm"
      footer={
        <>
          <ModalCancelButton onClick={onCancel}>{cancelText}</ModalCancelButton>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg transition-colors cursor-pointer text-white ${CONFIRM_BTN[type]}`}
          >
            {confirmText}
          </button>
        </>
      }
    >
      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
        {message}
      </p>
    </Modal>
  );
};
