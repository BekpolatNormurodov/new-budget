import React, { useState } from 'react';
import { X, Send, CheckCircle2, Users, ShieldAlert, Radio } from 'lucide-react';

interface MarketingBroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface BroadcastResult {
  sentCount: number;
  failedCount: number;
  durationMs: number;
  slot: string;
}

export const MarketingBroadcastModal: React.FC<MarketingBroadcastModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [selectedSlot, setSelectedSlot] = useState<'TEST' | 'MORNING' | 'EVENING'>('TEST');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);

  if (!isOpen) return null;

  const handleSendBroadcast = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/broadcast/marketing-trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot: selectedSlot }),
      });
      const data = await res.json();
      setResult({
        sentCount: data.sentCount || 0,
        failedCount: data.failedCount || 0,
        durationMs: data.durationMs || 0,
        slot: selectedSlot,
      });
    } catch (e: any) {
      alert('Xabar yuborishda xatolik yuz berdi: ' + (e.message || 'Server xatosi'));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-amber-500 to-orange-500 rounded-2xl text-white shadow-md shadow-orange-500/20">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Ommaviy Eslatma Xabarnomasi</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Bot foydalanuvchilariga marketing va eslatma yuborish</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {!result ? (
            <>
              {/* Alert Info Box */}
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-300 text-xs flex items-start gap-3">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <p className="leading-relaxed">
                  Ushbu amal barcha ulangan botlar orqali hali ovoz bermagan yoki to'xtab qolgan foydalanuvchilarga aqlli eslatma xabarini parallel yuboradi.
                </p>
              </div>

              {/* Slot selector */}
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 block">
                  Xabarnoma turi (Shablon)
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSelectedSlot('TEST')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      selectedSlot === 'TEST'
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300 ring-2 ring-amber-500/20 font-bold'
                        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs">
                      <span>⚡️ Test Rejim</span>
                    </div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-normal">Tezkor sinov xabari</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedSlot('MORNING')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      selectedSlot === 'MORNING'
                        ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500/20 font-bold'
                        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs">
                      <span>🌅 Tonggi Eslatma</span>
                    </div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-normal">Kun boshidagi motivatsiya</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedSlot('EVENING')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      selectedSlot === 'EVENING'
                        ? 'bg-purple-500/10 border-purple-500/40 text-purple-700 dark:text-purple-300 ring-2 ring-purple-500/20 font-bold'
                        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs">
                      <span>🌙 Kechki Eslatma</span>
                    </div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-normal">Kechki yakuniy chaqiriq</p>
                  </button>
                </div>
              </div>

              {/* Message preview card */}
              <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Xabar mazmuni:
                </span>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-mono">
                  {selectedSlot === 'MORNING'
                    ? '🌅 Xayrli tong! Bugun mahallamiz rivoji uchun ovoz berib, 30 000 so\'m mukofotni qo\'lga kiriting!'
                    : selectedSlot === 'EVENING'
                    ? '🌙 Kun yakunlanmoqda! Imkoniyatni qo\'ldan boy bermang, hoziroq ovoz bering va balansingizni to\'ldiring!'
                    : '📢 Test: Ochiq Budjet botimiz faol ishlamoqda. Ovoz bering va mukofotingizni yechib oling!'}
                </p>
              </div>
            </>
          ) : (
            /* Results Card */
            <div className="space-y-4 animate-in fade-in zoom-in-95">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <h4 className="font-bold text-sm">Xabarnoma Muvaffaqiyatli Yakunlandi!</h4>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">Barcha foydalanuvchilarga xabarlar yetkazildi.</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-center">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-semibold">Yuborildi</span>
                  <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">{result.sentCount} ta</span>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-center">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-semibold">Yetmadi / Blok</span>
                  <span className="text-lg font-extrabold text-rose-600 dark:text-rose-400">{result.failedCount} ta</span>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-center">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-semibold">Ketgan vaqt</span>
                  <span className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400">{result.durationMs} ms</span>
                </div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
            >
              {result ? 'Yopish' : 'Bekor qilish'}
            </button>

            {!result ? (
              <button
                type="button"
                onClick={handleSendBroadcast}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-orange-500/25 transition disabled:opacity-50 cursor-pointer"
              >
                <Send className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>{loading ? 'Yuborilmoqda...' : 'Hozir Yuborish'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setResult(null)}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition cursor-pointer"
              >
                Yana Yuborish
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
