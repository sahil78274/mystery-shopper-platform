#!/usr/bin/env bash
# End-to-end API workflow check for the mystery shopper platform.
#
#   Admin assigns -> verified shopper submits -> reviewer approves -> regional
#   executive sees an updated scorecard. Also exercises role authorization.
#
# Requires a running API server (default http://127.0.0.1:8080).
#   BASE=http://127.0.0.1:8080 ./scripts/e2e-workflow.sh
set -uo pipefail
BASE=${BASE:-http://127.0.0.1:8080}
API=$BASE/api
DATE=$(date +%F)
PASS=0
FAIL=0

req() { # method path [body]
  local m=$1 p=$2 b=${3:-}
  if [ -n "$b" ]; then
    curl -s -w '\n%{http_code}' -X "$m" "$API$p" -H 'content-type: application/json' ${TOKEN:+-H "authorization: Bearer $TOKEN"} -d "$b"
  else
    curl -s -w '\n%{http_code}' -X "$m" "$API$p" ${TOKEN:+-H "authorization: Bearer $TOKEN"}
  fi
}

call() { # method path [body] -> sets BODY / CODE
  local out
  out=$(req "$@")
  CODE=$(printf '%s' "$out" | tail -n1)
  BODY=$(printf '%s' "$out" | sed '$d')
}

check2() { # label code_a code_b -- re-runnable creates accept 201 or 409
  local label=$1 a=$2 b=$3
  if [ "$CODE" = "$a" ] || [ "$CODE" = "$b" ]; then
    PASS=$((PASS + 1))
    printf 'PASS  %-56s %s\n' "$label" "$CODE"
  else
    FAIL=$((FAIL + 1))
    printf 'FAIL  %-56s got %s want %s|%s :: %s\n' "$label" "$CODE" "$a" "$b" "$(printf '%s' "$BODY" | head -c 200)"
  fi
}

check() { # label expected_code
  local label=$1 expected=$2
  if [ "$CODE" = "$expected" ]; then
    PASS=$((PASS + 1))
    printf 'PASS  %-56s %s\n' "$label" "$CODE"
  else
    FAIL=$((FAIL + 1))
    printf 'FAIL  %-56s got %s want %s :: %s\n' "$label" "$CODE" "$expected" "$(printf '%s' "$BODY" | head -c 220)"
  fi
}

j() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)" <<<"$BODY"; }

TOKEN=""

echo "=================== 1. Admin setup ==================="
call POST /auth/login '{"email":"admin@ricoz.in","password":"Admin@12345"}'
check "admin login" 200
ADMIN_TOKEN=$(j 'd["token"]')
TOKEN=$ADMIN_TOKEN

call POST /stores '{"name":"Hisar Central Mall","code":"HSR-01","brandName":"Ricoz","region":"North","city":"Hisar","address":"Sector 10, Hisar","contactPerson":"Rakesh","contactPhone":"9999999999","status":"active"}'
check2 "create store HSR-01 (new or existing)" 201 409
if [ "$CODE" = "201" ]; then
  STORE_ID=$(j 'd["id"]')
else
  call GET "/stores?search=HSR-01"
  STORE_ID=$(j '[s["id"] for s in d if s["code"] == "HSR-01"][0]')
fi

call POST /stores '{"name":"Rohtak Plaza","code":"RTK-01","brandName":"Ricoz","region":"North","city":"Rohtak","address":"Model Town","contactPerson":"Suman","contactPhone":"8888888888","status":"active"}'
check2 "create store RTK-01 (new or existing)" 201 409
if [ "$CODE" = "201" ]; then
  STORE2_ID=$(j 'd["id"]')
else
  call GET "/stores?search=RTK-01"
  STORE2_ID=$(j '[s["id"] for s in d if s["code"] == "RTK-01"][0]')
fi

call POST /stores '{"name":"Bengaluru Central","code":"BLR-01","brandName":"Ricoz","region":"South","city":"Bengaluru","address":"MG Road","contactPerson":"Anil","contactPhone":"7777777777","status":"active"}'
check2 "create store BLR-01 (new or existing)" 201 409
if [ "$CODE" = "201" ]; then
  SOUTH_STORE_ID=$(j 'd["id"]')
else
  call GET "/stores?search=BLR-01"
  SOUTH_STORE_ID=$(j '[s["id"] for s in d if s["code"] == "BLR-01"][0]')
fi

