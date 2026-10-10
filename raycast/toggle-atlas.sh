#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Atlas
# @raycast.mode compact
# @raycast.packageName Sketchbook

# Optional parameters:
# @raycast.icon 🗺️
# @raycast.description Start Atlas (:5181), or stop it if this command started it

exec "$(dirname "$0")/_service.sh" atlas 5181 atlas
