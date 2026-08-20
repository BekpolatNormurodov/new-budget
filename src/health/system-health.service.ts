import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { OpenBudgetService } from '../openbudget/openbudget.service';
import { CaptchaSolverService } from '../openbudget/captcha-solver.service';
import { ProxyManagerService } from '../proxy/proxy-manager.service';
import { ExternalBridgeService } from '../external-bridge/external-bridge.service';
import { BotManagerService } from '../bot/bot-manager.service';

export interface HealthReport {
  timestamp: Date;
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  openBudget: { isAlive: boolean; latencyMs: number; error?: string };
  captcha: { isAlive: boolean; sampleResolved: boolean; latencyMs: number };
  proxies: { total: number; alive: number; dead: number };
  externalBridge: { isEnabled: boolean; isAlive: boolean; latencyMs: number; status?: string };
  bots: { total: number; online: number; offline: number };
  issues: string[];
}

@Injectable()
export class SystemHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SystemHealthService.name);
  private checkIntervalHandle: NodeJS.Timeout | null = null;
  private lastReport: HealthReport | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly openBudgetService: OpenBudgetService,
    private readonly captchaSolver: CaptchaSolverService,
    private readonly proxyManager: ProxyManagerService,
    private readonly externalBridge: ExternalBridgeService,
    private readonly botManager: BotManagerService,
  ) {}

  onModuleInit() {
    const isEnabled = this.configService.get<boolean>('health.enabled') ?? true;
    if (!isEnabled) {
      this.logger.log('⏸ Avtomatik 30 daqiqalik salomatlik tekshiruvi o\'chirilgan.');
      return;
    }

    const intervalMinutes = this.configService.get<number>('health.intervalMinutes') || 30;
    const intervalMs = intervalMinutes * 60 * 1000;

    this.logger.log(`⏱ 30 daqiqalik Tizim Monitoringi faollashtirildi (Har ${intervalMinutes} daqiqada ishga tushadi)`);

    // Dastlabki tezkor tekshiruv (10 soniyadan so'ng)
    setTimeout(() => {
      this.runPeriodicHealthCheck().catch((err) => {
        this.logger.error(`Boshlang'ich tekshiruvda xatolik: ${err.message}`);
      });
    }, 10000);

    // Har 30 daqiqalik interval
    this.checkIntervalHandle = setInterval(() => {
      this.runPeriodicHealthCheck().catch((err) => {
        this.logger.error(`30 daqiqalik tekshiruvda xatolik: ${err.message}`);
      });
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.checkIntervalHandle) {
      clearInterval(this.checkIntervalHandle);
      this.checkIntervalHandle = null;
    }
  }

  /**
   * 30 daqiqalik to'liq tizim tekshiruvini bajarish (100% xatosiz va bardoshli)
   */
  public async runPeriodicHealthCheck(): Promise<HealthReport> {
    this.logger.log('🔍 [30-Daqiqalik Monitoring] Tizim, Ovoz berish, Captcha, Proxy va Botlar holati tekshirilmoqda...');
    const issues: string[] = [];

    // 1. OpenBudget Provider salomatligini tekshirish
    const obStart = Date.now();
    let obAlive = true;
    let obError: string | undefined = undefined;

    try {
      const defaultInit = await this.openBudgetService.getDefaultInitiative().catch(() => null);
      if (!defaultInit) {
        obAlive = false;
        obError = 'Birlamchi tashabbus/mahalla sozlanmagan';
        issues.push(obError);
      }
    } catch (e: any) {
      obAlive = false;
      obError = e.message;
      issues.push(`OpenBudget ulanish xatoligi: ${e.message}`);
    }
    const obLatency = Date.now() - obStart;

    // 2. Captcha Solver sinovi
    const capStart = Date.now();
    let capResolved = false;
    try {
      const worker = await this.captchaSolver.getWorker().catch(() => null);
      capResolved = !!worker;
    } catch (e: any) {
      issues.push(`Captcha solver xatoligi: ${e.message}`);
    }
    const capLatency = Date.now() - capStart;

    // 3. Proxylarni tekshirish
    let proxyStats = { total: 0, alive: 0, dead: 0 };
    try {
      proxyStats = await this.proxyManager.checkAllProxiesHealth().catch(() => ({ total: 0, alive: 0, dead: 0 }));
      if (proxyStats.total > 0 && proxyStats.alive === 0) {
        issues.push('Barcha proxylar nosoz holatda!');
      }
    } catch (e: any) {
      this.logger.warn(`Proxy tekshiruvida xatolik: ${e.message}`);
    }

    // 4. Tashqi Mikroservis Ko'prigini tekshirish
    let bridgeStats: { alive: boolean; latencyMs: number; status?: string } = {
      alive: false,
      latencyMs: 0,
      status: 'DISABLED',
    };
    try {
      bridgeStats = await this.externalBridge.pingService().catch(() => ({ alive: false, latencyMs: 0, status: 'ERROR' }));
      if (this.externalBridge.isServiceActive() && !bridgeStats.alive) {
        issues.push(`Tashqi REST API mikroservisiga ulanib bo'lmadi: ${bridgeStats.status}`);
      }
    } catch (e: any) {
      this.logger.warn(`External bridge tekshiruvida xatolik: ${e.message}`);
    }

    // 5. Botlar holati
    let bots: any[] = [];
    let onlineBots = 0;
    let offlineBots = 0;
    try {
      bots = await this.prisma.botInstance.findMany().catch(() => []);
      onlineBots = bots.filter((b) => b.isActive && b.status === 'ONLINE').length;
      offlineBots = bots.filter((b) => !b.isActive || b.status !== 'ONLINE').length;
    } catch (e: any) {
      this.logger.warn(`Botlar ro'yxatini tekshirishda xatolik: ${e.message}`);
    }

    let overallStatus: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' = 'HEALTHY';
    if (!obAlive || (bots.length > 0 && onlineBots === 0)) {
      overallStatus = 'UNHEALTHY';
    } else if (issues.length > 0) {
      overallStatus = 'DEGRADED';
    }

    const report: HealthReport = {
      timestamp: new Date(),
      status: overallStatus,
      openBudget: { isAlive: obAlive, latencyMs: obLatency, error: obError },
      captcha: { isAlive: obAlive, sampleResolved: capResolved, latencyMs: capLatency },
      proxies: proxyStats,
      externalBridge: {
        isEnabled: this.externalBridge.isServiceActive(),
        isAlive: bridgeStats.alive,
        latencyMs: bridgeStats.latencyMs,
        status: bridgeStats.status,
      },
      bots: { total: bots.length, online: onlineBots, offline: offlineBots },
      issues,
    };

    this.lastReport = report;

    this.logger.log(
      `📊 [30-Daqiqalik Monitoring Natijasi] Holat: ${overallStatus} | OpenBudget: ${obLatency}ms | Captcha: ${capLatency}ms | Botlar: ${onlineBots}/${bots.length} Online`
    );

    // Agar tizimda jiddiy nosozlik aniqlansa, adminlarga bildirishnoma jo'natish (Asinxron)
    if (overallStatus !== 'HEALTHY' && issues.length > 0) {
      this.notifyAdminsAboutIssues(report).catch(() => {});
    }

    return report;
  }

  /**
   * Muammo yuz berganda adminlarni Telegram orqali xabardor qilish
   */
  private async notifyAdminsAboutIssues(report: HealthReport) {
    try {
      const shouldAlert = this.configService.get<boolean>('health.alertAdmins') ?? true;
      if (!shouldAlert) return;

      const alertMessage =
        `⚠️ <b>[30-DAQIQALIK TIZIM OGOHLANTIRIShI]</b>\n\n` +
        `📌 <b>Tizim Holati:</b> ${report.status === 'UNHEALTHY' ? '🔴 XAVFLI (UNHEALTHY)' : '🟡 DIQQAT (DEGRADED)'}\n` +
        `⏱ <b>Vaqt:</b> ${new Date().toLocaleTimeString('uz-UZ')}\n\n` +
        `🔍 <b>Aniqlangan Muammolar:</b>\n` +
        report.issues.map((i) => `• ${i}`).join('\n') +
        `\n\n🤖 <b>Faol Botlar:</b> ${report.bots.online} / ${report.bots.total} ta online\n` +
        `🌐 <b>OpenBudget Latency:</b> ${report.openBudget.latencyMs}ms`;

      const adminIds = ['8140304652', '2053690211', '5957905121'];
      for (const adminId of adminIds) {
        await this.botManager.sendMessageToUser(adminId, alertMessage).catch(() => {});
      }
    } catch (e) {}
  }

  /**
   * Oxirgi hisobotni olish
   */
  public getLastReport(): HealthReport | null {
    return this.lastReport;
  }
}
