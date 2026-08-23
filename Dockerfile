# Production image for Open Budget Multi-Bot Orchestrator
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Install Tesseract, OpenSSL, curl & Chromium for CAPTCHA OCR & Puppeteer
RUN apk add --no-cache tesseract-ocr vips openssl libc6-compat curl \
    chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --only=production
RUN npx prisma generate

COPY dist ./dist
COPY public ./public
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
COPY test-live-login.js /app/test-live-login.js

RUN chmod +x /app/docker-entrypoint.sh && \
    mkdir -p /app/logs /app/public/receipts /app/public/avatars

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
