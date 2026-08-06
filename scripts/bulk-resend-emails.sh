#!/usr/bin/env bash
# Reenvia e-mails de compra (todos pagos) + lembretes X1 5/30 min (pendentes elegíveis).
set -euo pipefail
BASE="${API_BASE:-https://ofertasgrandes.com}"
KEY="${OPS_KEY:-${WEBHOOK_SECRET:-whk_ttkshop_2026_ax9Q}}"
LIMIT="${BATCH_LIMIT:-15}"

repair() {
  local extra="$1"
  curl -sS -X POST "${BASE}/api/ops/repair?key=${KEY}&limit=${LIMIT}${extra}"
}

echo "=== Reenvio e-mails de compra (todos pagos com e-mail) ==="
email_off=0
while true; do
  j=$(repair "&force_email=1&email_offset=${email_off}&x1=0")
  echo "$j" | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('repair',{}); print('email batch ok', r.get('email',{}), 'remaining', d.get('remaining',{}).get('email'))"
  rem=$(echo "$j" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('remaining',{}).get('email',0))")
  next=$(echo "$j" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('repair',{}).get('email_next_offset',0))")
  att=$(echo "$j" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('repair',{}).get('email',{}).get('attempted',0))")
  email_off=$next
  if [[ "$rem" -eq 0 ]] || [[ "$att" -eq 0 ]]; then break; fi
  sleep 1
done

echo "=== Reenvio lembretes 5/30 min (pendentes) ==="
x1_off=0
while true; do
  j=$(repair "&force_x1=1&x1_offset=${x1_off}&email=0")
  echo "$j" | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('repair',{}); print('x1 batch ok', r.get('x1',{}), 'remaining', d.get('remaining',{}).get('x1'))"
  rem=$(echo "$j" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('remaining',{}).get('x1',0))")
  next=$(echo "$j" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('repair',{}).get('x1_next_offset',0))")
  att=$(echo "$j" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('repair',{}).get('x1',{}).get('attempted',0))")
  x1_off=$next
  if [[ "$rem" -eq 0 ]] || [[ "$att" -eq 0 ]]; then break; fi
  sleep 1
done

echo "Concluído."
