#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Archive Site
# @raycast.mode compact
# @raycast.packageName Sketchbook

# Optional parameters:
# @raycast.icon images/icon.png
# @raycast.description Start Archive Site (:4173), or stop it if this command started it

exec "$(dirname "$0")/_service.sh" archive 4173 archive:dev
