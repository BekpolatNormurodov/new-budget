/**
 * Open Budget Rasmiy va Yangi Tizim (new.openbudget.uz) API & URL Konfiguratsiyasi
 * Tahlil qilingan va tasdiqlangan: 2026-yilgi Ochiq Budjet Mavsumi
 */

export const OPEN_BUDGET_ENDPOINTS = {
  // 🌐 1. Asosiy Yangi Platforma (new.openbudget.uz)
  NEW_BASE_URL: 'https://new.openbudget.uz',
  NEW_API_V2: 'https://new.openbudget.uz/api/v2',
  
  // 🗳 Ovoz berish & Captcha Modal Endpointlari
  NEW_VOTE_CAPTCHA_IFRAME: 'https://new.openbudget.uz/api/v2/vote/mvc/captcha', // /api/v2/vote/mvc/captcha/:initiativeId
  NEW_VOTE_SEND_OTP: 'https://new.openbudget.uz/api/v2/vote/send-sms',
  NEW_VOTE_VERIFY_OTP: 'https://new.openbudget.uz/api/v2/vote/verify-sms',
  
  // 📋 Asosiy Bo'limlar & Sahifalar
  INITIATIVE_BUDGET_LIST: 'https://new.openbudget.uz/uz/initiative-budget',
  ACTIVE_INITIATIVES: 'https://new.openbudget.uz/uz/initiative-budget/active-initiatives',
  MY_SCHOOL_INITIATIVES: 'https://new.openbudget.uz/uz/initiative-budget/my-school',
  
  // 📍 Aniq Mahalla / Loyiha Ko'rinishi
  INITIATIVE_DETAIL: (publicId: string) => `https://new.openbudget.uz/uz/initiative/${publicId}`,
  INITIATIVE_VOTERS_PORTRAIT: (id: string | number) => `https://new.openbudget.uz/uz/initiative-budget/active-initiatives/${id}`,
  
  // 🏛 Eski/Klassik OpenBudget (Fallback)
  LEGACY_BASE_URL: 'https://openbudget.uz',
  LEGACY_API_V1: 'https://openbudget.uz/api/v1',
  LEGACY_INITIATIVE_URL: (boardId: string, uuid: string) => `https://openbudget.uz/boards/initiatives/initiative/${boardId}/${uuid}`,
};

/**
 * Muhim Xulosa:
 * Oddiy fuqarolardan ovoz berish jarayonida OneID login yoki E-IMZO talab qilinmaydi!
 * Ovoz berish to'liq TELEFON RAQAM + CAPTCHA + SMS KOD (OTP) orqali ishlaydi.
 */
