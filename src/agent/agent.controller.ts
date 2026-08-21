import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { AgentService } from './agent.service';

@Controller('api/admin/agents')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get()
  async listAgents(@Query('botInstanceId') botInstanceId?: string) {
    const id = botInstanceId ? parseInt(botInstanceId, 10) : undefined;
    return this.agentService.listAgents(id);
  }

  @Get(':id')
  async getAgent(@Param('id') id: string) {
    return this.agentService.getAgent(parseInt(id, 10));
  }

  @Post()
  async createAgent(@Body() body: any) {
    return this.agentService.createAgent({
      botInstanceId: parseInt(body.botInstanceId, 10),
      name: body.name,
      phone: body.phone,
      username: body.username || body.telegramUser,
      telegramId: body.telegramId,
      code: body.code,
      rewardPerVote: body.rewardPerVote ? parseInt(body.rewardPerVote, 10) : undefined,
    });
  }

  @Patch(':id')
  async updateAgent(@Param('id') id: string, @Body() body: any) {
    return this.agentService.updateAgent(parseInt(id, 10), {
      name: body.name,
      phone: body.phone,
      username: body.username || body.telegramUser,
      telegramId: body.telegramId,
      rewardPerVote: body.rewardPerVote !== undefined ? parseInt(body.rewardPerVote, 10) : undefined,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
    });
  }

  /**
   * Agentga to'lov qilish (chek rasmi bilan ixtiyoriy)
   * Body: { amount: number, receiptImageBase64?: string }
   */
  @Post(':id/payout')
  async payoutAgent(@Param('id') id: string, @Body() body: any) {
    const amount = typeof body.amount === 'string' ? parseInt(body.amount, 10) : body.amount;
    return this.agentService.payoutAgent(
      parseInt(id, 10),
      amount,
      body.receiptImageBase64,
    );
  }

  @Delete(':id')
  async deleteAgent(@Param('id') id: string) {
    return this.agentService.deleteAgent(parseInt(id, 10));
  }
}
