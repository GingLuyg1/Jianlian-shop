#!/usr/bin/env bash
set -euo pipefail

test "$(uname -s)" = Linux
lock_dir="$(mktemp -d)"
lock_file="$lock_dir/watcher.lock"
lock_cleanup=""
if [[ ! -e /run/lock/jianlian-liuhaoyi-wechat-recovery.lock ]] &&
   ( set -C; umask 077; : > /run/lock/jianlian-liuhaoyi-wechat-recovery.lock ) 2>/dev/null; then
  lock_file="/run/lock/jianlian-liuhaoyi-wechat-recovery.lock"
  lock_cleanup="$lock_file"
fi
trap 'if [[ -n "$lock_cleanup" ]]; then rm -f "$lock_cleanup"; fi; rm -f "$lock_dir"/*; rmdir "$lock_dir"' EXIT

# A holds the lock. B must exit successfully without reaching its simulated
# provider-query/credit marker. Once A exits, C must acquire the same lock.
flock -n -E 0 "$lock_file" sh -c 'touch "$1/a_started"; sleep 2' sh "$lock_dir" &
a_pid=$!
for _ in {1..50}; do
  if test -f "$lock_dir/a_started"; then break; fi
  sleep 0.1
done
test -f "$lock_dir/a_started"
flock -n -E 0 "$lock_file" sh -c 'touch "$1/b_provider_query"; touch "$1/b_credit"' sh "$lock_dir"
test ! -e "$lock_dir/b_provider_query"
test ! -e "$lock_dir/b_credit"
wait "$a_pid"
flock -n -E 0 "$lock_file" sh -c 'touch "$1/c_started"' sh "$lock_dir"
test -f "$lock_dir/c_started"
echo "LOCK_TEST_PATH=$lock_file"
echo "LINUX_FLOCK_PASS=yes"

systemd-analyze verify \
  ops/systemd/jianlian-liuhaoyi-wechat-recovery.service \
  ops/systemd/jianlian-liuhaoyi-wechat-recovery.timer
grep -Fxq 'Type=oneshot' ops/systemd/jianlian-liuhaoyi-wechat-recovery.service
grep -Fxq 'EnvironmentFile=/etc/jianlian/liuhaoyi-wechat-recovery.env' ops/systemd/jianlian-liuhaoyi-wechat-recovery.service
grep -Fxq 'WorkingDirectory=/www/jianlian-shop' ops/systemd/jianlian-liuhaoyi-wechat-recovery.service
grep -Fq 'ExecStart=/usr/bin/flock -n -E 0 /run/lock/jianlian-liuhaoyi-wechat-recovery.lock' ops/systemd/jianlian-liuhaoyi-wechat-recovery.service
grep -Fxq 'TimeoutStartSec=45s' ops/systemd/jianlian-liuhaoyi-wechat-recovery.service
grep -Fxq 'OnUnitActiveSec=1min' ops/systemd/jianlian-liuhaoyi-wechat-recovery.timer
grep -Fxq 'Persistent=false' ops/systemd/jianlian-liuhaoyi-wechat-recovery.timer
echo "SYSTEMD_VERIFY_PASS=yes"
echo "SYSTEMD_RUNTIME_TEST_PASS=not_available"
