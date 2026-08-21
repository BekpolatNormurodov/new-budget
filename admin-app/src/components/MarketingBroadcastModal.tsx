import React, { useState, useRef, useEffect } from 'react';
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
  Plus,
  ExternalLink,
  Sparkles,
  MessageSquare,
  Layers,
  Undo2,
  Redo2,
  Eraser,
  Target,
  Zap,
  Flame,
  History,
  Clock,
  RotateCcw,
  Check,
} from 'lucide-react';
import { BotInstanceItem } from '../types';

interface MarketingBroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  bots?: BotInstanceItem[];
}

interface InlineButton {
  id: string;
  text: string;
  url: string;
}

interface BroadcastResult {
  sentCount: number;
  failedCount: number;
  durationMs: number;
}

interface HistoryItem {
  id: number;
  type: string;
  slot?: string;
  targetBotId?: number;
  targetMahallaName?: string;
  text: string;
  photoUrl?: string;
  buttonsJson?: string;
  totalUsers: number;
  sentCount: number;
  failedCount: number;
  durationMs: number;
  status: string;
  createdAt: string;
}

const TEMPLATES = [
  {
    id: 'income150k',
    label: '💸 150 000 So\'m Daromad',
    icon: '🔥',
    text:
      '🔥 <b>10 DAQIQADA 150 000 SO\'M ISHLASHNI HOHLAYSIZMI?</b>\n\n' +
      'Ochiq Budjet loyihasida o\'zingiz, oila a\'zolaringiz va yaqinlaringiz nomidagi raqamlardan ovoz bering!\n\n' +
      '💰 <b>Har bir ovoz uchun: 30 000 so\'m naqd pul!</b>\n' +
      '⚡️ 5 ta ovoz = <b>150 000 so\'m</b> darhol hisobingizda!\n\n' +
      'Pullar to\'g\'ridan-to\'g\'ri Uzcard/Humo kartangizga yoki Paynetga tushiriladi ✅\n\n' +
      'Hoziroq boshlash uchun pastdagi tugmani bosing 👇',
    buttons: [
      { id: '1', text: '🗳 Ovoz Berish (+30 000 so\'m)', url: 'start_vote' },
      { id: '2', text: '💳 Kartaga Pul Yechish', url: 'withdraw_menu' },
    ],
  },
  {
    id: 'new_mahalla',
    label: '⚡️ Yangi Mahalla Ochildi',
    icon: '🚀',
    text:
      '⚡️ <b>DIQQAT: YANGI KATTA BYUDJETLI MAHALLA START OLDI!</b>\n\n' +
      'Agar oldin boshqa mahallaga ovoz bergan bo\'lsangiz ham — <b>ushbu yangi mahallamizga yangi raqamlar orqali</b> yana cheksiz ovoz berib pul ishlashingiz mumkin!\n\n' +
      '💎 Har bir tasdiqlangan ovozga: <b>30 000 so\'m kafolatlangan mukofot!</b>\n' +
      '🎯 Ovozlar soni cheklangan, birinchilardan bo\'ling!\n\n' +
      'Birinchilardan bo\'lib ovoz bering 👇',
    buttons: [
      { id: '1', text: '⚡️ Yangi Mahallaga Ovoz Berish', url: 'start_vote' },
      { id: '2', text: '👥 Do\'stlarni Taklif Qilish', url: 'referral_link' },
    ],
  },
  {
    id: 'withdraw',
    label: '💳 1 Daqiqada Kartaga Pul',
    icon: '💰',
    text:
      '💰 <b>BALANSINGIZDAGI PULLARNI YECHIB OLING!</b>\n\n' +
      'Hisobingizda mablag\' bormi? Uni <b>1 daqiqa ichida</b> o\'z plastik kartangizga (Uzcard / Humo) yoki telefon raqamingizga Paynet orqali o\'tkazib oling!\n\n' +
      '🚀 Minimal yechish summasi: <b>10 000 so\'m</b>\n' +
      '🔒 To\'lovlar 100% avtomatlashgan va komissiyasiz amalga oshiriladi.\n\n' +
      'Balansingizni tekshiring va pulni oling 👇',
    buttons: [
      { id: '1', text: '💳 Pulni Kartaga Yechib Olish', url: 'withdraw_menu' },
      { id: '2', text: '💰 Balansimni Tekshirish', url: 'refresh_balance' },
    ],
  },
  {
    id: 'ref',
    label: '👥 Passiv Daromad (+5 000)',
    icon: '🏆',
    text:
      '👥 <b>HECH QANDAY MEHNATSIZ KUNIGA 300 000 SO\'M ISHLANG!</b>\n\n' +
      'O\'zingiz ovoz berib bo\'ldingizmi? Endi do\'stlaringiz orqali katta pul ishlang!\n\n' +
      'Sizning havolangizdan kirgan har bir inson uchun: <b>+5 000 so\'m naqd pul!</b>\n' +
      '👥 20 ta do\'st = <b>100 000 so\'m</b>\n' +
      '👥 60 ta do\'st = <b>300 000 so\'m</b> 💸\n\n' +
      'Shaxsiy havolangizni oling va do\'stlaringizga yuboring 👇',
    buttons: [
      { id: '1', text: '🔗 Shaxsiy Referal Havolam', url: 'referral_link' },
      { id: '2', text: '🗳 Ovoz Berish (+30 000)', url: 'start_vote' },
    ],
  },
  {
    id: 'fomo',
    label: '⏰ Shoshiling! So\'nggi Ovozlar',
    icon: '🚨',
    text:
      '🚨 <b>DIQQAT! OVOZ BERISH JARAYONI YAKUNLANMOQDA!</b>\n\n' +
      'Mahallamiz uchun ajratilgan ovozlar limiti <b>90% ga to\'ldi</b>. Limit to\'lishi bilan ovoz qabul qilish va to\'lovlar to\'xtatiladi!\n\n' +
      '🔥 Oxirgi imkoniyatdan foydalaning va <b>30 000 so\'m</b> daromadingizni olib qoling!\n\n' +
      'Hoziroq ovoz berish uchun pastdagi tugmani bosing 👇',
    buttons: [
      { id: '1', text: '🔥 So\'nggi Ovozni Berish (+30 000)', url: 'start_vote' },
      { id: '2', text: '💬 Admin bilan bog\'lanish', url: 'https://t.me/Elbek_Muxtorovv' },
    ],
  },
  {
    id: 'bonus',
    label: '🎁 Bugungi Maxsus Bonus',
    icon: '🎉',
    text:
      '🎉 <b>BUGUNGI MAXSUS KATTA AKSIYA!</b>\n\n' +
      'Bugun ovoz bergan foydalanuvchilar uchun navbatsiz, <b>eng tezkor to\'lov kafolati</b> beriladi!\n\n' +
      '📍 Mahalla: <b>Ochiq Budjet Loyihasi</b>\n' +
      '💰 To\'lov: <b>30 000 so\'m</b> (Darhol kartaga)\n\n' +
      'Imkoniyatni qo\'ldan boy bermang 👇',
    buttons: [
      { id: '1', text: '🎁 Ovoz Berish & Bonusni Olish', url: 'start_vote' },
      { id: '2', text: '💳 Balansni Yechish', url: 'withdraw_menu' },
    ],
  },
];

