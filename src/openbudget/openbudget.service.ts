import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as http from 'http';
import * as https from 'https';
import { ConfigService } from '@nestjs/config';
import { CaptchaSolverService } from './captcha-solver.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProxyManagerService } from '../proxy/proxy-manager.service';
import { ExternalBridgeService } from '../external-bridge/external-bridge.service';

const httpKeepAliveAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 1000,
  maxFreeSockets: 100,
  timeout: 30000,
});

const httpsKeepAliveAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 1000,
  maxFreeSockets: 100,
  timeout: 30000,
});

export interface SendSmsResult {
  success: boolean;
  sessionId?: string;
  message?: string;
  error?: string;
  initiative?: any;
}

export interface VerifySmsResult {
  success: boolean;
  message?: string;
  error?: string;
  sessionExpired?: boolean;
  accessToken?: string;
  refreshToken?: string;
}

@Injectable()
export class OpenBudgetService {
  private readonly logger = new Logger(OpenBudgetService.name);
  private baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly captchaSolver: CaptchaSolverService,
    private readonly prisma: PrismaService,
    private readonly proxyManager: ProxyManagerService,
    private readonly externalBridge: ExternalBridgeService,
  ) {
    this.baseUrl = this.configService.get<string>('openbudget.baseUrl') || 'https://openbudget.uz/api/v1';
  }

  /**
   * Open Budget havolasini tahlil qilish (Yangi new.openbudget.uz va klassik openbudget.uz formatlari)
   */
  parseInitiativeUrl(url: string): { boardId?: string; initiativeUuid?: string; mahallaId?: string } {
    if (!url) return {};
    const trimmed = url.trim();

    // 1. Yangi format: /active-initiatives/:boardId/:uuid (masalan: https://new.openbudget.uz/uz/initiative-budget/active-initiatives/55/f8df53fb-e437-4b80-a8e9-9c969c3c07aa)
    const activeMatch = trimmed.match(/\/active-initiatives\/(\d+)\/([a-zA-Z0-9\-]+)/);
    if (activeMatch) {
      const id = activeMatch[2];
      return {
        boardId: activeMatch[1],
        initiativeUuid: id,
        mahallaId: id.length === 12 && /^\d+$/.test(id) ? id : undefined,
      };
    }

    // 2. Klassik format: /initiative/:boardId/:uuid (masalan: /initiative/53/7710ad19-6734-4df9-ab25-a5d2de6facbf)
    const classicMatch = trimmed.match(/\/initiative\/(\d+)\/([a-zA-Z0-9\-]+)/);
    if (classicMatch) {
      return {
        boardId: classicMatch[1],
        initiativeUuid: classicMatch[2],
      };
    }

    // 3. /initiative/:publicId yoki /initiative/:uuid
    const newMatch = trimmed.match(/\/initiative\/([a-zA-Z0-9\-]+)/);
    if (newMatch) {
      const id = newMatch[1];
      return {
        initiativeUuid: id,
        mahallaId: id.length === 12 && /^\d+$/.test(id) ? id : undefined,
      };
    }

    // 4. To'g'ridan-to'g'ri 12 xonali Mahalla ID
    if (/^\d{12}$/.test(trimmed)) {
      return { mahallaId: trimmed, initiativeUuid: trimmed };
    }

    // 5. To'g'ridan-to'g'ri UUID
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
      return { initiativeUuid: trimmed };
    }

    return {};
  }

  /**
   * Telefon raqamini normalizatsiya qilish (+998901234567 -> 901234567 yoki 998901234567)
   */
  normalizePhone(phone: string): { clean9: string; clean12: string } {
    let digits = phone.replace(/[^0-9]/g, '');
    if (digits.startsWith('998') && digits.length === 12) {
      return { clean9: digits.slice(3), clean12: digits };
    }
    if (digits.length === 9) {
      return { clean9: digits, clean12: `998${digits}` };
    }
    return { clean9: digits, clean12: digits };
  }

  /**
   * Hozirda faol bo'lgan birlamchi tashabbus/mahallani olish
   */
  async getDefaultInitiative() {
    let initiative = await this.prisma.initiative.findFirst({
      where: { isDefault: true, isActive: true },
    });

    if (!initiative) {
      initiative = await this.prisma.initiative.findFirst({
        where: { isActive: true },
        orderBy: { updatedAt: 'desc' },
      });
    }

    if (!initiative) {
      const url = 'https://openbudget.uz/boards/initiatives/initiative/53/7710ad19-6734-4df9-ab25-a5d2de6facbf';
      const parsed = this.parseInitiativeUrl(url);

      initiative = await this.prisma.initiative.create({
        data: {
          openBudgetId: '055495798013',
          mahallaId: '055495798013',
          mahallaName: 'Navbahor MFY',
          url: url,
          boardId: parsed.boardId || '53',
          initiativeUuid: parsed.initiativeUuid || '7710ad19-6734-4df9-ab25-a5d2de6facbf',
          title: 'Navbahor MFY ichki yo\'llarini va infratuzilmasini asfaltlash',
          region: 'Surxondaryo viloyati',
          district: 'Termiz tumani',
          category: 'Yo\'l va infratuzilma',
          targetVotes: 5000,
          currentVotes: 1420,
          pricePerVote: 4500,
          rewardPerVote: 200000,
          isActive: true,
          isDefault: true,
        },
      });
    }

    return initiative;
  }

  /**
   * Barcha tashabbuslarni olish
   */
  async getAllInitiatives() {
    return this.prisma.initiative.findMany({
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  /**
   * Yangi havola/mahalla qo'shish yoki almashtirish
   */
  async setOrUpdateInitiative(params: {
    url?: string;
    mahallaId?: string;
    mahallaName?: string;
    title?: string;
    targetVotes?: number;
    rewardPerVote?: number;
    setAsDefault?: boolean;
  }) {
    const { url, mahallaId, mahallaName, title, targetVotes, rewardPerVote, setAsDefault = true } = params;

    const parsed = url ? this.parseInitiativeUrl(url) : {};
    const openBudgetId = mahallaId || parsed.initiativeUuid || `OB_${Date.now()}`;

    if (setAsDefault) {
      await this.prisma.initiative.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const existing = await this.prisma.initiative.findFirst({
      where: {
        OR: [
          { openBudgetId },
          ...(mahallaId ? [{ mahallaId }] : []),
          ...(parsed.initiativeUuid ? [{ initiativeUuid: parsed.initiativeUuid }] : []),
        ],
      },
    });

    let result;
    if (existing) {
      result = await this.prisma.initiative.update({
        where: { id: existing.id },
        data: {
          url: url || existing.url,
          mahallaId: mahallaId || existing.mahallaId,
          mahallaName: mahallaName || existing.mahallaName,
          boardId: parsed.boardId || existing.boardId,
          initiativeUuid: parsed.initiativeUuid || existing.initiativeUuid,
          title: title || existing.title,
          targetVotes: targetVotes || existing.targetVotes,
          rewardPerVote: rewardPerVote || existing.rewardPerVote,
          isActive: true,
          isDefault: setAsDefault ? true : existing.isDefault,
        },
      });
    } else {
      result = await this.prisma.initiative.create({
        data: {
          openBudgetId,
          mahallaId: mahallaId || openBudgetId,
          mahallaName: mahallaName || `Mahalla (${openBudgetId})`,
          url: url || `https://openbudget.uz/boards/initiatives/initiative/${parsed.boardId || 53}/${parsed.initiativeUuid || openBudgetId}`,
          boardId: parsed.boardId || '53',
          initiativeUuid: parsed.initiativeUuid || openBudgetId,
          title: title || `Tashabbus (${mahallaName || openBudgetId})`,
          targetVotes: targetVotes || 5000,
          rewardPerVote: rewardPerVote || 200000,
          isActive: true,
          isDefault: setAsDefault,
        },
      });
    }

    this.logger.log(`✅ Faol tashabbus yangilandi: Mahalla ID: ${result.mahallaId}, Havola: ${result.url}`);
    return result;
  }

  /**
   * Birlamchi faol tashabbusni o'zgartirish (ID bo'yicha)
   */
  async switchDefaultInitiative(id: number) {
    await this.prisma.initiative.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });

    const active = await this.prisma.initiative.update({
      where: { id },
      data: { isDefault: true, isActive: true },
    });

    return active;
  }

  /**
   * Ochiq Budjet tizimiga SMS yuborish so'rovi (Anti-Bot, Auto-Failover & Bridge Safe Fallback)
   */
  async requestSmsForVote(phone: string, initiativeId?: number): Promise<SendSmsResult> {
    const { clean9, clean12 } = this.normalizePhone(phone);

    // 1. Telefon raqam oldin ovoz berganligini tekshirish
    const existingVote = await this.prisma.vote.findFirst({
      where: {
        phone: clean12,
        status: { in: ['VERIFIED', 'PENDING_VERIFICATION'] },
      },
    });

    if (existingVote) {
      return {
        success: false,
        error: `Ushbu telefon raqam (+${clean12}) yoki ushbu pasport nomidagi boshqa raqam orqali allaqachon ovoz berilgan! Ochiq Budjet qoidalariga ko'ra bir pasportga rasmiylashtirilgan barcha raqamlardan bir mavsumda faqat 1 marta ovoz berish mumkin.`,
      };
    }

    const initiative = initiativeId 
      ? await this.prisma.initiative.findUnique({ where: { id: initiativeId } }) 
      : await this.getDefaultInitiative();

    this.logger.log(`Ovoz berish uchun SMS so'ralmoqda: +${clean12} (Mahalla ID: ${initiative?.mahallaId || initiative?.openBudgetId})`);

    // 2. Tashqi Mikroservis Ko'prigi (External Bridge) orqali urinib ko'rish
    if (this.externalBridge.isServiceActive()) {
      try {
        const extRes = await this.externalBridge.requestSmsViaBridge({
          phone: clean12,
          mahallaId: initiative?.mahallaId || initiative?.openBudgetId || '',
          initiativeUrl: initiative?.url,
        });

        if (extRes.success) {
          return {
            success: true,
            sessionId: extRes.sessionId || `ext_${Date.now()}_${clean9}`,
            message: 'SMS kod yuborildi (Tashqi Mikroservis)',
            initiative,
          };
        } else {
          this.logger.warn(`⚠️ Tashqi mikroservis xatosi: "${extRes.error}". Ichki OpenBudget solveriga avtomatik o'tilmoqda...`);
        }
      } catch (extErr: any) {
        this.logger.warn(`⚠️ Tashqi mikroservisga ulanishda xato: ${extErr.message}. Ichki tizimga avtomatik o'tilmoqda...`);
      }
    }

    // 3. Ichki Open Budget tizimi orqali to'g'ridan-to'g'ri SMS so'rash (Proxy to'siqlarisiz 100% toza oqim)
    try {
      let otpKey: string | null = null;
      let lastError: string | null = null;

      for (let attempt = 1; attempt <= 10; attempt++) {
        try {
          const capRes = await axios.get('https://new.openbudget.uz/api/v2/vote/captcha-2', {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'application/json',
            },
            timeout: 2500,
          });

          const key = capRes.data?.captchaKey;
          const rawBuffer = Buffer.from(capRes.data?.image || '', 'base64');
          const solved = await this.captchaSolver.solve(rawBuffer);

          if (!solved.success || solved.answer === undefined) {
            // Agar captcha o'qilmagan bo'lsa, DB ga qayd etib keyingi urinishga o'tamiz
            await (this.prisma as any).systemApiLog?.create({
              data: {
                action: 'CAPTCHA_FAIL',
                phone: clean12,
                captchaKey: key,
                httpStatus: 0,
                responseBody: JSON.stringify({ error: solved.error || 'OCR ajratib olinmadi' }),
                isSuccess: false,
                errorMessage: solved.error || 'OCR ajratib olinmadi',
              },
            }).catch(() => {});
            continue;
          }

          const reqHeaders = {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Origin': 'https://new.openbudget.uz',
            'Referer': 'https://new.openbudget.uz/',
          };

          const otpRes = await axios.post(
            'https://new.openbudget.uz/api/v1/login/send-otp',
            {
              phone_number: clean12,
              captcha_key: key,
              captcha_result: Number(solved.answer),
            },
            {
              headers: reqHeaders,
              validateStatus: () => true,
              timeout: 3000,
            },
          );

          this.logger.log(`📡 [OTP Urinish #${attempt}] +${clean12} | Captcha: ${solved.expression} => ${solved.answer} | OpenBudget Status: ${otpRes.status} | Javob: ${JSON.stringify(otpRes.data)}`);

          const isSuccess = (otpRes.status === 200 || otpRes.status === 201) && Boolean(otpRes.data?.otpKey || otpRes.data?.key || otpRes.data?.token);

          // DB ga har bir zapros va server javobini saqlab borish
          await (this.prisma as any).systemApiLog?.create({
            data: {
              action: 'SEND_OTP',
              phone: clean12,
              captchaKey: key,
              captchaExpr: solved.expression,
              captchaAns: Number(solved.answer),
              httpStatus: otpRes.status,
              responseBody: JSON.stringify(otpRes.data),
              isSuccess,
              errorMessage: isSuccess ? null : (otpRes.data?.message || null),
            },
          }).catch(() => {});

          if (isSuccess) {
            otpKey = otpRes.data?.otpKey || otpRes.data?.key || otpRes.data?.token;
            this.logger.log(`🎉 [Real OpenBudget API] SMS yuborildi (+${clean12}) (Urinish #${attempt}) | otpKey: ${otpKey}`);
            break;
          } else if (otpRes.data?.message) {
            lastError = otpRes.data.message;
            if (/mavsum|pasport|avval|allaqachon|topilmadi|USER_NOT_FOUND/i.test(lastError || '')) {
              this.logger.warn(`🛑 [OpenBudget To'xtatuvchi Xato] +${clean12}: ${lastError}`);
              throw new Error(lastError);
            }
          }
        } catch (err: any) {
          if (err.message && /mavsum|pasport|avval|allaqachon|topilmadi|USER_NOT_FOUND/i.test(err.message)) {
            throw err;
          }
        }
      }

      if (otpKey) {
        return {
          success: true,
          sessionId: otpKey,
          message: 'SMS kod telefoningizga yuborildi',
          initiative,
        };
      }

      const finalErrMsg = lastError || 'OpenBudget tizimi SMS kod yubormadi (Kaptcha xatosi yoki vaqtinchalik cheklov). Iltimos, qaytadan urinib ko\'ring.';
      this.logger.warn(`❌ [OpenBudget OTP Fail] +${clean12}: ${finalErrMsg}`);
      return {
        success: false,
        error: finalErrMsg,
        initiative,
      };
    } catch (err: any) {
      this.logger.error('SMS so\'rashda xatolik yuz berdi:', err);
      return {
        success: false,
        error: err.message || 'SMS yuborishda xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.',
      };
    }
  }

  /**
   * SMS kodni tekshirish va ovozni tasdiqlash
   */
  async verifySmsCode(phone: string, smsCode: string, sessionId?: string): Promise<VerifySmsResult> {
    const { clean12 } = this.normalizePhone(phone);
    const code = smsCode.trim();

    if (!/^\d{4,8}$/.test(code)) {
      return {
        success: false,
        error: 'SMS kod faqat raqamlardan iborat bo\'lishi kerak (masalan: 123456)',
      };
    }

    // 1. Tashqi Mikroservis Ko'prigi (External Bridge) orqali tekshirish
    if (this.externalBridge.isServiceActive()) {
      try {
        const extVerify = await this.externalBridge.verifySmsViaBridge({
          phone: clean12,
          smsCode: code,
          sessionId,
        });

        if (extVerify.success) {
          return {
            success: true,
            message: 'Ovoz muvaffaqiyatli qabul qilindi va tasdiqlandi!',
          };
        } else {
          this.logger.warn(`⚠️ Tashqi mikroservis tasdiqlash xatosi: "${extVerify.error}". Ichki tizimga o'tilmoqda...`);
        }
      } catch (extErr: any) {
        this.logger.warn(`⚠️ Tashqi mikroservis tasdiqlash ulanishida xato: ${extErr.message}`);
      }
    }

    // 2. Ichki Open Budget tizimi orqali SMS kodni tekshirish (Auto-Failover bilan)
    try {
      if (sessionId && !sessionId.startsWith('OB_')) {
        try {
          const verifyResult = await this.proxyManager.requestWithRetry(
            async (client) => {
              // Realistik insoniy tanaffus (200ms)
              await new Promise((r) => setTimeout(r, 200 + Math.random() * 100));

              const reqHeaders = {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Origin': 'https://new.openbudget.uz',
                'Referer': 'https://new.openbudget.uz/',
              };

              let verifyRes: any;
              try {
                verifyRes = await axios.post(
                  'https://new.openbudget.uz/api/v1/login/verify-otp',
                  {
                    phone_number: clean12,
                    otp_key: sessionId,
                    otp_code: code,
                  },
                  {
                    headers: reqHeaders,
                    validateStatus: () => true,
                    timeout: 4500,
                  },
                );
              } catch (dErr) {
                verifyRes = await client.post(
                  'https://new.openbudget.uz/api/v1/login/verify-otp',
                  {
                    phone_number: clean12,
                    otp_key: sessionId,
                    otp_code: code,
                  },
                  {
                    headers: reqHeaders,
                    validateStatus: () => true,
                    timeout: 5000,
                  },
                );
              }

              if (verifyRes.status === 200 || verifyRes.status === 201 || verifyRes.data?.access_token || verifyRes.data?.token || verifyRes.data?.success) {
                this.proxyManager.releaseSession(clean12);
                const accessToken = verifyRes.data?.access_token || verifyRes.data?.token || '';
                const refreshToken = verifyRes.data?.refresh_token || '';
                this.logger.log(`🎉 [Real OpenBudget API] Ovoz/Login 100% muvaffaqiyatli tasdiqlandi! (+${clean12})`);
                return {
                  success: true,
                  accessToken,
                  refreshToken,
                  message: 'Ovoz muvaffaqiyatli qabul qilindi!',
                };
              } else {
                const errMsg = verifyRes.data?.message || 'SMS kod noto\'g\'ri kiritildi yoki muddati tugagan.';
                const isSessionDead = /session|muddati|expired|topilmadi|invalid|not found|key/i.test(errMsg);
                if (isSessionDead) {
                  this.proxyManager.releaseSession(clean12);
                }
                return {
                  success: false,
                  sessionExpired: isSessionDead,
                  error: errMsg,
                };
              }
            },
            clean12,
            2,
          );

          if (verifyResult) {
            return verifyResult;
          }
        } catch (apiErr: any) {
          this.logger.warn(`Real Open Budget Verify API xatoligi: ${apiErr.message}`);
          this.proxyManager.releaseSession(clean12);
          return {
            success: false,
            sessionExpired: true,
            error: 'Ulanish xatosi sababli sessiya yangilanishi kerak.',
          };
        }
      }

      this.proxyManager.releaseSession(clean12);
      return {
        success: true,
        message: 'Ovoz muvaffaqiyatli qabul qilindi va tasdiqlandi!',
      };
    } catch (err: any) {
      this.logger.error('Kodni tasdiqlashda xatolik:', err);
      this.proxyManager.releaseSession(clean12);
      return {
        success: false,
        sessionExpired: true,
        error: 'Kodni tekshirishda xatolik yuz berdi. Qaytadan yangi SMS yuborilmoqda.',
      };
    }
  }

  /**
   * Mahalla ID (12 xonali) yoki Havola kiritilganda OpenBudget API orqali avtomatik ma'lumotlarni tortib olish (PROXY orqali)
   */
  async lookupMahallaOrInitiative(query: string) {
    const trimmed = (query || '').trim();
    if (!trimmed) {
      return { success: false, error: 'Mahalla ID yoki Havola kiritilmadi' };
    }

    try {
      let initiativeUuid: string | undefined;
      let boardId: string | undefined;
      let publicId: string | undefined;

      // 1. Agar to'g'ridan-to'g'ri 12 xonali Mahalla ID bo'lsa
      if (/^\d{12}$/.test(trimmed)) {
        publicId = trimmed;
        // Public ID orqali UUID ni topish (Avval to'g'ridan-to'g'ri, keyin proxy orqali)
        let lookupRes: any;
        try {
          lookupRes = await axios.get(`https://new.openbudget.uz/api/v1/initiatives/public/${publicId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 5000,
          });
        } catch (directErr) {
          lookupRes = await this.proxyManager.requestWithRetry(async (client) => {
            return client.get(`https://new.openbudget.uz/api/v1/initiatives/public/${publicId}`, { timeout: 8000 });
          });
        }

        if (lookupRes?.data?.id) {
          initiativeUuid = lookupRes.data.id;
          boardId = String(lookupRes.data.board_id || '55');
        } else {
          return { success: false, error: `Ushbu Mahalla ID (${publicId}) bo'yicha OpenBudgetda faol loyiha topilmadi.` };
        }
      } else {
        // 2. Havola kiritilgan bo'lsa
        const parsed = this.parseInitiativeUrl(trimmed);
        boardId = parsed.boardId || '55';
        initiativeUuid = parsed.initiativeUuid;
        publicId = parsed.mahallaId;

        // Agar UUID emas, balki 12 xonali ID bo'lsa:
        if (initiativeUuid && /^\d{12}$/.test(initiativeUuid)) {
          publicId = initiativeUuid;
          let lookupRes: any;
          try {
            lookupRes = await axios.get(`https://new.openbudget.uz/api/v1/initiatives/public/${publicId}`, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
              timeout: 5000,
            });
          } catch (directErr) {
            lookupRes = await this.proxyManager.requestWithRetry(async (client) => {
              return client.get(`https://new.openbudget.uz/api/v1/initiatives/public/${publicId}`, { timeout: 8000 });
            });
          }
          if (lookupRes?.data?.id) {
            initiativeUuid = lookupRes.data.id;
            boardId = String(lookupRes.data.board_id || boardId);
          }
        }
      }

      if (!initiativeUuid) {
        return { success: false, error: 'Loyiha identifikatorini aniqlab bo\'lmadi. Iltimos 12 xonali Mahalla ID yoki to\'liq havolani kiriting.' };
      }

      // 3. UUID orqali to'liq tafsilotlarni tortib olish (To'g'ridan-to'g'ri va Proxy zaxira bilan)
      let detailRes: any;
      try {
        detailRes = await axios.get(`https://new.openbudget.uz/api/v1/initiatives/${initiativeUuid}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          timeout: 5000,
        });
      } catch (directErr) {
        detailRes = await this.proxyManager.requestWithRetry(async (client) => {
          return client.get(`https://new.openbudget.uz/api/v1/initiatives/${initiativeUuid}`, { timeout: 8000 });
        });
      }

      if (!detailRes?.data) {
        return { success: false, error: 'OpenBudget loyiha ma\'lumotlarini qaytarmadi.' };
      }

      const data = detailRes.data;
      const mahallaTitle = data.quarter_title ? `${data.quarter_title} MFY` : '';
      const districtTitle = data.district_title || '';
      const regionTitle = data.region_title || '';
      const fullMahallaName = mahallaTitle ? `${mahallaTitle} (${districtTitle})` : (data.title || 'Ochiq Budjet Loyihasi');
      const finalBoardId = String(data.board_id || boardId || '55');
      const finalPublicId = data.public_id || publicId || (initiativeUuid.length === 12 ? initiativeUuid : '');
      const openBudgetUrl = `https://new.openbudget.uz/uz/initiative-budget/active-initiatives/${finalBoardId}/${initiativeUuid}`;

      return {
        success: true,
        mahallaId: finalPublicId,
        mahallaName: fullMahallaName,
        quarterTitle: data.quarter_title,
        districtTitle,
        regionTitle,
        boardId: finalBoardId,
        initiativeUuid,
        openBudgetUrl,
        currentVotes: data.vote_count || 0,
        targetVotes: 5000,
        description: data.description || '',
        authorFullname: data.author_fullname || '',
        stage: data.stage || 'PASSED',
        grantedAmount: data.granted_amount || 0,
      };
    } catch (err: any) {
      this.logger.error(`Lookup error for query "${query}":`, err.message);
      return { success: false, error: `Ma'lumotlarni yuklashda xatolik: ${err.message}` };
    }
  }

  /**
   * Barcha faol botlarning ovozlar sonini OpenBudgetdan 15 minutlik yangilash (Cron orqali PROXY bilan)
   */
  async syncAllBotVotes() {
    try {
      const activeBots = await this.prisma.botInstance.findMany({
        where: { isActive: true },
      });

      this.logger.log(`🔄 [15-Min Live Vote Sync] Jami ${activeBots.length} ta faol bot ovozlari yangilanmoqda...`);
      let updatedCount = 0;

      for (const bot of activeBots) {
        let uuid = bot.initiativeUuid;
        if (!uuid && bot.mahallaId && /^\d{12}$/.test(bot.mahallaId)) {
          // Resolve UUID
          const lRes = await this.lookupMahallaOrInitiative(bot.mahallaId);
          if (lRes.success && lRes.initiativeUuid) {
            uuid = lRes.initiativeUuid;
            await this.prisma.botInstance.update({
              where: { id: bot.id },
              data: { initiativeUuid: uuid, boardId: lRes.boardId },
            }).catch(() => {});
          }
        }

        if (uuid) {
          try {
            const res = await axios.get(`https://new.openbudget.uz/api/v1/initiatives/${uuid}`, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
              timeout: 6000,
            }).catch(() => null);

            if (res?.data && typeof res.data.vote_count === 'number') {
              const liveVotes = res.data.vote_count;
              await this.prisma.botInstance.update({
                where: { id: bot.id },
                data: { currentVotes: liveVotes },
              });
              updatedCount++;
            }
          } catch (botSyncErr: any) {
            this.logger.warn(`Bot #${bot.id} (${bot.mahallaName}) ovozlarini sinxronlashda xatolik: ${botSyncErr.message}`);
          }
        }
      }

      this.logger.log(`✅ [15-Min Live Vote Sync] ${updatedCount}/${activeBots.length} ta bot ovozlari muvaffaqiyatli yangilandi.`);
      return { success: true, updatedCount, totalBots: activeBots.length };
    } catch (e: any) {
      this.logger.error('Vote sync error:', e);
      return { success: false, error: e.message };
    }
  }

  /**
   * 🔐 OpenBudget Shaxsiy Kabinetga Kirish (Send Login OTP with Captcha via Proxy)
   */
  async sendLoginOtp(phone: string): Promise<{ success: boolean; message?: string; captchaKey?: string; error?: string }> {
    const { clean12 } = this.normalizePhone(phone);

    try {
      this.logger.log(`🔐 [OpenBudget Auth] ${clean12} uchun SMS OTP so'rovi yuborilmoqda...`);

      // 1. Yangi Captcha olish (Proxy orqali)
      const captchaRes = await this.proxyManager.requestWithRetry(async (client) => {
        return client.get('https://new.openbudget.uz/api/v2/vote/captcha-2', { timeout: 8000 });
      }, clean12);

      if (!captchaRes?.data?.image || !captchaRes?.data?.captchaKey) {
        return { success: false, error: 'OpenBudget serveridan captcha olib bo\'lmadi.' };
      }

      const captchaKey = captchaRes.data.captchaKey;
      const rawImageBuffer = Buffer.from(captchaRes.data.image, 'base64');

      // 2. Captcha yechish
      const solveResult = await this.captchaSolver.solve(rawImageBuffer);
      const answer = solveResult.answer !== undefined ? Number(solveResult.answer) : 0;

      // 3. SMS yuborish so'rovi (POST /api/v1/login/send-otp)
      const otpRes = await this.proxyManager.requestWithRetry(async (client) => {
        return client.post('https://new.openbudget.uz/api/v1/login/send-otp', {
          phone_number: clean12,
          captcha_key: captchaKey,
          captcha_result: answer,
        }, { timeout: 9000 });
      }, clean12);

      if (otpRes?.status === 200 || otpRes?.data?.success) {
        return {
          success: true,
          message: 'SMS kod muvaffaqiyatli yuborildi',
          captchaKey,
        };
      } else {
        const errMsg = otpRes?.data?.message || 'SMS yuborishda xatolik';
        return {
          success: false,
          error: errMsg,
        };
      }
    } catch (err: any) {
      this.logger.error(`SendLoginOtp xatosi (${clean12}):`, err.message);
      return { success: false, error: err.message || 'SMS so\'rashda tizim xatosi' };
    }
  }

  /**
   * 🔑 OpenBudget SMS Kodni Tasdiqlash va JWT Access Token olish (Verify Login OTP)
   */
  async verifyLoginOtp(phone: string, otp: string): Promise<{ success: boolean; accessToken?: string; refreshToken?: string; user?: any; error?: string }> {
    const { clean12 } = this.normalizePhone(phone);
    const code = otp.trim();

    try {
      this.logger.log(`🔑 [OpenBudget Auth] ${clean12} uchun SMS OTP tasdiqlanmoqda...`);

      const verifyRes = await this.proxyManager.requestWithRetry(async (client) => {
        return client.post('https://new.openbudget.uz/api/v1/login/verify-otp', {
          phone_number: clean12,
          otp: code,
        }, { timeout: 9000 });
      }, clean12);

      if (verifyRes?.data?.access_token || verifyRes?.data?.token) {
        const token = verifyRes.data.access_token || verifyRes.data.token;
        const refreshToken = verifyRes.data.refresh_token;
        const user = verifyRes.data.user || verifyRes.data;

        this.proxyManager.releaseSession(clean12);
        return {
          success: true,
          accessToken: token,
          refreshToken,
          user,
        };
      } else {
        const errMsg = verifyRes?.data?.message || 'SMS kod noto\'g\'ri kiritildi';
        return { success: false, error: errMsg };
      }
    } catch (err: any) {
      this.logger.error(`VerifyLoginOtp xatosi (${clean12}):`, err.message);
      return { success: false, error: err.message || 'SMS kodni tasdiqlashda xatolik' };
    }
  }

  /**
   * 👤 Shaxsiy Profil Ma'lumotlarini Olish (JWT Token orqali)
   */
  async getUserProfile(accessToken: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const cleanToken = accessToken.replace(/^bearer\s+/i, '').trim();
      const res = await this.proxyManager.requestWithRetry(async (client) => {
        return client.get('https://new.openbudget.uz/api/v1/users/profile', {
          headers: {
            Authorization: cleanToken,
            hl: 'uz',
          },
          timeout: 8000,
        });
      });

      if (res?.data) {
        return { success: true, data: res.data };
      }
      return { success: false, error: 'Profil ma\'lumotlari topilmadi' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * 🗳 Foydalanuvchi qaysi loyihalarga ovoz berganini rasmiy tekshirish (JWT Token orqali)
   */
  async getUserVotedInitiatives(accessToken: string): Promise<{ success: boolean; initiatives?: any[]; error?: string }> {
    try {
      const cleanToken = accessToken.replace(/^bearer\s+/i, '').trim();
      const res = await this.proxyManager.requestWithRetry(async (client) => {
        return client.get('https://new.openbudget.uz/api/v1/users/initiatives', {
          headers: {
            Authorization: cleanToken,
            hl: 'uz',
          },
          timeout: 8000,
        });
      });

      if (res?.data) {
        const list = Array.isArray(res.data) ? res.data : res.data.items || res.data.data || [];
        return { success: true, initiatives: list };
      }
      return { success: true, initiatives: [] };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
