#!/usr/bin/env bash
# The trust step.
#
# A delegator should not take our word for what the handler holding their
# rewards does. This recomputes the class hash from source and prints it next to
# the one actually deployed on chain, so the two can be compared by eye.
#
# If they differ, the deployed handler is not this source. Do not opt in.
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIG=web/config/mainnet.json
RPC=$(python3 -c "import json;print(json.load(open('$CONFIG'))['rpc'])")
DEPLOYED=$(python3 -c "import json;print(json.load(open('$CONFIG'))['deployed']['handlerClassHash'] or '')")

echo "Recomputing RewardsHandler class hash from source..."
cd contracts
LOCAL=$(sncast utils class-hash --contract-name RewardsHandler | awk '/Class Hash:/ {print $3}')
cd ..

norm() { python3 -c "import sys;print(hex(int(sys.argv[1],16)))" "$1"; }

echo
echo "  from source   : $(norm "$LOCAL")"
if [ -z "$DEPLOYED" ]; then
  echo "  on chain      : (not recorded in $CONFIG yet)"
  echo
  echo "Nothing deployed to compare against."
  exit 0
fi
echo "  on chain      : $(norm "$DEPLOYED")"
echo

if [ "$(norm "$LOCAL")" = "$(norm "$DEPLOYED")" ]; then
  echo "MATCH. The deployed handler is this source."
else
  echo "MISMATCH. The deployed handler is NOT this source. Do not opt in." >&2
  exit 1
fi

echo
echo "Confirming the class is declared on chain..."
curl -s -X POST "$RPC" -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"starknet_getClass\",\"params\":[\"latest\",\"$(norm "$DEPLOYED")\"]}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('declared on chain.' if 'result' in d else 'NOT declared: '+str(d.get('error')))"
