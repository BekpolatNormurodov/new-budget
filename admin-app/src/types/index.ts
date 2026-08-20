export interface AdminUser {
  name: string;
  phone: string;
  role: string;
}

export interface BotInstanceItem {
  id: number;
  name: string;
  token: string;
  botUsername?: string;
  mahallaId: string;
  mahallaName: string;
  openBudgetUrl: string;
  boardId?: string;
  initiativeUuid?: string;
  targetVotes: number;
  currentVotes: number;
  pendingVotes?: number;
  totalCollectedVotes?: number;
  remainingVotes?: number;
  percentage?: number;
  isTargetReached?: boolean;
  voteReward: number;
  refBonus: number;
  isActive: boolean;
  status: string;
  avatarUrl?: string;
  description?: string;
  isLiveRunning?: boolean;
  createdAt?: string;
}

export interface VoteItem {
  id: number;
  userId: number;
  phone: string;
  status: string;
  rewardAmount: number;
  createdAt: string;
  user?: {
    id?: number;
    firstName: string;
    username?: string;
    phone?: string;
    telegramId?: string;
  };
  botInstance?: {
    id?: number;
    name?: string;
    mahallaName: string;
  };
}

export interface WithdrawalItem {
  id: number;
  userId: number;
  amount: number;
  paymentMethod: string;
  accountDetails: string;
  cardHolder?: string;
  status: string;
  adminNote?: string;
  receiptUrl?: string;
  createdAt: string;
  processedAt?: string;
  user?: {
    id?: number;
    firstName: string;
    username?: string;
    phone?: string;
    balance?: number;
    telegramId?: string;
  };
}

export interface UserItem {
  id: number;
  telegramId: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  phone?: string;
  balance: number;
  totalVotes: number;
  totalEarned?: number;
  totalWithdrawn?: number;
  role?: string;
  isBanned: boolean;
  createdAt?: string;
  _count?: {
    referrals: number;
    votes?: number;
  };
  botInstance?: {
    id?: number;
    name?: string;
    mahallaName: string;
  };
}

export type TabType = 'dashboard' | 'bots' | 'votes' | 'withdrawals' | 'users' | 'health';

export interface HealthReport {
  timestamp: string;
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  openBudget: { isAlive: boolean; latencyMs: number; error?: string };
  captcha: { isAlive: boolean; sampleResolved: boolean; latencyMs: number };
  proxies: { total: number; alive: number; dead: number };
  externalBridge: { isEnabled: boolean; isAlive: boolean; latencyMs: number; status?: string };
  bots: { total: number; online: number; offline: number };
  issues: string[];
}

export interface ProxyStats {
  enabled: boolean;
  total: number;
  alive: number;
  dead: number;
  pool: Array<{
    host: string;
    port: number;
    protocol: string;
    isAlive: boolean;
    latencyMs?: number;
    failCount: number;
    lastCheckedAt?: string | Date;
  }>;
}

export interface DashboardStats {
  totalUsers: number;
  todayUsers: number;
  totalVotes: number;
  todayVotes: number;
  pendingVotesCount: number;
  totalBotsCount: number;
  onlineBotsCount: number;
  totalPaid: number;
  pendingWithdrawalsCount: number;
  bots: BotInstanceItem[];
  pendingVotes: VoteItem[];
  pendingWithdrawals: WithdrawalItem[];
  health?: HealthReport;
}

export interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}
