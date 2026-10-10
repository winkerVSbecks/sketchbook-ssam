#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Light Table
# @raycast.mode compact
# @raycast.packageName Sketchbook

# Optional parameters:
# @raycast.icon 🔍
# @raycast.description Start Light Table (:5180), or stop it if this command started it

exec "$(dirname "$0")/_service.sh" review 5180 review