const PRESET_BUTTON_ACTIONS = [
  { label: '🗳 Ovoz Berish', action: 'start_vote', text: '🗳 Ovoz Berish (+30 000 so\'m)' },
  { label: '💳 Pul Yechish', action: 'withdraw_menu', text: '💳 Pulni Kartaga Yechib Olish' },
  { label: '🔗 Referal Havola', action: 'referral_link', text: '🔗 Shaxsiy Referal Havolam' },
  { label: '💰 Balans Tekshirish', action: 'refresh_balance', text: '💰 Balansimni Tekshirish' },
  { label: '💬 Admin', action: 'https://t.me/Elbek_Muxtorovv', text: '💬 Admin bilan bog\'lanish' },
];

export const MarketingBroadcastModal: React.FC<MarketingBroadcastModalProps> = ({
  isOpen,
  onClose,
  bots = [],
}) => {
  const [activeTab, setActiveTab] = useState<'custom_ad' | 'reminder' | 'history'>('custom_ad');

  // Targeting: ALL or specific bot ID
  const [selectedBotTarget, setSelectedBotTarget] = useState<string>('ALL');

  // Tab 1: Reminder State
  const [selectedSlot, setSelectedSlot] = useState<'MORNING' | 'EVENING'>('MORNING');

  // Tab 2: Custom Ad State
  const [adText, setAdText] = useState<string>(TEMPLATES[0].text);
  const [bannerImage, setBannerImage] = useState<string>('');
  const [buttons, setButtons] = useState<InlineButton[]>(TEMPLATES[0].buttons);

  // Tab 3: History State
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // History stack for Undo/Redo (Ctrl+Z / Ctrl+Y)
  const historyRef = useRef<string[]>([TEMPLATES[0].text]);
  const historyIndexRef = useRef<number>(0);

  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load history when history tab is opened
  useEffect(() => {
    if (isOpen && activeTab === 'history') {
      fetchHistory();
    }
  }, [isOpen, activeTab]);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/admin/broadcast/history');
      if (res.ok) {
        const data = await res.json();
        setHistoryList(data || []);
      }
    } catch (e) {
      console.error('History fetch error:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Push new state to history stack
  const pushToHistory = (newVal: string) => {
    const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    nextHistory.push(newVal);
    if (nextHistory.length > 50) nextHistory.shift();
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    setAdText(newVal);
  };

  const handleUndo = () => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      const prevText = historyRef.current[historyIndexRef.current];
      setAdText(prevText);
    }
  };

  const handleRedo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      const nextText = historyRef.current[historyIndexRef.current];
      setAdText(nextText);
    }
  };

  // Keyboard shortcut listener for Ctrl+Z and Ctrl+Y / Cmd+Z
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      handleRedo();
    }
  };

  // Clean HTML tag insert
  const insertTag = (openTag: string, closeTag: string, placeholder = 'matn') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.focus();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const hasSelection = start !== end;
    const selectedText = hasSelection ? textarea.value.substring(start, end) : placeholder;
    const replacement = `${openTag}${selectedText}${closeTag}`;

    const newText = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
    pushToHistory(newText);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const innerStart = start + openTag.length;
        const innerEnd = innerStart + selectedText.length;
        textareaRef.current.setSelectionRange(innerStart, innerEnd);
      }
    }, 20);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setAdText(val);
    pushToHistory(val);
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

  // Button management
  const addButton = (preset?: { text: string; action: string }) => {
    setButtons([
      ...buttons,
      {
        id: Date.now().toString(),
        text: preset ? preset.text : `👉 Yangi Tugma #${buttons.length + 1}`,
        url: preset ? preset.action : 'start_vote',
      },
    ]);
  };

  const updateButton = (id: string, field: 'text' | 'url', value: string) => {
    setButtons(buttons.map((b) => (b.id === id ? { ...b, [field]: value } : b)));
  };

  const removeButton = (id: string) => {
    setButtons(buttons.filter((b) => b.id !== id));
  };

  // Preset Template loader
  const applyTemplate = (tmpl: typeof TEMPLATES[0]) => {
    pushToHistory(tmpl.text);
    setButtons(tmpl.buttons.map((b) => ({ ...b, id: Math.random().toString() })));
  };

  const isActionUrl = (url: string) => {
    const u = url.trim();
    return !u.startsWith('http://') && !u.startsWith('https://') && !u.startsWith('t.me/');
  };

  // Load from history into editor
  const handleReuseHistory = (item: HistoryItem) => {
    if (item.type === 'REMINDER') {
      setActiveTab('reminder');
      setSelectedSlot((item.slot as any) || 'MORNING');
      if (item.targetBotId) setSelectedBotTarget(String(item.targetBotId));
      else setSelectedBotTarget('ALL');
    } else {
      setActiveTab('custom_ad');
      pushToHistory(item.text);
      if (item.targetBotId) setSelectedBotTarget(String(item.targetBotId));
      else setSelectedBotTarget('ALL');

      if (item.buttonsJson) {
        try {
          const parsed = JSON.parse(item.buttonsJson);
          if (Array.isArray(parsed)) {
            setButtons(parsed.map((b: any, idx: number) => ({ id: String(idx), text: b.text, url: b.url })));
          }
        } catch (e) {}
      }
    }
  };

  const handleSendBroadcast = async () => {
    setLoading(true);
    setResult(null);

    const targetBotId = selectedBotTarget === 'ALL' ? undefined : Number(selectedBotTarget);

    try {
      if (activeTab === 'reminder') {
        const res = await fetch('/api/admin/broadcast/marketing-trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slot: selectedSlot, targetBotId }),
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

        const validButtons = buttons
          .filter((b) => b.text.trim() && b.url.trim())
          .map((b) => ({ text: b.text.trim(), url: b.url.trim() }));

        const res = await fetch('/api/admin/broadcast/custom-ad', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: adText.trim(),
            photoBase64OrUrl: bannerImage || undefined,
            buttons: validButtons.length > 0 ? validButtons : undefined,
            targetBotId,
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 dark:bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-amber-500 via-orange-500 to-orange-600 rounded-2xl text-white shadow-md shadow-orange-500/20">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Ommaviy Xabarnoma & Reklama Markazi</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Barcha bot foydalanuvchilariga bannerli va formatli xabarlar tarqatish</p>
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

        {/* Global Controls Bar: Target Filter & Tab Selector */}
        {!result && (
          <div className="px-5 pt-3 pb-2 bg-white dark:bg-slate-900 space-y-2.5 border-b border-slate-200 dark:border-slate-800 shrink-0">
            {/* Target Audience / Mahalla Selector */}
            {activeTab !== 'history' && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-orange-500 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">
                      Qaysi auditoriyaga yuborilsin?
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      Barcha mahallalarga yoki faqat tanlangan bot foydalanuvchilariga
                    </span>
                  </div>
                </div>

                <select
                  value={selectedBotTarget}
                  onChange={(e) => setSelectedBotTarget(e.target.value)}
                  className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-semibold text-xs rounded-xl px-3 py-1.5 border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-orange-500 cursor-pointer shadow-sm"
                >
                  <option value="ALL">🌐 Barcha Mahallalar (Hamma Foydalanuvchilar)</option>
                  {bots.map((b) => (
                    <option key={b.id} value={b.id}>
                      📍 {b.mahallaName} ({b.botUsername ? `@${b.botUsername}` : b.name})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 3-Tab Selector */}
            <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab('custom_ad')}
                className={`flex items-center justify-center gap-2 py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'custom_ad'
                    ? 'bg-white dark:bg-slate-800 text-orange-600 dark:text-orange-400 shadow-sm border border-slate-200/60 dark:border-slate-700/60'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="truncate">Reklama & Banner</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('reminder')}
                className={`flex items-center justify-center gap-2 py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'reminder'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200/60 dark:border-slate-700/60'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span className="truncate">Avtomatik Eslatma</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`flex items-center justify-center gap-2 py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'history'
                    ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200/60 dark:border-slate-700/60'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span className="truncate">Yuborilganlar Tarixi</span>
              </button>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="p-5 overflow-y-auto flex-1">
          {!result ? (
            activeTab === 'custom_ad' ? (
              /* TAB 1: CUSTOM AD (Split Layout) */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Left Column: Composer Controls (7 cols) */}
                <div className="lg:col-span-7 space-y-4">
                  {/* 6 Preset Marketing Templates Chips */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-orange-500" />
                      6 ta Viral Marketing Shablonlari (1-Click):
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {TEMPLATES.map((tmpl) => (
                        <button
                          key={tmpl.id}
                          type="button"
                          onClick={() => applyTemplate(tmpl)}
                          className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-orange-500/10 hover:border-orange-500/40 hover:text-orange-600 dark:hover:text-orange-400 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition cursor-pointer flex items-center gap-1 shadow-sm"
                        >
                          <span>{tmpl.icon}</span>
                          <span>{tmpl.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Banner Image Upload */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Image className="w-3.5 h-3.5 text-orange-500" />
                        <span>Reklama Banneri (Rasm)</span>
                      </label>
                      {bannerImage && (
                        <button
                          type="button"
                          onClick={() => setBannerImage('')}
                          className="text-[11px] text-rose-500 hover:text-rose-600 flex items-center gap-1 cursor-pointer font-semibold"
                        >
                          <Trash2 className="w-3 h-3" />
                          Rasmni olib tashlash
                        </button>
                      )}
                    </div>

                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImageUpload}
                      accept="image/*"
                      className="hidden"
                    />

                    {bannerImage ? (
                      <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 max-h-36 bg-slate-100 dark:bg-slate-950 flex items-center justify-center">
                        <img src={bannerImage} alt="Banner" className="max-h-36 w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="absolute bottom-2 right-2 px-2.5 py-1 bg-black/75 hover:bg-black text-white text-[10px] font-bold rounded-lg backdrop-blur-md transition cursor-pointer"
                        >
                          Boshqa rasm
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border border-dashed border-slate-300 dark:border-slate-700 hover:border-orange-500 dark:hover:border-orange-400 rounded-xl p-3 text-center cursor-pointer transition bg-white dark:bg-slate-900/60"
                      >
                        <Upload className="w-5 h-5 mx-auto text-slate-400 dark:text-slate-500 mb-1" />
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Banner rasmini yuklash</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500">JPG, PNG, WEBP (5MB gacha)</p>
                      </div>
                    )}
                  </div>

                  {/* Formatting Toolbar & Text Area */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Reklama Matni (Telegram HTML)
                      </label>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                        Ctrl+Z / Cmd+Z (Qaytish)
                      </span>
                    </div>

                    {/* Toolbar */}
                    <div className="flex items-center justify-between p-1 bg-slate-100 dark:bg-slate-800/90 rounded-t-2xl border border-slate-300 dark:border-slate-700 border-b-0 flex-wrap gap-0.5">
                      <div className="flex items-center gap-0.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => insertTag('<b>', '</b>', 'qalin matn')}
                          className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
                          title="Qalin (Bold) <b>"
                        >
                          <Bold className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => insertTag('<i>', '</i>', 'qiya matn')}
                          className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 text-xs cursor-pointer"
                          title="Qiya (Italic) <i>"
                        >
                          <Italic className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => insertTag('<u>', '</u>', 'tagi chizilgan')}
                          className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 text-xs cursor-pointer"
                          title="Tagiga chizilgan <u>"
                        >
                          <Underline className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => insertTag('<s>', '</s>', 'ochirilgan')}
                          className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 text-xs cursor-pointer"
                          title="O'chirilgan <s>"
                        >
                          <Strikethrough className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => insertTag('<code>', '</code>', 'kod')}
                          className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 text-xs cursor-pointer"
                          title="Monospace Kod <code>"
                        >
                          <Code className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => insertTag('<span class="tg-spoiler">', '</span>', 'yashirin')}
                          className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 text-xs cursor-pointer"
                          title="Spoiler (Yashirin)"
                        >
                          <EyeOff className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => insertTag('<blockquote>', '</blockquote>', 'iqtibos')}
                          className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 text-xs cursor-pointer"
                          title="Iqtibos (Quote)"
                        >
                          <Quote className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => insertTag('<a href="https://t.me/...">', '</a>', 'havola')}
                          className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 text-xs cursor-pointer"
                          title="Matnli Havola <a>"
                        >
                          <Link className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Undo / Redo / Clear Tools */}
                      <div className="flex items-center gap-0.5 border-l border-slate-300 dark:border-slate-700 pl-1">
                        <button
                          type="button"
                          onClick={handleUndo}
                          className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-400 text-xs cursor-pointer"
                          title="Orqaga qaytarish (Ctrl+Z)"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={handleRedo}
                          className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-400 text-xs cursor-pointer"
                          title="Oldinga o'tish (Ctrl+Y)"
                        >
                          <Redo2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => pushToHistory('')}
                          className="p-1.5 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-500 rounded-lg text-xs cursor-pointer"
                          title="Matnni tozalash"
                        >
                          <Eraser className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <textarea
                      ref={textareaRef}
                      rows={5}
                      value={adText}
                      onChange={handleTextChange}
                      onKeyDown={handleKeyDown}
                      placeholder="Reklama matnini kiriting..."
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-b-2xl p-3 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:border-orange-500 transition-colors"
                      required
                    />
                  </div>

                  {/* Multiple Inline Buttons Builder */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Telegram Inline Tugmalar ({buttons.length} ta)</span>
                        </label>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          Bot ichidagi amallar yoki tashqi havola tugmalari
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => addButton()}
                        className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-sm transition active:scale-95 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Yangi Tugma</span>
                      </button>
                    </div>

                    {/* Quick Button Presets */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-200 dark:border-slate-700/60">
                      <span className="text-[10px] font-bold text-slate-400">Tezkor Tugmalar:</span>
                      {PRESET_BUTTON_ACTIONS.map((pa, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => addButton(pa)}
                          className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-white dark:bg-slate-900 hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                        >
                          + {pa.label}
                        </button>
                      ))}
                    </div>

                    {buttons.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-2 italic">
                        Hech qanday tugma qo'shilmagan. Yuqoridagi "Yangi Tugma" yoki tezkor tugmalardan birini bosing.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                        {buttons.map((btn, idx) => {
                          const isAction = isActionUrl(btn.url);
                          return (
                            <div
                              key={btn.id}
                              className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                  <span>#{idx + 1}</span>
                                  {isAction ? (
                                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[9px] font-bold">
                                      ⚡️ Bot Amali ({btn.url})
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 font-mono text-[9px] font-bold">
                                      🌐 Tashqi Havola
                                    </span>
                                  )}
                                </span>

                                <button
                                  type="button"
                                  onClick={() => removeButton(btn.id)}
                                  className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition shrink-0 cursor-pointer"
                                  title="Tugmani o'chirish"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <input
                                  type="text"
                                  value={btn.text}
                                  onChange={(e) => updateButton(btn.id, 'text', e.target.value)}
                                  placeholder="Tugma matni (masalan: 🗳 Ovoz Berish)"
                                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:border-indigo-500"
                                />
                                <input
                                  type="text"
                                  value={btn.url}
                                  onChange={(e) => updateButton(btn.id, 'url', e.target.value)}
                                  placeholder="start_vote yoki https://t.me/..."
                                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Real-Time Telegram Bubble Preview (5 cols) */}
                <div className="lg:col-span-5 flex flex-col">
                  <div className="sticky top-0 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-sky-500" />
                        <span>Telegramdagi Jonli Ko'rinishi (Preview)</span>
                      </span>

                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                        {selectedBotTarget === 'ALL' ? '🌐 Barchaga' : '📍 Aniq Mahallaga'}
                      </span>
                    </div>

                    {/* Telegram Screen Frame */}
                    <div className="p-3.5 rounded-3xl bg-[#73899c]/20 dark:bg-[#0e1621] border border-slate-200 dark:border-slate-800 shadow-inner">
                      {/* Telegram Message Bubble */}
                      <div className="p-3.5 rounded-2xl bg-white dark:bg-[#182533] border border-slate-200/60 dark:border-slate-700/50 shadow-md space-y-3">
                        {bannerImage && (
                          <div className="rounded-xl overflow-hidden max-h-48 border border-black/5 dark:border-white/5">
                            <img src={bannerImage} alt="Banner Preview" className="w-full h-auto object-cover" />
                          </div>
                        )}

                        {/* Formatted Text Content */}
                        <div
                          className="text-xs leading-relaxed text-slate-900 dark:text-slate-100 break-words whitespace-pre-line"
                          dangerouslySetInnerHTML={{ __html: adText.replace(/\n/g, '<br/>') }}
                        />

                        {/* Message Time Stamp */}
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 dark:text-slate-400 font-mono">
                            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ✓✓
                          </span>
                        </div>

                        {/* Render All Dynamic Inline Buttons */}
                        {buttons.filter((b) => b.text.trim()).length > 0 && (
                          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                            {buttons
                              .filter((b) => b.text.trim())
                              .map((btn) => {
                                const isAction = isActionUrl(btn.url);
                                return (
                                  <div
                                    key={btn.id}
                                    className="w-full py-2 px-3 rounded-xl bg-indigo-500/10 dark:bg-indigo-600/25 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-bold text-xs text-center border border-indigo-500/30 flex items-center justify-center gap-1.5 transition block shadow-sm truncate"
                                  >
                                    <span className="truncate">{btn.text}</span>
                                    {isAction ? (
                                      <Zap className="w-3 h-3 text-amber-500 shrink-0" />
                                    ) : (
                                      <ExternalLink className="w-3 h-3 opacity-60 shrink-0" />
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : activeTab === 'reminder' ? (
              /* TAB 2: AUTOMATIC REMINDER */
              <div className="space-y-4 max-w-xl mx-auto py-2">
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-300 text-xs flex items-start gap-3">
                  <Radio className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <p className="leading-relaxed">
                    Avtomatik kunlik eslatma tizimi{' '}
                    <b>{selectedBotTarget === 'ALL' ? 'barcha mahallalar' : 'tanlangan mahalla'}</b> foydalanuvchilariga ovoz yig'ish chaqiruvini yuboradi.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 block">
                    Eslatma vaqti va shabloni
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedSlot('MORNING')}
                      className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
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
                      className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
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

                {/* Dynamic Mahalla & Reward Info Card */}
                {(() => {
                  const targetBot = bots.find((b) => String(b.id) === String(selectedBotTarget));
                  const mahallaName = targetBot ? targetBot.mahallaName : "Foydalanuvchining o'z mahallasi";
                  const rewardStr = targetBot ? (targetBot.voteReward || 30000).toLocaleString('uz-UZ') + " so'm" : "30 000 so'm";

                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Telegramdagi Jonli Ko'rinishi (Dinamik Eslatma):</span>
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                          {targetBot ? `📍 ${mahallaName}` : '🌐 Barcha Mahallalar'}
                        </span>
                      </div>

                      {/* Telegram Message Bubble */}
                      <div className="p-3.5 rounded-3xl bg-[#73899c]/20 dark:bg-[#0e1621] border border-slate-200 dark:border-slate-800 shadow-inner max-w-md mx-auto">
                        <div className="p-4 rounded-2xl bg-white dark:bg-[#182533] border border-slate-200/60 dark:border-slate-700/50 shadow-md space-y-3">
                          {selectedSlot === 'MORNING' ? (
                            <div className="text-xs leading-relaxed text-slate-900 dark:text-slate-100 space-y-2">
                              <p className="font-bold text-amber-600 dark:text-amber-400">🌅 Xayrli tong, aziz yurtdosh!</p>
                              <p>🔥 <b>Open Budgetda ovoz berib, qo'shimcha daromad oling!</b></p>
                              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/60 dark:border-slate-800 text-[11px] space-y-1">
                                <p>📍 Mahalla: <b>{mahallaName}</b></p>
                                <p>💰 Har bir ovoz uchun to'lov: <b className="text-emerald-600 dark:text-emerald-400">{rewardStr}</b> (Darhol kartaga / paynetga)</p>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">👥 Oila a'zolaringiz va yaqinlaringiz raqamlaridan ham ovoz berib pul ishlashingiz mumkin!</p>
                              <p>Hoziroq "🗳 Ovoz berish" tugmasini bosing va o'z mukofotingizni oling 👇</p>
                            </div>
                          ) : (
                            <div className="text-xs leading-relaxed text-slate-900 dark:text-slate-100 space-y-2">
                              <p className="font-bold text-purple-600 dark:text-purple-400">🌆 Xayrli kech! Bugungi imkoniyatni qo'ldan boy bermang!</p>
                              <p>⚡️ <b>{mahallaName}</b> bo'yicha ovoz berish jarayoni davom etmoqda!</p>
                              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/60 dark:border-slate-800 text-[11px] space-y-1">
                                <p>📍 Mahalla: <b>{mahallaName}</b></p>
                                <p>💰 Ovoz mukofoti: <b className="text-emerald-600 dark:text-emerald-400">{rewardStr}</b></p>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">👥 Yaqinlaringiz nomidagi raqamlardan ham ovoz berib, balansingizni to'ldiring!</p>
                              <p>Ovoz berish uchun pastdagi tugmani bosing 👇</p>
                            </div>
                          )}

                          {/* Time Stamp */}
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 font-mono">
                              {selectedSlot === 'MORNING' ? '09:00' : '17:00'} ✓✓
                            </span>
                          </div>

                          {/* Action Buttons in Telegram */}
                          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                            <div className="w-full py-2 px-3 rounded-xl bg-indigo-500/10 dark:bg-indigo-600/25 text-indigo-700 dark:text-indigo-300 font-bold text-xs text-center border border-indigo-500/30 flex items-center justify-center gap-1.5 shadow-sm">
                              <span>🗳 {selectedSlot === 'MORNING' ? `Ovoz berish (+${rewardStr})` : `Hoziroq ovoz berish (+${rewardStr})`}</span>
                              <Zap className="w-3 h-3 text-amber-500 shrink-0" />
                            </div>
                            <div className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs text-center border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 shadow-sm">
                              <span>{selectedSlot === 'MORNING' ? '💰 Balansimni tekshirish' : '💳 Pulni yechib olish'}</span>
                              <Zap className="w-3 h-3 text-indigo-500 shrink-0" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              /* TAB 3: BROADCAST HISTORY */
              <div className="space-y-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <History className="w-4 h-4 text-emerald-500" />
                    <span>Yuborilgan Xabarnomalar va Reklamalar Tarixi (Oxirgi 50 ta)</span>
                  </span>
                  <button
                    type="button"
                    onClick={fetchHistory}
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer font-bold"
                  >
                    <RotateCcw className={`w-3 h-3 ${loadingHistory ? 'animate-spin' : ''}`} />
                    <span>Yangilash</span>
                  </button>
                </div>

                {loadingHistory ? (
                  <div className="p-8 text-center text-xs text-slate-400">Tarix yuklanmoqda...</div>
                ) : historyList.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                    Hozircha yuborilgan xabarlar tarixi mavjud emas.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-1">
                    {historyList.map((item) => {
                      const isReminder = item.type === 'REMINDER';
                      const formattedDate = new Date(item.createdAt).toLocaleString('uz-UZ', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      });

                      return (
                        <div
                          key={item.id}
                          className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition space-y-2"
                        >
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                  isReminder
                                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
                                    : 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20'
                                }`}
                              >
                                {isReminder ? `📢 Eslatma (${item.slot || 'Kunlik'})` : '🎨 Reklama & Banner'}
                              </span>

                              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                                <Target className="w-3 h-3 text-slate-400" />
                                <span>{item.targetMahallaName || 'Barcha Mahallalar'}</span>
                              </span>
                            </div>

                            <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono">
                              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                                <Check className="w-3 h-3" />
                                {item.sentCount} ta yetkazildi
                              </span>
                              {item.failedCount > 0 && (
                                <span className="text-rose-500 font-bold">
                                  {item.failedCount} ta blok
                                </span>
                              )}
                              <span>{formattedDate}</span>
                            </div>
                          </div>

                          <div className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 font-mono bg-white dark:bg-slate-900/60 p-2 rounded-xl border border-slate-200/60 dark:border-slate-800">
                            {item.text.replace(/<[^>]*>?/gm, '')}
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[10px] text-slate-400">
                              Sarflangan vaqt: {item.durationMs} ms
                            </span>

                            <button
                              type="button"
                              onClick={() => handleReuseHistory(item)}
                              className="px-3 py-1 bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 transition cursor-pointer flex items-center gap-1 shadow-sm"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Qaytadan Yuklash</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )
          ) : (
            /* Results Card */
            <div className="space-y-4 animate-in fade-in zoom-in-95 py-6 max-w-lg mx-auto">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 flex items-center gap-3">
                <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <h4 className="font-bold text-sm">Xabarnoma Muvaffaqiyatli Yetkazildi!</h4>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    {selectedBotTarget === 'ALL' ? 'Barcha botlar' : 'Tanlangan mahalla boti'} orqali xabarlar jo\'natildi.
                  </p>
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
        <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {!result && activeTab === 'custom_ad' && (
              <span>✨ {buttons.filter((b) => b.text.trim()).length} ta tugma biriktirildi</span>
            )}
            {!result && activeTab === 'history' && (
              <span>📜 Tarix saqlanmoqda (Audit uchun)</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
            >
              {result ? 'Yopish' : 'Bekor qilish'}
            </button>

            {!result && activeTab !== 'history' ? (
              <button
                type="button"
                onClick={handleSendBroadcast}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 via-orange-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-orange-500/25 transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <Send className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>{loading ? 'Xabarlar yuborilmoqda...' : 'Hozir Yuborish'}</span>
              </button>
            ) : result ? (
              <button
                type="button"
                onClick={() => setResult(null)}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition cursor-pointer"
              >
                Yangi Xabar Yuborish
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
