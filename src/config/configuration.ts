export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || 'http://localhost:3000',
  adminAuth: {
    phone: (process.env.ADMIN_PHONE || '+998901234567').replace(/[^0-9]/g, ''),
    password: process.env.ADMIN_PASSWORD || 'admin_password',
    jwtSecret: process.env.ADMIN_JWT_SECRET || 'open_budget_secret_jwt_key_2026',
  },
  bot: {
    token: process.env.BOT_TOKEN || '8973530886:AAFjlBqhJgVaKseHVs1Eved6_ARENGeCAoc',
    username: process.env.BOT_USERNAME || 'openbudjet_ishonch_2026_bot',
    adminIds: (process.env.ADMIN_IDS || '8140304652,2053690211,5957905121').split(',').map((id) => id.trim()).filter(Boolean),
    voteReward: parseInt(process.env.VOTE_REWARD, 10) || 30000,
    referralBonus: parseInt(process.env.REFERRAL_BONUS, 10) || 5000,
    minWithdrawal: parseInt(process.env.MIN_WITHDRAWAL, 10) || 10000,
    votePrice: parseInt(process.env.VOTE_PRICE, 10) || 4500,
    autoApproveHours: parseFloat(process.env.VOTE_AUTO_APPROVE_HOURS) || 2,
    season: process.env.OPEN_BUDGET_SEASON || '2026-Mavsum 1',
    supportUsername: process.env.SUPPORT_USERNAME || 'openbudget_support',
  },
  openbudget: {
    baseUrl: process.env.OPEN_BUDGET_BASE_URL || 'https://openbudget.uz/api/v1',
  },
  health: {
    enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
    intervalMinutes: parseInt(process.env.HEALTH_CHECK_INTERVAL_MINUTES || '30', 10),
    alertAdmins: process.env.HEALTH_ALERT_ADMINS !== 'false',
  },
  proxy: {
    enabled: process.env.PROXY_ENABLED === 'true',
    list: process.env.PROXY_LIST || '',
    rotationMode: process.env.PROXY_ROTATION_MODE || 'round_robin',
  },
  external: {
    enabled: process.env.EXTERNAL_SERVICE_ENABLED === 'true',
    apiUrl: process.env.EXTERNAL_VOTING_API_URL || '',
    apiKey: process.env.EXTERNAL_VOTING_API_KEY || '',
    timeoutMs: parseInt(process.env.EXTERNAL_SERVICE_TIMEOUT_MS || '15000', 10),
  },
});
