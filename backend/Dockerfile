FROM node:18-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --production

COPY *.ts ./
COPY tsconfig.json ./

RUN npx tsc

ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/server.js"]
