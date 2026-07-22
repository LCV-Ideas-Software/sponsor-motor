#!/usr/bin/env bash
set -euo pipefail

: "${WRANGLER_BIN:?WRANGLER_BIN is required}"
: "${WORKER_NAME:?WORKER_NAME is required}"
: "${EXPECTED_WORKER_VERSION_ID:?EXPECTED_WORKER_VERSION_ID is required}"
: "${EXPECTED_VERSION:?EXPECTED_VERSION is required}"
: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURL_BIN="${CURL_BIN:-curl}"
SLEEP_BIN="${SLEEP_BIN:-sleep}"
NODE_BIN="${NODE_BIN:-node}"
SERVICE_PROBE_ATTEMPTS="${SERVICE_PROBE_ATTEMPTS:-30}"
SERVICE_PROBE_RETRY_DELAY_SECONDS="${SERVICE_PROBE_RETRY_DELAY_SECONDS:-1}"

if ! [[ "$EXPECTED_WORKER_VERSION_ID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  echo "::error::EXPECTED_WORKER_VERSION_ID must be a Worker version UUID." >&2
  exit 64
fi
if ! [[ "$SERVICE_PROBE_ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then
  echo "::error::SERVICE_PROBE_ATTEMPTS must be a positive integer." >&2
  exit 64
fi
if ! [[ "$SERVICE_PROBE_RETRY_DELAY_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "::error::SERVICE_PROBE_RETRY_DELAY_SECONDS must be a non-negative integer." >&2
  exit 64
fi

probe_dir="$(mktemp -d)"
probe_pid=''

# shellcheck disable=SC2329 # Invoked indirectly by the EXIT trap below.
cleanup() {
  if [ -n "$probe_pid" ] && kill -0 "$probe_pid" 2>/dev/null; then
    kill "$probe_pid" 2>/dev/null || true
    wait "$probe_pid" 2>/dev/null || true
  fi
  rm -rf -- "$probe_dir"
}
trap cleanup EXIT

cp "$script_dir/production-health-probe.mjs" "$probe_dir/probe.mjs"
jq -n \
  --arg worker_name "$WORKER_NAME" \
  --arg version_id "$EXPECTED_WORKER_VERSION_ID" \
  '{
    name: "sponsor-health-probe-local-only",
    main: "probe.mjs",
    compatibility_date: "2026-07-22",
    workers_dev: false,
    preview_urls: false,
    vars: {
      WORKER_NAME: $worker_name,
      EXPECTED_WORKER_VERSION_ID: $version_id
    },
    services: [{
      binding: "SPONSOR",
      service: $worker_name,
      remote: true
    }]
  }' > "$probe_dir/wrangler.json"

allocate_local_port() {
  "$NODE_BIN" -e '
    const net = require("node:net");
    const server = net.createServer();
    server.unref();
    server.on("error", (error) => { console.error(error.message); process.exit(1); });
    server.listen(0, "127.0.0.1", () => {
      console.log(server.address().port);
      server.close();
    });
  '
}

probe_port="$(allocate_local_port)"
inspector_port="$(allocate_local_port)"
while [ "$inspector_port" = "$probe_port" ]; do
  inspector_port="$(allocate_local_port)"
done

dev_log="$probe_dir/wrangler-dev.log"
(
  cd "$probe_dir"
  WRANGLER_SEND_METRICS=false CI=true \
    "$WRANGLER_BIN" dev \
      --config "$probe_dir/wrangler.json" \
      --ip 127.0.0.1 \
      --port "$probe_port" \
      --inspector-port "$inspector_port" \
      --persist-to "$probe_dir/state" \
      --show-interactive-dev-session=false
) > "$dev_log" 2>&1 &
probe_pid=$!

body_file="$probe_dir/body.json"
curl_error_file="$probe_dir/curl-error.log"
last_failure='local probe did not become ready'
for ((attempt = 1; attempt <= SERVICE_PROBE_ATTEMPTS; attempt += 1)); do
  if ! kill -0 "$probe_pid" 2>/dev/null; then
    last_failure='Wrangler local probe exited before becoming ready'
    break
  fi

  set +e
  http_code="$(
    "$CURL_BIN" \
      --silent \
      --show-error \
      --output "$body_file" \
      --write-out '%{http_code}' \
      --header 'Accept: application/json' \
      --connect-timeout 2 \
      --max-time 10 \
      --max-filesize 65536 \
      "http://127.0.0.1:$probe_port/probe" \
      2> "$curl_error_file"
  )"
  curl_status=$?
  set -e

  if [ "$curl_status" -eq 0 ] && [ "$http_code" = '200' ]; then
    if jq -e --arg version "$EXPECTED_VERSION" \
      '.ok == true and .service == "sponsor-motor" and .version == $version' \
      "$body_file" > /dev/null 2>&1; then
      echo "Production health check passed via authenticated service binding for $EXPECTED_VERSION."
      exit 0
    fi

    actual_version="$(jq -r '.version // "missing"' "$body_file" 2>/dev/null || printf 'invalid-json')"
    last_failure="HTTP 200 returned an unexpected health document (expected=$EXPECTED_VERSION actual=$actual_version)"
  elif [ "$curl_status" -ne 0 ]; then
    last_failure="local probe transport failure (exit=$curl_status)"
  else
    last_failure="authenticated service binding returned HTTP $http_code"
  fi

  if [ "$attempt" -lt "$SERVICE_PROBE_ATTEMPTS" ]; then
    "$SLEEP_BIN" "$SERVICE_PROBE_RETRY_DELAY_SECONDS"
  fi
done

echo "::error::Authenticated service binding health probe failed: $last_failure." >&2
echo "::group::Wrangler local probe diagnostics" >&2
while IFS= read -r line; do
  if [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [[ "$line" == *"$CLOUDFLARE_API_TOKEN"* ]]; then
    echo '[redacted token-bearing Wrangler log line]' >&2
  else
    echo "$line" >&2
  fi
done < <(tail -n 80 "$dev_log")
echo "::endgroup::" >&2
exit 1
