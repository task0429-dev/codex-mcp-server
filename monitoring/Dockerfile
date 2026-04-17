FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY rex-monitoring-daemon.mjs ./
COPY rex-monitor-provision.mjs ./
COPY healthcheck.mjs ./
COPY rex-monitor-inventory.json ./
COPY rex-monitor-provision.env.example ./

ENV NODE_ENV=production

CMD ["node", "rex-monitoring-daemon.mjs"]
