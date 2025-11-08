#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${1:-}" ]]; then
  echo "Usage: $0 <vercel-blob-rw-token> [prefix]" >&2
  exit 1
fi
TOKEN="$1"
PREFIX="${2:-agnicid/production}"
SOURCE_DIR="${AGNIG_HOME:-$HOME/.agnicid}"
if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Source directory $SOURCE_DIR does not exist" >&2
  exit 1
fi
find "$SOURCE_DIR" -type f | while read -r file; do
  rel="${file#"$SOURCE_DIR/"}"
  dest="$PREFIX/$rel"
  echo "Uploading $rel -> $dest"
  vercel blob put "$file" --path "$dest" --rw-token "vercel_blob_rw_Clj19F4htXP4v0hL_1WGuW83YOfABlxEdpWdogsKD0Ya6IC"
done
