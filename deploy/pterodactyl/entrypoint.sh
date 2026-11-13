#!/usr/bin/env bash
set -euo pipefail
cd /home/container
# A Wings mount hides image WORKDIR contents. Seed an empty install only;
# never overwrite an uploaded version, .env, or private data during restart.
if [[ ! -f package.json && ! -f src/index.js && -f /opt/666-streaming/src/index.js ]]; then
  cp -rn /opt/666-streaming/. /home/container/
fi
if [[ ! -f package.json || ! -f src/index.js ]]; then
  echo '666 Streaming: extract the complete JavaScript source into /home/container.' >&2
  exit 1
fi
if [[ -n "${STARTUP:-}" ]]; then
  # Administrator-controlled panel configuration, never media input.
  exec /bin/bash -c "exec ${STARTUP}"
fi
exec "$@"
