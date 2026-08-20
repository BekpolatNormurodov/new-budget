import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface ProDropdownOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  icon?: React.ReactNode;
}

export interface ProDropdownProps {
  options: ProDropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  className?: string;
  align?: 'left' | 'right';
}

export const ProDropdown: React.FC<ProDropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Tanlang...',
  icon,
  className = '',
  align = 'left',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-2 bg-slate-950/90 hover:bg-slate-900 border ${
          isOpen ? 'border-indigo-500 ring-1 ring-indigo-500/30' : 'border-slate-800 hover:border-slate-700'
        } rounded-xl px-3 py-2 text-xs text-white transition-all shadow-inner group`}
      >
        <div className="flex items-center gap-2 overflow-hidden text-left">
          {icon && <span className="text-indigo-400 flex-shrink-0">{icon}</span>}
          {selectedOption?.icon && <span className="flex-shrink-0">{selectedOption.icon}</span>}
          <div className="truncate">
            <span className="font-semibold text-slate-100 truncate block">
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            {selectedOption?.sublabel && (
              <span className="text-[10px] text-slate-400 truncate block font-normal">
                {selectedOption.sublabel}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {selectedOption?.badge && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {selectedOption.badge}
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-indigo-400' : 'group-hover:text-slate-200'
            }`}
          />
        </div>
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <div
          className={`absolute top-full z-50 mt-1.5 min-w-full w-max max-w-sm sm:max-w-md bg-slate-900/98 backdrop-blur-2xl border border-slate-800 rounded-xl shadow-2xl p-1 max-h-64 overflow-y-auto divide-y divide-slate-800/50 animate-in fade-in zoom-in-95 duration-150 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;

            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-3 p-2.5 rounded-lg text-xs transition-colors text-left group ${
                  isSelected
                    ? 'bg-indigo-600/20 text-white font-bold'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  {opt.icon && <span className="flex-shrink-0">{opt.icon}</span>}
                  <div className="overflow-hidden">
                    <p className={`text-xs truncate ${isSelected ? 'text-indigo-300 font-bold' : 'text-slate-200 font-medium'}`}>
                      {opt.label}
                    </p>
                    {opt.sublabel && (
                      <p className="text-[10px] text-slate-400 font-normal truncate mt-0.5 font-mono">
                        {opt.sublabel}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {opt.badge && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                      {opt.badge}
                    </span>
                  )}
                  {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
