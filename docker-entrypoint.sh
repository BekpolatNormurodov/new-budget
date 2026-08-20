#!/bin/sh
set -e

echo "🚀 [Open Budget Orchestrator] Konteyner ishga tushmoqda..."

# MySQL ulanishini tekshirish va Prisma sxemasini bazaga sinxronlash
echo "📦 Prisma ma'lumotlar bazasi sxemasini tekshirish va yangilash..."
npx prisma db push --skip-generate || echo "⚠️ Prisma db push ogohlantirishi (davom etiladi)..."

echo "✨ Server ishga tushirilmoqda..."
exec node dist/main