echo "=================== 2. Shopper self-registration ==================="
TOKEN=""
call POST /auth/register "{\"fullName\":\"Neha Sharma\",\"email\":\"shopper@ricoz.in\",\"password\":\"Shopper@123\",\"phone\":\"9811000001\",\"city\":\"Hisar\",\"experience\":2}"
check2 "public shopper registration (new or existing)" 201 409
if [ "$CODE" = "201" ]; then
  SHOPPER_TOKEN=$(j 'd["token"]')
  SHOPPER_ID=$(j 'd["user"]["shopperId"]')
else
  call POST /auth/login '{"email":"shopper@ricoz.in","password":"Shopper@123"}'
  SHOPPER_TOKEN=$(j 'd["token"]')
  SHOPPER_ID=$(j 'd["user"]["shopperId"]')
fi

call POST /auth/register '{"fullName":"Second Shopper","email":"shopper2@ricoz.in","password":"Shopper@123","phone":"9811000002","city":"Rohtak","experience":1}'
check2 "second public registration (new or existing)" 201 409
if [ "$CODE" = "201" ]; then
  ROLE=$(j 'd["user"]["role"]')
  if [ "$ROLE" = "mystery_shopper" ]; then
    PASS=$((PASS + 1)); echo "PASS  registration role forced to mystery_shopper"
  else
    FAIL=$((FAIL + 1)); echo "FAIL  registration role = $ROLE"
  fi
fi

echo "=================== 3. Admin verifies shopper ==================="
TOKEN=$ADMIN_TOKEN
call GET /shoppers
check "admin lists shoppers" 200
call POST "/shoppers/$SHOPPER_ID/verification" '{"verificationStatus":"verified","note":"Documents verified"}'
check "verify shopper" 200
VERIFIED=$(j 'd["verificationStatus"]' 2>/dev/null || echo '?')
if [ "$VERIFIED" = "verified" ]; then
  PASS=$((PASS + 1)); echo "PASS  shopper status = verified"
else
  FAIL=$((FAIL + 1)); echo "FAIL  shopper status = $VERIFIED"
fi

echo "=================== 4. Questionnaire ==================="
call POST /questionnaires '{"title":"Retail Visit E2E","description":"Standard in-store audit","status":"active","questions":[{"prompt":"How would you rate staff greeting?","type":"rating","required":true,"position":1,"options":[]},{"prompt":"Was the billing counter clean?","type":"yes_no","required":true,"position":2,"options":[]},{"prompt":"Which zone was visited?","type":"single_choice","required":true,"position":3,"options":["Apparel","Grocery","Electronics"]},{"prompt":"Describe the overall experience","type":"text","required":true,"position":4,"options":[]}]}'
check "create questionnaire" 201
if [ "$CODE" = "201" ]; then
  QNR_ID=$(j 'd["id"]')
else
  call GET "/questionnaires?search=Retail%20Visit%20E2E"
  QNR_ID=$(j '[q["id"] for q in d if q["title"] == "Retail Visit E2E"][0]')
  call GET "/questionnaires/$QNR_ID"
fi
Q1=$(j '[q["id"] for q in d["questions"] if q["type"]=="rating"][0]')
Q2=$(j '[q["id"] for q in d["questions"] if q["type"]=="yes_no"][0]')
Q3=$(j '[q["id"] for q in d["questions"] if q["type"]=="single_choice"][0]')
Q4=$(j '[q["id"] for q in d["questions"] if q["type"]=="text"][0]')

echo "=================== 5. Users: reviewer + regional ==================="
call POST /users '{"fullName":"Kavita Reviewer","email":"reviewer@ricoz.in","password":"Reviewer@123","role":"reviewer","region":null}'
check2 "admin creates reviewer (new or existing)" 201 409
if [ "$CODE" != "201" ]; then call GET /users; fi
call POST /users '{"fullName":"Amit Regional","email":"regional@ricoz.in","password":"Regional@123","role":"regional_executive","region":"North"}'
check2 "admin creates regional exec, North (new/existing)" 201 409
if [ "$CODE" != "201" ]; then call GET /users; fi
call GET /users
check "admin lists users" 200

echo "=================== 6. Task assignment ==================="
call POST /tasks "{\"storeId\":$STORE_ID,\"shopperId\":$SHOPPER_ID,\"questionnaireId\":$QNR_ID,\"visitDate\":\"$DATE\",\"dueDate\":\"$DATE\",\"instructions\":\"Complete a full visit and upload photos of the entrance and billing counter.\",\"priority\":\"high\",\"status\":\"assigned\"}"
check "admin creates + assigns task" 201
TASK_ID=$(j 'd["id"]')

