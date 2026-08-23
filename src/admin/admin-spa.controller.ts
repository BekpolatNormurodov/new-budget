import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { join } from 'path';

@Controller()
export class AdminSpaController {
  private serveAdminHtml(res: Response) {
    res.sendFile(join(process.cwd(), 'public', 'index.html'));
  }

  @Get(['bots', 'agents', 'votes', 'withdrawals', 'users', 'health', 'admin-view'])
  getAdminPages(@Res() res: Response) {
    this.serveAdminHtml(res);
  }
}
