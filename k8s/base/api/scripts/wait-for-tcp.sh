#!/bin/sh
set -eu

NAME="${1:?service name required}"
HOST="${2:?host required}"
PORT="${3:?port required}"
ERROR_HINT="${4:-check connectivity}"
MAX_WAIT="${5:-120}"
NC_WAIT="${6:-2}"
SLEEP_INTERVAL="${7:-3}"

echo "Waiting for ${NAME} at ${HOST}:${PORT}..."

START="$(date +%s)"
RETRIES=0

while true; do
  NOW="$(date +%s)"
  ELAPSED=$((NOW - START))
  REMAINING=$((MAX_WAIT - ELAPSED))

  if [ "$REMAINING" -le 0 ] || [ $((ELAPSED + NC_WAIT)) -gt "$MAX_WAIT" ]; then
    echo "Timed out waiting for ${NAME} after ${MAX_WAIT}s — ${ERROR_HINT}"
    exit 1
  fi

  if nc -z -w "$NC_WAIT" "$HOST" "$PORT"; then
    echo "${NAME} is up"
    exit 0
  fi

  NOW="$(date +%s)"
  ELAPSED=$((NOW - START))
  REMAINING=$((MAX_WAIT - ELAPSED))

  if [ "$REMAINING" -le 0 ]; then
    echo "Timed out waiting for ${NAME} after ${MAX_WAIT}s — ${ERROR_HINT}"
    exit 1
  fi

  RETRIES=$((RETRIES + 1))
  echo "  ${NAME} not ready at ${HOST}:${PORT} — retry ${RETRIES}, elapsed ${ELAPSED}s/${MAX_WAIT}s"

  SLEEP_FOR="$SLEEP_INTERVAL"
  if [ "$REMAINING" -lt "$SLEEP_FOR" ]; then
    SLEEP_FOR="$REMAINING"
  fi

  sleep "$SLEEP_FOR"
done
