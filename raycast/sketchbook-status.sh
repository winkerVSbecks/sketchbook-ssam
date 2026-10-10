#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Sketchbook Status
# @raycast.mode inline
# @raycast.refreshTime 10s
# @raycast.packageName Sketchbook

# Optional parameters:
# @raycast.icon images/icon.png
# @raycast.description Which of Archive Site, Light Table and Atlas are running

# Never starts or stops anything, so it is safe on a refresh timer. Each
# refresh also brings the toggles' icons back in step (say after a server was
# started from a terminal or died on its own).
source "$(dirname "$0")/_icons.sh"
state=$raycast_state

green=$'\e[32m'
yellow=$'\e[33m'
dim=$'\e[90m'
reset=$'\e[0m'

# <label> <pid name> <port>
status() {
  local label=$1 name=$2 port=$3 pgid
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo -n "${green}● $label${reset}"
    return
  fi
  pgid=$(cat "$state/$name.pid" 2>/dev/null)
  if [[ -n $pgid ]] && kill -0 -- "-$pgid" 2>/dev/null; then
    # Started but not listening yet (archive site is still building).
    echo -n "${yellow}◐ $label${reset}"
  else
    echo -n "${dim}○ $label${reset}"
  fi
}

sync_icon archive 4173 toggle-archive-site.sh
sync_icon review 5180 toggle-light-table.sh
sync_icon atlas 5181 toggle-atlas.sh

echo "$(status 'Archive' archive 4173)   $(status 'Light Table' review 5180)   $(status 'Atlas' atlas 5181)"
