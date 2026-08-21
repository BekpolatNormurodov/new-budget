import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Barcha agentlar ro'yxatini olish (ixtiyoriy bot bo'yicha filter bilan)
   */
  async listAgents(botInstanceId?: number) {
    const where: any = {};
    if (botInstanceId) {
      where.botInstanceId = botInstanceId;
    }

    const agents = await this.prisma.agent.findMany({
      where,
      include: {
        botInstance: {
          select: {
            id: true,
            name: true,
            mahallaName: true,
            botUsername: true,
          },
        },
        _count: {
          select: { referredUsers: true, votes: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return agents.map((a) => ({
      ...a,
      referralLink: a.botInstance?.botUsername
        ? `https://t.me/${a.botInstance.botUsername}?start=${a.code}`
        : null,
      referredUsersCount: a._count.referredUsers,
      votesCount: a._count.votes,
    }));
  }

  /**
   * Bitta agent ma'lumotlari va statistikasi
   */
  async getAgent(id: number) {
    const agent = await this.prisma.agent.findUnique({
      where: { id },
      include: {
        botInstance: {
          select: { id: true, name: true, mahallaName: true, botUsername: true },
        },
        _count: {
          select: { referredUsers: true, votes: true },
        },
      },
    });

    if (!agent) throw new NotFoundException('Agent topilmadi');

    const verifiedVotes = await this.prisma.vote.count({
      where: { agentId: id, status: 'VERIFIED' },
    });

    return {
      ...agent,
      referralLink: agent.botInstance?.botUsername
        ? `https://t.me/${agent.botInstance.botUsername}?start=${agent.code}`
        : null,
      referredUsersCount: agent._count.referredUsers,
      votesCount: agent._count.votes,
      verifiedVotesCount: verifiedVotes,
    };
  }

  /**
   * Telegram ID bo'yicha agentni topish (bot UI uchun)
   */
  async findAgentByTelegramId(telegramId: string, botInstanceId: number) {
    return this.prisma.agent.findFirst({
      where: {
        telegramId,
        botInstanceId,
        isActive: true,
      },
      include: {
        botInstance: {
          select: { id: true, botUsername: true, mahallaName: true },
        },
        _count: { select: { referredUsers: true, votes: true } },
      },
    });
  }

  /**
   * Yangi agent yaratish
   */
  async createAgent(dto: {
    botInstanceId: number;
    name: string;
    phone?: string;
    username?: string;
    telegramId?: string;
    code?: string;
    rewardPerVote?: number;
  }) {
    if (!dto.botInstanceId || !dto.name) {
      throw new BadRequestException('Bot ID va Agent ismi kiritilishi shart');
    }

    const bot = await this.prisma.botInstance.findUnique({
      where: { id: dto.botInstanceId },
    });
    if (!bot) {
      throw new NotFoundException('Tanlangan bot topilmadi');
    }

    // Unikal kod generatsiya qilish yoki kiritilganini tozalash
    let code = dto.code
      ? dto.code.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
      : '';

    if (!code) {
      const cleanName = dto.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 10);
      code = `ag_${cleanName || 'user'}_${Math.floor(1000 + Math.random() * 9000)}`;
    }

    // Kod mavjudligini tekshirish
    const existing = await this.prisma.agent.findUnique({ where: { code } });
    if (existing) {
      code = `${code}_${Math.floor(100 + Math.random() * 900)}`;
    }

    const cleanUsername = dto.username
      ? dto.username.replace(/^@/, '').trim()
      : null;

    const agent = await this.prisma.agent.create({
      data: {
        botInstanceId: dto.botInstanceId,
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        telegramUser: cleanUsername,
        telegramId: dto.telegramId?.trim() || null,
        code,
        rewardPerVote: dto.rewardPerVote !== undefined ? dto.rewardPerVote : 5000,
        isActive: true,
      },
      include: {
        botInstance: true,
      },
    });

    this.logger.log(`✅ Yangi Agent yaratildi: ${agent.name} (Kod: ${agent.code}) [Bot: ${bot.name}]`);

    return {
      ...agent,
      referralLink: agent.botInstance?.botUsername
        ? `https://t.me/${agent.botInstance.botUsername}?start=${agent.code}`
        : null,
    };
  }

  /**
   * Agent ma'lumotlarini yangilash
   */
  async updateAgent(
    id: number,
    dto: {
      name?: string;
      phone?: string;
      username?: string;
      telegramId?: string;
      rewardPerVote?: number;
      isActive?: boolean;
    },
  ) {
    const existing = await this.prisma.agent.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Agent topilmadi');
    }

    const cleanUsername = dto.username !== undefined
      ? (dto.username ? dto.username.replace(/^@/, '').trim() : null)
      : undefined;

    return this.prisma.agent.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? dto.name.trim() : undefined,
        phone: dto.phone !== undefined ? dto.phone?.trim() || null : undefined,
        telegramId: dto.telegramId !== undefined ? dto.telegramId?.trim() || null : undefined,
        telegramUser: cleanUsername,
        rewardPerVote: dto.rewardPerVote !== undefined ? dto.rewardPerVote : undefined,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
      },
      include: {
        botInstance: true,
      },
    });
  }

  /**
   * Agentga to'lov amalga oshirish (Payout / Hisobdan chiqarish)
   * - amount ixtiyoriy (partial to'lov mumkin)
   * - receiptImageBase64 ixtiyoriy – chek rasmi
   */
  async payoutAgent(id: number, amount: number, receiptImageBase64?: string) {
    const agent = await this.prisma.agent.findUnique({ where: { id } });
    if (!agent) {
      throw new NotFoundException('Agent topilmadi');
    }

    if (amount <= 0) {
      throw new BadRequestException("To'lov summasi musbat bo'lishi kerak");
    }

    // Chek rasmini saqlash (ixtiyoriy)
    let receiptUrl: string | null = agent.lastReceiptUrl || null;
    if (receiptImageBase64 && receiptImageBase64.startsWith('data:image')) {
      try {
        const base64Data = receiptImageBase64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const receiptsDir = path.join(process.cwd(), 'public', 'agent-receipts');
        if (!fs.existsSync(receiptsDir)) {
          fs.mkdirSync(receiptsDir, { recursive: true });
        }
        const fileName = `agent_${id}_${Date.now()}.jpg`;
        fs.writeFileSync(path.join(receiptsDir, fileName), buffer);
        receiptUrl = `/agent-receipts/${fileName}`;
        this.logger.log(`🧾 Agent cheki saqlandi: ${receiptUrl}`);
      } catch (err: any) {
        this.logger.error(`Agent chek rasmini saqlashda xatolik: ${err.message}`);
      }
    }

    const updated = await this.prisma.agent.update({
      where: { id },
      data: {
        totalPaid: { increment: amount },
        // balance: agar to'lov balance'dan oshsa, 0 ga tushirish (overdraft yo'q)
        balance: { decrement: Math.min(amount, agent.balance) },
        lastReceiptUrl: receiptUrl,
      },
      include: {
        botInstance: true,
      },
    });

    this.logger.log(`💵 Agentga to'lov qilindi: ${agent.name} -> ${amount} so'm. Yangi balans: ${updated.balance} so'm`);

    return {
      success: true,
      message: `Agentga ${amount.toLocaleString('uz-UZ')} so'm to'lov muvaffaqiyatli qayd qilindi`,
      agent: {
        ...updated,
        referralLink: updated.botInstance?.botUsername
          ? `https://t.me/${updated.botInstance.botUsername}?start=${updated.code}`
          : null,
      },
      receiptUrl,
    };
  }

  /**
   * Agentni o'chirish
   */
  async deleteAgent(id: number) {
    const agent = await this.prisma.agent.findUnique({ where: { id } });
    if (!agent) {
      throw new NotFoundException('Agent topilmadi');
    }

    await this.prisma.agent.delete({ where: { id } });
    this.logger.log(`🗑 Agent o'chirildi: ${agent.name} (ID: ${id})`);

    return { success: true, message: "Agent muvaffaqiyatli o'chirildi" };
  }
}
