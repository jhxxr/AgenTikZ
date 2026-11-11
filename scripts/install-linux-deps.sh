#!/usr/bin/env bash
# Install Tauri dependencies with bounded attempts against signed Ubuntu
# archives, avoiding the hosted runner's recursive mirror+file: fallback.
set -euo pipefail

. /etc/os-release
codename="${VERSION_CODENAME:?Ubuntu codename is missing}"
packages=(
  libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev
  libssl-dev libayatana-appindicator3-dev librsvg2-dev
)
if [[ "${1:-}" == "--bundle" ]]; then
  packages+=(patchelf libfuse2)
fi

sources="$(mktemp /tmp/agentikz-apt-XXXXXX.list)"
trap 'rm -f "$sources"' EXIT
options=(
  -o "Dir::Etc::sourcelist=$sources"
  -o 'Dir::Etc::sourceparts=-'
  -o 'APT::Get::List-Cleanup=0'
  -o 'APT::Update::Error-Mode=any'
  -o 'Acquire::ForceIPv4=true'
  -o 'Acquire::Retries=1'
  -o 'Acquire::http::Timeout=20'
  -o 'Acquire::https::Timeout=20'
)

for mirror in \
  https://archive.ubuntu.com/ubuntu \
  https://mirrors.edge.kernel.org/ubuntu \
  https://azure.archive.ubuntu.com/ubuntu; do
  printf 'Checking Ubuntu archive: %s\n' "$mirror"
  if ! curl -4 --fail --silent --show-error --connect-timeout 10 --max-time 20 \
      "$mirror/dists/$codename/InRelease" -o /dev/null; then
    continue
  fi
  for suite in "$codename" "$codename-updates" "$codename-security"; do
    printf 'deb %s %s main restricted universe multiverse\n' "$mirror" "$suite"
  done > "$sources"
  # Keep normal APT signature verification; never trust an unsigned mirror.
  if sudo timeout 240 apt-get "${options[@]}" update && \
     sudo timeout 600 apt-get "${options[@]}" install -y "${packages[@]}"; then
    exit 0
  fi
  printf 'Archive unavailable or package installation failed: %s\n' "$mirror" >&2
 done

printf 'Unable to install Tauri dependencies from any signed Ubuntu archive.\n' >&2
exit 1
