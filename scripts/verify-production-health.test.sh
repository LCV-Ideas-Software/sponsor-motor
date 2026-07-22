#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
verifier="$repo_root/scripts/verify-production-health.sh"
failures=0

mock_wrangler() {
  if [ "$1 $2" = "deployments status" ]; then
    jq -cn \
      --arg version_id '95a2ba5b-78c5-408b-a913-65bb6ba0ac1d' \
      --argjson percentage "${MOCK_DEPLOY_PERCENTAGE:-100}" \
      '{id:"e940153a-2a06-4f74-b852-efc2d8107f44",versions:[{version_id:$version_id,percentage:$percentage}]}'
    return
  fi

  if [ "$1 $2" = "versions view" ]; then
    jq -cn \
      --arg id '95a2ba5b-78c5-408b-a913-65bb6ba0ac1d' \
      --arg tag "${MOCK_DEPLOY_TAG:-expected-sha}" \
      '{id:$id,annotations:{"workers/tag":$tag}}'
    return
  fi

  printf 'unexpected mock Wrangler arguments: %s\n' "$*" >&2
  return 64
}

mock_curl() {
  local headers_file=''
  local body_file=''

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --dump-header)
        headers_file="$2"
        shift 2
        ;;
      --output)
        body_file="$2"
        shift 2
        ;;
      --write-out)
        shift 2
        ;;
      *)
        shift
        ;;
    esac
  done

  case "${MOCK_HTTP_MODE:-healthy}" in
    challenge)
      printf 'HTTP/2 403\r\ncontent-type: text/html\r\ncf-mitigated: challenge\r\ncf-ray: test-ray\r\n\r\n' > "$headers_file"
      printf '<html>challenge</html>' > "$body_file"
      printf '403'
      ;;
    forbidden)
      printf 'HTTP/2 403\r\ncontent-type: application/json\r\ncf-ray: test-ray\r\n\r\n' > "$headers_file"
      printf '{"error":"forbidden"}' > "$body_file"
      printf '403'
      ;;
    healthy)
      printf 'HTTP/2 200\r\ncontent-type: application/json\r\ncf-ray: test-ray\r\n\r\n' > "$headers_file"
      jq -cn --arg version "${MOCK_HTTP_VERSION:-APP v01.02.05}" \
        '{ok:true,service:"sponsor-motor",version:$version}' > "$body_file"
      printf '200'
      ;;
    transport-error)
      return 7
      ;;
    *)
      printf 'unsupported MOCK_HTTP_MODE=%s\n' "$MOCK_HTTP_MODE" >&2
      return 64
      ;;
  esac
}

mock_sleep() {
  return 0
}

export -f mock_wrangler mock_curl mock_sleep

run_verifier() {
  MOCK_DEPLOY_TAG="${MOCK_DEPLOY_TAG:-expected-sha}" \
  MOCK_DEPLOY_PERCENTAGE="${MOCK_DEPLOY_PERCENTAGE:-100}" \
  MOCK_HTTP_MODE="${MOCK_HTTP_MODE:-healthy}" \
  MOCK_HTTP_VERSION="${MOCK_HTTP_VERSION:-APP v01.02.05}" \
  WRANGLER_BIN=mock_wrangler \
  CURL_BIN=mock_curl \
  SLEEP_BIN=mock_sleep \
  EXPECTED_REVISION=expected-sha \
  EXPECTED_VERSION='APP v01.02.05' \
  HEALTH_URL='https://sponsor-motor.lcv.app.br/api/health' \
  HEALTH_ATTEMPTS=2 \
  HEALTH_RETRY_DELAY_SECONDS=0 \
    bash "$verifier"
}

expect_success() {
  local name="$1"
  local expected="$2"
  shift 2
  local output
  local status

  set +e
  output="$("$@" 2>&1)"
  status=$?
  set -e

  if [ "$status" -ne 0 ] || ! grep -Fq "$expected" <<<"$output"; then
    printf 'not ok - %s (status=%s)\n%s\n' "$name" "$status" "$output" >&2
    failures=$((failures + 1))
    return
  fi
  printf 'ok - %s\n' "$name"
}

expect_failure() {
  local name="$1"
  local expected="$2"
  shift 2
  local output
  local status

  set +e
  output="$("$@" 2>&1)"
  status=$?
  set -e

  if [ "$status" -eq 0 ] || ! grep -Fq "$expected" <<<"$output"; then
    printf 'not ok - %s (status=%s)\n%s\n' "$name" "$status" "$output" >&2
    failures=$((failures + 1))
    return
  fi
  printf 'ok - %s\n' "$name"
}

healthy_case() {
  MOCK_HTTP_MODE=healthy run_verifier
}

challenge_case() {
  MOCK_HTTP_MODE=challenge run_verifier
}

forbidden_case() {
  MOCK_HTTP_MODE=forbidden run_verifier
}

wrong_version_case() {
  MOCK_HTTP_MODE=healthy MOCK_HTTP_VERSION='APP v00.00.00' run_verifier
}

wrong_deployment_case() {
  MOCK_DEPLOY_TAG=other-sha MOCK_HTTP_MODE=healthy run_verifier
}

split_deployment_case() {
  MOCK_DEPLOY_PERCENTAGE=50 MOCK_HTTP_MODE=healthy run_verifier
}

transport_error_case() {
  MOCK_HTTP_MODE=transport-error run_verifier
}

expect_success 'accepts the exact healthy JSON' 'Production health check passed for APP v01.02.05.' healthy_case
expect_failure 'fails closed when every probe is intercepted by a Cloudflare challenge' \
  'Production health is unverified because every probe was intercepted by a Cloudflare Challenge Page' \
  challenge_case
expect_failure 'rejects an application 403 without challenge evidence' \
  'Production health verification failed after 2 attempts' forbidden_case
expect_failure 'rejects stale application versions' \
  'Production health verification failed after 2 attempts' wrong_version_case
expect_failure 'rejects a deployed Worker tagged with another revision' \
  'Deployed Worker tag does not match the expected revision' wrong_deployment_case
expect_failure 'rejects partial or split production traffic' \
  'Expected exactly one Worker version at 100% production traffic' split_deployment_case
expect_failure 'rejects transport failures instead of treating them as challenges' \
  'Production health verification failed after 2 attempts' transport_error_case

if [ "$failures" -ne 0 ]; then
  printf '%s regression test(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'All production health regression tests passed.\n'
