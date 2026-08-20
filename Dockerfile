# Multi-stage Dockerfile for Open Budget Multi-Bot Orchestrator
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

COPY admin-app/package*.json ./admin-app/
RUN cd admin-app && npm ci

# Copy source code and build
COPY . .
RUN npx prisma generate
RUN npm run build

# Production image
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Install Tesseract & Graphics libraries if needed for OCR
RUN apk add --no-cache tesseract-ocr vips

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

RUN mkdir -p /app/logs /app/public/receipts /app/public/avatars

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/admin/stats || exit 1

CMD ["node", "dist/main"]
