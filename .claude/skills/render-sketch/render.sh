#!/usr/bin/env bash
# Triggers /export on the local ssam dev server and prints the path to the newest PNG.
# Exits non-zero if the server is not running.

STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ 2>/dev/null || echo "000")
if [ "$STATUS" != "200" ]; then
  echo "ERROR: dev server not running" >&2
  exit 1
fi

curl -s --max-time 10 http://localhost:5173/export > /dev/null
ls -t output/*.png 2>/dev/null | head -1
