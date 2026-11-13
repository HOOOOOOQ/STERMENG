# Node.js application only. yt-dlp is the explicitly approved standalone utility.
FROM node:22-bookworm-slim AS application
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-fund --no-audit
COPY . .
RUN npm run build \
    && npm run install:ytdlp \
    && npm prune --omit=dev --no-fund --no-audit

FROM node:22-bookworm-slim
LABEL org.opencontainers.image.title="666 Streaming" \
      org.opencontainers.image.description="Node.js 22 HLS dashboard and official Discord audio companion" \
      org.opencontainers.image.licenses="GPL-3.0-or-later" \
      org.opencontainers.image.authors="topsoil / dev-topsoil (original project); 666 Streaming contributors"
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg ca-certificates tini \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /home/container/data /opt/666-streaming \
    && chown -R node:node /home/container
COPY --from=application /app/ /opt/666-streaming/
COPY deploy/pterodactyl/entrypoint.sh /usr/local/bin/666-entrypoint
RUN chmod +x /usr/local/bin/666-entrypoint
ENV HOST=0.0.0.0 SERVER_PORT=8080 DATA_DIR=/home/container/data \
    VIDEO_ENCODER=libx264 STREAM_QUALITY=720p NODE_ENV=production \
    YTDLP_PATH=/opt/666-streaming/bin/yt-dlp NODE_USE_SYSTEM_CA=1
WORKDIR /home/container
USER node
EXPOSE 8080
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||process.env.SERVER_PORT||8080)+'/healthz',{signal:AbortSignal.timeout(3000)}).then(r=>{if(!r.ok)process.exitCode=1}).catch(()=>{process.exitCode=1})"
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/666-entrypoint"]
CMD ["node", "src/index.js"]