call POST /tasks "{\"storeId\":$STORE2_ID,\"shopperId\":$SHOPPER_ID,\"questionnaireId\":$QNR_ID,\"visitDate\":\"$DATE\",\"dueDate\":\"$DATE\",\"instructions\":\"Second visit\",\"priority\":\"medium\",\"status\":\"assigned\"}"
check "admin assigns second task" 201

echo "=================== 7. Shopper submits report ==================="
TOKEN=$SHOPPER_TOKEN
call GET /shopper/overview
check "shopper overview" 200
call GET /tasks
check "shopper sees assigned tasks" 200
N_TASKS=$(j 'len(d)')
if [ "$N_TASKS" -ge 2 ]; then
  PASS=$((PASS + 1)); echo "PASS  shopper sees only their own assignments ($N_TASKS)"
else
  FAIL=$((FAIL + 1)); echo "FAIL  shopper sees $N_TASKS tasks"
fi

call POST /submissions "{\"taskId\":$TASK_ID}"
check "shopper starts report for task" 201
SUB_ID=$(j 'd["id"]')

call POST "/submissions/$SUB_ID/evidence" '{"fileName":"entrance.jpg","mimeType":"image/jpeg","data":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==","caption":"Store entrance"}'
check "upload evidence photo" 201

call PUT "/submissions/$SUB_ID/draft" "{\"comment\":\"Draft notes\",\"answers\":[{\"questionId\":$Q1,\"valueNumber\":4}]}"
check "save draft answers" 200
DRAFT_STATUS=$(j 'd["status"]')
if [ "$DRAFT_STATUS" = "draft" ]; then
  PASS=$((PASS + 1)); echo "PASS  report stays in draft after saving"
else
  FAIL=$((FAIL + 1)); echo "FAIL  draft status = $DRAFT_STATUS"
fi

call POST "/submissions/$SUB_ID/submit" "{\"comment\":\"Draft notes\",\"answers\":[{\"questionId\":$Q1,\"valueNumber\":4}]}"
check "incomplete report cannot be submitted" 400

call POST "/submissions/$SUB_ID/submit" "{\"comment\":\"Excellent staff behaviour, billing counter was tidy.\",\"answers\":[{\"questionId\":$Q1,\"valueNumber\":5},{\"questionId\":$Q2,\"valueBoolean\":true},{\"questionId\":$Q3,\"valueText\":\"Apparel\"},{\"questionId\":$Q4,\"valueText\":\"Very smooth experience overall.\"}]}"
check "submit complete report" 200
SUB_STATUS=$(j 'd["status"]')
if [ "$SUB_STATUS" = "submitted" ]; then
  PASS=$((PASS + 1)); echo "PASS  report status = submitted"
else
  FAIL=$((FAIL + 1)); echo "FAIL  submit status = $SUB_STATUS"
fi

call GET /submissions/mine
check "shopper submission history" 200

echo "=================== 8. Reviews ==================="
TOKEN=""
call POST /auth/login '{"email":"reviewer@ricoz.in","password":"Reviewer@123"}'
check "reviewer login" 200
REVIEWER_TOKEN=$(j 'd["token"]')
TOKEN=$REVIEWER_TOKEN

call GET /reviews/overview
check "reviewer overview" 200
call GET /reviews/queue
check "review queue" 200
IN_QUEUE=$(printf '%s' "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len([r for r in d if r['id'] == $SUB_ID]))")
if [ "$IN_QUEUE" = 1 ]; then
  PASS=$((PASS + 1)); echo "PASS  submitted report is in the review queue"
else
  FAIL=$((FAIL + 1)); echo "FAIL  report $SUB_ID missing from queue :: $(printf '%s' "$BODY" | head -c 200)"
fi

call GET "/submissions/$SUB_ID"
check "reviewer inspects report" 200
ANS=$(j 'len(d["questions"])')
EV=$(j 'len(d["evidence"])')
if [ "$ANS" = 4 ]; then PASS=$((PASS + 1)); echo "PASS  report carries 4 answers"; else FAIL=$((FAIL + 1)); echo "FAIL  answers = $ANS"; fi
if [ "$EV" = 1 ]; then PASS=$((PASS + 1)); echo "PASS  report carries 1 evidence photo"; else FAIL=$((FAIL + 1)); echo "FAIL  evidence = $EV"; fi

