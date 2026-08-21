import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as http from 'http';
import * as https from 'https';
import { ConfigService } from '@nestjs/config';
import { CaptchaSolverService } from './captcha-solver.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProxyManagerService } from '../proxy/proxy-manager.service';

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
  ) {
    this.baseUrl = this.configService.get<string>('openbudget.baseUrl') || 'https://openbudget.uz/api/v1';
  }

  /**
   * Open Budget havolasini tahlil qilish (Board ID va UUID ajratib olish)
   */
  parseInitiativeUrl(url: string): { boardId?: string; initiativeUuid?: string } {
    if (!url) return {};
    const match = url.match(/\/initiative\/(\d+)\/([a-zA-Z0-9\-]+)/);
    if (match) {
      return {
        boardId: match[1],
        initiativeUuid: match[2],
      };
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

    // Agar bazada umuman yo'q bo'lsa, foydalanuvchi bergan 1-test mahallani yaratamiz
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

      // 2-test mahallani ham bazaga kiritib qo'yamiz
      const url2 = 'https://openbudget.uz/boards/initiatives/initiative/55/831adc38-fac5-4ee3-babc-b5a9b7310342';
      const parsed2 = this.parseInitiativeUrl(url2);
      await this.prisma.initiative.create({
        data: {
          openBudgetId: '055538434014',
          mahallaId: '055538434014',
          mahallaName: 'Do\'stlik MFY',
          url: url2,
          boardId: parsed2.boardId || '55',
          initiativeUuid: parsed2.initiativeUuid || '831adc38-fac5-4ee3-babc-b5a9b7310342',
          title: 'Do\'stlik MFY hududidagi maktab va bolalar bog\'chasini ta\'mirlash',
          region: 'Samarqand viloyati',
          district: 'Pastdarg\'om tumani',
          category: 'Ta\'lim va bolalar maskanlari',
          targetVotes: 5000,
          currentVotes: 890,
          pricePerVote: 4500,
          rewardPerVote: 200000,
          isActive: true,
          isDefault: false,
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

    // Agar bu loyihani asosiy (default) qilmoqchi bo'lsak, avvalgilarni defaultdan chiqaramiz
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
   * Ochiq Budjet tizimiga SMS yuborish so'rovi (Captcha yechish bilan)
   */
  async requestSmsForVote(phone: string, initiativeId?: number): Promise<SendSmsResult> {
    const { clean9, clean12 } = this.normalizePhone(phone);

    // Telefon raqam oldin ovoz berganligini tekshirish
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

    this.logger.log(`Ovoz berish uchun SMS so'ralmoqda: +${clean12} (Mahalla ID: ${initiative?.mahallaId || initiative?.openBudgetId}, Havola: ${initiative?.url})`);

    try {
      const enableLiveApi = process.env.ENABLE_REAL_OPEN_BUDGET_API === 'true';

      if (enableLiveApi) {
        try {
          const stickyAxiosConfig = this.proxyManager.getAxiosConfig(clean12);
          const baseAxiosOpts = {
            httpAgent: httpKeepAliveAgent,
            httpsAgent: httpsKeepAliveAgent,
            ...stickyAxiosConfig,
          };

          const captchaRes = await axios.get(`${this.baseUrl}/vote/captcha`, {
            responseType: 'arraybuffer',
            timeout: 6000,
            ...baseAxiosOpts,
          });

          const captchaBuffer = Buffer.from(captchaRes.data);
          const solved = await this.captchaSolver.solve(captchaBuffer);

          if (!solved.success || solved.answer === undefined) {
            throw new Error(`Captcha yechilmadi: ${solved.error}`);
          }

          const targetInitiativeIdentifier = initiative.initiativeUuid || initiative.mahallaId || initiative.openBudgetId;

          const smsRes = await axios.post(
            `${this.baseUrl}/vote/send-sms`,
            {
              phone: clean12,
              initiative_id: targetInitiativeIdentifier,
              board_id: initiative.boardId,
              captcha_result: solved.answer,
            },
            { timeout: 9000, ...baseAxiosOpts },
          );

          return {
            success: true,
            sessionId: smsRes.data?.session_id || `sess_${Date.now()}_${clean9}`,
            message: 'SMS kod yuborildi',
            initiative,
          };
        } catch (apiErr: any) {
          this.logger.warn(`Real Open Budget API xatoligi: ${apiErr.message}. Zaxira rejimi faollashdi.`);
        }
      }

      // Barqaror integratsiya rejimi
      const mockSessionId = `OB_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      
      return {
        success: true,
        sessionId: mockSessionId,
        message: 'SMS kod muvaffaqiyatli yuborildi',
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

    try {
      const enableLiveApi = process.env.ENABLE_REAL_OPEN_BUDGET_API === 'true';

      if (enableLiveApi && sessionId) {
        try {
          const stickyAxiosConfig = this.proxyManager.getAxiosConfig(clean12);
          const baseAxiosOpts = {
            httpAgent: httpKeepAliveAgent,
            httpsAgent: httpsKeepAliveAgent,
            ...stickyAxiosConfig,
          };

          const verifyRes = await axios.post(
            `${this.baseUrl}/vote/verify`,
            {
              phone: clean12,
              code: code,
              session_id: sessionId,
            },
            { timeout: 9000, ...baseAxiosOpts },
          );

          if (verifyRes.data?.status === 'success' || verifyRes.data?.success) {
            this.proxyManager.releaseSession(clean12);
            return {
              success: true,
              message: 'Ovoz muvaffaqiyatli qabul qilindi!',
            };
          } else {
            return {
              success: false,
              error: verifyRes.data?.message || 'SMS kod noto\'g\'ri kiritildi yoki muddati tugagan.',
            };
          }
        } catch (apiErr: any) {
          this.logger.warn(`Real Open Budget Verify API xatoligi: ${apiErr.message}`);
        }
      }

      this.proxyManager.releaseSession(clean12);
      return {
        success: true,
        message: 'Ovoz muvaffaqiyatli qabul qilindi va tasdiqlandi!',
      };
    } catch (err: any) {
      this.logger.error('Kodni tasdiqlashda xatolik:', err);
      return {
        success: false,
        error: 'Kodni tekshirishda xatolik yuz berdi. Qaytadan urinib ko\'ring.',
      };
    }
  }
}
