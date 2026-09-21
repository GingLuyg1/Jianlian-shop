#!/usr/bin/env bash
set -euo pipefail

test "$(uname -s)" = Linux
lock_dir="$(mktemp -d)"
lock_cleanup=()
trap 'for path in "${lock_cleanup[@]}"; do rm -f "$path"; done; rm -f "$lock_dir"/*; rmdir "$lock_dir"' EXIT

test_process_lock() {
  local name="$1"
  local requested="$2"
  local lock_file="$lock_dir/$name.lock"
  if [[ ! -e "$requested" ]] &&
     ( set -C; umask 077; : > "$requested" ) 2>/dev/null; then
    lock_file="$requested"
    lock_cleanup+=("$lock_file")
  fi
  flock -n -E 0 "$lock_file" sh -c 'touch "$1/a_started"; sleep 2' sh "$lock_dir" &
  local a_pid=$!
  for _ in {1..50}; do test -f "$lock_dir/a_started" && break; sleep 0.1; done
  test -f "$lock_dir/a_started"
  flock -n -E 0 "$lock_file" sh -c 'touch "$1/b_provider_query"; touch "$1/b_credit"' sh "$lock_dir"
  test ! -e "$lock_dir/b_provider_query"
  test ! -e "$lock_dir/b_credit"
  wait "$a_pid"
  flock -n -E 0 "$lock_file" sh -c 'touch "$1/c_started"' sh "$lock_dir"
  test -f "$lock_dir/c_started"
  rm -f "$lock_dir/a_started" "$lock_dir/c_started"
  echo "${name^^}_LOCK_TEST_PATH=$lock_file"
}

test_process_lock wechat /run/lock/jianlian-liuhaoyi-wechat-recovery.lock
test_process_lock alipay /run/lock/jianlian-liuhaoyi-alipay-recovery.lock
echo "LINUX_FLOCK_PASS=yes"

systemd-analyze verify \
  ops/systemd/jianlian-liuhaoyi-wechat-recovery.service \
  ops/systemd/jianlian-liuhaoyi-wechat-recovery.timer \
  ops/systemd/jianlian-liuhaoyi-recovery.service \
  ops/systemd/jianlian-liuhaoyi-recovery.timer

for service in \
  ops/systemd/jianlian-liuhaoyi-wechat-recovery.service \
  ops/systemd/jianlian-liuhaoyi-recovery.service; do
  grep -Fxq 'Type=oneshot' "$service"
  grep -Fxq 'WorkingDirectory=/www/jianlian-shop' "$service"
  grep -Fxq 'TimeoutStartSec=45s' "$service"
done
grep -Fxq 'EnvironmentFile=/etc/jianlian/liuhaoyi-wechat-recovery.env' ops/systemd/jianlian-liuhaoyi-wechat-recovery.service
grep -Fxq 'EnvironmentFile=/etc/jianlian/liuhaoyi-alipay-recovery.env' ops/systemd/jianlian-liuhaoyi-recovery.service
grep -Fq 'ExecStart=/usr/bin/flock -n -E 0 /run/lock/jianlian-liuhaoyi-wechat-recovery.lock' ops/systemd/jianlian-liuhaoyi-wechat-recovery.service
grep -Fq 'ExecStart=/usr/bin/flock -n -E 0 /run/lock/jianlian-liuhaoyi-alipay-recovery.lock' ops/systemd/jianlian-liuhaoyi-recovery.service
for timer in \
  ops/systemd/jianlian-liuhaoyi-wechat-recovery.timer \
  ops/systemd/jianlian-liuhaoyi-recovery.timer; do
  grep -Fxq 'OnUnitActiveSec=1min' "$timer"
  grep -Fxq 'Persistent=false' "$timer"
done
echo "SYSTEMD_VERIFY_PASS=yes"
echo "SYSTEMD_RUNTIME_TEST_PASS=not_available"
