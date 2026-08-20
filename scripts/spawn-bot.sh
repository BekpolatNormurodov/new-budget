#!/usr/bin/env bash
# Script: Tezkor yangi Mahalla Boti yaratish va ishga tushirish

NAME=$1
TOKEN=$2
MAHALLA_ID=$3
MAHALLA_NAME=$4
URL=$5

if [ -z "$TOKEN" ] || [ -z "$MAHALLA_ID" ]; then
  echo "Foydalanish: ./scripts/spawn-bot.sh <BotNomi> <BotToken> <MahallaID> <MahallaNomi> <OpenBudgetURL>"
  echo "Misol: ./scripts/spawn-bot.sh \"Do'stlik MFY\" \"123456:ABC-DEF\" \"055538434014\" \"Do'stlik MFY\" \"https://openbudget.uz/boards/initiatives/initiative/55/831adc38-fac5-4ee3-babc-b5a9b7310342\""
  exit 1
fi

echo "🤖 Yangi bot yaratilmoqda: $NAME ($MAHALLA_NAME)..."

curl -s -X POST http://localhost:3000/api/admin/bots \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$NAME\",
    \"token\": \"$TOKEN\",
    \"mahallaId\": \"$MAHALLA_ID\",
    \"mahallaName\": \"$MAHALLA_NAME\",
    \"openBudgetUrl\": \"$URL\",
    \"voteReward\": 30000,
    \"refBonus\": 5000
  }" | jq . || true

echo "✅ Bot muvaffaqiyatli ishga tushirildi!"
