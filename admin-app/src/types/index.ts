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
  isLiveRunning?: boolean;
}

export interface VoteItem {
  id: number;
  userId: number;
  phone: string;
  status: string;
  rewardAmount: number;
  createdAt: string;
  user?: {
    firstName: string;
    username?: string;
  };
  botInstance?: {
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
  user?: {
    firstName: string;
    username?: string;
  };
}

export interface UserItem {
  id: number;
  telegramId: string;
  firstName?: string;
  username?: string;
  phone?: string;
  balance: number;
  totalVotes: number;
  isBanned: boolean;
  _count?: {
    referrals: number;
  };
  botInstance?: {
    mahallaName: string;
  };
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
}

export interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}
