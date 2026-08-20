#!/usr/bin/env bash
# DevOps Healthcheck for Multi-Bot Open Budget System

echo "🔍 [DevOps Healthcheck] Tizim holati tekshirilmoqda..."

# 1. API Status
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/admin/stats || echo "000")

if [ "$HTTP_STATUS" == "200" ]; then
  echo "✅ NestJS Master API: ONLINE (HTTP 200)"
else
  echo "❌ NestJS Master API: OFFLINE ($HTTP_STATUS)"
fi

# 2. Multi-Bots Status
echo "🤖 Faol Botlar ro'yxati:"
curl -s http://localhost:3000/api/admin/bots | jq -r '.[] | " - [#" + (.id|tostring) + "] @" + (.botUsername // "yoq") + " (" + .mahallaName + ") => " + (if .isLiveRunning then "🟢 ONLINE" else "🔴 STOPPED" end)' || echo "Botlar ma'lumotini olib bo'lmadi"

# 3. Database connection
echo "🗄 MySQL ma'lumotlar bazasi:"
npx prisma db push --preview-feature >/dev/null 2>&1 && echo "✅ Database: CONNECTED" || echo "❌ Database: ERROR"
