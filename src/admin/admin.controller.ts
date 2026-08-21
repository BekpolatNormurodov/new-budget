import { Controller, Get, Post, Delete, Body, Param, Query, Patch } from '@nestjs/common';
import { AdminService } from './admin.service';

@Controller('api/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('login')
  async login(@Body() body: { phone: string; password: string }) {
    return this.adminService.login(body.phone, body.password);
  }

  @Get('stats')
  async getStats() {
    return this.adminService.getDashboardStats();
  }

  // Multi-Bot Management Routes
  @Get('bots')
  async listBots() {
    return this.adminService.listBots();
  }

  @Post('bots')
  async createBot(@Body() body: any) {
    return this.adminService.createBot(body);
  }

  @Post('bots/:id/start')
  async startBot(@Param('id') id: string) {
    return this.adminService.startBot(parseInt(id, 10));
  }

  @Post('bots/:id/stop')
  async stopBot(@Param('id') id: string) {
    return this.adminService.stopBot(parseInt(id, 10));
  }

  @Patch('bots/:id')
  async updateBot(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updateBot(parseInt(id, 10), body);
  }

  @Delete('bots/:id')
  async deleteBot(@Param('id') id: string) {
    return this.adminService.deleteBot(parseInt(id, 10));
  }

  // Votes Routes
  @Get('votes/pending')
  async getPendingVotes() {
    return this.adminService.listPendingVotes();
  }

  @Post('votes/:id/approve')
  async approveVote(@Param('id') id: string) {
    return this.adminService.approveVote(parseInt(id, 10));
  }

  @Post('votes/approve-all')
  async approveAllVotes() {
    return this.adminService.approveAllPendingVotes();
  }

  // Withdrawals Routes
  @Get('withdrawals')
  async getWithdrawals(@Query('status') status?: string) {
    return this.adminService.listWithdrawals(status);
  }

  @Post('withdrawals/:id/approve')
  async approveWithdrawal(
    @Param('id') id: string,
    @Body() body: { note?: string; receiptImage?: string },
  ) {
    return this.adminService.approveWithdrawal(parseInt(id, 10), body?.note, body?.receiptImage);
  }

  @Post('withdrawals/:id/reject')
  async rejectWithdrawal(@Param('id') id: string, @Body('note') note?: string) {
    return this.adminService.rejectWithdrawal(parseInt(id, 10), note);
  }

  // Users Routes
  @Get('users')
  async getUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.listUsers(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
      search,
    );
  }

  @Patch('users/:id/balance')
  async updateBalance(
    @Param('id') id: string,
    @Body('amount') amount: number,
    @Body('isAddition') isAddition = true,
  ) {
    return this.adminService.updateUserBalance(parseInt(id, 10), amount, isAddition);
  }

  @Patch('users/:id/toggle-ban')
  async toggleBan(@Param('id') id: string) {
    return this.adminService.toggleBanUser(parseInt(id, 10));
  }

  // System Health & Monitoring Routes
  @Get('health')
  async getHealth() {
    return this.adminService.getSystemHealth();
  }

  @Post('health/trigger')
  async triggerHealth() {
    return this.adminService.triggerSystemHealthCheck();
  }

  // Marketing Broadcast Trigger (Avtomatik Eslatma)
  @Post('broadcast/marketing-trigger')
  async triggerMarketingBroadcast(@Body('slot') slot?: 'MORNING' | 'EVENING' | 'TEST') {
    return this.adminService.triggerMarketingBroadcast(slot || 'MORNING');
  }

  // Custom Ad Broadcast (Banner, Matn, Formatlash, Inline Tugma)
  @Post('broadcast/custom-ad')
  async triggerCustomAdBroadcast(
    @Body() body: { text: string; photoBase64OrUrl?: string; buttonText?: string; buttonUrl?: string },
  ) {
    return this.adminService.triggerCustomAdBroadcast(body);
  }
}
