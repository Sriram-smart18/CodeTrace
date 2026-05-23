$anon = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2dXhpbXJ4bG9ndnRnaXJ0bHNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzA5NzcsImV4cCI6MjA5MDU0Njk3N30.kMFv3U_Yk_gCOrtU8VDYlZHb7OkznpBm_GtQZWWD18I"
$h = @{ "apikey" = $anon; "Authorization" = "Bearer $anon" }
$base = "https://uvuximrxlogvtgirtlsc.supabase.co/rest/v1"

$checks = @(
  "classrooms:id",
  "classroom_students:id",
  "assignments:classroom_id",
  "assignments:difficulty",
  "assignments:language",
  "assignments:expected_skill_level",
  "profiles:is_suspended",
  "submissions:behavioral_log",
  "ai_evaluations:risk_level",
  "ai_evaluations:integrity_verdict",
  "ai_evaluations:peer_similarity_scores",
  "ai_evaluations:faculty_review_recommended",
  "ai_evaluations:behavioral_log"
)

$missing = 0
$exists  = 0
foreach ($item in $checks) {
  $parts = $item.Split(":")
  $tbl = $parts[0]; $col = $parts[1]
  try {
    $null = Invoke-RestMethod -Uri "$base/${tbl}?select=${col}&limit=0" -Headers $h -UseBasicParsing -ErrorAction Stop
    Write-Host "EXISTS  ${tbl}.${col}"
    $exists++
  } catch {
    Write-Host "MISSING ${tbl}.${col}"
    $missing++
  }
}
Write-Host ""
Write-Host "EXISTS: $exists  MISSING: $missing"
if ($missing -eq 0) {
  Write-Host "STATUS: MIGRATION ALREADY APPLIED"
} else {
  Write-Host "STATUS: MIGRATION NEEDED ($missing items missing)"
}
