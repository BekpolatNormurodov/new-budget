#!/usr/bin/env bash
# Open Budget Multi-Bot Orchestrator Startup Script

set -e

echo "🚀 [DevOps] Open Budget Multi-Bot Orchestrator ishga tushirilmoqda..."

cd "$(dirname "$0")/.."

# 1. Muhit o'zgaruvchilarini tekshirish
if [ ! -f .env ]; then
  echo "⚠️ .env fayli topilmadi, namuna yaratilmoqda..."
  cp .env.example .env 2>/dev/null || true
fi

# 2. Prisma Database Push & Generate
echo "🔄 [Database] Prisma jadvallari MySQL bilan sinxronlanmoqda..."
npx prisma generate
npx prisma db push

# 3. Build project
echo "🛠 [Build] NestJS ilova kompilyatsiya qilinmoqda..."
npm run build

# 4. Start Server
echo "🟢 [Server] Server va barcha 10-15 ta botlar ishga tushirilmoqda..."
npm run start:prod
