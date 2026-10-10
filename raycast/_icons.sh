#!/bin/bash
# Sourced by _service.sh and sketchbook-status.sh: keeps each toggle's icon in
# step with its server. A toggle's `@raycast.icon` points at icons/<name>.png
# (gitignored); this copies images/icon-on.png or icon-off.png there and
# touches the toggle so Raycast re-reads it. Only writes when the state
# changed, so a 10s refresh does not churn.

raycast_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
raycast_state="$(dirname "$raycast_dir")/.raycast"

# <pid name> <port> → prints on|off
server_state() {
  local name=$1 port=$2 pgid
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo on
    return
  fi
  pgid=$(cat "$raycast_state/$name.pid" 2>/dev/null)
  if [[ -n $pgid ]] && kill -0 -- "-$pgid" 2>/dev/null; then echo on; else echo off; fi
}

# <pid name> <on|off> <toggle script filename>
set_icon() {
  local name=$1 state=$2 script=$3
  local icon="$raycast_dir/icons/$name.png" mark="$raycast_dir/icons/$name.state"
  [[ $(cat "$mark" 2>/dev/null) == "$state" && -f $icon ]] && return
  mkdir -p "$raycast_dir/icons"
  cp "$raycast_dir/images/icon-$state.png" "$icon"
  echo "$state" >"$mark"
  touch "$raycast_dir/$script"
}

# <pid name> <port> <toggle script filename>
sync_icon() {
  set_icon "$1" "$(server_state "$1" "$2")" "$3"
}
