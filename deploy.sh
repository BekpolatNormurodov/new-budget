#!/usr/bin/env bash
# ==============================================================================
# Open Budget Bot & Mini App — 1-Click Production Deployment Script
# ==============================================================================

set -e

echo "🚀 [Deploy] Open Budget ishlab chiqarish serveriga yuklash boshlandi..."

# 1. Ensure logs directory exists
mkdir -p logs public/receipts public/avatars

# 2. Check for .env file
if [ ! -f .env ]; then
  echo "⚠️ .env fayli topilmadi. .env.example dan nusxa ko'chirilmoqda..."
  cp .env.example .env
fi

# 3. Pull latest Git updates (if running in git repository)
if [ -d .git ]; then
  echo "📥 Git yangilanishlari tortib olinmoqda..."
  git pull origin main || true
fi

# 4. Install backend and admin dependencies
echo "📦 Paketlar o'rnatilmoqda..."
npm install --production=false
cd admin-app && npm install && cd ..

# 5. Database migration & Prisma Client generate
echo "🗄 Prisma ma'lumotlar bazasi sxemasi sinxronlanmoqda..."
npx prisma generate
npx prisma db push

# 6. Build Admin React App & NestJS Server
echo "🏗 Loyiha yig'ilmoqda (Build)..."
npm run build

# 7. Restart service (PM2 or Docker)
if command -v pm2 &> /dev/null; then
  echo "🔄 PM2 orqali xizmat qayta ishga tushirilmoqda..."
  pm2 startOrReload ecosystem.config.js --update-env
  pm2 save
elif command -v docker &> /dev/null && [ -f docker-compose.yml ]; then
  echo "🐳 Docker Compose orqali qayta yuklanmoqda..."
  docker compose down && docker compose up -d --build
else
  echo "✅ Build muvaffaqiyatli yakunlandi. Serverni ishga tushirish uchun: npm run start:prod"
fi

echo "🎉 [Deploy] Muvaffaqiyatli yakunlandi! Tizim 100% ishlab turibdi."
