#!/usr/bin/env bash
# Print the actual Node test/coverage output produced by ci/test/run.sh.
set -euo pipefail
cd "${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
if [[ ! -f artifacts/test-report.txt ]]; then
  echo 'Run ci/test/run.sh first; no JavaScript test report exists.' >&2
  exit 1
fi
tail -n 100 artifacts/test-report.txt
