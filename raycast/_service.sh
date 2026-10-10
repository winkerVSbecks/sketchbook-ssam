#!/bin/bash
# Shared start/stop toggle for the Raycast script commands beside this file.
# Usage: _service.sh <name> <port> <npm script>
#
# Starts `npm run <script>` detached in its own process group, records the
# group in .raycast/<name>.pid and logs to .raycast/<name>.log. Run again and
# it stops that group. Only ever signals a process it recorded itself; if the
# port is held by something else (say a terminal `npm run review`) it just
# opens the page.

set -u
name=$1
port=$2
script=$3

repo="$(cd "$(dirname "$0")/.." && pwd)"
state="$repo/.raycast"
pidfile="$state/$name.pid"
logfile="$state/$name.log"
url="http://localhost:$port/"

# Raycast runs scripts with a bare PATH; pick up node from the usual places.
export PATH="$HOME/n/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

mkdir -p "$state"

if [[ -f "$pidfile" ]]; then
  pgid=$(cat "$pidfile")
  if kill -0 -- "-$pgid" 2>/dev/null; then
    kill -TERM -- "-$pgid" 2>/dev/null
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 -- "-$pgid" 2>/dev/null || break
      sleep 0.3
    done
    kill -KILL -- "-$pgid" 2>/dev/null
    rm -f "$pidfile"
    echo "Stopped $name"
    exit 0
  fi
  rm -f "$pidfile"
fi

if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
  open "$url"
  echo "$name already running on :$port (not started here) — opened it"
  exit 0
fi

# Job control gives the background job its own process group, so stopping
# takes down npm, the shell it spawns and vite together.
set -m
cd "$repo"
nohup npm run "$script" >"$logfile" 2>&1 </dev/null &
echo $! >"$pidfile"
disown
echo "Started $name on :$port"
