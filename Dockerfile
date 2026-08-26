# Backrooms Online — all-in-one image: static client + WebSocket server
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY client ./client

# The host sets PORT (Render/Fly/Railway all do). 12000 is the local default.
ENV PORT=12000
EXPOSE 12000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "server/index.js"]
