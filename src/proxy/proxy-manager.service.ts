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

  constructor(private readonly configService: ConfigService) {}

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
   * Axios uchun proxy sozlamasini olish
   */
  public getAxiosConfig(): { proxy?: any } {
    const proxy = this.getNextProxy();
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
   * Barcha proxylarning salomatligini tekshirish
   */
  public async checkAllProxiesHealth(): Promise<{ total: number; alive: number; dead: number }> {
    if (this.proxyPool.length === 0) {
      return { total: 0, alive: 0, dead: 0 };
    }

    this.logger.log(`🔍 ${this.proxyPool.length} ta proxylar salomatligi tekshirilmoqda...`);
    let alive = 0;
    let dead = 0;

    for (const proxy of this.proxyPool) {
      const startTime = Date.now();
      try {
        const proxyConfig: any = {
          host: proxy.host,
          port: proxy.port,
          protocol: proxy.protocol,
        };
        if (proxy.auth?.username) {
          proxyConfig.auth = {
            username: proxy.auth.username,
            password: proxy.auth.password || '',
          };
        }

        const response = await axios.get('https://api.telegram.org', {
          proxy: proxyConfig,
          timeout: 6000,
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
    }

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
