#!/usr/bin/env bash
# Node.js 22 + actual FFmpeg/FFprobe + approved standalone yt-dlp are required.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
npm ci --include=dev --no-fund --no-audit
npm run install:ytdlp
npm run check:source
npm run lint
npm run build
mkdir -p artifacts
# No Python test/runtime/coverage process. Propagate the Node test exit status.
node --test --experimental-test-coverage --test-coverage-include='src/**' --test-concurrency=1 tests/*.test.js > artifacts/test-report.txt 2>&1 || { cat artifacts/test-report.txt; exit 1; }
cat artifacts/test-report.txt
npm run test:browser > artifacts/browser-test-report.txt 2>&1 || { cat artifacts/browser-test-report.txt; exit 1; }
cat artifacts/browser-test-report.txt
npm audit --omit=dev --audit-level=moderate
