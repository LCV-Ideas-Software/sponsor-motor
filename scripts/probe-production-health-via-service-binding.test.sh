#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
helper="$repo_root/scripts/probe-production-health-via-service-binding.sh"
verifier="$repo_root/scripts/verify-production-health.sh"
test_dir="$(mktemp -d)"

cleanup() {
  rm -rf -- "$test_dir"
}
trap cleanup EXIT

assert_token_capture_order() {
  local script="$1"
  local capture_line
  local unset_line
  local first_subprocess_line
  # shellcheck disable=SC2016 # These are literal source-code patterns.
  capture_line="$(grep -nF 'declare +x cloudflare_api_token="$CLOUDFLARE_API_TOKEN"' "$script" | cut -d: -f1 || true)"
  unset_line="$(grep -nF 'unset CLOUDFLARE_API_TOKEN' "$script" | cut -d: -f1 || true)"
  # shellcheck disable=SC2016 # This is a literal source-code pattern.
  first_subprocess_line="$(grep -nF 'script_dir="$(cd "$(dirname ' "$script" | cut -d: -f1 || true)"

  if [ -z "$capture_line" ] || [ -z "$unset_line" ] || [ -z "$first_subprocess_line" ] \
    || [ "$capture_line" -ge "$unset_line" ] || [ "$unset_line" -ge "$first_subprocess_line" ]; then
    printf 'token is not captured and unset before subprocesses in %s\n' "$script" >&2
    return 1
  fi
  # shellcheck disable=SC2016 # This is a literal source-code pattern.
  if ! grep -Fq 'CLOUDFLARE_API_TOKEN="$cloudflare_api_token"' "$script"; then
    printf 'scoped Wrangler token injection is missing in %s\n' "$script" >&2
    return 1
  fi
}

assert_token_capture_order "$verifier"
assert_token_capture_order "$helper"

trace_file="$test_dir/trace.log"
pid_file="$test_dir/wrangler.pid"
test_token='scope-test-token'

cat > "$test_dir/mock-jq" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [ -n "${CLOUDFLARE_API_TOKEN+x}" ]; then
  printf 'jq-token-leaked\n' >> "$TOKEN_SCOPE_TRACE_FILE"
  exit 97
fi
printf 'jq-token-absent\n' >> "$TOKEN_SCOPE_TRACE_FILE"
exec jq "$@"
EOF

cat > "$test_dir/mock-node" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [ -n "${CLOUDFLARE_API_TOKEN+x}" ]; then
  printf 'node-token-leaked\n' >> "$TOKEN_SCOPE_TRACE_FILE"
  exit 97
fi
printf 'node-token-absent\n' >> "$TOKEN_SCOPE_TRACE_FILE"
exec node "$@"
EOF

cat > "$test_dir/mock-curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [ -n "${CLOUDFLARE_API_TOKEN+x}" ]; then
  printf 'curl-token-leaked\n' >> "$TOKEN_SCOPE_TRACE_FILE"
  exit 97
fi
printf 'curl-token-absent\n' >> "$TOKEN_SCOPE_TRACE_FILE"
body_file=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output)
      body_file="$2"
      shift 2
      ;;
    --write-out | --header | --connect-timeout | --max-time | --max-filesize)
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
printf '{"ok":true,"service":"sponsor-motor","version":"APP v01.02.05"}\n' > "$body_file"
printf '200'
EOF

cat > "$test_dir/mock-wrangler" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [ "${CLOUDFLARE_API_TOKEN:-}" != "$EXPECTED_SCOPE_TEST_TOKEN" ]; then
  printf 'wrangler-token-missing\n' >> "$TOKEN_SCOPE_TRACE_FILE"
  exit 97
fi
printf 'wrangler-token-present\n' >> "$TOKEN_SCOPE_TRACE_FILE"
printf '%s\n' "$$" > "$PROBE_PID_FILE"
exec node -e 'setInterval(() => {}, 1000)'
EOF

chmod +x "$test_dir/mock-jq" "$test_dir/mock-node" "$test_dir/mock-curl" "$test_dir/mock-wrangler"

TOKEN_SCOPE_TRACE_FILE="$trace_file" \
PROBE_PID_FILE="$pid_file" \
EXPECTED_SCOPE_TEST_TOKEN="$test_token" \
CLOUDFLARE_API_TOKEN="$test_token" \
WRANGLER_BIN="$test_dir/mock-wrangler" \
JQ_BIN="$test_dir/mock-jq" \
NODE_BIN="$test_dir/mock-node" \
CURL_BIN="$test_dir/mock-curl" \
WORKER_NAME=sponsor-motor \
EXPECTED_WORKER_VERSION_ID=95a2ba5b-78c5-408b-a913-65bb6ba0ac1d \
EXPECTED_VERSION='APP v01.02.05' \
  bash "$helper" > /dev/null

if grep -Eq '^(jq|node|curl)-token-leaked$|^wrangler-token-missing$' "$trace_file"; then
  printf 'Cloudflare token scope regression detected:\n' >&2
  cat "$trace_file" >&2
  exit 1
fi
for expected in jq-token-absent node-token-absent curl-token-absent wrangler-token-present; do
  if ! grep -Fxq "$expected" "$trace_file"; then
    printf 'missing token scope evidence: %s\n' "$expected" >&2
    exit 1
  fi
done

wrangler_pid="$(cat "$pid_file")"
for _ in {1..20}; do
  if ! kill -0 "$wrangler_pid" 2>/dev/null; then
    break
  fi
  sleep 0.1
done
if kill -0 "$wrangler_pid" 2>/dev/null; then
  printf 'Wrangler probe process %s was not cleaned up\n' "$wrangler_pid" >&2
  exit 1
fi

printf 'Cloudflare token scope and Wrangler process cleanup tests passed.\n'
