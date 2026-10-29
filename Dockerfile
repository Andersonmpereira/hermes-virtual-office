  # Hermes Virtual Office — imagem para EasyPanel.
  # O servidor escuta em 0.0.0.0 (npm start do package.json trava em 127.0.0.1,
  # inalcançável de fora do container). Node 22: o escritório usa node:sqlite.
  #
  # Porta: a que o EasyPanel injetar em PORT (padrão 3000). No painel, aponte
  # o domínio para essa mesma porta.

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

  FROM node:22-bookworm-slim AS runner
  WORKDIR /app

  ENV NODE_ENV=production
  ENV NEXT_TELEMETRY_DISABLED=1
  ENV PORT=3000
  # Docker define HOSTNAME com o id do container; o server standalone do Next
  # usa essa variável para bindar. Sem este override o painel não alcança a porta.
  ENV HOSTNAME=0.0.0.0

  RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs \
    && mkdir -p /app/data /app/public \
    && chown -R nextjs:nodejs /app

  COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
  COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

  USER nextjs
  EXPOSE 3000

  HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

  CMD ["node", "server.js"]
