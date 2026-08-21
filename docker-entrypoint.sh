#!/bin/sh
set -e

echo "🚀 [Open Budget Orchestrator] Konteyner ishga tushmoqda..."

# MySQL ulanishini tekshirish va Prisma sxemasini bazaga sinxronlash
echo "📦 Prisma ma'lumotlar bazasi sxemasini tekshirish va yangilash..."
npx prisma db push --skip-generate || echo "⚠️ Prisma db push ogohlantirishi (davom etiladi)..."

echo "✨ Server yuqori unumdorlik (High-Load 4GB RAM + Multi-core) rejimida ishga tushirilmoqda..."
exec node --max-old-space-size=4096 dist/main
