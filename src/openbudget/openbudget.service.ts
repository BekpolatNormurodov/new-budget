import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as http from 'http';
import * as https from 'https';
import { ConfigService } from '@nestjs/config';
import { CaptchaSolverService } from './captcha-solver.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProxyManagerService } from '../proxy/proxy-manager.service';
import { ExternalBridgeService } from '../external-bridge/external-bridge.service';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execFileAsync = promisify(execFile);

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
   * Har bir captcha rasmini keyinchalik ko'rib chiqish/tekshirish uchun (audit) diskka
   * saqlaydi va nisbiy yo'lini qaytaradi. Xato bo'lsa (disk yo'q, ruxsat yo'q va h.k.)
   * jim null qaytaradi - captcha oqimining o'zi bunga bog'liq bo'lmasligi kerak.
   */
  private saveCaptchaImage(phone: string, buffer: Buffer): string | null {
    try {
      const dir = path.resolve(process.cwd(), 'public', 'captchas');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const dateStr = new Date().toISOString().slice(0, 10);
      const rand = Math.random().toString(36).slice(2, 10);
      const filename = `${dateStr}_${phone}_${rand}.jpg`;
      fs.writeFileSync(path.join(dir, filename), buffer);
      return `captchas/${filename}`;
    } catch (err: any) {
      this.logger.warn(`Captcha rasmini saqlashda xato: ${err.message}`);
      return null;
    }
  }

  /**
   * OpenBudget API xatoliklarini tushunarli, chiroyli va rasmiy o'zbek tiliga (Lotin) o'girish
   */
  private translateOpenBudgetError(rawMessage: string): string {
    if (!rawMessage) return rawMessage;

    // Rus tilida "noto'g'ri/xato" ma'nosini bildiruvchi ikkita eng keng tarqalgan o'zak
    // ("неверн-" va "неправильн-") - OpenBudget ba'zan bittasini, ba'zan ikkinchisini ishlatadi.
    const ru = '(?:невер|неправильн)';

    const known: Array<[RegExp, string]> = [
      // 1. Boshqa tashabbus / mahallaga ovoz berilganlik holati - "инициатив"/"голосов"
      // o'zaklarini so'z tartibidan qat'iy nazar tekshiramiz. #2 (umumiy "allaqachon ovoz
      // berilgan") dan OLDIN tekshiriladi, aks holda "инициатив" so'zi bo'lsa ham umumiyroq
      // pattern birinchi ishlab ketib, aniqroq xabar ko'rsatilmay qolardi.
      [
        /ташаббусга\s+овоз|маҳаллага\s+овоз|ushbu\s+tashabbusga|ushbu\s+mahallaga|boshqa\s+loyihaga|инициатив.{0,25}голосов|голосов.{0,25}инициатив/i,
        '⚠️ <b>Ushbu telefon raqam orqali boshqa mahallaga (tashabbusga) allaqachon ovoz berilgan!</b>\n\n' +
        '📌 <b>Ochiq Budjet qoidasi:</b> Bir mavsumda bitta fuqaro faqat 1 ta loyihaga ovoz bera oladi.\n\n' +
        '💡 <i>Iltimos, boshqa yaqinlaringiz telefon raqamini kiritib ovoz bering.</i>',
      ],

      // 2. Mavsumda allaqachon ovoz berilganlik holati. Rus tilidagi javob so'z tartibi va fe'l
      // shakli (голосовал/голосовали/проголосовали) bo'yicha farq qilishi mumkin, shuning uchun
      // aniq iborani emas, "уже" va "голосов" o'zaklari yaqin joylashganini tekshiramiz.
      [
        /мавсумда\s+овоз\s+берган|mavsumda\s+ovoz|avval\s+ovoz|allaqachon\s+ovoz|already[\s_]+voted|уже\s.{0,25}голосов|голосов.{0,25}уже/i,
        '⚠️ <b>Ushbu telefon raqam yoki pasport egasi nomidan ushbu mavsumda allaqachon ovoz berilgan!</b>\n\n' +
        '📌 <b>Ochiq Budjet qoidasi:</b> Bitta fuqaro (pasport) nomiga rasmiylashtirilgan barcha raqamlardan bir mavsumda faqat 1 marta ovoz berish mumkin.\n\n' +
        '💡 <i>Siz boshqa yaqinlaringiz (oila a\'zolaringiz) nomidagi telefon raqamlaridan ovoz berib pul ishlashingiz mumkin!</i>',
      ],

      // 3. Pasport bo'yicha limit to'lganlik holati
      [
        /паспорт|pasport|passport/i,
        '⚠️ <b>Ushbu pasport egasi nomidan bir mavsumda allaqachon ovoz berilgan!</b>\n\n' +
        '📌 <b>Ochiq Budjet qoidasi:</b> Bitta fuqaroning pasportiga ulangan barcha SIM-kartalardan faqat 1 marta ovoz berish mumkin.\n\n' +
        '💡 <i>Iltimos, boshqa fuqaro nomiga rasmiylashtirilgan telefon raqam kiriting.</i>',
      ],

      // 4. SMS kodi noto'g'ri kiritilganlik holati ("невер-" yoki "неправильн-" o'zagi "код"
      // so'ziga yaqin joylashgan bo'lsa - so'z tartibidan qat'iy nazar). Texnik kodlar
      // (INVALID_OTP kabi) probel emas pastki chiziq bilan kelishi mumkin - [\s_]+ ikkalasini
      // ham qamrab oladi.
      [
        new RegExp(`смс\\s+кодини\\s+текширишда\\s+хатолик|invalid[\\s_]+otp|wrong[\\s_]+otp|invalid[\\s_]+code|kod\\s+noto|код.{0,15}${ru}|${ru}.{0,15}код`, 'i'),
        '❌ <b>Kiritilgan SMS kod noto\'g\'ri!</b>\n\n' +
        'Iltimos, telefoningizga kelgan so\'nggi 6 xonali SMS kodni tekshirib qaytadan kiriting:',
      ],

      // 5. SMS muddati tugaganlik holati
      [
        /otp[\s_]+expired|code[\s_]+expired|муддати\s+туга|истек|muddati\s+tug/i,
        '⏳ <b>SMS kodning amal qilish muddati (2 daqiqa) tugagan!</b>\n\n' +
        'Iltimos, qaytadan "🗳 Ovoz berish" tugmasini bosib yangi SMS kod oling.',
      ],

      // 6. SMS yuborish limiti oshganlik holati
      [
        /лимит|limit|too[\s_]+many[\s_]+requests|rate[\s_]+limit/i,
        '⏳ <b>Ushbu raqamga SMS yuborish limiti vaqtincha to\'lgan!</b>\n\n' +
        '📌 OpenBudget portali xavfsizlik cheklovi tufayli 2-3 daqiqa kutib, so\'ng qaytadan urinib ko\'ring.',
      ],

      // 7. Akkaunt va ro'yxatdan o'tish holatlari
      [
        /account[\s_]+is[\s_]+inactive|аккаунт\s+не\s+активен|nofaol/i,
        '⚠️ <b>Ushbu hisob hali to\'liq faollashtirilmagan!</b>\n\n' +
        'Iltimos, "🗳 Ovoz berish" tugmasini bosib, yangi SMS kod orqali tasdiqlang.',
      ],
      [
        /user[\s_]+not[\s_]+found|топилмади|topilmadi|не\s+найден/i,
        'Ushbu raqam OpenBudget tizimida ro\'yxatdan o\'tmagan (tizim avtomatik ro\'yxatdan o\'tkazmoqda...).',
      ],

      // 8. Kaptcha javobi xatoligi (xuddi #4 kabi - "невер-"/"неправильн-" o'zagi "капч" so'ziga
      // yaqin bo'lsa yetarli)
      [
        new RegExp(`нотўғри\\s+каптча|noto.*kaptcha|wrong[\\s_]+captcha|капч.{0,20}${ru}|${ru}.{0,20}капч`, 'i'),
        '❌ <b>Kaptcha javobi noto\'g\'ri kiritilgan!</b>\n\n' +
        'Iltimos, rasmda ko\'rsatilgan matematik misol javobini diqqat bilan kiriting.',
      ],

      // 9. Tashabbus yopilganligi yoki ovoz to'xtatilganligi
      [
        /тўхтатилган|to'xtatilgan|closed|finished|завершен|остановлен/i,
        '🏁 <b>Ushbu tashabbus bo\'yicha ovoz yig\'ish yakunlangan yoki to\'xtatilgan!</b>',
      ],

      // 10. Davlat portali serveridagi yuklama va xatoliklar
      [
        /internal\s+server\s+error|серверда\s+хатолик|type.*internal|ошибка\s+сервера|500\s+internal|502|503/i,
        '⚠️ <b>Ochiq Budjet davlat portali serverida yuklama yuqori!</b>\n\n' +
        'Iltimos, 1-2 daqiqadan so\'ng qaytadan urinib ko\'ring.',
      ],
    ];

    for (const [pattern, translation] of known) {
      if (pattern.test(rawMessage)) return translation;
    }
    return rawMessage;
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
   * Ultra-tezkor va 100% ishonchli Curl orqali OpenBudget API ga HTTP Proxy so'rov yuborish
   */
  private async executeOpenBudgetCurl(url: string, options: { method?: string; data?: any; headers?: Record<string, string>; sessionKey?: string } = {}): Promise<{ status: number; data: any; cookie: string }> {
    const proxy = options.sessionKey 
      ? this.proxyManager.getStickyProxy(options.sessionKey) 
      : this.proxyManager.getNextProxy();

    const args: string[] = ['-s', '-i', '--connect-timeout', '4', '--max-time', '8'];

    if (proxy) {
      const auth = proxy.auth ? `${proxy.auth.username}:${proxy.auth.password}@` : '';
      // HTTP proxy ishlatamiz (8/8 ishlaydi), SOCKS5 emas (4/8 fail)
      args.push('-x', `http://${auth}${proxy.host}:${proxy.port}`);
    }

    if (options.method === 'POST') {
      args.push('-X', 'POST');
      args.push('-H', 'Content-Type: application/json');
      if (options.data) {
        args.push('-d', JSON.stringify(options.data));
      }
    }

    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        args.push('-H', `${k}: ${v}`);
      }
    }

    args.push(url);

    try {
      const { stdout } = await execFileAsync('curl', args, { maxBuffer: 10 * 1024 * 1024 });
      // Proxy orqali HTTPS so'ralganda curl -i avval "HTTP/1.0 200 Connection established"
      // (CONNECT tunnel) blokini qaytaradi, so'ng asl javob header+body kelidi. Shu sabab
      // oxirgi blokni body, undan oldingisini asl headerlar deb olamiz (CONNECT preambulasidan
      // qat'i nazar to'g'ri ishlaydi).
      const parts = stdout.split(/\r\n\r\n|\n\n/).filter((p) => p.length > 0);
      const bodyRaw = (parts[parts.length - 1] || '').trim();
      const headersRaw = parts.length >= 2 ? parts[parts.length - 2] : (parts[0] || '');

      const statusMatch = headersRaw.match(/HTTP\/[12\.]+\s+(\d+)/i);
      const status = statusMatch ? parseInt(statusMatch[1], 10) : 200;

      const cookieMatch = headersRaw.match(/set-cookie:\s*([^\r\n]+)/i);
      const cookie = cookieMatch ? cookieMatch[1] : '';

      let parsedData: any;
      try {
        parsedData = JSON.parse(bodyRaw);
      } catch (e) {
        parsedData = bodyRaw;
      }

      return { status, data: parsedData, cookie };
    } catch (err: any) {
      if (proxy) {
        this.proxyManager.markProxyFailure(proxy);
      }
      this.logger.warn(`Curl request failed for ${url} via proxy ${proxy?.host}: ${err.message}`);
      throw err;
    }
  }

  /**
   * OpenBudget Frontend bilan 100% bir xil Access-Captcha tokeni generatsiyasi
   */
  private generateAccessCaptcha(t: number = 12): string {
    const e = (t: number, n: number, r: number, e: number, a: number) => Buffer.from(`s${t}e${n}k${r}r${e}e${a}t`).toString('base64');
    const s = (t: number) => Math.floor(t);
    const a = (t: number = 10, n: number = 5) => s(Math.random() * (t - n) + n);
    return e(a(-3) * t, a(2, 19) * t, a(10, 5) * t, a(10, 4) * t, a(10, 220));
  }

  /**
   * Ochiq Budjet tizimiga SMS yuborish so'rovi (Anti-Bot, Auto-Failover & Bridge Safe Fallback)
   */
  async requestSmsForVote(
    phone: string,
    initiativeId?: number,
    manualCaptchaResolver?: (imageBuffer: Buffer, isRetry: boolean, note?: string) => Promise<number | null>,
  ): Promise<SendSmsResult> {
    const { clean9, clean12 } = this.normalizePhone(phone);
    // 'wrong' bo'lsa - foydalanuvchi haqiqatan xato javob bergan (qayta so'rashda buni bildiramiz);
    // aks holda (birinchi so'rov, yoki oldingi urinish captcha bilan bog'liq bo'lmagan sababdan
    // muvaffaqiyatsiz bo'lgani uchun qayta so'ralayotgan bo'lsa) birinchi so'rov kabi ko'rsatiladi.
    // HAR BIR yangi captchada foydalanuvchidan so'raladi (faqat 1 marta emas).
    let manualCaptchaRetryReason: 'wrong' | null = null;
    let manualRegCaptchaRetryReason: 'wrong' | null = null;
    // regAttempt loop hisoblagichi captcha rasmi kelmasa ham (bo'sh rasm) oldinga
    // siljishi mumkin - shuning uchun "bu foydalanuvchiga birinchi marta ro'yxatdan
    // o'tish captchasi ko'rsatilishi" ni ALOHIDA flag orqali kuzatamiz (regAttempt===1
    // emas), aks holda foydalanuvchi hali umuman javob bermagan holatda ham "captcha
    // javobingiz qabul qilindi" deb noto'g'ri xabar berilishi mumkin edi.
    let hasShownFirstRegCaptcha = false;

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
      // Ro'yxatdan o'tish (register/send-otp) ketma-ket "Internal server error" (500) qaytarsa,
      // bu captcha bilan bog'liq emas - OpenBudget serverining o'z muammosi. Shuni bir necha
      // marta qayta urinib, baribir davom etsa, foydalanuvchini captcha bilan cheksiz
      // band qilmasdan, tezda aniq xato bilan to'xtaymiz.
      let consecutiveRegServerErrors = 0;
      const MAX_CONSECUTIVE_REG_SERVER_ERRORS = 3;

      for (let attempt = 1; attempt <= 25; attempt++) {
        try {
          const capRes = await this.executeOpenBudgetCurl('https://openbudget.uz/api/v2/vote/captcha-2', {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'application/json, text/plain, */*',
              'Origin': 'https://openbudget.uz',
              'Referer': 'https://openbudget.uz/',
              'Access-Captcha': this.generateAccessCaptcha(),
            },
            sessionKey: clean12,
          });

          const key = capRes.data?.captchaKey;
          const cookie = capRes.cookie;

          if (!capRes.data?.image || !key) {
            this.logger.warn(`⚠️ [Kaptcha Urinish #${attempt}] Rasm/kalit kelmadi (proxy/tarmoq xatosi), yangi urinishga o'tilmoqda...`);
            continue;
          }

          const rawBuffer = Buffer.from(capRes.data.image, 'base64');

          // Avtomatik OCR vaqtincha O'CHIRILGAN - kaptcha faqat foydalanuvchining o'zi
          // tomonidan yechiladi (pastdagi manualCaptchaResolver orqali). Kerak bo'lsa qayta
          // yoqish uchun quyidagi qatorni izohdan chiqarish kifoya:
          // let solved = await this.captchaSolver.solve(rawBuffer);
          let solved: { success: boolean; answer?: number; expression?: string; error?: string } = {
            success: false,
            error: 'Avtomatik OCR o\'chirilgan - faqat foydalanuvchi javobi kutilmoqda',
          };
          let usedManualAnswer = false;

          // HAR BIR yangi captchada foydalanuvchining o'ziga ko'rsatib, tasdiqlashini kutamiz
          // (foydalanuvchi OpenBudgetda topilgan yoki topilmagan bo'lishidan qat'iy nazar, va
          // necha marta urinish bo'lishidan qat'iy nazar - faqat 1 marta emas). Agar 45 soniyada
          // javob kelmasa, shu captcha "yechilmagan" deb hisoblanadi va pastda yangi kaptcha
          // bilan qayta urinish boshlanadi (avtomatik OCR zaxirasi endi ishlatilmaydi).
          if (manualCaptchaResolver) {
            const isRetry = manualCaptchaRetryReason === 'wrong';
            manualCaptchaRetryReason = null;
            try {
              const manualAnswer = await manualCaptchaResolver(rawBuffer, isRetry);
              if (manualAnswer !== null && manualAnswer !== undefined && !Number.isNaN(manualAnswer)) {
                solved = {
                  success: true,
                  answer: manualAnswer,
                  expression: 'manual',
                } as any;
                usedManualAnswer = true;
              }
            } catch (manualErr: any) {
              this.logger.warn(`Foydalanuvchi kaptcha yechishida xato: ${manualErr.message}`);
            }
          }

          if (!solved.success || solved.answer === undefined) {
            await (this.prisma as any).systemApiLog?.create({
              data: {
                action: 'CAPTCHA_FAIL',
                phone: clean12,
                captchaKey: key,
                imagePath: this.saveCaptchaImage(clean12, rawBuffer),
                httpStatus: 0,
                responseBody: JSON.stringify({ error: solved.error || 'OCR ajratib olinmadi' }),
                isSuccess: false,
                errorMessage: solved.error || 'OCR ajratib olinmadi',
              },
            }).catch(() => {});
            continue;
          }

          const reqHeaders: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Origin': 'https://openbudget.uz',
            'Referer': 'https://openbudget.uz/',
          };

          if (cookie) {
            reqHeaders['Cookie'] = cookie;
          }

          const otpRes = await this.executeOpenBudgetCurl(
            'https://openbudget.uz/api/v1/login/send-otp',
            {
              method: 'POST',
              data: {
                phone_number: clean12,
                captcha_key: key,
                captcha_result: Number(solved.answer),
              },
              headers: reqHeaders,
              sessionKey: clean12,
            },
          );

          this.logger.log(`📡 [OTP Urinish #${attempt}/8] +${clean12} | Captcha: ${solved.expression} => ${solved.answer} | HTTP Status: ${otpRes.status} | Javob: ${JSON.stringify(otpRes.data)}`);

          const isSuccess = (otpRes.status === 200 || otpRes.status === 201) && Boolean(otpRes.data?.otpKey || otpRes.data?.key || otpRes.data?.token);

          // DB ga har bir zapros va server javobini saqlab borish (rasm bilan birga)
          try {
            const imagePath = this.saveCaptchaImage(clean12, rawBuffer);
            await (this.prisma as any).systemApiLog.create({
              data: {
                action: 'SEND_OTP',
                phone: clean12,
                captchaKey: key,
                captchaExpr: solved.expression,
                captchaAns: Number(solved.answer),
                imagePath,
                httpStatus: otpRes.status,
                responseBody: JSON.stringify(otpRes.data),
                isSuccess,
                errorMessage: isSuccess ? null : (otpRes.data?.message || `HTTP ${otpRes.status}`),
              },
            });
          } catch (dbLogErr: any) {
            this.logger.warn(`SystemApiLog yozishda xato: ${dbLogErr.message}`);
          }

          if (isSuccess) {
            otpKey = otpRes.data?.otpKey || otpRes.data?.key || otpRes.data?.token;
            this.logger.log(`🎉 [Real OpenBudget API] SMS yuborildi (+${clean12}) (Urinish #${attempt}) | otpKey: ${otpKey}`);
            break;
          } else if (otpRes.data?.message) {
            lastError = otpRes.data.message;
            const errCode = otpRes.data?.invalid_args?.error_code || '';
            if (errCode === 'WRONG_CAPTCHA') {
              this.proxyManager.releaseSession(clean12);
              if (usedManualAnswer) {
                // Foydalanuvchining qo'lda kiritgan javobi xato chiqdi — yangi kaptchada
                // buni bildirib qayta so'raymiz ("❌ Xato javob berdingiz!").
                manualCaptchaRetryReason = 'wrong';
              }
            }
            if (errCode === 'USER_NOT_FOUND' || /топилмади|topilmadi|USER_NOT_FOUND/i.test(lastError || '')) {
              this.logger.log(`⚡ [Auto-Registration] +${clean12} OpenBudgetda topilmadi. Yangi kaptcha olinib /register/send-otp ga yo'naltirilmoqda...`);
              
              // 2-QADAM: Yangi fuqaro uchun YANGI toza Kaptcha olib ro'yxatdan o'tkazish (Ichki retry bilan)!
              for (let regAttempt = 1; regAttempt <= 5; regAttempt++) {
                try {
                  const regCapRes = await this.executeOpenBudgetCurl('https://openbudget.uz/api/v2/vote/captcha-2', {
                    headers: {
                      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                      'Accept': 'application/json, text/plain, */*',
                      'Origin': 'https://openbudget.uz',
                      'Referer': 'https://openbudget.uz/registration',
                      'Access-Captcha': this.generateAccessCaptcha(),
                    },
                    sessionKey: clean12,
                  });

                  const regKey = regCapRes.data?.captchaKey;

                  if (!regCapRes.data?.image || !regKey) {
                    this.logger.warn(`⚠️ [Auto-Reg Urinish #${regAttempt}] Rasm/kalit kelmadi, yangi urinishga o'tilmoqda...`);
                    continue;
                  }

                  const regBuffer = Buffer.from(regCapRes.data.image, 'base64');

                  // Avtomatik OCR vaqtincha O'CHIRILGAN - qayta yoqish uchun quyidagi qatorni
                  // izohdan chiqarish kifoya:
                  // let regSolved = await this.captchaSolver.solve(regBuffer);
                  let regSolved: { success: boolean; answer?: number; expression?: string; error?: string } = {
                    success: false,
                    error: 'Avtomatik OCR o\'chirilgan - faqat foydalanuvchi javobi kutilmoqda',
                  };
                  let usedManualRegAnswer = false;

                  // Ro'yxatdan o'tish uchun kaptchani ham HAR SAFAR foydalanuvchining o'ziga
                  // tasdiqlash uchun ko'rsatamiz (faqat 1 marta emas).
                  if (manualCaptchaResolver) {
                    const isRegRetry = manualRegCaptchaRetryReason === 'wrong';
                    manualRegCaptchaRetryReason = null;
                    const isFirstRegCaptcha = !hasShownFirstRegCaptcha;
                    hasShownFirstRegCaptcha = true;
                    // Har bir xabarda aniq "Ro'yxatdan o'tish" bosqichi ekanini aytamiz, shunda
                    // foydalanuvchi qaysi qadamda ekanini tushunadi. Birinchi marta - tabriklab
                    // qisqa izoh beramiz; keyingi urinishlarda (agar sabab xato captcha bo'lmasa,
                    // masalan server vaqtinchalik javob bermasa) shu bosqich davom etayotganini
                    // bildiramiz.
                    const regNote = !isRegRetry
                      ? (isFirstRegCaptcha
                          ? '📝 <b>Ro\'yxatdan o\'tish boshlandi!</b> Bu atigi ~10 soniya vaqt oladi.\n\n✅ Captcha javobingiz qabul qilindi. Yakunlash uchun yana bitta captchani yeching:'
                          : '📝 <b>Ro\'yxatdan o\'tish davom etmoqda...</b>\n\nQuyidagi yangi captchani yeching:')
                      : undefined;
                    try {
                      const manualRegAnswer = await manualCaptchaResolver(regBuffer, isRegRetry, regNote);
                      if (manualRegAnswer !== null && manualRegAnswer !== undefined && !Number.isNaN(manualRegAnswer)) {
                        regSolved = {
                          success: true,
                          answer: manualRegAnswer,
                          expression: 'manual',
                        } as any;
                        usedManualRegAnswer = true;
                      }
                    } catch (manualRegErr: any) {
                      this.logger.warn(`Foydalanuvchi ro'yxatdan o'tish kaptchasini yechishida xato: ${manualRegErr.message}`);
                    }
                  }

                  if (regSolved.success && regSolved.answer !== undefined) {
                    const regPayload = {
                      fullname: 'Fuqaro Ochiq Budjet',
                      birth_date: '1995-05-15',
                      phone_number: clean12,
                      gender: 'M',
                      region_id: 11,
                      district_id: 172,
                      captcha_key: regKey,
                      captcha_result: Number(regSolved.answer),
                    };

                    const regRes = await this.executeOpenBudgetCurl(
                      'https://openbudget.uz/api/v1/register/send-otp',
                      {
                        method: 'POST',
                        data: regPayload,
                        headers: reqHeaders,
                        sessionKey: clean12,
                      }
                    );

                    this.logger.log(`📡 [Auto-Reg Urinish #${regAttempt}/5] +${clean12} | Captcha: ${regSolved.expression} => ${regSolved.answer} | Status: ${regRes.status} | Javob: ${JSON.stringify(regRes.data)}`);

                    const regIsSuccess = regRes.status === 200 || regRes.status === 201 || Boolean(regRes.data?.otpKey);
                    await (this.prisma as any).systemApiLog?.create({
                      data: {
                        action: 'REGISTER_SEND_OTP',
                        phone: clean12,
                        captchaKey: regKey,
                        captchaExpr: regSolved.expression,
                        captchaAns: Number(regSolved.answer),
                        imagePath: this.saveCaptchaImage(clean12, regBuffer),
                        httpStatus: regRes.status,
                        responseBody: JSON.stringify(regRes.data),
                        isSuccess: regIsSuccess,
                        errorMessage: regIsSuccess ? null : (regRes.data?.message || `HTTP ${regRes.status}`),
                      },
                    }).catch(() => {});

                    if (regRes.status === 200 || regRes.status === 201 || regRes.data?.otpKey) {
                      const rawOtpKey = regRes.data?.otpKey || regRes.data?.key || `${Date.now()}`;
                      otpKey = `REG:${rawOtpKey}`;
                      this.logger.log(`🎉 [Auto-Registration SUCCESS] Yangi foydalanuvchiga SMS yuborildi (+${clean12}) | otpKey: ${otpKey}`);
                      break;
                    }

                    const regErrCode = regRes.data?.invalid_args?.error_code || '';
                    if (usedManualRegAnswer && (regErrCode === 'WRONG_CAPTCHA' || /captcha|kaptcha/i.test(regRes.data?.message || ''))) {
                      // Foydalanuvchining ro'yxatdan o'tish kaptchasiga javobi xato chiqdi — buni
                      // bildirib keyingi kaptchada qayta so'raymiz.
                      manualRegCaptchaRetryReason = 'wrong';
                    }

                    if (regRes.status === 500 || regRes.data?.type === 'INTERNAL') {
                      consecutiveRegServerErrors++;
                      if (consecutiveRegServerErrors >= MAX_CONSECUTIVE_REG_SERVER_ERRORS) {
                        this.logger.error(`🛑 [OpenBudget Server Xatosi] +${clean12}: registratsiya ketma-ket ${consecutiveRegServerErrors} marta "Internal server error" qaytardi (captcha bilan bog'liq emas) - to'xtatilmoqda.`);
                        return {
                          success: false,
                          error: 'Hozircha ovoz berish ishlamayapti. Iltimos, birozdan so\'ng qaytadan urinib ko\'ring.',
                          initiative,
                        };
                      }
                    } else {
                      consecutiveRegServerErrors = 0;
                    }
                  }
                } catch (regErr: any) {
                  this.logger.warn(`Auto-Registration urinish #${regAttempt} xatosi: ${regErr.message}`);
                }
              }

              if (otpKey) {
                break;
              }
            } else if (/mavsum|pasport|avval|allaqachon/i.test(lastError || '')) {
              this.logger.warn(`🛑 [OpenBudget Foydalanuvchi Xatosi] +${clean12}: ${lastError} (${errCode})`);
              return {
                success: false,
                error: this.translateOpenBudgetError(lastError || ''),
                initiative,
              };
            }
          }
        } catch (err: any) {
          this.proxyManager.releaseSession(clean12);
          if (err.message && /mavsum|pasport|avval|allaqachon/i.test(err.message)) {
            return {
              success: false,
              error: err.message,
              initiative,
            };
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

      const finalErrMsg = lastError || 'SMS kod yuborilmadi. Iltimos, qaytadan urinib ko\'ring.';
      this.logger.warn(`❌ [OpenBudget OTP Fail] +${clean12}: ${finalErrMsg}`);
      return {
        success: false,
        error: this.translateOpenBudgetError(finalErrMsg),
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
          const reqHeaders = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Origin': 'https://openbudget.uz',
            'Referer': 'https://openbudget.uz/',
          };

          const isRegSession = sessionId.startsWith('REG:');
          const realSessionId = isRegSession ? sessionId.replace(/^REG:/, '') : sessionId;

          let verifyRes: any;

          if (isRegSession) {
            // Ro'yxatdan o'tish orqali yuborilgan OTP uchun TO'G'RIDAN-TO'G'RI /register/verify-otp ga yuboramiz!
            verifyRes = await this.executeOpenBudgetCurl(
              'https://openbudget.uz/api/v1/register/verify-otp',
              {
                method: 'POST',
                data: {
                  phone_number: clean12,
                  otp_key: realSessionId,
                  otp_code: code,
                },
                headers: reqHeaders,
                sessionKey: clean12,
              },
            );
            this.logger.log(`📡 [/register/verify-otp DIRECT] +${clean12} Status: ${verifyRes.status} | Javob: ${JSON.stringify(verifyRes.data)}`);
          } else {
            // Standart login OTP uchun /login/verify-otp chaqiriladi
            verifyRes = await this.executeOpenBudgetCurl(
              'https://openbudget.uz/api/v1/login/verify-otp',
              {
                method: 'POST',
                data: {
                  phone_number: clean12,
                  otp_key: realSessionId,
                  otp_code: code,
                },
                headers: reqHeaders,
                sessionKey: clean12,
              },
            );

            this.logger.log(`📡 [/login/verify-otp] +${clean12} Status: ${verifyRes.status} | Javob: ${JSON.stringify(verifyRes.data)}`);

            // Agar login/verify-otp "account is inactive" yoki boshqa xato bersa, register/verify-otp bilan ham urinib ko'rish
            if (verifyRes.status !== 200 && verifyRes.status !== 201 && !verifyRes.data?.access_token && !verifyRes.data?.token) {
              try {
                const regVerifyRes = await this.executeOpenBudgetCurl(
                  'https://openbudget.uz/api/v1/register/verify-otp',
                  {
                    method: 'POST',
                    data: {
                      phone_number: clean12,
                      otp_key: realSessionId,
                      otp_code: code,
                    },
                    headers: reqHeaders,
                    sessionKey: clean12,
                  },
                );
                this.logger.log(`📡 [/register/verify-otp fallback] +${clean12} Status: ${regVerifyRes.status} | Javob: ${JSON.stringify(regVerifyRes.data)}`);
                if (regVerifyRes.status === 200 || regVerifyRes.status === 201 || regVerifyRes.data?.access_token || regVerifyRes.data?.token) {
                  verifyRes = regVerifyRes;
                }
              } catch (e: any) {
                this.logger.warn(`register/verify-otp fallback xatosi: ${e.message}`);
              }
            }
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
            const rawErrMsg = verifyRes.data?.message || 'SMS kod noto\'g\'ri kiritildi yoki muddati tugagan.';
            const isSessionDead = /session|muddati|expired|topilmadi|invalid|not found|key/i.test(rawErrMsg);
            if (isSessionDead) {
              this.proxyManager.releaseSession(clean12);
            }
            return {
              success: false,
              sessionExpired: isSessionDead,
              error: this.translateOpenBudgetError(rawErrMsg),
            };
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
      const openBudgetUrl = `https://openbudget.uz/boards/initiatives/initiative/${finalBoardId}/${initiativeUuid}`;

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
  async syncAllBotVotes(): Promise<{ success: boolean; updatedCount: number; results: any[] }> {
    try {
      const activeBots = await this.prisma.botInstance.findMany({
        where: { isActive: true },
      });

      this.logger.log(`🔄 [15-Min Live Vote Sync] Jami ${activeBots.length} ta faol bot ovozlari yangilanmoqda...`);
      const results = [];

      for (const bot of activeBots) {
        try {
          let uuid = bot.initiativeUuid;
          if (!uuid && bot.mahallaId) {
            const lRes = await this.lookupMahallaOrInitiative(bot.mahallaId);
            if (lRes.success && lRes.initiativeUuid) {
              uuid = lRes.initiativeUuid;
              await this.prisma.botInstance.update({
                where: { id: bot.id },
                data: { initiativeUuid: uuid, boardId: lRes.boardId },
              }).catch(() => {});
            }
          }

          let officialVotes = 0;
          let grantedAmount: bigint | undefined;

          if (uuid) {
            // 1. Jonli rasmiy ovozlar sonini olish (v2 count)
            try {
              const countRes = await this.proxyManager.requestWithRetry(async (client) => {
                return client.get(`https://new.openbudget.uz/api/v2/info/initiative/count/${uuid}`, {
                  timeout: 9000,
                });
              });
              if (countRes?.data && countRes.data.count !== undefined) {
                officialVotes = Number(countRes.data.count) || 0;
              }
            } catch (cErr) {}

            // 2. Loyiha ma'lumotlarini olish (v1 initiative)
            try {
              const res = await this.proxyManager.requestWithRetry(async (client) => {
                return client.get(`https://new.openbudget.uz/api/v1/initiatives/${uuid}`, {
                  timeout: 9000,
                });
              });
              if (res?.data?.granted_amount) {
                grantedAmount = BigInt(res.data.granted_amount);
              }
            } catch (iErr) {}

            await this.prisma.botInstance.update({
              where: { id: bot.id },
              data: {
                currentVotes: officialVotes,
                ...(grantedAmount ? { grantedAmount } : {}),
              },
            });

            // 3. To'liq rasmiy ovozlar ro'yxatini yuklash va keshga joylash (Auto-Approver uchun)
            try {
              const listRes = await this.fetchOfficialInitiativeVotesList(uuid, 0, 50000);
              if (listRes.success && listRes.totalElements > 0) {
                this.logger.log(`📋 [Full Official Registry] ${bot.mahallaName}: Jami ${listRes.totalElements} ta rasmiy ovoz ro'yxati xotiraga saqlandi.`);
              }
            } catch (lErr: any) {
              this.logger.debug(`Full registry fetch attempt error: ${lErr.message}`);
            }
            
            this.logger.log(`🔄 [Sync Bot Votes] ${bot.mahallaName}: OpenBudget rasmiy jonli ovozlari = ${officialVotes} ta`);
          }

          results.push({
            botId: bot.id,
            mahallaName: bot.mahallaName,
            openBudgetVotes: officialVotes,
          });
        } catch (botSyncErr: any) {
          this.logger.warn(`Bot #${bot.id} (${bot.mahallaName}) ovozlarini sinxronlashda xatolik: ${botSyncErr.message}`);
        }
      }

      this.logger.log(`✅ [15-Min Live Vote Sync] ${results.length}/${activeBots.length} ta bot ovozlari yangilandi.`);
      return { success: true, updatedCount: results.length, results };
    } catch (e: any) {
      this.logger.error('Vote sync error:', e);
      return { success: false, updatedCount: 0, results: [] };
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

  // In-memory initiative token cache (initiativeUuid -> { token, expiresAt })
  private initiativeTokenCache = new Map<string, { token: string; expiresAt: number }>();
  private captchaSessionMap = new Map<string, { cookies: string; sessionKey: string; page?: any }>();
  private initiativeVotesListCache = new Map<string, { votes: any[]; totalElements: number; totalPages: number; fetchedAt: number }>();
  // Har bir prewarm siklidan keyin HAQIQIY qamrov holatini saqlaydi (UI'da
  // ko'rsatish uchun) — chunki cheklov (rate-limit) tufayli erta to'xtagan
  // holatda kesh "3 soat qamrab olindi" deb NOTO'G'RI da'vo qilmasligi kerak.
  private prewarmStatus = new Map<string, { cachedPages: number; totalPages: number; coverageMinutes: number; reachedFullCutoff: boolean; finishedAt: number }>();

  getPrewarmStatus(initiativeUuid: string) {
    return this.prewarmStatus.get(initiativeUuid) || null;
  }

  // 🌐 Haqiqiy Chrome brauzer orqali OpenBudget WAF/anti-bot himoyasidan o'tish uchun (headless)
  private headlessBrowser: any = null;

  // Headless brauzer qaysi proxy bilan ishga tushirilganini eslab qolish (yangi sahifada auth uchun)
  private headlessProxyAuth: { username: string; password: string } | null = null;

  private async getHeadlessBrowser(): Promise<any> {
    if (this.headlessBrowser && this.headlessBrowser.isConnected()) {
      return this.headlessBrowser;
    }
    const puppeteer = require('puppeteer-core');
    const executablePath =
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      this.configService.get<string>('puppeteer.executablePath') ||
      '/usr/bin/chromium-browser';

    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ];

    // Server IP'sining o'zi OpenBudget tomonidan bloklangani uchun, headless brauzer
    // ham (agar mavjud bo'lsa) proxy hovuzidagi IP orqali ishga tushiriladi.
    const proxy = this.proxyManager.getNextProxy();
    this.headlessProxyAuth = null;
    if (proxy) {
      args.push(`--proxy-server=${proxy.protocol.startsWith('socks') ? proxy.protocol : 'http'}://${proxy.host}:${proxy.port}`);
      if (proxy.auth?.username) {
        this.headlessProxyAuth = { username: proxy.auth.username, password: proxy.auth.password || '' };
      }
    }

    this.headlessBrowser = await puppeteer.launch({
      executablePath,
      headless: true,
      args,
    });
    return this.headlessBrowser;
  }

  private async newHeadlessPage(browser: any): Promise<any> {
    const page = await browser.newPage();
    if (this.headlessProxyAuth) {
      await page.authenticate(this.headlessProxyAuth);
    }
    return page;
  }

  /**
   * Rotating proxy IP so'rov davomida almashib qolganda (ERR_NETWORK_CHANGED)
   * brauzerni butunlay yopib, keyingi urinishda yangi proxy bilan qayta ochish uchun.
   */
  private async restartHeadlessBrowser(): Promise<void> {
    try {
      if (this.headlessBrowser) await this.headlessBrowser.close().catch(() => {});
    } finally {
      this.headlessBrowser = null;
    }
  }

  /**
   * 🌐 Bitta headless sahifa/navigatsiya doirasida OCR bilan captcha'ni bir necha marta
   * urinib avtomatik yechadi va tokenni qaytaradi. Har bir urinishda YANGI sahifa/
   * navigatsiya OCHMAYDI (faqat fetch() qayta chaqiradi) — shu bilan CPU sarfini va
   * botning asosiy event loop'ini bloklab qo'yish xavfini keskin kamaytiradi.
   */
  private async solveInitiativeTokenHeadless(
    initiativeUuid: string,
    maxAttempts: number = 6,
  ): Promise<{ success: boolean; token?: string; error?: string }> {
    let page: any;
    try {
      const browser = await this.getHeadlessBrowser();
      page = await this.newHeadlessPage(browser);
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      );
      await page.goto(
        `https://new.openbudget.uz/uz/initiative-budget/active-initiatives/55/${initiativeUuid}`,
        { waitUntil: 'domcontentloaded', timeout: 20000 },
      );

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const capResult = await page.evaluate(async () => {
            const res = await fetch('/api/v2/vote/captcha-2', {
              headers: { hl: 'uz_lat' },
              credentials: 'include',
            });
            return res.json();
          });
          if (!capResult?.image || !capResult?.captchaKey) continue;

          const solveRes = await this.captchaSolver.solve(capResult.image);
          if (!solveRes.success || solveRes.answer === undefined) continue;
          const numAns = typeof solveRes.answer === 'number' ? solveRes.answer : parseInt(String(solveRes.answer), 10);
          if (isNaN(numAns)) continue;

          const submitResult = await page.evaluate(
            async (uuid: string, key: string, ans: number) => {
              const res = await fetch('/api/v2/info/get-initiative-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ captchaKey: key, captchaResult: ans, initiativeId: uuid }),
              });
              return res.json();
            },
            initiativeUuid,
            capResult.captchaKey,
            numAns,
          );

          if (submitResult?.token) {
            this.logger.log(`🎉 [Headless Auto-OCR] Muvaffaqiyatli yechildi (${attempt}-urinish): ${solveRes.expression} = ${solveRes.answer}`);
            this.initiativeTokenCache.set(initiativeUuid, {
              token: submitResult.token,
              expiresAt: Date.now() + 60 * 60 * 1000,
            });
            await page.close().catch(() => {});
            return { success: true, token: submitResult.token };
          }
        } catch (attemptErr: any) {
          this.logger.debug(`Headless auto-solver attempt #${attempt} error: ${attemptErr.message}`);
        }
      }

      await page.close().catch(() => {});
      return { success: false, error: 'OpenBudget token olinmadi (barcha urinishlar tugadi)' };
    } catch (e: any) {
      if (page) await page.close().catch(() => {});
      this.logger.error(`❌ [Headless Auto-OCR] Xatolik: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  /**
   * 🌐 Headless Chrome orqali OpenBudget'ning haqiqiy brauzer-fingerprint himoyasidan
   * (WAF) muvaffaqiyatli o'tib, captcha rasmini olib beradi. Sahifa keyinchalik
   * submitOfficialInitiativeCaptcha'da xuddi shu sessiyani (cookie/fingerprint) davom
   * ettirish uchun captchaSessionMap'da saqlanadi.
   */
  private async getOfficialInitiativeCaptchaHeadless(
    initiativeUuid: string,
  ): Promise<{ success: boolean; captchaKey?: string; image?: string; error?: string }> {
    // Rotating proxy IP so'rov o'rtasida almashib qolishi (ERR_NETWORK_CHANGED va
    // shunga o'xshash tarmoq xatolari) mumkin — bunday hollarda brauzerni yangi
    // proxy bilan qayta ishga tushirib, 1 marta qayta urinamiz.
    for (let attempt = 1; attempt <= 2; attempt++) {
      let page: any;
      try {
        const browser = await this.getHeadlessBrowser();
        page = await this.newHeadlessPage(browser);
        await page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        );
        await page.goto(
          `https://new.openbudget.uz/uz/initiative-budget/active-initiatives/55/${initiativeUuid}`,
          { waitUntil: 'domcontentloaded', timeout: 20000 },
        );

        const result = await page.evaluate(async () => {
          const res = await fetch('/api/v2/vote/captcha-2', {
            headers: { hl: 'uz_lat' },
            credentials: 'include',
          });
          const data = await res.json();
          return { status: res.status, data };
        });

        if (result?.data?.image && result?.data?.captchaKey) {
          const captchaKey = result.data.captchaKey;
          this.captchaSessionMap.set(captchaKey, { cookies: '', sessionKey: '', page });
          return { success: true, captchaKey, image: result.data.image };
        }

        await page.close().catch(() => {});
        return { success: false, error: "Headless captcha olinmadi" };
      } catch (e: any) {
        if (page) await page.close().catch(() => {});
        const isNetworkGlitch = /ERR_NETWORK_CHANGED|ERR_CONNECTION|ERR_PROXY|net::/.test(e.message || '');
        if (isNetworkGlitch && attempt < 2) {
          this.logger.warn(`⚠️ [Headless captcha] Tarmoq xatosi (${e.message}), yangi proxy bilan qayta urinilmoqda...`);
          await this.restartHeadlessBrowser();
          continue;
        }
        return { success: false, error: e.message };
      }
    }
    return { success: false, error: 'Captcha olinmadi (qayta urinishlardan keyin ham)' };
  }

  /**
   * 🌐 Headless Chrome orqali (real fingerprint bilan) ovozlar ro'yxatini olish.
   */
  private async fetchVotesListHeadless(
    initiativeUuid: string,
    initToken: string,
    page: number,
    size: number,
  ): Promise<{ content: any[]; totalElements: number; totalPages: number } | null> {
    let browserPage: any;
    try {
      const browser = await this.getHeadlessBrowser();
      browserPage = await this.newHeadlessPage(browser);
      await browserPage.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      );
      await browserPage.goto(
        `https://new.openbudget.uz/uz/initiative-budget/active-initiatives/55/${initiativeUuid}`,
        { waitUntil: 'domcontentloaded', timeout: 20000 },
      );

      const result = await browserPage.evaluate(
        async (token: string, p: number, s: number) => {
          const url = `/api/v2/info/votes/${token}?page=${p}&size=${s}&limit=${s}`;
          try {
            const res = await fetch(url, { credentials: 'include' });
            if (!res.ok) return { status: res.status, data: null };
            const text = await res.text();
            if (!text || !text.trim()) return { status: res.status, data: null };
            return { status: res.status, data: JSON.parse(text) };
          } catch (e) {
            return { status: 0, data: null };
          }
        },
        initToken,
        page,
        size,
      );

      await browserPage.close().catch(() => {});

      if (result?.data) {
        return {
          content: result.data.content || [],
          totalElements: result.data.totalElements || (result.data.content || []).length,
          totalPages: result.data.totalPages || 1,
        };
      } else {
        this.initiativeTokenCache.delete(initiativeUuid);
      }
      return null;
    } catch (e: any) {
      if (browserPage) await browserPage.close().catch(() => {});
      this.logger.error(`❌ [Headless votes fetch] Xatolik: ${e.message}`);
      return null;
    }
  }

  /**
   * 🔎 Telefon raqamining oxirgi (ko'rinadigan) raqamlari bo'yicha OpenBudget rasmiy
   * ro'yxatining BARCHA sahifalari bo'ylab qidiradi. OpenBudget bir so'rovda faqat
   * o'zining kichik sahifasini (~12-15 ta) qaytargani uchun, admin panel qidiruvi
   * to'liq ro'yxatni topishi uchun shu funksiya kerak — bitta headless sahifa/
   * navigatsiya doirasida, ketma-ket fetch() chaqiruvlari bilan.
   */
  async searchOfficialVotesByTail(
    initiativeUuid: string,
    tailDigits: string,
    maxPages: number = 140,
  ): Promise<{ success: boolean; matches: any[]; scannedPages: number; totalPages: number; error?: string }> {
    if (!tailDigits) return { success: false, matches: [], scannedPages: 0, totalPages: 0, error: "Qidiruv matni bo'sh" };

    let initToken = '';
    const cached = this.initiativeTokenCache.get(initiativeUuid);
    if (cached && cached.expiresAt > Date.now()) {
      initToken = cached.token;
    }
    if (!initToken) {
      const solved = await this.solveInitiativeTokenHeadless(initiativeUuid, 6);
      if (solved.success && solved.token) initToken = solved.token;
    }
    if (!initToken) {
      return { success: false, matches: [], scannedPages: 0, totalPages: 0, error: 'OpenBudget token olinmadi' };
    }

    let browserPage: any;
    try {
      const browser = await this.getHeadlessBrowser();
      browserPage = await this.newHeadlessPage(browser);
      await browserPage.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      );
      await browserPage.goto(
        `https://new.openbudget.uz/uz/initiative-budget/active-initiatives/55/${initiativeUuid}`,
        { waitUntil: 'domcontentloaded', timeout: 20000 },
      );

      const matches: any[] = [];
      // Haqiqiy totalPages birinchi muvaffaqiyatli javobdan aniqlanguncha, maxPages'gacha
      // urinib ko'riladi (aks holda 1-sahifa vaqtincha xato bersa, qidiruv darhol to'xtab qolardi).
      let totalPages = maxPages;

      for (let p = 0; p < maxPages && p < totalPages; p++) {
        let result: any = null;
        // Vaqtinchalik (WAF/tarmoq) xatoliklarda shu sahifani 2 marta qayta urinib ko'rish
        for (let retry = 0; retry < 2 && !result; retry++) {
          try {
            result = await browserPage.evaluate(
              async (token: string, page: number) => {
                const res = await fetch(`/api/v2/info/votes/${token}?page=${page}&size=15&limit=15`, { credentials: 'include' });
                const text = await res.text();
                if (!text) return null;
                try { return JSON.parse(text); } catch { return null; }
              },
              initToken,
              p,
            );
          } catch {
            result = null;
          }
          if (!result) await new Promise((r) => setTimeout(r, 300));
        }
        if (!result) continue; // shu sahifa o'tkazib yuboriladi, qidiruv davom etadi
        totalPages = result.totalPages || totalPages;
        const content = result.content || [];
        for (const v of content) {
          const digits = String(v.phoneNumber || '').replace(/\D/g, '');
          const len = Math.min(tailDigits.length, digits.length);
          if (len > 0 && digits.slice(-len) === tailDigits.slice(-len)) {
            matches.push(v);
          }
        }
        if (matches.length > 0) break; // topilgach darhol to'xtaydi
      }

      await browserPage.close().catch(() => {});
      return { success: true, matches, scannedPages: Math.min(maxPages, totalPages), totalPages };
    } catch (e: any) {
      if (browserPage) await browserPage.close().catch(() => {});
      this.logger.error(`❌ [Headless votes search] Xatolik: ${e.message}`);
      return { success: false, matches: [], scannedPages: 0, totalPages: 0, error: e.message };
    }
  }

  /**
   * 🔄 OpenBudget rasmiy ro'yxatining BARCHA sahifalarini fon rejimida oldindan
   * yuklab, har biri alohida 30 daqiqalik keshga saqlaydi. Shu tufayli admin panel
   * ochilganda yoki qidiruv qilinganda ma'lumot deyarli bir zumda (keshdan) chiqadi —
   * uzoq (real vaqtli) kutish faqat shu fon jarayonining o'zida bo'ladi.
   */
  async prewarmOfficialVotesCache(initiativeUuid: string, maxPages: number = 230): Promise<void> {
    let initToken = '';
    const cached = this.initiativeTokenCache.get(initiativeUuid);
    if (cached && cached.expiresAt > Date.now()) {
      initToken = cached.token;
    } else {
      const solved = await this.solveInitiativeTokenHeadless(initiativeUuid, 6);
      if (solved.success && solved.token) initToken = solved.token;
    }
    if (!initToken) {
      this.logger.warn('⚠️ [Prewarm] Token olinmadi, kesh yangilanmadi.');
      return;
    }

    let browserPage: any;
    try {
      const browser = await this.getHeadlessBrowser();
      browserPage = await this.newHeadlessPage(browser);
      await browserPage.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      );
      await browserPage.goto(
        `https://new.openbudget.uz/uz/initiative-budget/active-initiatives/55/${initiativeUuid}`,
        { waitUntil: 'domcontentloaded', timeout: 20000 },
      );

      let totalPages = maxPages;
      let cachedCount = 0;
      let consecutiveFailures = 0;
      let tokenRefreshesUsed = 0;
      let oldestCoveredTs: number | null = null;
      let reachedFullCutoff = false;
      const MAX_TOKEN_REFRESHES = 15; // 215 sahifa / ~20 tadan ~11 marta yangilash kifoya, zaxira bilan

      for (let p = 0; p < maxPages && p < totalPages; p++) {
        let result: any = null;
        for (let retry = 0; retry < 2 && !result; retry++) {
          try {
            result = await browserPage.evaluate(
              async (token: string, page: number) => {
                const res = await fetch(`/api/v2/info/votes/${token}?page=${page}&size=15&limit=15`, { credentials: 'include' });
                const text = await res.text();
                if (!text) return null;
                try { return JSON.parse(text); } catch { return null; }
              },
              initToken,
              p,
            );
          } catch {
            result = null;
          }
          if (!result) await new Promise((r) => setTimeout(r, 300));
        }
        if (!result) {
          consecutiveFailures++;
          this.logger.debug(`⚠️ [Prewarm] Sahifa ${p} bo'sh javob qaytardi (ketma-ket ${consecutiveFailures}-marta).`);
          // ANIQLANDI (tajriba bilan): bu na vaqt-asosidagi cheklov (80s kutish
          // yordam bermadi), na token-asosidagi cheklov (yangi token olish ham
          // yordam bermadi — chunki eski token bilan ishlagan headless brauzer
          // O'SHA proxy ulanishini/IP'ni davom ettiraveradi, faqat --proxy-server
          // argumenti bilan BIR MARTA ishga tushirilgani uchun). Demak bu haqiqatan
          // ham IP-asosidagi cheklov. Yechim: butun headless brauzerni yangi proxy
          // IP bilan qayta ishga tushirish, so'ng yangi sahifa+token olish.
          if (consecutiveFailures >= 6) {
            if (tokenRefreshesUsed < MAX_TOKEN_REFRESHES) {
              tokenRefreshesUsed++;
              this.logger.warn(`🔄 [Prewarm] IP/token ${consecutiveFailures} marta ketma-ket bo'sh javob berdi — brauzer yangi proxy IP bilan qayta ishga tushirilmoqda (${tokenRefreshesUsed}/${MAX_TOKEN_REFRESHES}), so'ng ${p}-sahifadan davom etiladi...`);
              await this.restartHeadlessBrowser();
              await browserPage.close().catch(() => {});
              const solved = await this.solveInitiativeTokenHeadless(initiativeUuid, 6);
              if (solved.success && solved.token) {
                initToken = solved.token;
                const newBrowser = await this.getHeadlessBrowser();
                browserPage = await this.newHeadlessPage(newBrowser);
                await browserPage.setUserAgent(
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                );
                await browserPage.goto(
                  `https://new.openbudget.uz/uz/initiative-budget/active-initiatives/55/${initiativeUuid}`,
                  { waitUntil: 'domcontentloaded', timeout: 20000 },
                );
                consecutiveFailures = 0;
                p--; // shu sahifani yangi IP/token bilan qayta urinish uchun
                continue;
              }
              this.logger.warn(`⚠️ [Prewarm] Yangi IP/token olinmadi, to'xtatilmoqda (${cachedCount} sahifa keshlandi).`);
              break;
            }
            this.logger.warn(`⚠️ [Prewarm] IP/token yangilash limiti tugadi — to'xtatilmoqda (${cachedCount} sahifa keshlandi).`);
            break;
          }
          continue;
        }
        consecutiveFailures = 0;
        totalPages = result.totalPages || totalPages;
        this.initiativeVotesListCache.set(`${initiativeUuid}_p${p}`, {
          votes: result.content || [],
          totalElements: result.totalElements || 0,
          totalPages,
          fetchedAt: Date.now(),
        });
        cachedCount++;

        // AQLLI TO'XTASH: ro'yxat eng yangisidan eskisiga tartiblangan (yangi
        // ovoz — birinchi qatorda). Ovozlar tasdiqlanishi o'rtacha ~2 soat
        // davom etadi, shuning uchun tekshiruv/qidiruv uchun kamida shu
        // muddatdan ortiqroq (3 soat) qamrov kerak — bundan qisqaroq chegara
        // hali tasdiqlanmagan ovozlarni ko'rsatmay qoldirishi mumkin edi.
        const content = result.content || [];
        const oldestInPage = content[content.length - 1];
        if (oldestInPage?.voteDate) {
          const formattedDateStr = String(oldestInPage.voteDate).includes('+')
            ? oldestInPage.voteDate
            : String(oldestInPage.voteDate).replace(' ', 'T') + '+05:00';
          const oldestTs = new Date(formattedDateStr).getTime();
          if (!isNaN(oldestTs)) oldestCoveredTs = oldestTs;
          const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
          if (!isNaN(oldestTs) && Date.now() - oldestTs > THREE_HOURS_MS) {
            this.logger.log(`⏹ [Prewarm] Sahifa ${p}dagi eng eski ovoz 3 soatdan eski (${oldestInPage.voteDate}) — bu yerda to'xtatilmoqda (keyingisi kerak emas).`);
            reachedFullCutoff = true;
            break;
          }
        }

        // Har sahifadan keyin kichik pauza — so'rov tezligini pasaytirib,
        // OpenBudget'ning tezlik-asosidagi cheklovidan qochish uchun.
        await new Promise((r) => setTimeout(r, 700));
      }

      await browserPage.close().catch(() => {});

      // MUHIM: bu yerda "3 soat qamrab olindi" deb hech qachon QOTIB QOLGAN
      // (hardcoded) matn yozilmaydi — chunki agar tsikl vaqt-chegarasiga
      // yetmasdan (masalan IP/limit tugab) erta to'xtagan bo'lsa, bu HAQIQATDA
      // qamrab olingan muddat 3 soatdan ANCHA KAM bo'lishi mumkin. Shuning uchun
      // haqiqiy qamrov (oldestCoveredTs orqali) hisoblanadi va admin panelga
      // ko'rsatish uchun saqlanadi.
      const coverageMinutes = oldestCoveredTs ? Math.round((Date.now() - oldestCoveredTs) / 60000) : 0;
      this.prewarmStatus.set(initiativeUuid, {
        cachedPages: cachedCount,
        totalPages,
        coverageMinutes,
        reachedFullCutoff,
        finishedAt: Date.now(),
      });

      if (reachedFullCutoff) {
        this.logger.log(`✅ [Prewarm] OpenBudget ro'yxati keshlandi: ${cachedCount}/${totalPages} sahifa (so'nggi ~3 soat to'liq qamrab olindi).`);
      } else {
        this.logger.warn(`⚠️ [Prewarm] TO'LIQ EMAS: ${cachedCount}/${totalPages} sahifa keshlandi, lekin faqat so'nggi ~${coverageMinutes} daqiqa qamrab olindi (limit/tarmoq tufayli erta to'xtadi).`);
      }
    } catch (e: any) {
      if (browserPage) await browserPage.close().catch(() => {});
      this.logger.error(`❌ [Prewarm] Xatolik: ${e.message}`);
    }
  }

  /**
   * 🌐 Headless Chrome sahifasi orqali (aynan shu fingerprint/cookie sessiyasi bilan)
   * captcha javobini yuborish va tashabbus tokenini olish.
   */
  private async submitOfficialInitiativeCaptchaHeadless(
    initiativeUuid: string,
    captchaKey: string,
    captchaResult: number,
  ): Promise<{ success: boolean; token?: string; error?: string }> {
    const sessionData = this.captchaSessionMap.get(captchaKey);
    const page = sessionData?.page;
    if (!page) {
      return { success: false, error: 'Headless sessiya topilmadi (captcha muddati tugagan)' };
    }

    try {
      const result = await page.evaluate(
        async (uuid: string, key: string, ans: number) => {
          const res = await fetch('/api/v2/info/get-initiative-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ captchaKey: key, captchaResult: ans, initiativeId: uuid }),
          });
          const data = await res.json();
          return { status: res.status, data };
        },
        initiativeUuid,
        captchaKey,
        captchaResult,
      );

      await page.close().catch(() => {});
      this.captchaSessionMap.delete(captchaKey);

      if (result?.data?.token) {
        const token = result.data.token;
        this.initiativeTokenCache.set(initiativeUuid, {
          token,
          expiresAt: Date.now() + 60 * 60 * 1000,
        });
        return { success: true, token };
      }

      this.logger.warn(`⚠️ [Headless submit] Token yo'q: ${JSON.stringify(result?.data)}`);
      return { success: false, error: result?.data?.message || "Captcha noto'g'ri" };
    } catch (e: any) {
      if (page) await page.close().catch(() => {});
      this.captchaSessionMap.delete(captchaKey);
      this.logger.error(`❌ [Headless submit] Xatolik: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  private getAccessCaptchaHeader(t: number = 12): string {
    const a = (top: number = 10, bot: number = 5) => Math.floor(Math.random() * (top - bot) + bot);
    const raw = `s${a(-3) * t}e${a(2, 19) * t}k${a(10, 5) * t}r${a(10, 4) * t}e${a(10, 220)}t`;
    return Buffer.from(raw).toString('base64');
  }

  /**
   * 📋 OpenBudget Rasmiy Saytidan Ovozlar Ro'yxatini olish.
   *
   * MUHIM: OpenBudget'ning o'zi `size` parametrini e'tiborga olmaydi va har doim
   * o'zining belgilangan sahifa hajmini (odatda ~12-15 ta) qaytaradi — `size=50000`
   * so'rasak ham. Shuning uchun "bittada hammasini olib, keshlab, o'zimiz bo'lib
   * beramiz" degan avvalgi yondashuv har doim faqat 1-sahifani "to'liq ro'yxat" deb
   * noto'g'ri keshlab qo'yardi (qidiruv va pagination shu tufayli ishlamasdi).
   * Endi har so'ralgan `page` haqiqatan OpenBudget'ning shu sahifasidan olinadi.
   */
  async fetchOfficialInitiativeVotesList(
    initiativeUuid: string,
    page: number = 0,
    size: number = 15,
    forceRefresh: boolean = false,
  ): Promise<{ success: boolean; totalElements: number; totalPages: number; page: number; content: any[]; error?: string }> {
    try {
      const cacheKey = `${initiativeUuid}_p${page}`;
      const cachedPage = this.initiativeVotesListCache.get(cacheKey);
      const cacheTtl = page === 0 ? 10 * 1000 : 2 * 60 * 1000;
      if (!forceRefresh && cachedPage && Date.now() - cachedPage.fetchedAt < cacheTtl) {
        return {
          success: true,
          totalElements: cachedPage.totalElements,
          totalPages: cachedPage.totalPages,
          page,
          content: cachedPage.votes,
        };
      }

      let initToken = '';
      const cached = this.initiativeTokenCache.get(initiativeUuid);
      if (cached && cached.expiresAt > Date.now()) {
        initToken = cached.token;
      }

      // Agar token bo'lmasa, headless Chrome + OCR orqali avtomatik yechish
      // (bitta sahifa/navigatsiya doirasida, botning asosiy jarayonini bloklamaslik uchun)
      if (!initToken) {
        const solved = await this.solveInitiativeTokenHeadless(initiativeUuid, 6);
        if (solved.success && solved.token) {
          initToken = solved.token;
        }
      }

      if (!initToken) {
        return { success: false, totalElements: 0, totalPages: 0, page, content: [], error: 'OpenBudget token olinmadi' };
      }

      // OpenBudget WAF'i oddiy so'rovlarni bloklagani uchun headless brauzer ishlatiladi.
      // Haqiqiy so'ralgan sahifa (page) va hajm (size) to'g'ridan-to'g'ri uzatiladi.
      const votesData = await this.fetchVotesListHeadless(initiativeUuid, initToken, page, size);

      if (votesData) {
        const content = votesData.content || [];
        const totalElements = votesData.totalElements || content.length;
        const totalPages = votesData.totalPages || 1;

        this.initiativeVotesListCache.set(cacheKey, {
          votes: content,
          totalElements,
          totalPages,
          fetchedAt: Date.now(),
        });

        return { success: true, totalElements, totalPages, page, content };
      }

      return { success: false, totalElements: 0, totalPages: 0, page, content: [] };
    } catch (err: any) {
      this.logger.error(`fetchOfficialInitiativeVotesList error: ${err.message}`);
      return { success: false, totalElements: 0, totalPages: 0, page, content: [], error: err.message };
    }
  }

  /**
   * 🖼 OpenBudget Captcha olish (Rasmiy ro'yxatni ochish uchun)
   */
  async getOfficialInitiativeCaptcha(initiativeUuid?: string): Promise<{ success: boolean; captchaKey?: string; image?: string; error?: string }> {
    // OpenBudget WAF'i oddiy HTTP so'rovlarni (proxy/axios) bloklagani uchun (PAYMENT_REQUIRED),
    // haqiqiy Chrome fingerprint bilan headless brauzer orqali olinadi.
    return this.getOfficialInitiativeCaptchaHeadless(initiativeUuid || 'b8752aa2-e6da-470c-8a26-52d5b594526a');
  }

  /**
   * 🔓 OpenBudget Captcha Javobini Yuborish va Ovozlar Ro'yxati Tokenini Keshga Saqlash
   */
  async submitOfficialInitiativeCaptcha(
    initiativeUuid: string,
    captchaKey: string,
    captchaResult: number,
  ): Promise<{ success: boolean; token?: string; error?: string }> {
    const numAns = typeof captchaResult === 'number' ? captchaResult : parseInt(String(captchaResult), 10);
    if (isNaN(numAns) || !Number.isFinite(numAns)) {
      return { success: false, error: "Noto'g'ri captcha javobi (Raqam emas)" };
    }
    // OpenBudget WAF'i oddiy HTTP so'rovlarni bloklagani uchun (PAYMENT_REQUIRED),
    // captcha aynan qaysi headless sahifada olingan bo'lsa, o'sha sessiyada yuboriladi.
    return this.submitOfficialInitiativeCaptchaHeadless(initiativeUuid, captchaKey, numAns);
  }
}
