#!/usr/bin/env bash
# Pull the latest code for the deploy branch and rebuild if it changed. Run by the bos-update timer every 5 minutes.
set -euo pipefail
DIR=/opt/business-os
BRANCH="${BRANCH:-claude/nice-wright-ngqxec}"
cd "$DIR"
git fetch -q origin "$BRANCH"
NEW=$(git rev-parse "origin/$BRANCH")
[ "$(git rev-parse HEAD)" = "$NEW" ] && [ "${1:-}" != "--force" ] && exit 0
echo "$(date -Is) updating to $NEW"
git reset -q --hard "$NEW"
cd business-os
docker compose up -d --build
docker image prune -f >/dev/null
echo "$(date -Is) updated to $(git rev-parse --short HEAD)"
