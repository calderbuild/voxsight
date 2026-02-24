FROM node:18-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY *.ts tsconfig.json ./
RUN npx tsc

# Production image
FROM node:18-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --production

COPY --from=builder /app/dist ./dist

ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/server.js"]
