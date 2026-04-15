#!/usr/bin/env bash
# Stop backend and frontend started by start.sh.
set -e
cd "$(dirname "$0")"

stop_pid() {
  local name="$1" file=".pids/$1.pid"
  if [ -f "$file" ]; then
    local pid
    pid="$(cat "$file")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping $name (pid $pid)"
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$file"
  else
    echo "$name not running (no pid file)"
  fi
}

stop_pid backend
stop_pid frontend

# Fallback: kill anything bound to our ports.
for port in "${BACKEND_PORT:-2727}" "${FRONTEND_PORT:-1717}"; do
  pids="$(lsof -ti :"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "Killing stragglers on :$port ($pids)"
    kill -9 $pids 2>/dev/null || true
  fi
done

echo "Stopped."
