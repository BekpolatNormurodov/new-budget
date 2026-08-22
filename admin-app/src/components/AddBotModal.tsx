import React, { useState } from 'react';
import {
  X,
  PlusCircle,
  Target,
  DollarSign,
  Gift,
  MapPin,
  Key,
  FileText,
  Search,
  Sparkles,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

interface AddBotModalProps {
  isOpen: boolean;
  onClose: () => void;
  newBot: any;
  setNewBot: (bot: any) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const AddBotModal: React.FC<AddBotModalProps> = ({
  isOpen,
  onClose,
  newBot,
  setNewBot,
  onSubmit,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [totalResults, setTotalResults] = useState<number>(0);
  const [searchPage, setSearchPage] = useState<number>(1);
  const [searchError, setSearchError] = useState<string>('');
  const [selectedInitiative, setSelectedInitiative] = useState<any>(null);

  if (!isOpen) return null;

  // Real OpenBudget Live Search (Google-like Search + Pagination + Client Direct Fallback)
  const handleSearch = async (pageToFetch: number = 1) => {
    const q = searchQuery.trim();
    if (!q) {
      alert('Iltimos, Mahalla nomi, tuman, viloyat, 12 xonali ID yoki havola kiriting!');
      return;
    }

    setIsSearching(true);
    setSearchError('');
    setSearchPage(pageToFetch);

    // 1. Agar to'g'ridan-to'g'ri 12 xonali ID bo'lsa -> Brauzerdan to'g'ridan-to'g'ri OpenBudget API ga so'rov yuborish (0.05s tezlik)
    if (/^\d{12}$/.test(q)) {
      try {
        const directPublicRes = await fetch(`https://new.openbudget.uz/api/v1/initiatives/public/${q}`);
        if (directPublicRes.ok) {
          const pubData = await directPublicRes.json();
          if (pubData && pubData.id) {
            const detailRes = await fetch(`https://new.openbudget.uz/api/v1/initiatives/${pubData.id}`);
            if (detailRes.ok) {
              const d = await detailRes.json();
              const formattedItem = {
                id: d.id,
                publicId: d.public_id || q,
                mahallaName: d.quarter_title ? `${d.quarter_title} MFY` : (d.title || 'Mahalla'),
                quarterTitle: d.quarter_title,
                region: d.region_title,
                district: d.district_title,
                boardId: String(d.board_id || '55'),
                currentVotes: d.vote_count || 0,
                targetVotes: 5000,
                openBudgetUrl: `https://new.openbudget.uz/uz/initiative-budget/active-initiatives/${d.board_id || 55}/${d.id}`,
                description: d.description || '',
                grantedAmount: d.granted_amount || 0,
                stage: d.stage || 'PASSED',
              };

              setSearchResults([formattedItem]);
              setTotalResults(1);
              setIsSearching(false);
              return;
            }
          }
        }
      } catch (clientErr) {
        console.warn('Direct client fetch fallback to backend search:', clientErr);
      }
    }

    // 2. Backend Search / Lookup orqali qidirish
    try {
      const adminToken = localStorage.getItem('token') || localStorage.getItem('adminToken') || '';
      const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (adminToken) authHeaders['Authorization'] = `Bearer ${adminToken}`;

      // Avval 1-click lookup qilib ko'ramiz
      const lookupRes = await fetch('/api/admin/bots/lookup-mahalla', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ query: q }),
      });
      const lookupData = await lookupRes.json();

      if (lookupData && lookupData.success && lookupData.mahallaName) {
        const formattedItem = {
          id: lookupData.initiativeUuid || lookupData.id,
          publicId: lookupData.mahallaId || q,
          mahallaName: lookupData.mahallaName,
          quarterTitle: lookupData.quarterTitle,
          region: lookupData.regionTitle,
          district: lookupData.districtTitle,
          boardId: lookupData.boardId || '55',
          currentVotes: lookupData.currentVotes || 0,
          targetVotes: lookupData.targetVotes || 5000,
          openBudgetUrl: lookupData.openBudgetUrl,
          description: lookupData.description || '',
          grantedAmount: lookupData.grantedAmount || 0,
          stage: lookupData.stage || 'PASSED',
        };
        setSearchResults([formattedItem]);
        setTotalResults(1);
        setIsSearching(false);
        return;
      }

      // Agar lookup topmasa, search-initiatives endpointiga murojaat
      const res = await fetch(`/api/admin/bots/search-initiatives?query=${encodeURIComponent(q)}&page=${pageToFetch}`, {
        headers: authHeaders,
      });
      const data = await res.json();

      if (data.success && data.results && data.results.length > 0) {
        setSearchResults(data.results);
        setTotalResults(data.total || data.results.length);
      } else {
        setSearchError(lookupData.error || data.error || `"${q}" bo'yicha OpenBudgetda faol mahalla yoki tashabbus topilmadi. Iltimos 12 xonali Mahalla ID yoki to'liq havolani kiriting.`);
        setSearchResults([]);
      }
    } catch (e: any) {
      setSearchError(e.message || 'Serverga ulanishda xatolik');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectInitiative = (item: any) => {
    setSelectedInitiative(item);
    setNewBot({
      ...newBot,
      mahallaName: item.mahallaName || item.quarterTitle || newBot.mahallaName,
      mahallaId: item.publicId || item.mahallaId || item.id,
      openBudgetUrl: item.openBudgetUrl || `https://new.openbudget.uz/uz/initiative-budget/active-initiatives/${item.boardId || 55}/${item.id}`,
      name: newBot.name || `${item.mahallaName || 'Mahalla'} Boti`,
      targetVotes: item.targetVotes || 5000,
      description: item.description || (item.region ? `📍 ${item.region}, ${item.district || ''}` : ''),
      grantedAmount: item.grantedAmount || item.granted_amount || 0,
    });
  };

  const totalSearchPages = Math.ceil(totalResults / 20) || 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-5 sm:p-6 max-w-xl w-full space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto animate-in zoom-in-95 duration-200 transition-colors">
        <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <PlusCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Yangi Bot & Mahalla Qo'shish</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">OpenBudget Jonli Qidiruv va Integratsiya</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 🔎 GOOGLE-LIKE LIVE SEARCH BOX (OpenBudget Live API + Proxy) */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>OpenBudget Qidiruv (Mahalla, Tuman, Viloyat, ID)</span>
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-mono font-bold">
              Jonli API ⚡️
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearch(1))}
                placeholder="Mahalla nomi, tuman, viloyat yoki 12 xonali ID..."
                className="w-full bg-white dark:bg-slate-950 border border-indigo-200 dark:border-indigo-800/80 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 shadow-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => handleSearch(1)}
              disabled={isSearching}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50 shadow-md"
            >
              {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              <span>{isSearching ? 'Qidirilmoqda...' : 'Qidirish'}</span>
            </button>
          </div>

          {/* Search Results Dropdown/List */}
          {searchResults.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                <span>Topilgan natijalar ({totalResults} ta):</span>
                {totalSearchPages > 1 && (
                  <span className="text-[10px] text-slate-400">
                    Sahifa: {searchPage} / {totalSearchPages}
                  </span>
                )}
              </div>

              <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                {searchResults.map((item, idx) => {
                  const isSelected = selectedInitiative?.id === item.id || selectedInitiative?.publicId === item.publicId;
                  return (
                    <div
                      key={item.id || idx}
                      onClick={() => handleSelectInitiative(item)}
                      className={`p-2.5 rounded-xl border text-xs cursor-pointer transition flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                          : 'bg-white dark:bg-slate-950/80 border-slate-200 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <div className="space-y-0.5 truncate">
                        <div className="font-bold flex items-center gap-1.5 truncate">
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white shrink-0" />}
                          <span className="truncate">{item.mahallaName}</span>
                        </div>
                        <p className={`text-[10px] truncate ${isSelected ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`}>
                          📍 {item.region || ''} {item.district ? `(${item.district})` : ''} • ID: <code className="font-mono">{item.publicId || item.id}</code>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400'
                        }`}>
                          🗳 {item.currentVotes || 0} ovoz
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Search Pagination Buttons */}
              {totalSearchPages > 1 && (
                <div className="flex items-center justify-end gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => handleSearch(searchPage - 1)}
                    disabled={searchPage <= 1 || isSearching}
                    className="p-1 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
                  </button>
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 text-slate-700 dark:text-slate-300">
                    {searchPage} / {totalSearchPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSearch(searchPage + 1)}
                    disabled={searchPage >= totalSearchPages || isSearching}
                    className="p-1 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Selected Banner */}
          {selectedInitiative && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-[11px] space-y-1 animate-in fade-in">
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Tanlandi: {selectedInitiative.mahallaName}</span>
                </span>
                <span className="font-mono bg-emerald-500/20 px-1.5 py-0.5 rounded text-[10px]">
                  Joriy ovoz: {selectedInitiative.currentVotes} ta
                </span>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {searchError && (
            <p className="text-[11px] text-rose-500 font-semibold px-1">
              ❌ {searchError}
            </p>
          )}
        </div>

        <form onSubmit={onSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Bot Nomi</label>
            <input
              type="text"
              placeholder="Masalan: Do'stlik MFY Boti"
              value={newBot.name || ''}
              onChange={(e) => setNewBot({ ...newBot, name: e.target.value })}
              required
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold"
            />
          </div>

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1 flex items-center gap-1">
              <Key className="w-3.5 h-3.5 text-amber-500" />
              <span>Telegram Bot Token (BotFather dan)</span>
            </label>
            <input
              type="text"
              placeholder="1234567890:ABCdefGHIjklMNO..."
              value={newBot.token || ''}
              onChange={(e) => setNewBot({ ...newBot, token: e.target.value })}
              required
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-mono text-[11px]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                <span>Mahalla Nomi</span>
              </label>
              <input
                type="text"
                placeholder="Do'stlik MFY"
                value={newBot.mahallaName || ''}
                onChange={(e) => setNewBot({ ...newBot, mahallaName: e.target.value })}
                required
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Mahalla ID (12 xonali)
              </label>
              <input
                type="text"
                placeholder="055538434014"
                value={newBot.mahallaId || ''}
                onChange={(e) => setNewBot({ ...newBot, mahallaId: e.target.value })}
                required
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-mono text-[11px]"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
              Open Budget Loyiha Havolasi
            </label>
            <input
              type="text"
              placeholder="https://new.openbudget.uz/uz/initiative-budget/active-initiatives/55/..."
              value={newBot.openBudgetUrl || ''}
              onChange={(e) => setNewBot({ ...newBot, openBudgetUrl: e.target.value })}
              required
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 text-[11px] font-mono"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1 flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Reja (Ovoz)</span>
              </label>
              <input
                type="number"
                value={newBot.targetVotes || 5000}
                onChange={(e) => setNewBot({ ...newBot, targetVotes: parseInt(e.target.value, 10) || 5000 })}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold"
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Ovoz Mukofoti</span>
              </label>
              <input
                type="number"
                value={newBot.voteReward || 30000}
                onChange={(e) => setNewBot({ ...newBot, voteReward: parseInt(e.target.value, 10) || 30000 })}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1">
                  <Gift className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>Referal Bonusi</span>
                </label>
                <button
                  type="button"
                  onClick={() => setNewBot({ ...newBot, isRefActive: newBot.isRefActive === false })}
                  aria-pressed={newBot.isRefActive !== false}
                  title={newBot.isRefActive !== false ? 'Referal tizimi yoqilgan' : 'Referal tizimi o\'chirilgan'}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                    newBot.isRefActive !== false ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                      newBot.isRefActive !== false ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              <input
                type="number"
                value={newBot.refBonus || 5000}
                onChange={(e) => setNewBot({ ...newBot, refBonus: parseInt(e.target.value, 10) || 5000 })}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-bold"
              />
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                {newBot.isRefActive !== false ? 'Yoqilgan - yangi referallar bonus oladi' : 'O\'chirilgan - referal bonusi berilmaydi'}
              </p>
            </div>
          </div>

          {/* 🏛 Loyiha Tavsifi & Loyiha Summasi (OpenBudget Avtomat yoki Qo'lda) */}
          <div className="space-y-3 p-3.5 rounded-2xl bg-indigo-50/50 dark:bg-slate-950/60 border border-indigo-100 dark:border-indigo-900/30">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Loyiha Nomi / Tavsifi (OpenBudget)</span>
                </span>
                <span className="text-[10px] text-slate-400">Avtomatik</span>
              </label>
              <textarea
                rows={2}
                value={newBot.description || ''}
                onChange={(e) => setNewBot({ ...newBot, description: e.target.value })}
                placeholder="Masalan: Arabxona qishlog'i piyodalar yo'lagi qurish..."
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 placeholder-slate-400 resize-none"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Loyiha Qiymati / Ajratilgan Mablag' (so'm)</span>
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold font-mono">
                  {newBot.grantedAmount ? `${Number(newBot.grantedAmount).toLocaleString('uz-UZ')} so'm` : '0 so\'m'}
                </span>
              </label>
              <input
                type="number"
                value={newBot.grantedAmount || ''}
                onChange={(e) => setNewBot({ ...newBot, grantedAmount: parseInt(e.target.value, 10) || 0 })}
                placeholder="Masalan: 1240000000"
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-mono font-bold"
              />
            </div>
          </div>

          {/* 👥 Dynamic Multiple Admin Contacts */}
          <div className="space-y-2 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <label className="block text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-500" />
                <span>Mas'ul Adminlar / Kontaktlar (2-3 ta admin)</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  const current = Array.isArray(newBot.adminContactsList) ? [...newBot.adminContactsList] : [];
                  setNewBot({
                    ...newBot,
                    adminContactsList: [...current, { name: '', username: '', phone: '' }],
                  });
                }}
                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                <PlusCircle className="w-3 h-3" />
                <span>Admin qo'shish</span>
              </button>
            </div>

            <div className="space-y-2">
              {(newBot.adminContactsList && newBot.adminContactsList.length > 0 ? newBot.adminContactsList : [
                { name: 'Elbek Muxtorov', username: 'Elbek_Muxtorovv', phone: '998943489900' },
                { name: 'Jonibek Ismoilov', username: 'JONIBEKISMOILOV', phone: '998990652651' },
              ]).map((contact: any, index: number) => (
                <div key={index} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1.3fr_auto] gap-2 items-center bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
                  <input
                    type="text"
                    placeholder="Ism (masalan: Elbek)"
                    value={contact.name || ''}
                    onChange={(e) => {
                      const list = Array.isArray(newBot.adminContactsList) ? [...newBot.adminContactsList] : [
                        { name: 'Elbek Muxtorov', username: 'Elbek_Muxtorovv', phone: '998943489900' },
                        { name: 'Jonibek Ismoilov', username: 'JONIBEKISMOILOV', phone: '998990652651' },
                      ];
                      list[index] = { ...list[index], name: e.target.value };
                      setNewBot({ ...newBot, adminContactsList: list });
                    }}
                    className="w-full min-w-0 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    placeholder="@username"
                    value={contact.username || ''}
                    onChange={(e) => {
                      const list = Array.isArray(newBot.adminContactsList) ? [...newBot.adminContactsList] : [
                        { name: 'Elbek Muxtorov', username: 'Elbek_Muxtorovv', phone: '998943489900' },
                        { name: 'Jonibek Ismoilov', username: 'JONIBEKISMOILOV', phone: '998990652651' },
                      ];
                      list[index] = { ...list[index], username: e.target.value };
                      setNewBot({ ...newBot, adminContactsList: list });
                    }}
                    className="w-full min-w-0 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white font-mono text-[11px]"
                  />
                  <input
                    type="text"
                    placeholder="998901234567"
                    value={contact.phone || ''}
                    onChange={(e) => {
                      const list = Array.isArray(newBot.adminContactsList) ? [...newBot.adminContactsList] : [
                        { name: 'Elbek Muxtorov', username: 'Elbek_Muxtorovv', phone: '998943489900' },
                        { name: 'Jonibek Ismoilov', username: 'JONIBEKISMOILOV', phone: '998990652651' },
                      ];
                      list[index] = { ...list[index], phone: e.target.value };
                      setNewBot({ ...newBot, adminContactsList: list });
                    }}
                    className="col-span-2 sm:col-span-1 w-full min-w-0 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white font-mono text-[11px]"
                  />
                  {index >= 2 && (
                    <button
                      type="button"
                      onClick={() => {
                        const list = Array.isArray(newBot.adminContactsList) ? [...newBot.adminContactsList] : [];
                        list.splice(index, 1);
                        setNewBot({ ...newBot, adminContactsList: list });
                      }}
                      className="col-span-2 sm:col-span-1 justify-self-end p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition cursor-pointer"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-indigo-500/20 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Botni Yaratish & Ishga Tushirish</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
