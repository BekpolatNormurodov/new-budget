import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

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

@Injectable()
export class ProxyManagerService implements OnModuleInit {
  private readonly logger = new Logger(ProxyManagerService.name);
  private proxyPool: ProxyItem[] = [];
  private currentIndex = 0;
  private isEnabled = false;

  // Sticky Session kesh: sessionKey (masalan: telefon yoki sessionId) -> ProxyItem
  private sessionMap = new Map<string, { proxy: ProxyItem; expiresAt: number }>();
  private readonly DEFAULT_SESSION_TTL_MS = 20 * 60 * 1000; // 20 daqiqa

  constructor(private readonly configService: ConfigService) {
    // Har 5 daqiqada muddati o'tgan sticky sessiyalarni tozalash (Garbage Collection)
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
  private parseProxyUrl(proxyString: string): ProxyItem | null {
    try {
      const url = new URL(proxyString.startsWith('http') || proxyString.startsWith('socks') ? proxyString : `http://${proxyString}`);
      const protocol = (url.protocol.replace(':', '') as any) || 'http';
      
      const item: ProxyItem = {
        url: proxyString,
        protocol,
        host: url.hostname,
        port: parseInt(url.port, 10) || (protocol === 'http' ? 80 : 8080),
        isAlive: true,
        failCount: 0,
      };

      if (url.username) {
        item.auth = {
          username: decodeURIComponent(url.username),
          password: decodeURIComponent(url.password || ''),
        };
      }

      return item;
    } catch (e) {
      this.logger.error(`Proxy formatini o'qishda xatolik [${proxyString}]`);
      return null;
    }
  }

  /**
   * Navbatdagi faol proxyni olish (Round-robin)
   */
  public getNextProxy(): ProxyItem | null {
    if (!this.isEnabled || this.proxyPool.length === 0) {
      return null;
    }

    const activeList = this.proxyPool.filter((p) => p.isAlive);
    if (activeList.length === 0) {
      this.logger.warn('⚠️ Barcha proxylar nosoz holatda!');
      return null;
    }

    const selected = activeList[this.currentIndex % activeList.length];
    this.currentIndex = (this.currentIndex + 1) % activeList.length;
    return selected;
  }

  /**
   * Sticky Session: Berilgan kalit (Telefon raqam, SessionId yoki BotId) uchun doimiy biriktirilgan proxyni olish
   * Agar avval biriktirilgan bo'lsa, xuddi o'sha IP ni qaytaradi (SMS so'rash va Verify bir xil IP dan chiqishi uchun)
   */
  public getStickyProxy(sessionKey: string, ttlMs = this.DEFAULT_SESSION_TTL_MS): ProxyItem | null {
    if (!sessionKey || !this.isEnabled || this.proxyPool.length === 0) {
      return this.getNextProxy();
    }

    const now = Date.now();
    const existing = this.sessionMap.get(sessionKey);

    if (existing && existing.expiresAt > now && existing.proxy.isAlive) {
      // Sessiya muddatini yana uzaytirish
      existing.expiresAt = now + ttlMs;
      return existing.proxy;
    }

    // Yangi proxy biriktirish (Round-robin orqali)
    const newProxy = this.getNextProxy();
    if (newProxy) {
      this.sessionMap.set(sessionKey, {
        proxy: newProxy,
        expiresAt: now + ttlMs,
      });
      this.logger.debug(`🔒 Sticky Session biriktirildi [${sessionKey}] -> IP: ${newProxy.host}`);
    }

    return newProxy;
  }

  /**
   * Sessiya tugaganda sticky birikuvni bo'shatish
   */
  public releaseSession(sessionKey: string) {
    if (sessionKey) {
      this.sessionMap.delete(sessionKey);
    }
  }

  /**
   * Axios uchun to'liq sozlangan Proxy konfiguratsiyasini olish
   * @param sessionKey Ixtiyoriy: Agar telefon raqam yoki session berilsa, Sticky Proxy ishlatiladi
   */
  public getAxiosConfig(sessionKey?: string): { proxy?: any } {
    const proxy = sessionKey ? this.getStickyProxy(sessionKey) : this.getNextProxy();
    if (!proxy || proxy.protocol.startsWith('socks')) {
      return {};
    }

    return {
      proxy: {
        host: proxy.host,
        port: proxy.port,
        ...(proxy.auth && { auth: proxy.auth }),
        protocol: proxy.protocol,
      },
    };
  }

  /**
   * Istalgan so'rov uchun ideal darajada tayyorlangan Axios Instance yaratish
   */
  // Haqiqiy brauzer User-Agent lari (Anti-bot himoyasidan o'tish uchun)
  private readonly USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36',
  ];

