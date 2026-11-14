#!/usr/bin/env bash
# Start-up check for the Linux .deb, run by the release workflow on the Ubuntu build machine.
# It installs the package, starts the app on a virtual screen and checks that a window process
# comes up and stays up with the sandbox on. It proves "installs and starts", nothing more:
# Linux stays "untested" until a person has used the screens.
set -euo pipefail

fail() {
  echo "::error::Linux start-up check: $1"
  if [ -n "${log:-}" ] && [ -s "$log" ]; then
    echo "--- last lines of the app's output"
    tail -n 60 "$log"
  fi
  exit 1
}

shopt -s nullglob
debs=(dist/*.deb)
[ "${#debs[@]}" -eq 1 ] || fail "expected one .deb in dist/, found ${#debs[@]}"
deb="${debs[0]}"
pkg="$(dpkg-deb -f "$deb" Package)"

# Install the way a user would, so missing dependencies show up here.
sudo apt-get update -qq
sudo apt-get install -y "./$deb" xvfb

desktop="$(dpkg -L "$pkg" | grep -m1 '\.desktop$')" || fail "the package has no menu entry"
exec_line="$(grep -m1 '^Exec=' "$desktop")" || fail "the menu entry has no Exec line"
case "$exec_line" in
  *--no-sandbox*) fail "the menu entry starts the app with the sandbox off: $exec_line" ;;
esac
exe="${exec_line#Exec=}"
exe="${exe%% *}"
exe="${exe//\"/}"
[ -x "$exe" ] || fail "the program in the menu entry is missing: $exe"

echo "Package: $pkg"
echo "Program: $exe"
echo "User namespace restriction: $(sysctl -n kernel.apparmor_restrict_unprivileged_userns 2>/dev/null || echo 'not present')"
echo "AppArmor profile: $(ls "/etc/apparmor.d/$(basename "$exe")" 2>/dev/null || echo 'not installed')"

log="$(mktemp)"
xvfb-run -a "$exe" >"$log" 2>&1 &
runner=$!
cleanup() {
  pkill -f -- "^${exe}( |\$)" 2>/dev/null || true
  kill "$runner" 2>/dev/null || true
}
trap cleanup EXIT

# Wait for a window (renderer) process. Without a working sandbox the app aborts before this.
started=no
for _ in $(seq 1 60); do
  kill -0 "$runner" 2>/dev/null || break
  if pgrep -f -- "^${exe} .*--type=renderer" >/dev/null; then
    started=yes
    break
  fi
  sleep 1
done
[ "$started" = yes ] || fail "the app did not open a window within 60 seconds"

# It must also stay up.
sleep 5
kill -0 "$runner" 2>/dev/null || fail "the app closed again right after starting"
processes="$(pgrep -a -f -- "^${exe}( |\$)" || true)"
[ -n "$processes" ] || fail "the app is no longer running"
if grep -q -- '--no-sandbox' <<<"$processes"; then
  fail "the app is running with the sandbox off"
fi

echo "Linux start-up check passed: installed, started, stayed up, sandbox on."
