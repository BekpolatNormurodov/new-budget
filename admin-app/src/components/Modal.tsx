import React from 'react';
import { X } from 'lucide-react';

type Accent = 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate';
type Size = 'sm' | 'md' | 'lg' | 'xl';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  accent?: Accent;
  size?: Size;
  /** Ixtiyoriy sticky footer (odatda tugmalar). */
  footer?: React.ReactNode;
  /** Berilsa, body + footer <form> ichida bo'ladi va submit shu formaga bog'lanadi. */
  onSubmit?: (e: React.FormEvent) => void;
  /** Body (scroll qismi) uchun qo'shimcha classlar. */
  bodyClassName?: string;
  /** Yopish (X) tugmasini yashirish. */
  hideClose?: boolean;
  children: React.ReactNode;
}

const SIZE_MAP: Record<Size, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-xl',
  xl: 'max-w-4xl',
};

const ACCENT_MAP: Record<Accent, string> = {
  indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  slate: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
};

/**
 * Butun admin panel uchun yagona modal qobig'i.
 * Izchil overlay, panel, header (ikonka+sarlavha+yopish), scroll body va
 * sticky footer beradi. Mobil uchun p-3, kattaroq ekranda p-4.
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  accent = 'indigo',
  size = 'md',
  footer,
  onSubmit,
  bodyClassName = '',
  hideClose = false,
  children,
}) => {
  if (!isOpen) return null;

  const InnerTag: React.ElementType = onSubmit ? 'form' : 'div';
  const innerProps = onSubmit ? { onSubmit } : {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`relative w-full ${SIZE_MAP[size]} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200 transition-colors`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <div className={`p-2 rounded-xl flex-shrink-0 ${ACCENT_MAP[accent]}`}>{icon}</div>
            )}
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white truncate">
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>
              )}
            </div>
          </div>
          {!hideClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex-shrink-0"
              title="Yopish"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <InnerTag {...innerProps} className="flex flex-col flex-1 overflow-hidden">
          {/* Body (scroll) */}
          <div className={`p-4 sm:p-5 overflow-y-auto flex-1 ${bodyClassName}`}>{children}</div>

          {/* Footer (sticky) */}
          {footer && (
            <div className="flex items-center justify-end gap-2 p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex-shrink-0">
              {footer}
            </div>
          )}
        </InnerTag>
      </div>
    </div>
  );
};

/** Modal footer uchun ikkilamchi (Bekor qilish) tugma. */
export const ModalCancelButton: React.FC<{
  onClick: () => void;
  children?: React.ReactNode;
}> = ({ onClick, children = 'Bekor qilish' }) => (
  <button
    type="button"
    onClick={onClick}
    className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
  >
    {children}
  </button>
);
