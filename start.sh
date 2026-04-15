#!/usr/bin/env bash
# Start backend (FastAPI) on :2727 and frontend (Vite) on :1717.
set -e
cd "$(dirname "$0")"
mkdir -p .pids logs

# Load .env if present (for OPENAI_API_KEY, etc.)
if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

BACKEND_PORT="${BACKEND_PORT:-2727}"
FRONTEND_PORT="${FRONTEND_PORT:-1717}"

echo "==> Backend setup (port $BACKEND_PORT)"
cd backend
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
. .venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
nohup uvicorn app.main:app --host 0.0.0.0 --port "$BACKEND_PORT" --reload \
  > ../logs/backend.log 2>&1 &
echo $! > ../.pids/backend.pid
deactivate
cd ..

echo "==> Frontend setup (port $FRONTEND_PORT)"
cd frontend
if [ ! -d node_modules ]; then
  npm install --silent
fi
nohup npm run dev -- --port "$FRONTEND_PORT" > ../logs/frontend.log 2>&1 &
echo $! > ../.pids/frontend.pid
cd ..

sleep 2
echo ""
echo "Backend:  http://localhost:$BACKEND_PORT/health    (logs: logs/backend.log)"
echo "Frontend: http://localhost:$FRONTEND_PORT          (logs: logs/frontend.log)"
echo "Stop with ./stop.sh"
