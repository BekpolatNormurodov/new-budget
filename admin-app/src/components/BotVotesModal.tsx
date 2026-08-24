import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  RefreshCw,
  Search,
  CheckCircle2,
  Hourglass,
  ChevronLeft,
  ChevronRight,
  Clock,
  Target,
  Bot,
  Globe,
  KeyRound,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { BotInstanceItem } from '../types';
import { formatSum, formatTashkentDateTime } from '../utils/format';

interface BotVotesModalProps {
  bot: BotInstanceItem | null;
  isOpen: boolean;
  onClose: () => void;
  onBotUpdated?: () => void;
}

export const BotVotesModal: React.FC<BotVotesModalProps> = ({
  bot,
  isOpen,
  onClose,
  onBotUpdated,
}) => {
  // Active Tab: 'OPENBUDGET' (Rasmiy Sayt Reyestri) vs 'OUR_SYSTEM' (Biz orqali berilganlar)
  const [activeTab, setActiveTab] = useState<'OPENBUDGET' | 'OUR_SYSTEM'>('OPENBUDGET');

  // OpenBudget Official Votes Feed
  const [obVotes, setObVotes] = useState<any[]>([]);
  const [obTotalElements, setObTotalElements] = useState(0);
  const [obPage, setObPage] = useState(0); // 0-indexed for OpenBudget
  const [obTotalPages, setObTotalPages] = useState(1);
  const [isObLoading, setIsObLoading] = useState(false);

  // Captcha state for OpenBudget Official list
  const [needCaptcha, setNeedCaptcha] = useState(false);
  const [captchaKey, setCaptchaKey] = useState('');
  const [captchaImage, setCaptchaImage] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [isSubmittingCaptcha, setIsSubmittingCaptcha] = useState(false);
  const [captchaError, setCaptchaError] = useState('');

  // Our System Votes Feed
  const [ourVotes, setOurVotes] = useState<any[]>([]);
  const [ourTotal, setOurTotal] = useState(0);
  const [ourPage, setOurPage] = useState(1); // 1-indexed
  const [ourTotalPages, setOurTotalPages] = useState(1);
  const [isOurLoading, setIsOurLoading] = useState(false);
  const [ourFilter, setOurFilter] = useState<'ALL' | 'VERIFIED' | 'PENDING'>('ALL');
  const [allOurVotes, setAllOurVotes] = useState<any[]>([]);

  // Common Search & Sync
  const [search, setSearch] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');

  // OpenBudget ro'yxati ko'p sahifali (~210 ta) bo'lgani uchun, joriy sahifada
  // topilmasa, 5+ raqam kiritilganda BUTUN ro'yxat bo'yicha serverdan qidiriladi.
  const [obSearchResults, setObSearchResults] = useState<any[] | null>(null);
  const [isObSearching, setIsObSearching] = useState(false);
  const [obSearchNotFound, setObSearchNotFound] = useState(false);
  const [obSearchCoverage, setObSearchCoverage] = useState<{ scannedPages: number; totalPages: number } | null>(null);

  // Fon rejimidagi tez-kesh (prewarm) qamrovi — bu FAQAT sahifalash (list) uchun
  // tezlashtirish maqsadida, qidiruv (search) esa har doim butun ro'yxatni
  // ko'radi (quyida alohida ko'rsatiladi). Bu holat aniq ko'rsatilmasa, admin
  // "3 soatdan eski ovoz yo'q" deb noto'g'ri xulosaga kelishi mumkin edi.
  // Fon rejimidagi tez-kesh (prewarm) qamrovi
  const [prewarmStatus, setPrewarmStatus] = useState<{
    cachedPages: number;
    totalPages: number;
    coverageMinutes: number;
    reachedFullCutoff: boolean;
    finishedAt: number;
  } | null>(null);

  // OUR_SYSTEM search & filter effect
  useEffect(() => {
    if (activeTab !== 'OUR_SYSTEM' || !bot) return;
    const timer = setTimeout(() => {
      fetchOurVotes(1, search, ourFilter);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, ourFilter, activeTab, bot?.id]);

  // OPENBUDGET search effect (searches in-memory RAM cache instantly, then server)
  useEffect(() => {
    if (activeTab !== 'OPENBUDGET' || !bot) {
      setObSearchResults(null);
      setObSearchNotFound(false);
      setObSearchCoverage(null);
      return;
    }
    const cleanSearch = search.trim();
    if (cleanSearch.length < 2) {
      setObSearchResults(null);
      setObSearchNotFound(false);
      setObSearchCoverage(null);
      setIsObSearching(false);
      return;
    }

    setIsObSearching(true);
    setObSearchNotFound(false);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/bots/${bot.id}/official-votes-search?tail=${encodeURIComponent(cleanSearch)}`);
        const data = await res.json();
        if (data.success) {
          setObSearchResults(data.matches || []);
          setObSearchNotFound((data.matches || []).length === 0);
          setObSearchCoverage({ scannedPages: data.scannedPages || 0, totalPages: data.totalPages || 0 });
        } else {
          setObSearchResults([]);
          setObSearchNotFound(true);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsObSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [search, activeTab, bot?.id]);

  const [liveStats, setLiveStats] = useState<{
    openBudgetVotes: number;
    currentVotes: number;
    pendingVotes: number;
  }>({
    openBudgetVotes: 0,
    currentVotes: 0,
    pendingVotes: 0,
  });

  const fetchAllOurVotes = async () => {
    if (!bot) return;
    try {
      const res = await fetch(`/api/admin/bots/${bot.id}/votes-feed?page=1&size=2000`);
      const data = await res.json();
      if (data.success && Array.isArray(data.content)) {
        setAllOurVotes(data.content);
      }
    } catch (e) {
      console.error('Failed to load all our votes for cross-ref:', e);
    }
  };

  const ourVotesByTail = useMemo(() => {
    const map = new Map<string, any>();
    for (const v of allOurVotes) {
      const clean = (v.phone || v.phoneNumber || v.rawPhone || '').replace(/\D/g, '');
      if (clean.length >= 6) {
        map.set(clean.slice(-6), v);
      }
      if (clean.length >= 5 && !map.has(clean.slice(-5))) {
        map.set(clean.slice(-5), v);
      }
    }
    return map;
  }, [allOurVotes]);

  useEffect(() => {
    if (isOpen && bot) {
      setLiveStats({
        openBudgetVotes: bot.openBudgetVotes || bot.currentVotes || 0,
        currentVotes: bot.currentVotes || 0,
        pendingVotes: bot.pendingVotes || 0,
      });
      setLastSyncTime(new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      fetchOfficialVotes(0);
      fetchOurVotes(1, search, ourFilter);
      fetchAllOurVotes();
    }
  }, [isOpen, bot?.id]);

  // Fetch from OpenBudget official API
  const fetchOfficialVotes = async (targetPage: number = 0, forceRefresh: boolean = false) => {
    if (!bot) return;
    setIsObLoading(true);
    try {
      const res = await fetch(`/api/admin/bots/${bot.id}/official-votes-list?page=${targetPage}${forceRefresh ? '&refresh=true' : ''}`);
      const data = await res.json();
      setPrewarmStatus(data.prewarmStatus || null);
      if (data.success && data.content?.length > 0) {
        setObVotes(data.content || []);
        setObTotalElements(data.totalElements || 0);
        setObTotalPages(data.totalPages || 1);
        setObPage(data.page || 0);
        setNeedCaptcha(false);
        setLiveStats((prev) => ({
          ...prev,
          openBudgetVotes: data.totalElements || prev.openBudgetVotes,
        }));
      } else if (data.needCaptcha) {
        setNeedCaptcha(true);
        setCaptchaKey(data.captchaKey || '');
        setCaptchaImage(data.image || '');
      } else if (data.content) {
        setObVotes(data.content);
        setObTotalElements(data.totalElements || 0);
        setObTotalPages(data.totalPages || 1);
        setObPage(data.page || 0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsObLoading(false);
    }
  };

  const reloadCaptcha = async () => {
    if (!bot) return;
    setIsObLoading(true);
    setCaptchaError('');
    try {
      const res = await fetch(`/api/admin/bots/${bot.id}/official-captcha`);
      const data = await res.json();
      if (data.success) {
        setCaptchaKey(data.captchaKey || '');
        setCaptchaImage(data.image || '');
        setCaptchaAnswer('');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsObLoading(false);
    }
  };

  const handleCaptchaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bot || !captchaAnswer.trim()) return;

    setIsSubmittingCaptcha(true);
    setCaptchaError('');
    try {
      const res = await fetch(`/api/admin/bots/${bot.id}/official-captcha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          captchaKey,
          captchaResult: parseInt(captchaAnswer.replace(/\D/g, ''), 10) || 0,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNeedCaptcha(false);
        setObVotes(data.content || []);
        setObTotalElements(data.totalElements || 0);
        setObTotalPages(data.totalPages || 1);
        setObPage(0);
        setLiveStats((prev) => ({
          ...prev,
          openBudgetVotes: data.totalElements || prev.openBudgetVotes,
        }));
      } else {
        setCaptchaError(data.error || 'Captcha noto\'g\'ri kiritildi. Qayta urinib ko\'ring.');
        reloadCaptcha();
      }
    } catch (err: any) {
      setCaptchaError('Ulanishda xatolik yuz berdi.');
      reloadCaptcha();
    } finally {
      setIsSubmittingCaptcha(false);
    }
  };

  // Fetch from our local DB with server-side query filtering
  const fetchOurVotes = async (
    targetPage: number = 1,
    currentSearch: string = search,
    currentFilter: string = ourFilter,
  ) => {
    if (!bot) return;
    setIsOurLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        size: '15',
      });
      if (currentSearch.trim()) params.append('search', currentSearch.trim());
      if (currentFilter !== 'ALL') params.append('status', currentFilter);

      const res = await fetch(`/api/admin/bots/${bot.id}/votes-feed?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setOurVotes(data.content || []);
        setOurTotal(data.total || 0);
        setOurPage(data.page || 1);
        setOurTotalPages(data.totalPages || 1);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsOurLoading(false);
    }
  };

  const handleLiveSync = async () => {
    if (!bot) return;
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/admin/bots/${bot.id}/sync`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setLiveStats({
          openBudgetVotes: data.openBudgetVotes || 0,
          currentVotes: data.currentVotes || 0,
          pendingVotes: data.pendingVotes || 0,
        });
        setLastSyncTime(new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        fetchOfficialVotes(obPage, true);
        fetchOurVotes(ourPage, search, ourFilter);
        if (onBotUpdated) onBotUpdated();
      }
    } catch (e) {
      console.error('Sync error:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isOpen || !bot) return null;

  const TAIL_MATCH_LEN = 5;
  const formatCoverage = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h <= 0) return `${m} daqiqa`;
    return m > 0 ? `${h}s ${m}d` : `${h} soat`;
  };
  const filteredObVotes = obSearchResults !== null
    ? obSearchResults
    : obVotes.filter((v) => {
        if (!search.trim()) return true;
        const queryClean = search.trim().toLowerCase();
        const queryDigits = queryClean.replace(/\D/g, '');
        const phoneDigits = (v.phoneNumber || '').replace(/\D/g, '');
        if (queryDigits && phoneDigits.includes(queryDigits)) return true;
        if ((v.phoneNumber || '').toLowerCase().includes(queryClean)) return true;
        if ((v.voteDate || '').toLowerCase().includes(queryClean)) return true;
        return false;
      });

  const filteredOurVotes = ourVotes;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] transition-colors">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/90 dark:bg-slate-950/70">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 flex items-center justify-center text-white font-black text-base sm:text-lg shadow-md shadow-indigo-500/20 shrink-0">
              {bot.mahallaName.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                  {bot.mahallaName} — Ovozlar Ro'yxati
                </h3>
                <span className="shrink-0 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  #{bot.mahallaId?.slice(-6) || bot.id}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {bot.botUsername ? `@${bot.botUsername}` : bot.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleLiveSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition-all active:scale-95 cursor-pointer shadow-sm disabled:opacity-50"
              title="OpenBudget rasmiy serveri bilan sinxronlash"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Yangilanmoqda...' : 'Yangilash'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="px-3 sm:px-5 py-3 sm:py-3.5 bg-slate-100/70 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 text-xs">
          <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-0.5">
              <Globe className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[10px] font-semibold uppercase">OpenBudget:</span>
            </div>
            <p className="text-base font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
              {formatSum(liveStats.openBudgetVotes)} <span className="text-xs font-normal">ta</span>
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-0.5">
              <Bot className="w-3.5 h-3.5 text-indigo-500" />
              <span className="text-[10px] font-semibold uppercase">Biz orqali:</span>
            </div>
            <p className="text-base font-extrabold font-mono text-indigo-600 dark:text-indigo-400">
              {formatSum(liveStats.currentVotes)} <span className="text-xs font-normal">ta</span>
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-0.5">
              <Hourglass className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[10px] font-semibold uppercase">Kutilmoqda:</span>
            </div>
            <p className="text-base font-extrabold font-mono text-amber-600 dark:text-amber-400">
              {formatSum(liveStats.pendingVotes)} <span className="text-xs font-normal">ta</span>
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-0.5">
              <Target className="w-3.5 h-3.5 text-purple-500" />
              <span className="text-[10px] font-semibold uppercase">Reja:</span>
            </div>
            <p className="text-base font-extrabold font-mono text-purple-600 dark:text-purple-400">
              {formatSum(bot.targetVotes || 5000)} <span className="text-xs font-normal">ta</span>
            </p>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="px-3 sm:px-5 pt-2 sm:pt-3 flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-950/40 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('OPENBUDGET')}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'OPENBUDGET'
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Globe className="w-4 h-4" />
              <span>OpenBudget Rasmiy Ro'yxati ({obTotalElements || liveStats.openBudgetVotes})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('OUR_SYSTEM')}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'OUR_SYSTEM'
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Bot className="w-4 h-4" />
              <span>Bizning Bot Tizimi ({ourTotal})</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {/* Search Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Raqam yoki vaqt bo'yicha qidirish..."
                className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              {activeTab === 'OPENBUDGET' && isObSearching && (
                <span className="absolute right-3 top-2 text-[10px] text-indigo-500 font-bold animate-pulse">
                  Butun ro'yxatdan qidirilmoqda...
                </span>
              )}
              {activeTab === 'OPENBUDGET' && !isObSearching && obSearchNotFound && (
                <span className="absolute right-3 top-2 text-[10px] text-rose-500 font-bold">
                  {obSearchCoverage && obSearchCoverage.scannedPages < obSearchCoverage.totalPages
                    ? `Topilmadi (so'nggi ${obSearchCoverage.scannedPages * 15} tadan)`
                    : 'Topilmadi'}
                </span>
              )}
            </div>

            {activeTab === 'OUR_SYSTEM' && (
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shrink-0 text-xs">
                <button
                  type="button"
                  onClick={() => setOurFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                    ourFilter === 'ALL'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Barchasi
                </button>
                <button
                  type="button"
                  onClick={() => setOurFilter('VERIFIED')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                    ourFilter === 'VERIFIED'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Tasdiqlangan
                </button>
                <button
                  type="button"
                  onClick={() => setOurFilter('PENDING')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                    ourFilter === 'PENDING'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Kutilmoqda
                </button>
              </div>
            )}
          </div>

          {activeTab === 'OPENBUDGET' && !needCaptcha && (
            <div className="flex items-center justify-between px-3.5 py-2 rounded-xl text-[11px] font-semibold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-500" />
                <span>OpenBudget rasmiy reyestri har 1 soatda avtomatik yangilanadi</span>
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">🟢 24/7 Faol</span>
            </div>
          )}

          {/* TABLE: OPENBUDGET OFFICIAL LIST */}
          {activeTab === 'OPENBUDGET' ? (
            needCaptcha ? (
              <div className="p-6 rounded-2xl border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    OpenBudget Rasmiy Ovozlar Ro'yxatini Ochish
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                    OpenBudget serveridan 2 502 ta ovozlar ro'yxatini yuklash uchun quyidagi rasmdagi misol javobini kiriting:
                  </p>
                </div>

                <form onSubmit={handleCaptchaSubmit} className="max-w-xs mx-auto space-y-3">
                  <div className="flex items-center justify-center gap-2 p-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-inner">
                    {captchaImage ? (
                      <img
                        src={`data:image/jpeg;base64,${captchaImage}`}
                        alt="Captcha"
                        className="h-12 object-contain rounded-lg"
                      />
                    ) : (
                      <div className="h-12 w-36 flex items-center justify-center text-xs text-slate-400">Yuklanmoqda...</div>
                    )}
                    <button
                      type="button"
                      onClick={reloadCaptcha}
                      disabled={isObLoading}
                      className="p-2 rounded-xl text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Yangi rasm olish"
                    >
                      <RefreshCw className={`w-4 h-4 ${isObLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={captchaAnswer}
                      onChange={(e) => setCaptchaAnswer(e.target.value)}
                      placeholder="Misol javobi (masalan: 12)"
                      className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white text-center focus:outline-none focus:border-emerald-500"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={isSubmittingCaptcha || !captchaAnswer.trim()}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                    >
                      {isSubmittingCaptcha ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                      <span>Ochish</span>
                    </button>
                  </div>

                  {captchaError && (
                    <p className="text-xs text-rose-500 font-medium">{captchaError}</p>
                  )}
                </form>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-950 shadow-sm">
                {/* Mobile Cards View (< sm) */}
                <div className="block sm:hidden divide-y divide-slate-100 dark:divide-slate-800/60">
                  {(isObLoading || (activeTab === 'OPENBUDGET' && isObSearching)) && obVotes.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
                      {activeTab === 'OPENBUDGET' && isObSearching
                        ? "Butun rasmiy ro'yxat bo'ylab qidirilmoqda..."
                        : "OpenBudget rasmiy saytidan ovozlar yuklanmoqda..."}
                    </div>
                  ) : filteredObVotes.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 p-4">
                      {search.trim() ? (
                        <div className="space-y-2">
                          <Search className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                          <p className="font-semibold text-slate-700 dark:text-slate-300">
                            "{search}" bo'yicha hech qanday ovoz topilmadi
                          </p>
                          <button
                            type="button"
                            onClick={() => setSearch('')}
                            className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer"
                          >
                            Qidiruvni tozalash
                          </button>
                        </div>
                      ) : (
                        <div>
                          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-700" />
                          <p className="font-semibold text-slate-700 dark:text-slate-300">Rasmiy reyestr ro'yxati hozircha bo'sh</p>
                          <button
                            type="button"
                            onClick={reloadCaptcha}
                            className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer"
                          >
                            🔑 Qayta yuklash (Captcha bilan)
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    filteredObVotes.map((v, idx) => {
                      const itemDigits = (v.phoneNumber || '').replace(/\D/g, '');
                      const matchedOurVote = itemDigits.length >= 5
                        ? (ourVotesByTail.get(itemDigits.slice(-6)) || ourVotesByTail.get(itemDigits.slice(-5)))
                        : null;
                      const isOurVerified = matchedOurVote && matchedOurVote.status === 'VERIFIED';
                      const isOurPending = matchedOurVote && matchedOurVote.status === 'PENDING_VERIFICATION';

                      return (
                        <div
                          key={idx}
                          className={`p-3 flex items-center justify-between gap-2 transition-colors ${
                            isOurVerified
                              ? 'bg-emerald-500/10 dark:bg-emerald-500/15 border-l-4 border-l-emerald-500'
                              : isOurPending
                              ? 'bg-amber-500/10 dark:bg-amber-500/15 border-l-4 border-l-amber-500'
                              : ''
                          }`}
                        >
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-slate-400">#{obPage * 15 + idx + 1}</span>
                              <span
                                className={`px-2 py-0.5 rounded-lg font-mono font-bold text-xs ${
                                  isOurVerified
                                    ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border border-emerald-500/40'
                                    : isOurPending
                                    ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-500/40'
                                    : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                                }`}
                              >
                                {v.phoneNumber}
                              </span>
                            </div>
                            {isOurVerified ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                Bizning Bot (Tasdiqlangan)
                              </span>
                            ) : isOurPending ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                                <Hourglass className="w-3 h-3 text-amber-500" />
                                Bizning Bot (Kutilmoqda)
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">🌐 Tashqi ovoz</span>
                            )}
                          </div>
                          <span className="text-right text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                            {v.voteDate}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Desktop Table View (>= sm) */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-3 px-4 font-semibold w-12">#</th>
                        <th className="py-3 px-4 font-semibold">Telefon Raqami</th>
                        <th className="py-3 px-4 font-semibold">Bizning Tizim Holati</th>
                        <th className="py-3 px-4 font-semibold text-right">Ovoz Berilgan Vaqti</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {(isObLoading || (activeTab === 'OPENBUDGET' && isObSearching)) && obVotes.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-12 text-center text-slate-400">
                            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
                            {activeTab === 'OPENBUDGET' && isObSearching
                              ? "Butun rasmiy ro'yxat bo'ylab qidirilmoqda..."
                              : "OpenBudget rasmiy saytidan ovozlar yuklanmoqda..."}
                          </td>
                        </tr>
                      ) : filteredObVotes.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-12 text-center text-slate-400">
                            {search.trim() ? (
                              <div className="space-y-2">
                                <Search className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                                <p className="font-semibold text-slate-700 dark:text-slate-300">
                                  "{search}" bo'yicha hech qanday ovoz topilmadi
                                </p>
                                <button
                                  type="button"
                                  onClick={() => setSearch('')}
                                  className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer"
                                >
                                  Qidiruvni tozalash
                                </button>
                              </div>
                            ) : (
                              <div>
                                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-700" />
                                <p className="font-semibold text-slate-700 dark:text-slate-300">Rasmiy reyestr ro'yxati hozircha bo'sh</p>
                                <button
                                  type="button"
                                  onClick={reloadCaptcha}
                                  className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer"
                                >
                                  🔑 Qayta yuklash (Captcha bilan)
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ) : (
                        filteredObVotes.map((v, idx) => {
                          const itemDigits = (v.phoneNumber || '').replace(/\D/g, '');
                          const matchedOurVote = itemDigits.length >= 5
                            ? (ourVotesByTail.get(itemDigits.slice(-6)) || ourVotesByTail.get(itemDigits.slice(-5)))
                            : null;
                          const isOurVerified = matchedOurVote && matchedOurVote.status === 'VERIFIED';
                          const isOurPending = matchedOurVote && matchedOurVote.status === 'PENDING_VERIFICATION';

                          return (
                            <tr
                              key={idx}
                              className={`transition-colors ${
                                isOurVerified
                                  ? 'bg-emerald-500/10 dark:bg-emerald-500/15 hover:bg-emerald-500/20'
                                  : isOurPending
                                  ? 'bg-amber-500/10 dark:bg-amber-500/15 hover:bg-amber-500/20'
                                  : 'hover:bg-slate-50/80 dark:hover:bg-slate-900/50'
                              }`}
                            >
                              <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                                {obPage * 15 + idx + 1}
                              </td>
                              <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                                <span
                                  className={`px-2.5 py-1 rounded-lg border font-mono ${
                                    isOurVerified
                                      ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border-emerald-500/40'
                                      : isOurPending
                                      ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-500/40'
                                      : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                                  }`}
                                >
                                  {v.phoneNumber}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                {isOurVerified ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500 text-white shadow-sm shadow-emerald-500/20 animate-in fade-in">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Bizning Bot (Tasdiqlangan)</span>
                                    {matchedOurVote?.user?.firstName && (
                                      <span className="opacity-80 font-normal">({matchedOurVote.user.firstName})</span>
                                    )}
                                  </span>
                                ) : isOurPending ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500 text-white shadow-sm shadow-amber-500/20">
                                    <Hourglass className="w-3.5 h-3.5" />
                                    <span>Bizning Bot (Kutilmoqda)</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80">
                                    <span>🌐 Tashqi ovoz</span>
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-300 font-mono text-xs">
                                {v.voteDate}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ) : (
            /* TABLE: OUR SYSTEM VOTES */
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-950 shadow-sm">
              {/* Mobile Cards View (< sm) */}
              <div className="block sm:hidden divide-y divide-slate-100 dark:divide-slate-800/60">
                {isOurLoading ? (
                  <div className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                    Bizning tizim ovozlari yuklanmoqda...
                  </div>
                ) : filteredOurVotes.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 p-4">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-700" />
                    Hozircha ovozlar topilmadi
                  </div>
                ) : (
                  filteredOurVotes.map((v, idx) => (
                    <div key={v.id} className="p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-slate-400">#{(ourPage - 1) * 15 + idx + 1}</span>
                          <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold text-xs">
                            {v.phoneNumber}
                          </span>
                        </div>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-xs">
                          +{formatSum(v.rewardAmount || 30000)} so'm
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>{formatTashkentDateTime((v as any).createdAt || v.voteDate)}</span>
                        {v.status === 'VERIFIED' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" />
                            Tasdiqlangan
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                            <Hourglass className="w-3 h-3" />
                            Tekshiruvda
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Desktop Table View (>= sm) */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-3 px-4 font-semibold w-12">#</th>
                      <th className="py-3 px-4 font-semibold">Telefon Raqami</th>
                      <th className="py-3 px-4 font-semibold">Ovoz Sanasi & Vaqti</th>
                      <th className="py-3 px-4 font-semibold">Holati</th>
                      <th className="py-3 px-4 font-semibold text-right">Mukofot</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {isOurLoading ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                          Bizning tizim ovozlari yuklanmoqda...
                        </td>
                      </tr>
                    ) : filteredOurVotes.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400">
                          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-700" />
                          Hozircha ovozlar topilmadi
                        </td>
                      </tr>
                    ) : (
                      filteredOurVotes.map((v, idx) => (
                        <tr key={v.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/50 transition-colors">
                          <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                            {(ourPage - 1) * 15 + idx + 1}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white">
                              {v.phoneNumber}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                            {formatTashkentDateTime((v as any).createdAt || v.voteDate)}
                          </td>
                          <td className="py-3 px-4">
                            {v.status === 'VERIFIED' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" />
                                Tasdiqlangan
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                <Hourglass className="w-3 h-3" />
                                Tekshiruvda
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            +{formatSum(v.rewardAmount || 30000)} so'm
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50/70 dark:bg-slate-950/70 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <Clock className="w-3.5 h-3.5 text-indigo-500" />
            <span>Oxirgi yangilanish: <b className="font-mono text-slate-800 dark:text-slate-200">{lastSyncTime || 'Hozir'}</b></span>
          </div>

          {activeTab === 'OPENBUDGET' && !needCaptcha ? (
            <div className="flex items-center gap-3">
              <span className="text-slate-500 dark:text-slate-400">
                Jami rasmiy: <b className="font-mono text-slate-800 dark:text-slate-200">{obTotalElements}</b> ta
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fetchOfficialVotes(Math.max(0, obPage - 1))}
                  disabled={obPage <= 0 || isObLoading}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                  title="Oldingi sahifa"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-mono font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                  {obPage + 1} / {obTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() => fetchOfficialVotes(Math.min(obTotalPages - 1, obPage + 1))}
                  disabled={obPage >= obTotalPages - 1 || isObLoading}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                  title="Keyingi sahifa"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : activeTab === 'OUR_SYSTEM' ? (
            <div className="flex items-center gap-3">
              <span className="text-slate-500 dark:text-slate-400">
                Jami bot orqali: <b className="font-mono text-slate-800 dark:text-slate-200">{ourTotal}</b> ta
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fetchOurVotes(Math.max(1, ourPage - 1))}
                  disabled={ourPage <= 1 || isOurLoading}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                  title="Oldingi sahifa"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-mono font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                  {ourPage} / {ourTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() => fetchOurVotes(Math.min(ourTotalPages, ourPage + 1))}
                  disabled={ourPage >= ourTotalPages || isOurLoading}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                  title="Keyingi sahifa"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