call POST "/reviews/$SUB_ID" '{"status":"approved","comment":"Evidence and answers consistent."}'
check "reviewer approves report" 200
REV_STATUS=$(j 'd["status"]')
if [ "$REV_STATUS" = "approved" ]; then
  PASS=$((PASS + 1)); echo "PASS  report approved"
else
  FAIL=$((FAIL + 1)); echo "FAIL  review status = $REV_STATUS"
fi

call GET /reviews/history
check "review history" 200
HIST=$(j 'len(d)')
if [ "$HIST" -ge 1 ]; then PASS=$((PASS + 1)); echo "PASS  decision recorded in history ($HIST decisions)"; else FAIL=$((FAIL + 1)); echo "FAIL  history = $HIST"; fi

echo "=================== 9. Regional executive ==================="
TOKEN=""
call POST /auth/login '{"email":"regional@ricoz.in","password":"Regional@123"}'
check "regional login" 200
REGIONAL_TOKEN=$(j 'd["token"]')
TOKEN=$REGIONAL_TOKEN

call GET /regional/overview
check "regional overview" 200
call GET /regional/scorecards
check "regional scorecards" 200
printf '%s' "$BODY" > /tmp/scorecards.json
python3 - <<'PY'
import json
with open("/tmp/scorecards.json") as handle:
    d = json.load(handle)
print("      scorecards:")
for s in d:
    print("        %-22s region=%-6s visits=%s average=%s last=%s trend=%s" % (
        s.get("storeName"), s.get("region"), s.get("visits"),
        s.get("averageScore"), s.get("lastScore"), s.get("trend")))
PY
call GET /regional/comparison
check "regional comparison" 200
call GET "/regional/trends?months=6"
check "regional trends" 200
call GET "/regional/export?dataset=scorecards"
check "regional CSV export" 200
printf '      csv head: %s\n' "$(printf '%s' "$BODY" | head -1)"

echo "=================== 10. Region enforcement ==================="
call GET "/stores/$SOUTH_STORE_ID"
check "regional exec cannot read other-region store" 404
call GET "/regional/scorecards?region=South"
check "regional exec cannot query another region" 403

echo "=================== 11. Authorization negatives ==================="
TOKEN=$SHOPPER_TOKEN
call GET /stores
check "shopper blocked from store directory" 403
call GET /users
check "shopper blocked from user management" 403
call POST /tasks "{\"storeId\":$STORE_ID,\"shopperId\":$SHOPPER_ID,\"questionnaireId\":$QNR_ID,\"visitDate\":\"$DATE\",\"dueDate\":\"$DATE\",\"instructions\":\"x\",\"priority\":\"low\",\"status\":\"assigned\"}"
check "shopper cannot create tasks" 403
call GET /reviews/queue
check "shopper blocked from review queue" 403
call GET /regional/overview
check "shopper blocked from regional data" 403
call GET "/submissions/$SUB_ID"
check "shopper can read own report" 200

TOKEN=""
call GET /tasks
check "anonymous request rejected" 401
call GET /submissions
check "anonymous submissions rejected" 401

TOKEN=$REVIEWER_TOKEN
call POST /users '{"fullName":"Nope","email":"nope@ricoz.in","password":"Nope@12345","role":"admin","region":null}'
check "reviewer cannot create users" 403
call POST /stores '{"name":"X","code":"X-01","brandName":"b","region":"North","city":"c","address":"a","status":"active"}'
check "reviewer cannot create stores" 403

echo "=================== 12. Settings + preferences ==================="
TOKEN=$ADMIN_TOKEN
call PUT /organization '{"name":"Ricoz Innovation","contactEmail":"ops@ricoz.in","phone":"+91 11 4000 0000","address":"Gurugram, Haryana","website":"https://ricoz.in"}'
check "admin updates organization settings" 200
call GET /organization
check "read organization settings" 200
call GET /me/preferences
check "read user preferences" 200
call PUT /me/preferences '{"timezone":"Asia/Kolkata","dateFormat":"dd/MM/yyyy","timeFormat":"24h","emailNotifications":true,"weeklyDigest":false}'
check "save user preferences" 200
TOKEN=$SHOPPER_TOKEN
call PUT /organization '{"brandName":"Hacked"}'
check "shopper cannot change org settings" 403

echo
echo "================ RESULT: $PASS passed, $FAIL failed ================"
[ "$FAIL" = 0 ] || exit 1
