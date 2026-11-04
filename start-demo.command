#!/bin/sh
set -eu
task_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$task_dir"
if [ ! -f dist/index.html ]; then
  printf '%s\n' 'Build output is missing. Run npm ci and npm run build first.'
  exit 1
fi
printf '%s\n' 'Nadwave demo: http://127.0.0.1:5173' 'Keep this window open while demonstrating.'
exec python3 -m http.server 5173 --directory dist --bind 127.0.0.1