  /**
   * Realistik brauzer sarlavhalarini olish
   */
  public getRandomBrowserHeaders(): Record<string, string> {
    const userAgent = this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)];
    return {
      'User-Agent': userAgent,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'uz-UZ,uz;q=0.9,ru;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': userAgent.includes('Mobile') ? '?1' : '?0',
      'sec-ch-ua-platform': userAgent.includes('Windows') ? '"Windows"' : (userAgent.includes('Mac') ? '"macOS"' : '"Android"'),
    };
  }

  /**
   * Istalgan so'rov uchun ideal darajada tayyorlangan Axios Instance yaratish (Interceptors va Loglar bilan)
   */
  public createAxiosClient(sessionKey?: string, customConfig: any = {}) {
    const proxyConfig = this.getAxiosConfig(sessionKey);
    const headers = {
      ...this.getRandomBrowserHeaders(),
      ...(customConfig.headers || {}),
    };

    const instance = axios.create({
      timeout: 12000,
      headers,
      ...proxyConfig,
      ...customConfig,
    });

    // So'rov va javob loglarini real vaqtda qayd etuvchi Interceptorlar
    instance.interceptors.request.use((config) => {
      (config as any).metadata = { startTime: Date.now() };
      const proxyHost = proxyConfig.proxy ? proxyConfig.proxy.host : 'DIRECT';
      this.logger.log(
        `🌐 [Proxy OUT] ${config.method?.toUpperCase()} ${config.url} | IP: ${proxyHost} ${sessionKey ? `| Session: ${sessionKey}` : ''}`
      );
      return config;
    });

    instance.interceptors.response.use(
      (response) => {
        const duration = Date.now() - ((response.config as any).metadata?.startTime || Date.now());
        const proxyHost = proxyConfig.proxy ? proxyConfig.proxy.host : 'DIRECT';
        this.logger.log(
          `✅ [Proxy IN] ${response.status} OK | ${response.config.url} | IP: ${proxyHost} | Vaqt: ${duration}ms`
        );
        return response;
      },
      (error) => {
        const duration = Date.now() - ((error.config as any)?.metadata?.startTime || Date.now());
        const proxyHost = proxyConfig.proxy ? proxyConfig.proxy.host : 'DIRECT';
        this.logger.warn(
          `❌ [Proxy ERR] ${error.response?.status || 'NET_ERR'} | ${error.config?.url} | IP: ${proxyHost} | Vaqt: ${duration}ms | Xato: ${error.message}`
        );
        return Promise.reject(error);
      }
    );

    return instance;
  }

  /**
   * Avtomatik xatolikdan tiklanish (Auto-Failover / Retry):
   * Agar joriy proxyda xatolik yuz bersa, avtomatik boshqa toza proxydan qayta urinadi
   */
  public async requestWithRetry<T = any>(
    requestFn: (client: typeof axios) => Promise<T>,
    sessionKey?: string,
    maxRetries = 3,
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const client = this.createAxiosClient(sessionKey);
        return await requestFn(client as any);
      } catch (err: any) {
        lastError = err;
        this.logger.warn(`⚠️ [Proxy Retry ${attempt}/${maxRetries}] So'rov xatoligi [${err.message}]. Keyingi proxyga o'tilmoqda...`);

        // Agar bu sticky sessiya bo'lsa va xato bersa, yangi toza proxy biriktiramiz
        if (sessionKey) {
          this.sessionMap.delete(sessionKey);
        }

        // Kichik tanaffus (200ms)
        await new Promise((r) => setTimeout(r, 200));
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
   * Barcha proxylarning salomatligini tekshirish
   */
  public async checkAllProxiesHealth(): Promise<{ total: number; alive: number; dead: number }> {
    if (this.proxyPool.length === 0) {
      return { total: 0, alive: 0, dead: 0 };
    }

    this.logger.log(`🔍 ${this.proxyPool.length} ta proxylar salomatligi tekshirilmoqda (Parallel)...`);
    let alive = 0;
    let dead = 0;

    await Promise.allSettled(
      this.proxyPool.map(async (proxy) => {
        const startTime = Date.now();
        try {
          const proxyConfig: any = {
            host: proxy.host,
            port: proxy.port,
            protocol: 'http',
          };
          if (proxy.auth?.username) {
            proxyConfig.auth = {
              username: proxy.auth.username,
              password: proxy.auth.password || '',
            };
          }

          const response = await axios.get('http://ipinfo.io/json', {
            proxy: proxyConfig,
            timeout: 4000,
          });

          proxy.isAlive = response.status >= 200 && response.status < 500;
          proxy.latencyMs = Date.now() - startTime;
          proxy.lastCheckedAt = new Date();
          proxy.failCount = 0;
          alive++;
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
