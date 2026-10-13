#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Atlas
# @raycast.mode compact
# @raycast.packageName Sketchbook

# Optional parameters:
# @raycast.icon images/icon.png
# @raycast.description Start Atlas (:5182), or stop it if this command started it

exec "$(dirname "$0")/_service.sh" atlas 5182 atlas
