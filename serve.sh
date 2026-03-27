#!/usr/bin/env bash
# Launches a local HTTP server for the Geo Track Viewer.
# Required because:
#   1. Browsers block file:// access for large video files (range requests)
#   2. Cesium CDN requires a real origin (no file://)
#   3. Cross-origin restrictions on fetching local resources

PORT=${1:-8080}
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "──────────────────────────────────────────"
echo "  DJI Geo Track Viewer"
echo "  Serving: $DIR"
echo "  URL:     http://localhost:$PORT"
echo "──────────────────────────────────────────"
echo "  Press Ctrl+C to stop"
echo ""

# Try Python 3 first, then Python 2
if command -v python3 &>/dev/null; then
  python3 -m http.server "$PORT" --directory "$DIR"
elif command -v python &>/dev/null; then
  cd "$DIR" && python -m SimpleHTTPServer "$PORT"
elif command -v npx &>/dev/null; then
  npx --yes serve "$DIR" -l "$PORT"
else
  echo "ERROR: No server found. Install Python 3 or Node.js."
  exit 1
fi
