import React, { useState, useEffect } from 'react';
import { Pencil } from 'lucide-react';
import { Modal, ModalCancelButton } from './Modal';

interface PromptModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  onConfirm: (val: string) => void;
  onCancel: () => void;
}

export const PromptModal: React.FC<PromptModalProps> = ({
  isOpen,
  title,
  message,
  placeholder = '',
  defaultValue = '',
  confirmText = 'Saqlash',
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue, isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      icon={<Pencil className="w-5 h-5" />}
      accent="indigo"
      size="sm"
      bodyClassName="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(value);
      }}
      footer={
        <>
          <ModalCancelButton onClick={onCancel} />
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-colors cursor-pointer"
          >
            {confirmText}
          </button>
        </>
      }
    >
      {message && (
        <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line">{message}</p>
      )}
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-3 glass-input rounded-2xl font-medium text-xs focus:outline-none"
      />
    </Modal>
  );
};
