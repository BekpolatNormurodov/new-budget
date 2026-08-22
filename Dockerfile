# Multi-stage Dockerfile for Open Budget Multi-Bot Orchestrator
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

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

# Install Tesseract, OpenSSL, curl & Graphics libraries for CAPTCHA OCR & Ultra-Fast SOCKS5 Proxying
RUN apk add --no-cache tesseract-ocr vips openssl libc6-compat curl

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --only=production
RUN npx prisma generate

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
COPY test-live-login.js /app/test-live-login.js

RUN chmod +x /app/docker-entrypoint.sh && \
    mkdir -p /app/logs /app/public/receipts /app/public/avatars

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
