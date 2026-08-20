import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { ProxyManagerService } from '../proxy/proxy-manager.service';

export interface ExternalSmsRequestResult {
  success: boolean;
  sessionId?: string;
  isExternal: boolean;
  error?: string;
}

export interface ExternalSmsVerifyResult {
  success: boolean;
  isExternal: boolean;
  error?: string;
}

export interface ExternalCaptchaSolveResult {
  success: boolean;
  captchaText?: string;
  latencyMs?: number;
  error?: string;
}

@Injectable()
export class ExternalBridgeService {
  private readonly logger = new Logger(ExternalBridgeService.name);
  private httpClient: AxiosInstance;
  private isEnabled = false;
  private apiUrl = '';
  private apiKey = '';

  constructor(
    private readonly configService: ConfigService,
    private readonly proxyManager: ProxyManagerService,
  ) {
    this.apiUrl = this.configService.get<string>('external.apiUrl') || process.env.EXTERNAL_VOTING_API_URL || '';
    this.apiKey = this.configService.get<string>('external.apiKey') || process.env.EXTERNAL_VOTING_API_KEY || '';
    this.isEnabled = (this.configService.get<boolean>('external.enabled') || process.env.EXTERNAL_SERVICE_ENABLED === 'true') && !!this.apiUrl;

    this.httpClient = axios.create({
      baseURL: this.apiUrl,
      timeout: parseInt(process.env.EXTERNAL_SERVICE_TIMEOUT_MS || '15000', 10),
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}`, 'X-API-Key': this.apiKey }),
      },
    });

    if (this.isEnabled) {
      this.logger.log(`🌐 Tashqi REST API mikroservis ko'prigi faollashtirildi: ${this.apiUrl}`);
    }
  }

  public isServiceActive(): boolean {
    return this.isEnabled && !!this.apiUrl;
  }

  /**
   * Tashqi mikroservis salomatligini tekshirish (Ping)
   */
  public async pingService(): Promise<{ alive: boolean; latencyMs: number; status?: string }> {
    if (!this.isServiceActive()) {
      return { alive: false, latencyMs: 0, status: 'DISABLED' };
    }

    const start = Date.now();
    try {
      const axiosConfig = this.proxyManager.getAxiosConfig();
      const res = await this.httpClient.get('/health', { ...axiosConfig, timeout: 5000 });
      return {
        alive: res.status >= 200 && res.status < 300,
        latencyMs: Date.now() - start,
        status: res.data?.status || 'OK',
      };
    } catch (err: any) {
      return {
        alive: false,
        latencyMs: Date.now() - start,
        status: err.message,
      };
    }
  }

  /**
   * Tashqi servis orqali SMS so'rash
   */
  public async requestSmsViaBridge(params: {
    phone: string;
    mahallaId: string;
    initiativeUrl?: string;
    botId?: number;
  }): Promise<ExternalSmsRequestResult> {
    if (!this.isServiceActive()) {
      return { success: false, isExternal: false, error: 'External service disabled' };
    }

    try {
      const axiosConfig = this.proxyManager.getAxiosConfig();
      const res = await this.httpClient.post(
        '/api/vote/request-sms',
        {
          phone: params.phone,
          mahallaId: params.mahallaId,
          initiativeUrl: params.initiativeUrl,
          botId: params.botId,
        },
        axiosConfig,
      );

      if (res.data?.success) {
        return {
          success: true,
          sessionId: res.data.sessionId,
          isExternal: true,
        };
      }
      return {
        success: false,
        isExternal: true,
        error: res.data?.message || 'Tashqi servis SMS yubora olmadi',
      };
    } catch (err: any) {
      this.logger.warn(`Tashqi servis orqali SMS so'rashda xatolik: ${err.message}`);
      return { success: false, isExternal: true, error: err.message };
    }
  }

  /**
   * Tashqi servis orqali SMS kodni tasdiqlash
   */
  public async verifySmsViaBridge(params: {
    phone: string;
    smsCode: string;
    sessionId?: string;
    botId?: number;
  }): Promise<ExternalSmsVerifyResult> {
    if (!this.isServiceActive()) {
      return { success: false, isExternal: false, error: 'External service disabled' };
    }

    try {
      const axiosConfig = this.proxyManager.getAxiosConfig();
      const res = await this.httpClient.post(
        '/api/vote/verify-sms',
        {
          phone: params.phone,
          smsCode: params.smsCode,
          sessionId: params.sessionId,
          botId: params.botId,
        },
        axiosConfig,
      );

      if (res.data?.success) {
        return { success: true, isExternal: true };
      }
      return {
        success: false,
        isExternal: true,
        error: res.data?.message || 'Tashqi servis ovozni tasdiqlay olmadi',
      };
    } catch (err: any) {
      this.logger.warn(`Tashqi servis orqali SMS tasdiqlashda xatolik: ${err.message}`);
      return { success: false, isExternal: true, error: err.message };
    }
  }

  /**
   * Tashqi yuqori tezlikdagi AI/OCR mikroservisi orqali Captcha yechish
   */
  public async solveCaptchaViaBridge(imageBase64: string): Promise<ExternalCaptchaSolveResult> {
    if (!this.isServiceActive()) {
      return { success: false, error: 'External service disabled' };
    }

    const start = Date.now();
    try {
      const axiosConfig = this.proxyManager.getAxiosConfig();
      const res = await this.httpClient.post(
        '/api/captcha/solve',
        { image: imageBase64 },
        axiosConfig,
      );

      if (res.data?.code || res.data?.captchaText) {
        return {
          success: true,
          captchaText: res.data.code || res.data.captchaText,
          latencyMs: Date.now() - start,
        };
      }
      return {
        success: false,
        latencyMs: Date.now() - start,
        error: res.data?.message || 'Captcha yechilmadi',
      };
    } catch (err: any) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        error: err.message,
      };
    }
  }
}
