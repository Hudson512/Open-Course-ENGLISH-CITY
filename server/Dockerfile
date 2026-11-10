# Backend: Express API + WebSocket multiplayer. Build context is the repository root.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY server ./server
COPY shared ./shared
COPY tools ./tools
COPY packs ./packs
USER node
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8787/api/config >/dev/null || exit 1
CMD ["node", "server/index.js"]
