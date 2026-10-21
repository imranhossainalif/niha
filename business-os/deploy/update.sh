#!/usr/bin/env bash
# Pull the latest code for the deploy branch and rebuild if it changed. Run by the bos-update timer every 5 minutes.
# Everything is inside main() so bash has read the whole script before git replaces this file.
set -euo pipefail
main() {
  local DIR=/opt/business-os BRANCH="${BRANCH:-claude/nice-wright-ngqxec}" NEW
  cd "$DIR"
  git fetch -q origin "$BRANCH"
  NEW=$(git rev-parse "origin/$BRANCH")
  if [ "$(git rev-parse HEAD)" = "$NEW" ] && [ "${1:-}" != "--force" ]; then return 0; fi
  echo "$(date -Is) updating to $NEW"
  git reset -q --hard "$NEW"
  cd business-os
  # older .env files had inline comments, which Docker passes on as part of the value
  [ -f .env ] && sed -i -E 's/^([A-Z0-9_]+=)[[:space:]]*#.*$/\1/; s/^([A-Z0-9_]+=[^[:space:]#]+)[[:space:]]+#.*$/\1/' .env
  docker compose up -d --build
  docker image prune -f >/dev/null
  echo "$(date -Is) updated to $(git rev-parse --short HEAD)"
}
main "$@"
exit
