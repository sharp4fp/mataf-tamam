#!/usr/bin/env bash
# חזרה אוטומטית לפריסה הקודמת ב-Cloudflare Pages, כשבדיקת העשן של פריסה חדשה נכשלה.
# שימוש: cf-rollback.sh <project-name>
# דורש: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (הרשאת Pages: Edit).
set -euo pipefail
PROJECT="$1"
API="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${PROJECT}"
AUTH=(-H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json")

# פריסות הייצור, מהחדשה לישנה: [0] היא זו שנכשלה, [1] היא הקודמת שעבדה.
PREV=$(curl -sf "${AUTH[@]}" "${API}/deployments?env=production&per_page=5" \
  | python3 -c 'import json,sys; r=json.load(sys.stdin)["result"]; print(r[1]["id"] if len(r)>1 else "")')

if [ -z "$PREV" ]; then
  echo "אין פריסה קודמת לחזור אליה ב-${PROJECT}"; exit 1
fi
echo "חוזר לפריסה הקודמת ${PREV} ב-${PROJECT}"
curl -sf -X POST "${AUTH[@]}" "${API}/deployments/${PREV}/rollback" \
  | python3 -c 'import json,sys; r=json.load(sys.stdin); print("הצליח" if r.get("success") else r)'
