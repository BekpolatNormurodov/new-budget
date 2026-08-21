import React, { useState, useRef } from 'react';
import {
  X,
  Send,
  Radio,
  Image,
  Link,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  EyeOff,
  Quote,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Trash2,
  ExternalLink,
  Sparkles,
  MessageSquare,
} from 'lucide-react';

interface MarketingBroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface BroadcastResult {
  sentCount: number;
  failedCount: number;
  durationMs: number;
}

export const MarketingBroadcastModal: React.FC<MarketingBroadcastModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'reminder' | 'custom_ad'>('reminder');

  // Tab 1: Reminder State
  const [selectedSlot, setSelectedSlot] = useState<'MORNING' | 'EVENING'>('MORNING');

  // Tab 2: Custom Ad State
  const [adText, setAdText] = useState<string>(
    '🔥 <b>DIQQAT, KATTA IMKONIYAT!</b>\n\n' +
    'Ochiq Budjet loyihasida ovoz berib <b>30 000 so\'m</b> kafolatlangan mukofotga ega bo\'ling!\n\n' +
    '📌 <i>Barcha oila a\'zolaringiz raqamlaridan ham ovoz berishingiz mumkin!</i>\n\n' +
    'Hoziroq quyidagi tugma orqali boshlang 👇'
  );
  const [bannerImage, setBannerImage] = useState<string>('');
  const [buttonText, setButtonText] = useState<string>('🗳 Hoziroq Ovoz Berish');
  const [buttonUrl, setButtonUrl] = useState<string>('https://t.me/open_budget_bot');

  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (!isOpen) return null;

  // Insert HTML tag into textarea
  const insertTag = (openTag: string, closeTag: string) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end) || 'matn';
    const replacement = `${openTag}${selectedText}${closeTag}`;

    const newText = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
    setAdText(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + openTag.length, start + openTag.length + selectedText.length);
    }, 50);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('Rasm hajmi 5MB dan oshmasligi kerak');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        setBannerImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSendBroadcast = async () => {
    setLoading(true);
    setResult(null);

    try {
      if (activeTab === 'reminder') {
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
        });
      } else {
        if (!adText.trim()) {
          alert('Iltimos, reklama matnini kiriting!');
          setLoading(false);
          return;
        }

        const res = await fetch('/api/admin/broadcast/custom-ad', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: adText.trim(),
            photoBase64OrUrl: bannerImage || undefined,
            buttonText: buttonText.trim() || undefined,
            buttonUrl: buttonUrl.trim() || undefined,
          }),
        });
        const data = await res.json();
        setResult({
          sentCount: data.sentCount || 0,
          failedCount: data.failedCount || 0,
          durationMs: data.durationMs || 0,
        });
      }
    } catch (e: any) {
      alert('Xabar yuborishda xatolik: ' + (e.message || 'Server xatosi'));
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 dark:bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-amber-500 to-orange-500 rounded-2xl text-white shadow-md shadow-orange-500/20">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Ommaviy Xabarnoma & Reklama</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Barcha bot foydalanuvchilariga xabar yuborish tizimi</p>
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

        {/* Tab Selector */}
        {!result && (
          <div className="px-5 pt-4 bg-white dark:bg-slate-900 shrink-0">
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-950/80 rounded-2xl border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab('reminder')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'reminder'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Radio className="w-4 h-4" />
                <span>Avtomatik Eslatma</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('custom_ad')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'custom_ad'
                    ? 'bg-white dark:bg-slate-800 text-orange-600 dark:text-orange-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>Reklama & Banner</span>
              </button>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {!result ? (
            <>
              {activeTab === 'reminder' ? (
                /* Tab 1: Reminder Mode */
                <div className="space-y-4">
                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-300 text-xs flex items-start gap-3">
                    <Radio className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    <p className="leading-relaxed">
                      Avtomatik eslatma tizimi barcha mahallalar holatini tahlil qiladi va rejasiga yetmagan mahallalar uchun ovoz yig'ish xabarlarini yuboradi.
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 block">
                      Eslatma vaqti va shabloni
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedSlot('MORNING')}
                        className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                          selectedSlot === 'MORNING'
                            ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500/20 font-bold'
                            : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="text-xs">🌅 Tonggi Eslatma</span>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-normal">09:00 dagi kun boshidagi chaqiriq</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedSlot('EVENING')}
                        className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                          selectedSlot === 'EVENING'
                            ? 'bg-purple-500/10 border-purple-500/40 text-purple-700 dark:text-purple-300 ring-2 ring-purple-500/20 font-bold'
                            : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="text-xs">🌙 Kechki Eslatma</span>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-normal">17:00 dagi kun yakuni xabarnomasi</p>
                      </button>
                    </div>
                  </div>

                  {/* Preview Card */}
                  <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-2">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      Avtomatik xabar mazmuni:
                    </span>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-mono whitespace-pre-line">
                      {selectedSlot === 'MORNING'
                        ? '🌅 Xayrli tong, aziz yurtdosh!\n\n🔥 Open Budgetda ovoz berib, 30 000 so\'m mukofot oling!\n📍 Mahalla: [Mahalla Nomi]\n💰 To\'lov: 30 000 so\'m (Darhol kartaga / paynetga)\n\nHoziroq "🗳 Ovoz berish" tugmasini bosing 👇'
                        : '🌆 Xayrli kech! Bugungi imkoniyatni boy bermang!\n\n⚡️ [Mahalla Nomi] bo\'yicha ovoz berish davom etmoqda!\n💰 Ovoz mukofoti: 30 000 so\'m\n\nOvoz berish uchun pastdagi tugmani bosing 👇'}
                    </p>
                  </div>
                </div>
              ) : (
                /* Tab 2: Custom Ad & Banner Mode */
                <div className="space-y-4">
                  {/* Banner Image Input */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Image className="w-3.5 h-3.5 text-orange-500" />
                        <span>Reklama Banneri (Ixtiyoriy)</span>
                      </span>
                      {bannerImage && (
                        <button
                          type="button"
                          onClick={() => setBannerImage('')}
                          className="text-[11px] text-rose-500 hover:text-rose-600 flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          Rasmni o'chirish
                        </button>
                      )}
                    </label>

                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImageUpload}
                      accept="image/*"
                      className="hidden"
                    />

                    {bannerImage ? (
                      <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 max-h-48 bg-slate-100 dark:bg-slate-950 flex items-center justify-center">
                        <img src={bannerImage} alt="Banner" className="max-h-48 w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="absolute bottom-2 right-2 px-3 py-1.5 bg-black/70 hover:bg-black text-white text-[11px] font-bold rounded-xl backdrop-blur-md transition cursor-pointer"
                        >
                          O'zgartirish
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-orange-500 rounded-2xl p-4 text-center cursor-pointer transition bg-slate-50 dark:bg-slate-800/40"
                      >
                        <Upload className="w-6 h-6 mx-auto text-slate-400 dark:text-slate-500 mb-1" />
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Rasm yuklash uchun bosing</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500">PNG, JPG, JPEG (5MB gacha)</p>
                      </div>
                    )}
                  </div>

                  {/* Formatting Toolbar & Text Area */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
                      Reklama Matni (Telegram HTML format)
                    </label>

                    {/* Toolbar */}
                    <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-t-xl border border-slate-300 dark:border-slate-700 border-b-0 flex-wrap">
                      <button
                        type="button"
                        onClick={() => insertTag('<b>', '</b>')}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
                        title="Qalin (Bold)"
                      >
                        <Bold className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => insertTag('<i>', '</i>')}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 text-xs cursor-pointer"
                        title="Qiya (Italic)"
                      >
                        <Italic className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => insertTag('<u>', '</u>')}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 text-xs cursor-pointer"
                        title="Tagiga chizilgan"
                      >
                        <Underline className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => insertTag('<s>', '</s>')}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 text-xs cursor-pointer"
                        title="O'chirilgan"
                      >
                        <Strikethrough className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => insertTag('<code>', '</code>')}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 text-xs cursor-pointer"
                        title="Kod (Monospace)"
                      >
                        <Code className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => insertTag('<span class="tg-spoiler">', '</span>')}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 text-xs cursor-pointer"
                        title="Yashirin (Spoiler)"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => insertTag('<blockquote>', '</blockquote>')}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 text-xs cursor-pointer"
                        title="Iqtibos (Quote)"
                      >
                        <Quote className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => insertTag('<a href="https://t.me/...">', '</a>')}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 text-xs cursor-pointer"
                        title="Havola (Link)"
                      >
                        <Link className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <textarea
                      ref={textareaRef}
                      rows={4}
                      value={adText}
                      onChange={(e) => setAdText(e.target.value)}
                      placeholder="Xabar matnini kiriting..."
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-b-xl p-3 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:border-orange-500 transition-colors"
                      required
                    />
                  </div>

                  {/* Inline Button Configuration */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                        Tugma Matni (Ixtiyoriy)
                      </label>
                      <input
                        type="text"
                        value={buttonText}
                        onChange={(e) => setButtonText(e.target.value)}
                        placeholder="Masalan: 👉 Kanalga O'tish"
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:border-orange-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                        Tugma Havolasi (URL)
                      </label>
                      <input
                        type="url"
                        value={buttonUrl}
                        onChange={(e) => setButtonUrl(e.target.value)}
                        placeholder="https://t.me/..."
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:border-orange-500 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Telegram Bubble Live Preview */}
                  <div className="space-y-1.5 pt-2">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      Telegramdagi Jonli Ko'rinishi (Preview):
                    </span>
                    <div className="p-4 rounded-3xl bg-slate-200/70 dark:bg-[#182533] border border-slate-300 dark:border-slate-700/60 max-w-md mx-auto shadow-xl">
                      {bannerImage && (
                        <div className="rounded-2xl overflow-hidden mb-3 max-h-44 border border-black/10">
                          <img src={bannerImage} alt="Banner Preview" className="w-full h-auto object-cover" />
                        </div>
                      )}
                      <div
                        className="text-xs leading-relaxed text-slate-900 dark:text-white break-words"
                        dangerouslySetInnerHTML={{ __html: adText.replace(/\n/g, '<br/>') }}
                      />
                      {buttonText && buttonUrl && (
                        <div className="mt-3 pt-2 border-t border-black/10 dark:border-white/10">
                          <div className="py-2 px-4 rounded-xl bg-indigo-500/20 dark:bg-indigo-600/30 text-indigo-700 dark:text-indigo-300 font-bold text-xs text-center border border-indigo-500/30 flex items-center justify-center gap-1.5">
                            <span>{buttonText}</span>
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Results Card */
            <div className="space-y-4 animate-in fade-in zoom-in-95 py-4">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 flex items-center gap-3">
                <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <h4 className="font-bold text-sm">Xabarnoma Muvaffaqiyatli Yetkazildi!</h4>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">Barcha botlar orqali foydalanuvchilarga xabarlar jo'natildi.</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-center">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-semibold">Yetkazildi</span>
                  <span className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">{result.sentCount} ta</span>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-center">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-semibold">Bloklangan</span>
                  <span className="text-xl font-extrabold text-rose-600 dark:text-rose-400">{result.failedCount} ta</span>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-center">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-semibold">Sarflangan vaqt</span>
                  <span className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400">{result.durationMs} ms</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            {result ? 'Yopish' : 'Bekor qilish'}
          </button>

          {!result ? (
            <button
              type="button"
              onClick={handleSendBroadcast}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 via-orange-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-orange-500/25 transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Send className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Xabarlar yuborilmoqda...' : 'Hozir Yuborish'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setResult(null)}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition cursor-pointer"
            >
              Yangi Xabar Yuborish
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
