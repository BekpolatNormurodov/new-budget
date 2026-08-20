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
  public createAxiosClient(sessionKey?: string, customConfig: any = {}) {
    const proxyConfig = this.getAxiosConfig(sessionKey);
    return axios.create({
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        ...(customConfig.headers || {}),
      },
      ...proxyConfig,
      ...customConfig,
    });
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
