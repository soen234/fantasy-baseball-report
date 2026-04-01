#!/bin/bash
# 심볼릭 링크를 따라가 실제 프로젝트 경로를 찾음
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
DIR="$(cd -P "$(dirname "$SOURCE")/.." && pwd)"

exec npx --prefix "$DIR" tsx "$DIR/src/cli.ts" "$@"
