#!/usr/bin/env bash
# Benchmarks the instance (CPU, memory, disk, stress) and saves a report.
# Sized for VM.Standard.E3.Flex with 1 OCPU (2 vCPUs) and 3 GB RAM.
# Usage:  bash deploy/benchmark.sh
# Takes about 5 minutes. The app will be slower while it runs.
set -uo pipefail

REPORT="benchmark-$(date +%Y%m%d-%H%M%S).txt"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

sudo DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get install -y sysbench stress-ng fio >/dev/null

section() { echo; echo "===== $1 ====="; }

{
  section "System"
  date -u
  uname -a
  lscpu | grep -E 'Model name|^CPU\(s\)|Thread|Core'
  free -h
  df -h /

  section "CPU (sysbench, 60s, all threads)"
  sysbench cpu --threads="$(nproc)" --time=60 run | grep -E 'events per second|total number of events|avg:|95th'

  section "CPU (sysbench, 60s, single thread)"
  sysbench cpu --threads=1 --time=60 run | grep -E 'events per second|avg:|95th'

  section "Memory (sysbench, 5G transfer)"
  sysbench memory --threads="$(nproc)" --memory-total-size=5G run | grep -E 'transferred|total time'

  section "Disk random 4k read/write (fio, 60s)"
  fio --name=rand --directory="$WORK_DIR" --rw=randrw --bs=4k --size=512M --numjobs=2 \
      --iodepth=32 --ioengine=libaio --direct=1 --runtime=60 --time_based --group_reporting \
      | grep -E 'read:|write:|lat \(msec\): min|clat percentiles' | head -6

  section "Disk sequential write (fio, 1G)"
  fio --name=seq --directory="$WORK_DIR" --rw=write --bs=1M --size=1G \
      --ioengine=libaio --direct=1 --group_reporting | grep -E 'write:|WRITE:'

  section "Stress test (stress-ng, 2 min: CPU + 60% RAM + IO)"
  stress-ng --cpu 0 --vm 1 --vm-bytes 60% --io 1 --timeout 2m --metrics-brief 2>&1 | tail -8

  section "Load after stress"
  uptime
  free -h
} | tee "$REPORT"

echo
echo "Report saved to $(pwd)/$REPORT"
