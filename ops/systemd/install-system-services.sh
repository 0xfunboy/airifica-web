#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/home/funboy/airifica-stack/airifica-web"

sudo cp "$REPO_ROOT/ops/systemd/airifica-port-bridge.service" /etc/systemd/system/airifica-port-bridge.service
sudo cp "$REPO_ROOT/ops/systemd/airifica-tts-proxy.service" /etc/systemd/system/airifica-tts-proxy.service

sudo systemctl daemon-reload

systemctl --user disable --now airifica-port-bridge.service airifica-tts-proxy.service || true
sudo systemctl disable --now airifica-web.service || true

sudo systemctl enable --now airifica-port-bridge.service airifica-tts-proxy.service

sudo systemctl status airifica-port-bridge.service airifica-tts-proxy.service --no-pager
