#!/usr/bin/env bash
set -euo pipefail

: "${WRANGLER_BIN:?WRANGLER_BIN is required}"
: "${EXPECTED_REVISION:?EXPECTED_REVISION is required}"
: "${EXPECTED_VERSION:?EXPECTED_VERSION is required}"
: "${HEALTH_URL:?HEALTH_URL is required}"

WORKER_NAME="${WORKER_NAME:-sponsor-motor}"
WRANGLER_CONFIG="${WRANGLER_CONFIG:-wrangler.json}"
CURL_BIN="${CURL_BIN:-curl}"
SLEEP_BIN="${SLEEP_BIN:-sleep}"
HEALTH_ATTEMPTS="${HEALTH_ATTEMPTS:-6}"
HEALTH_RETRY_DELAY_SECONDS="${HEALTH_RETRY_DELAY_SECONDS:-5}"

if ! [[ "$HEALTH_ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then
  echo "::error::HEALTH_ATTEMPTS must be a positive integer." >&2
  exit 64
fi
if ! [[ "$HEALTH_RETRY_DELAY_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "::error::HEALTH_RETRY_DELAY_SECONDS must be a non-negative integer." >&2
  exit 64
fi

deployment_json="$(
  "$WRANGLER_BIN" deployments status \
    --name "$WORKER_NAME" \
    --config "$WRANGLER_CONFIG" \
    --json
)"

if ! jq -e \
  '.versions | length == 1 and .[0].percentage == 100 and (.[0].version_id | type == "string" and length > 0)' \
  <<<"$deployment_json" > /dev/null; then
  echo "::error::Expected exactly one Worker version at 100% production traffic." >&2
  exit 1
fi

version_id="$(jq -er '.versions[0].version_id' <<<"$deployment_json")"
version_json="$(
  "$WRANGLER_BIN" versions view "$version_id" \
    --name "$WORKER_NAME" \
    --config "$WRANGLER_CONFIG" \
    --json
)"

deployed_tag="$(jq -er '.annotations["workers/tag"]' <<<"$version_json")"
reported_version_id="$(jq -er '.id' <<<"$version_json")"
if [ "$reported_version_id" != "$version_id" ]; then
  echo "::error::Wrangler returned metadata for a different Worker version." >&2
  exit 1
fi
if [ "$deployed_tag" != "$EXPECTED_REVISION" ]; then
  echo "::error::Deployed Worker tag does not match the expected revision (expected=$EXPECTED_REVISION actual=$deployed_tag)." >&2
  exit 1
fi

echo "Verified Worker revision $EXPECTED_REVISION at 100% production traffic (version $version_id)."

probe_dir="$(mktemp -d)"
trap 'rm -rf -- "$probe_dir"' EXIT
challenge_count=0
last_failure='no probe completed'

for ((attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt += 1)); do
  headers_file="$probe_dir/headers-$attempt"
  body_file="$probe_dir/body-$attempt"

  set +e
  http_code="$(
    "$CURL_BIN" \
      --silent \
      --show-error \
      --dump-header "$headers_file" \
      --output "$body_file" \
      --write-out '%{http_code}' \
      --header 'Accept: application/json' \
      --header "User-Agent: sponsor-motor-deploy-health/$EXPECTED_REVISION" \
      --connect-timeout 10 \
      --max-time 20 \
      --max-filesize 65536 \
      "$HEALTH_URL"
  )"
  curl_status=$?
  set -e

  if [ "$curl_status" -eq 0 ] && [ "$http_code" = '200' ]; then
    if jq -e --arg version "$EXPECTED_VERSION" \
      '.ok == true and .service == "sponsor-motor" and .version == $version' \
      "$body_file" > /dev/null 2>&1; then
      echo "Production health check passed for $EXPECTED_VERSION."
      exit 0
    fi

    actual_version="$(jq -r '.version // "missing"' "$body_file" 2>/dev/null || printf 'invalid-json')"
    last_failure="HTTP 200 returned an unexpected health document (expected=$EXPECTED_VERSION actual=$actual_version)"
  elif [ "$curl_status" -eq 0 ] \
    && tr -d '\r' < "$headers_file" | grep -Eiq '^cf-mitigated:[[:space:]]*challenge[[:space:]]*$' \
    && tr -d '\r' < "$headers_file" | grep -Eiq '^content-type:[[:space:]]*text/html([[:space:]]*;.*)?$'; then
    challenge_count=$((challenge_count + 1))
    ray_id="$(
      tr -d '\r' < "$headers_file" \
        | awk 'tolower($0) ~ /^cf-ray:[[:space:]]*/ { sub(/^[^:]+:[[:space:]]*/, ""); print; exit }'
    )"
    last_failure="Cloudflare Challenge Page (HTTP $http_code, cf-ray=${ray_id:-missing})"
    echo "::warning::Production health probe $attempt/$HEALTH_ATTEMPTS was intercepted by a Cloudflare Challenge Page (cf-ray=${ray_id:-missing})."
  elif [ "$curl_status" -ne 0 ]; then
    last_failure="curl transport failure (exit=$curl_status)"
  else
    last_failure="unexpected HTTP status $http_code without authenticated Cloudflare challenge headers"
  fi

  if [ "$attempt" -lt "$HEALTH_ATTEMPTS" ]; then
    "$SLEEP_BIN" "$HEALTH_RETRY_DELAY_SECONDS"
  fi
done

if [ "$challenge_count" -eq "$HEALTH_ATTEMPTS" ]; then
  echo "::warning::Cloudflare challenged every production probe; exact Worker revision $EXPECTED_REVISION remains verified at 100% traffic."
  exit 0
fi

echo "::error::Production health verification failed after $HEALTH_ATTEMPTS attempts: $last_failure." >&2
exit 1
