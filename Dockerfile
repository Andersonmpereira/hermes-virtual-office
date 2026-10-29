# Build do Virtual Office. O runtime Hermes traz Node 26; o build fica no
# Node 22 do package-lock. O standalone é JavaScript, sem addon nativo.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

FROM nousresearch/hermes-agent:0.22.5 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HERMES_BIN=/opt/hermes/bin/hermes
ENV HERMES_HOME=/opt/data
ENV HOME=/opt/data
ENV DATA_DIR=/app/data
ENV OFFICE_DB_PATH=/app/data/office.db

# /app/data é o volume do office. /opt/data (Hermes) não é tocado aqui.
RUN mkdir -p /app/data \
 && chown hermes:hermes /app/data \
 && printf '%s\n' \
    '#!/bin/sh' \
    'set -eu' \
    'if [ -L /app/data ] || [ /app/data -ef /opt/data ]; then' \
    '  echo "recusando start: /app/data aponta para o volume do Hermes" >&2' \
    '  exit 1' \
    'fi' \
    'chown -R hermes:hermes /app/data' \
    'export HOME=/opt/data' \
    'export HOSTNAME=0.0.0.0' \
    'exec /command/s6-setuidgid hermes /usr/local/bin/node /app/server.js' \
    > /app/office-entrypoint.sh \
 && chmod 755 /app/office-entrypoint.sh

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

# Apaga o ENTRYPOINT da imagem base. Sem isto o dispatch do Hermes roda.
ENTRYPOINT []
CMD ["/app/office-entrypoint.sh"]
