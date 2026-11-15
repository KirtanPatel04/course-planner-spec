#!/usr/bin/env bash
# Walks through the main Course Planner scenarios against a running server (npm run dev).
# Usage: scripts/demo.sh [base-url]        Requires curl and jq. In a terminal it pauses between steps.
set -euo pipefail
API=${1:-http://localhost:3000}

step() { echo; echo "=== $1"; if [[ -t 0 ]]; then read -r -p "(Enter) " _; fi; }
# call <user|-> <METHOD> <path> [json-body] [jq-filter]: prints the request, the filtered body, the status
call() {
  local user=$1 method=$2 path=$3 body=${4:-} filter=${5:-.}
  local args=(-s -X "$method" "$API$path" -H 'Content-Type: application/json' -o /tmp/course-planner-demo.json -w '%{http_code}')
  [[ $user != - ]] && args+=(-H "X-User-Id: $user")
  [[ -n $body ]] && args+=(-d "$body")
  echo "> $method $path   (as ${user/#-/nobody})"
  local code; code=$(curl "${args[@]}")
  jq "$filter" /tmp/course-planner-demo.json 2>/dev/null || cat /tmp/course-planner-demo.json
  echo "HTTP $code"
}

step "Sync status (FR-018)"
call stu-a GET /sync-status '' .

step "No sign-in is rejected (FR-019, X-01)"
call - GET /schedules '' .

step "AC-001: Core sections in Fall 2027 starting at or after 17:00"
call stu-a GET '/sections?term=FA27&requirement=CORE&startsAtOrAfter=17:00' '' '.[]? | {sectionId, courseId, meetings, seatsAvailable}'

step "AC-003: stu-a creates a Fall 2027 draft and adds CSCI8100-001"
ID=$(curl -s -X POST "$API/schedules" -H 'X-User-Id: stu-a' -H 'Content-Type: application/json' -d '{"term":"FA27","name":"Demo fall plan"}' | jq -r .id)
echo "draft id: $ID"
call stu-a POST "/schedules/$ID/sections" '{"sectionId":"CSCI8100-001"}' '{status, sectionIds, totalCreditHours}'

step "AC-004: adding CSCI8200-001 (Tue 18:00) flags a TIME_CONFLICT on both sections"
call stu-a POST "/schedules/$ID/sections" '{"sectionId":"CSCI8200-001"}' '.validationResults? | map({sectionId, outcome, flags: [.flags[].code]})'

step "Remove CSCI8200-001 and add CSCI8000-001 instead; everything passes (AC-009)"
call stu-a DELETE "/schedules/$ID/sections/CSCI8200-001" >/dev/null
call stu-a POST "/schedules/$ID/sections" '{"sectionId":"CSCI8000-001"}' '{sectionIds, totalCreditHours, results: (.validationResults? | map({sectionId, outcome}))}'

step "AC-033: stu-b cannot see stu-a's schedule (same answer as a missing one)"
call stu-b GET "/schedules/$ID" '' .

step "AC-010: stu-a's generated plan of study"
call stu-a GET /plan '' '.terms? | map({term, courses: [.courses[].courseId]})'

step "AC-013: stu-a submits; the advisor is notified"
call stu-a POST "/schedules/$ID/submit" '' '{status, classification}'
call adv-1 GET /notifications '' 'map({event, message})'

step "AC-015: adv-1's dashboard"
call adv-1 GET /advisor/dashboard '' 'map({studentName, term, label: .classification.label, reasons: [.classification.reasons[].code]})'

step "AC-034: stu-a cannot approve their own schedule"
call stu-a POST "/schedules/$ID/approve" '' .

step "AC-016: adv-1 approves in one step"
call adv-1 POST "/schedules/$ID/approve" '' '{status, history: (.history? | map("\(.from) -> \(.to) by \(.actor.id // .actor.kind)"))}'

echo; echo "Waiting for the job runner to enroll the schedule (FR-014)..."
for _ in $(seq 1 12); do
  STATUS=$(curl -s "$API/schedules/$ID" -H 'X-User-Id: stu-a' | jq -r .status)
  [[ $STATUS == ENROLLED || $STATUS == PARTIALLY_ENROLLED ]] && break
  sleep 5
done

step "AC-024: enrolled, with one Enrollment Record per section and a notification"
call stu-a GET "/schedules/$ID" '' '{status, enrollmentRecords: (.enrollmentRecords? | map({sectionId, outcome}))}'
call stu-a GET /notifications '' 'map({event, message})'

step "AC-012: degree progress"
call stu-a GET /degree-progress '' '.requirements? | map({requirementId, status, creditHoursCompleted, creditHoursRequired})'
echo; echo "Done."
