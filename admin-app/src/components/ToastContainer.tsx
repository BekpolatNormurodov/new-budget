import React from 'react';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { ToastItem } from '../types';

interface ToastContainerProps {
  toasts: ToastItem[];
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts }) => {
  return (
    <div className="fixed top-5 right-5 z-50 flex flex-col space-y-2 pointer-events-none max-w-sm w-full">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto p-4 rounded-2xl shadow-2xl border flex items-center gap-3 backdrop-blur-xl transition-all duration-300 transform translate-y-0 ${
            t.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-200'
              : t.type === 'error'
              ? 'bg-rose-950/90 border-rose-500/30 text-rose-200'
              : 'bg-indigo-950/90 border-indigo-500/30 text-indigo-200'
          }`}
        >
          <div className="shrink-0">
            {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
            {t.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-400" />}
            {t.type === 'info' && <Info className="w-5 h-5 text-indigo-400" />}
          </div>
          <div className="text-xs font-semibold flex-1">{t.message}</div>
        </div>
      ))}
    </div>
  );
};
