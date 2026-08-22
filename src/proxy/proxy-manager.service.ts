import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as http from 'http';
import * as https from 'https';
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

export interface ProxyItem {
  url: string;
  protocol: 'http' | 'https' | 'socks5' | 'socks4';
  host: string;
  port: number;
  auth?: { username: string; password?: string };
  isAlive: boolean;
  lastCheckedAt?: Date;
  latencyMs?: number;
  failCount: number;
}

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

@Injectable()
export class ProxyManagerService implements OnModuleInit {
  private readonly logger = new Logger(ProxyManagerService.name);
  private proxyPool: ProxyItem[] = [];
  private currentIndex = 0;
  private isEnabled = false;

  // Sticky Session kesh: sessionKey (masalan: telefon raqam) -> ProxyItem
  private sessionMap = new Map<string, { proxy: ProxyItem; expiresAt: number }>();
  private readonly DEFAULT_SESSION_TTL_MS = 20 * 60 * 1000; // 20 daqiqa

  constructor(private readonly configService: ConfigService) {
    // Har 5 daqiqada muddati o'tgan sticky sessiyalarni tozalash
    setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000);
  }

  onModuleInit() {
    this.loadProxies();
  }

  /**
   * Konfiguratsiyadan proxylarni yuklash
   */
  public loadProxies() {
    this.isEnabled = this.configService.get<boolean>('proxy.enabled') || process.env.PROXY_ENABLED === 'true';
    const proxyListStr = this.configService.get<string>('proxy.list') || process.env.PROXY_LIST || '';

    if (!proxyListStr.trim()) {
      this.proxyPool = [];
      if (this.isEnabled) {
        this.logger.warn('⚠️ Proxy yoqilgan, lekin PROXY_LIST bo\'sh.');
      }
      return;
    }

    const rawList = proxyListStr.split(',').map((p) => p.trim()).filter(Boolean);
    this.proxyPool = rawList.map((p) => this.parseProxyUrl(p)).filter((item): item is ProxyItem => item !== null);

    this.logger.log(`🛡 Jami ${this.proxyPool.length} ta proxy muvaffaqiyatli yuklandi (Holati: ${this.isEnabled ? 'FAOL' : 'O\'CHIRILGAN'})`);
  }

  /**
   * Proxy URL matnini obyektga aylantirish
   */
  public parseProxyUrl(rawUrl: string): ProxyItem | null {
    try {
      let formatted = rawUrl.trim();
      if (!formatted.includes('://')) {
        formatted = `http://${formatted}`;
      }

      const parsed = new URL(formatted);
      const protocol = (parsed.protocol.replace(':', '') || 'http') as any;

      let auth: { username: string; password?: string } | undefined;
      if (parsed.username) {
        auth = {
          username: decodeURIComponent(parsed.username),
          password: decodeURIComponent(parsed.password || ''),
        };
      }

      return {
        url: rawUrl,
        protocol: ['http', 'https', 'socks5', 'socks4'].includes(protocol) ? protocol : 'http',
        host: parsed.hostname,
        port: parseInt(parsed.port, 10) || 8080,
        auth,
        isAlive: true,
        failCount: 0,
      };
    } catch (e) {
      this.logger.error(`Noto'g'ri proxy formati: "${rawUrl}"`, e);
      return null;
    }
  }

  /**
   * Navbatdagi faol proxyni olish (Round-robin + Auto-Failover)
   */
  public getNextProxy(): ProxyItem | null {
    if (!this.isEnabled || this.proxyPool.length === 0) return null;

    const aliveProxies = this.proxyPool.filter((p) => p.isAlive);
    if (aliveProxies.length === 0) {
      // Agar barcha proxylar vaqtincha nofaol deb belgilangan bo'lsa, ularga ikkinchi imkoniyat beramiz
      this.logger.warn('⚠️ Barcha proxylar nofaol deb belgilangan. Hovuz qayta tiklanmoqda...');
      this.proxyPool.forEach((p) => { p.isAlive = true; p.failCount = 0; });
      return this.proxyPool[0] || null;
    }

    const proxy = aliveProxies[this.currentIndex % aliveProxies.length];
    this.currentIndex = (this.currentIndex + 1) % aliveProxies.length;
    return proxy;
  }

  /**
   * Sticky Session: Bitta telefon raqami uchun butun ovoz berish jarayonida bir xil IP ni ushlab turish
   */
  public getStickyProxy(sessionKey: string): ProxyItem | null {
    if (!this.isEnabled || this.proxyPool.length === 0) return null;

    const now = Date.now();
    const existing = this.sessionMap.get(sessionKey);
    if (existing && existing.expiresAt > now && existing.proxy.isAlive) {
      // Sessiya muddatini yangilash
      existing.expiresAt = now + this.DEFAULT_SESSION_TTL_MS;
      return existing.proxy;
    }

    // Yangi proxy tanlash va sticky keshga biriktirish
    const newProxy = this.getNextProxy();
    if (newProxy) {
      this.sessionMap.set(sessionKey, {
        proxy: newProxy,
        expiresAt: now + this.DEFAULT_SESSION_TTL_MS,
      });
    }
    return newProxy;
  }

  /**
   * Sessiya yakunlanganda sticky bog'lanishni bo'shatish
   */
  public releaseSession(sessionKey: string) {
    this.sessionMap.delete(sessionKey);
  }

  /**
   * Nosoz proxyni belgilash va vaqtincha chetlatish
   */
  public markProxyFailure(proxy: ProxyItem) {
    proxy.failCount++;
    if (proxy.failCount >= 3) {
      proxy.isAlive = false;
      this.logger.warn(`⚠️ Proxy ${proxy.host}:${proxy.port} 3 marta xato bergani uchun vaqtincha nofaol qilindi`);
    }
  }

  /**
   * Muvaffaqiyatli ishlagan proxyni tiklash
   */
  public markProxySuccess(proxy: ProxyItem) {
    proxy.failCount = 0;
    proxy.isAlive = true;
  }

  /**
   * Axios konfiguratsiyasi uchun Proxy sozlamalarini tayyorlash
   */
  public getAxiosConfig(sessionKey?: string): any {
    const proxy = sessionKey ? this.getStickyProxy(sessionKey) : this.getNextProxy();
    const baseHeaders = this.getRandomBrowserHeaders();

    if (!proxy || !this.isEnabled) {
      return {
        headers: baseHeaders,
        httpAgent: httpKeepAliveAgent,
        httpsAgent: httpsKeepAliveAgent,
      };
    }

    // HTTP va SOCKS5 protokollarini avtomatik moslashtirish
    const authPart = proxy.auth?.username
      ? `${encodeURIComponent(proxy.auth.username)}:${encodeURIComponent(proxy.auth.password || '')}@`
      : '';
    
    let agent: any;
    if (proxy.protocol.startsWith('socks')) {
      const socksUrl = `${proxy.protocol}://${authPart}${proxy.host}:${proxy.port}`;
      agent = new SocksProxyAgent(socksUrl);
    } else {
      const proxyUrl = `http://${authPart}${proxy.host}:${proxy.port}`;
      agent = new HttpsProxyAgent(proxyUrl);
    }

    return {
      headers: baseHeaders,
      httpAgent: agent,
      httpsAgent: agent,
      proxy: false, // Node.js da httpsAgent bilan proxy:false ishlatilishi 100% standart
    };
  }

  /**
   * Haqiqiy brauzer User-Agent lari (Anti-bot himoyasidan o'tish uchun)
   */
  private readonly USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; SM-S928B Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.165 Mobile Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  ];

  /**
   * Realistik brauzer sarlavhalari (Anti-bot / Stealth)
   */
  public getRandomBrowserHeaders(): Record<string, string> {
    const userAgent = this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)];
    const isMobile = userAgent.includes('Mobile') || userAgent.includes('iPhone') || userAgent.includes('Android');

    return {
      'User-Agent': userAgent,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'uz-UZ,uz;q=0.9,ru;q=0.8,en-US;q=0.7,en;q=0.6',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Origin': 'https://openbudget.uz',
      'Referer': 'https://openbudget.uz/boards/initiatives',
      'sec-ch-ua': '"Chromium";v="126", "Google Chrome";v="126", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': isMobile ? '?1' : '?0',
      'sec-ch-ua-platform': userAgent.includes('Windows') ? '"Windows"' : (userAgent.includes('Mac') ? '"macOS"' : (isMobile ? '"Android"' : '"Linux"')),
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
    };
  }

  /**
   * Istalgan so'rov uchun ideal darajada tayyorlangan Axios Instance yaratish
   */
  public createAxiosClient(sessionKey?: string, customConfig: any = {}): AxiosInstance {
    const proxyConfig = this.getAxiosConfig(sessionKey);
    const headers = {
      ...this.getRandomBrowserHeaders(),
      ...(customConfig.headers || {}),
    };

    const instance = axios.create({
      timeout: 10000,
      headers,
      ...proxyConfig,
      ...customConfig,
    });

    instance.interceptors.request.use((config) => {
      (config as any).metadata = { startTime: Date.now() };
      return config;
    });

    instance.interceptors.response.use(
      (response) => {
        return response;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    return instance;
  }

  /**
   * Avtomatik xatolikdan tiklanish (Auto-Failover / Automatic IP Rotation):
   * Agar joriy proxy yoki ulanishda xato yuz bersa, bu proxyni darhol nofaol deb belgilab,
   * avtomatik navbatdagi toza proxydan (yoki Direct) qayta urinadi!
   */
  public async requestWithRetry<T = any>(
    requestFn: (client: AxiosInstance) => Promise<T>,
    sessionKey?: string,
    maxRetries = 3,
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const client = this.createAxiosClient(sessionKey);
        return await requestFn(client);
      } catch (err: any) {
        lastError = err;
        this.logger.warn(`⚠️ [Proxy Auto-Failover ${attempt}/${maxRetries}] So'rov xatoligi (${err.message}). Keyingi toza kanalga o'tilmoqda...`);

        // Agar bu sticky sessiya bo'lsa va xato bersa, eski nofaol proxyni o'chirib, boshqasini tanlaymiz
        if (sessionKey) {
          const bound = this.sessionMap.get(sessionKey);
          if (bound) {
            bound.proxy.isAlive = false;
            bound.proxy.failCount++;
            this.sessionMap.delete(sessionKey);
          }
        }

        // Kichik tanaffus (100ms)
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    throw lastError;
  }

  /**
   * Muddati o'tgan sessiyalarni tozalash
   */
  private cleanupExpiredSessions() {
    const now = Date.now();
    for (const [key, val] of this.sessionMap.entries()) {
      if (val.expiresAt <= now) {
        this.sessionMap.delete(key);
      }
    }
  }

  /**
   * Barcha proxylarning salomatligini tekshirish (SOCKS5 orqali OpenBudget API ga)
   */
  public async checkAllProxiesHealth(): Promise<{ total: number; alive: number; dead: number }> {
    if (this.proxyPool.length === 0) {
      return { total: 0, alive: 0, dead: 0 };
    }

    this.logger.log(`🔍 ${this.proxyPool.length} ta proxylar salomatligi tekshirilmoqda...`);
    let alive = 0;
    let dead = 0;

    await Promise.allSettled(
      this.proxyPool.map(async (proxy) => {
        const startTime = Date.now();
        try {
          const auth = proxy.auth ? `${proxy.auth.username}:${proxy.auth.password}@` : '';
          const { stdout } = await execFileAsync('curl', [
            '-sI',
            '--connect-timeout', '3',
            '--max-time', '5',
            '-x', `http://${auth}${proxy.host}:${proxy.port}`,
            'https://new.openbudget.uz/api/v2/vote/captcha-2'
          ]);

          if (stdout.includes('200') || stdout.includes('HTTP/')) {
            proxy.isAlive = true;
            proxy.latencyMs = Date.now() - startTime;
            proxy.lastCheckedAt = new Date();
            proxy.failCount = 0;
            alive++;
          } else {
            throw new Error('Status not 200');
          }
        } catch (err) {
          proxy.isAlive = false;
          proxy.failCount++;
          proxy.lastCheckedAt = new Date();
          dead++;
        }
      }),
    );

    this.logger.log(`🛡 Proxy tekshiruvi yakunlandi: ${alive} ta faol, ${dead} ta nosoz.`);
    return { total: this.proxyPool.length, alive, dead };
  }

  /**
   * Joriy proxy hovuzi statistikasi
   */
  public getStats() {
    return {
      enabled: this.isEnabled,
      total: this.proxyPool.length,
      alive: this.proxyPool.filter((p) => p.isAlive).length,
      dead: this.proxyPool.filter((p) => !p.isAlive).length,
      activeStickySessions: this.sessionMap.size,
      pool: this.proxyPool.map((p) => ({
        host: p.host,
        port: p.port,
        protocol: p.protocol,
        isAlive: p.isAlive,
        latencyMs: p.latencyMs,
        failCount: p.failCount,
      })),
    };
  }
}
