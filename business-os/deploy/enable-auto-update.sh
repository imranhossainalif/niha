#!/usr/bin/env bash
# Install a systemd timer that runs deploy/update.sh every 5 minutes (needs the repo deploy key set up first).
set -euo pipefail
cat > /etc/systemd/system/bos-update.service <<UNIT
[Unit]
Description=Business OS: pull and rebuild if the code changed
After=docker.service network-online.target
[Service]
Type=oneshot
ExecStart=/bin/bash /opt/business-os/business-os/deploy/update.sh
UNIT
cat > /etc/systemd/system/bos-update.timer <<UNIT
[Unit]
Description=Business OS auto-update every 5 minutes
[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now bos-update.timer
bash /opt/business-os/business-os/deploy/update.sh --force
echo "Auto-update on. Log: journalctl -u bos-update -n 50"
