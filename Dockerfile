# Daily Planning Assistant — production image (Fly.io).
# No build tools needed: better-sqlite3 ships prebuilt binaries for linux-x64.
FROM node:24-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js schema.sql ./
COPY db ./db
COPY routes ./routes
COPY lib ./lib
COPY public ./public

EXPOSE 3000
CMD ["node", "server.js"]
