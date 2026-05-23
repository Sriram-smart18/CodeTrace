$sql     = [System.IO.File]::ReadAllText("c:\Users\patar\OneDrive\Desktop\Tracecode\COMPLETE_MIGRATION.sql")
# Keep comments for phase-label searches; strip for SQL-only checks
$sqlLines = $sql -split "`n"
$sqlOnly  = ($sqlLines | Where-Object { $_ -notmatch '^\s*--' }) -join "`n"

$passCount = 0; $failCount = 0
$failures  = @()

function Check($id, $desc, [bool]$ok, $detail="") {
  if ($ok) {
    Write-Host "  [PASS] $id $desc"
    $script:passCount++
  } else {
    Write-Host "  [FAIL] $id $desc$(if($detail){' -- '+$detail})"
    $script:failCount++
    $script:failures += "$id $desc$(if($detail){' -- '+$detail})"
  }
}

# ================================================================
Write-Host ""
Write-Host "=== SECTION 1: has_role() CALL VALIDATION ==="
Write-Host "    Signature: has_role(_user_id UUID, _role app_role)"
Write-Host ""

# Match has_role calls allowing nested parens: has_role(auth.uid(), 'admin')
# Pattern: has_role( <anything> , <anything> )
$hrCalls = [regex]::Matches($sqlOnly, "(?:public\.)?has_role\(([^,]+),\s*([^)]+)\)")
Write-Host "    Found $($hrCalls.Count) has_role() calls:"
$hrBad = @()
foreach ($c in $hrCalls) {
  $a1 = $c.Groups[1].Value.Trim()
  $a2 = $c.Groups[2].Value.Trim()
  # arg1 must be auth.uid() or a _user_id param
  $a1ok = $a1 -match "auth\.uid\(\)" -or $a1 -match "_user_id"
  # arg2 must be a quoted role or app_role type reference
  $a2ok = $a2 -match "'(admin|teacher|student)'" -or $a2 -match "app_role"
  $status = if ($a1ok -and $a2ok) { "PASS" } else { "FAIL" }
  Write-Host "    [$status] has_role($a1, $a2)"
  if ($status -eq "FAIL") { $hrBad += "has_role($a1, $a2)" }
}
Check "HR-1" "All has_role() calls have correct argument order ($($hrCalls.Count) calls)" `
  ($hrBad.Count -eq 0) (if($hrBad.Count -gt 0){"Bad: "+($hrBad -join "; ")}else{""})

# ================================================================
Write-Host ""
Write-Host "=== SECTION 2: POLICY EXTRACTION ==="
Write-Host ""

# Extract policies from SQL-only content
$polMatches = [regex]::Matches($sqlOnly, 'CREATE POLICY\s+"([^"]+)"\s+ON\s+public\.(\w+)\s+FOR\s+(\w+)[^;]+?(?:USING|WITH CHECK)\s*\(([^;]+)\)')
$pols = @()
foreach ($m in $polMatches) {
  $body = $m.Groups[4].Value.Trim() -replace '\s+', ' '
  $pols += [PSCustomObject]@{
    Name  = $m.Groups[1].Value
    Table = $m.Groups[2].Value
    Op    = $m.Groups[3].Value
    Body  = $body
  }
}
Write-Host "    Extracted $($pols.Count) policies:"
$pols | ForEach-Object { Write-Host "    [$($_.Op)] $($_.Table) -- $($_.Name)" }

function FindPol($table, $op, $bodyPat) {
  [bool]($pols | Where-Object { $_.Table -eq $table -and $_.Op -eq $op -and $_.Body -match $bodyPat })
}

# ================================================================
Write-Host ""
Write-Host "=== SECTION 3: ISOLATION LOGIC VALIDATION ==="
Write-Host ""

Write-Host "  [classrooms]"
Check "CR-1" "Teacher SELECT scoped to teacher_id = auth.uid()" `
  (FindPol "classrooms" "SELECT" "teacher_id\s*=\s*auth\.uid\(\)")
Check "CR-2" "Teacher INSERT requires teacher_id = auth.uid()" `
  (FindPol "classrooms" "INSERT" "teacher_id\s*=\s*auth\.uid\(\)")
Check "CR-3" "Teacher UPDATE scoped to teacher_id = auth.uid()" `
  (FindPol "classrooms" "UPDATE" "teacher_id\s*=\s*auth\.uid\(\)")
Check "CR-4" "Teacher DELETE scoped to teacher_id = auth.uid()" `
  (FindPol "classrooms" "DELETE" "teacher_id\s*=\s*auth\.uid\(\)")
Check "CR-5" "Student SELECT checks classroom_students enrollment" `
  (FindPol "classrooms" "SELECT" "classroom_students.*student_id\s*=\s*auth\.uid\(\)")
Check "CR-6" "Admin SELECT via has_role admin" `
  (FindPol "classrooms" "SELECT" "has_role.*admin")

Write-Host ""
Write-Host "  [classroom_students]"
Check "CS-1" "Student INSERT: student_id = auth.uid() only" `
  (FindPol "classroom_students" "INSERT" "student_id\s*=\s*auth\.uid\(\)")
Check "CS-2" "Teacher DELETE: verifies classroom ownership" `
  (FindPol "classroom_students" "DELETE" "classrooms.*teacher_id\s*=\s*auth\.uid\(\)")
Check "CS-3" "Student SELECT: own enrollments only" `
  (FindPol "classroom_students" "SELECT" "student_id\s*=\s*auth\.uid\(\)")

Write-Host ""
Write-Host "  [assignments]"
Check "AS-1" "Student SELECT: checks classroom_students enrollment" `
  (FindPol "assignments" "SELECT" "classroom_students")
Check "AS-2" "Legacy NULL classroom_id: backward compatible" `
  (FindPol "assignments" "SELECT" "classroom_id IS NULL")
Check "AS-3" "Teacher INSERT: created_by = auth.uid()" `
  (FindPol "assignments" "INSERT" "created_by\s*=\s*auth\.uid\(\)")
Check "AS-4" "Teacher INSERT: verifies classroom ownership" `
  (FindPol "assignments" "INSERT" "classrooms.*teacher_id\s*=\s*auth\.uid\(\)")
Check "AS-5" "Teacher UPDATE: created_by = auth.uid()" `
  (FindPol "assignments" "UPDATE" "created_by\s*=\s*auth\.uid\(\)")
Check "AS-6" "Teacher DELETE: created_by = auth.uid()" `
  (FindPol "assignments" "DELETE" "created_by\s*=\s*auth\.uid\(\)")
Check "AS-7" "Admin UPDATE/DELETE via has_role admin" `
  (FindPol "assignments" "UPDATE" "has_role.*admin")

Write-Host ""
Write-Host "  [profiles]"
Check "PR-1" "Admin SELECT on profiles" `
  (FindPol "profiles" "SELECT" "has_role.*admin")
Check "PR-2" "Admin UPDATE on profiles" `
  (FindPol "profiles" "UPDATE" "has_role.*admin")

Write-Host ""
Write-Host "  [submissions]"
Check "SB-1" "Admin SELECT on submissions" `
  (FindPol "submissions" "SELECT" "has_role.*admin")

# ================================================================
Write-Host ""
Write-Host "=== SECTION 4: REALTIME SECURITY ==="
Write-Host ""

Check "RT-1" "classrooms added to supabase_realtime" `
  ([bool]($sql -match "ALTER PUBLICATION supabase_realtime ADD TABLE public\.classrooms"))
Check "RT-2" "classroom_students added to supabase_realtime" `
  ([bool]($sql -match "ALTER PUBLICATION supabase_realtime ADD TABLE public\.classroom_students"))
Check "RT-3" "Realtime ALTER PUBLICATION in DO blocks (idempotent)" `
  ([bool]($sql -match '(?s)DO \$\$[\s\S]{0,200}ALTER PUBLICATION supabase_realtime'))
Check "RT-4" "activity_events teacher policy in original migration" `
  ([bool]([System.IO.File]::ReadAllText("c:\Users\patar\OneDrive\Desktop\Tracecode\supabase\migrations\20260403094850_b07a0c14-0878-4531-9786-b7c62c7a04ba.sql") -match "Teachers can view all events"))
Check "RT-5" "Frontend monitoring scoped to teacher assignment IDs" `
  ([bool]([System.IO.File]::ReadAllText("c:\Users\patar\OneDrive\Desktop\Tracecode\src\pages\teacher\Monitoring.tsx") -match "created_by"))

# ================================================================
Write-Host ""
Write-Host "=== SECTION 5: DEPENDENCY ORDER ==="
Write-Host ""

# Use full sql (with comments) for phase labels, sqlOnly for SQL positions
$p_rls_pos  = $sqlOnly.IndexOf("ENABLE ROW LEVEL SECURITY")
$p_pol_pos  = $sqlOnly.IndexOf("CREATE POLICY")
$p_cr_tbl   = $sqlOnly.IndexOf("CREATE TABLE IF NOT EXISTS public.classrooms (")
$p_cs_tbl   = $sqlOnly.IndexOf("CREATE TABLE IF NOT EXISTS public.classroom_students")
$p_fk_col   = $sqlOnly.IndexOf("ADD COLUMN IF NOT EXISTS classroom_id UUID")

# Phase labels are in comments — search full sql
$p_ph1 = $sql.IndexOf("PHASE 1 ")
$p_ph9 = $sql.IndexOf("PHASE 9 ")

Check "ORD-1" "RLS ENABLE before first CREATE POLICY (pos $p_rls_pos < $p_pol_pos)" `
  ($p_rls_pos -gt 0 -and $p_rls_pos -lt $p_pol_pos)
Check "ORD-2" "Phase 1 (enum) before Phase 9 (admin RLS) (pos $p_ph1 < $p_ph9)" `
  ($p_ph1 -gt 0 -and $p_ph1 -lt $p_ph9)
Check "ORD-3" "classrooms table before classroom_students (pos $p_cr_tbl < $p_cs_tbl)" `
  ($p_cr_tbl -gt 0 -and $p_cr_tbl -lt $p_cs_tbl)
Check "ORD-4" "classroom_id FK after classrooms table (pos $p_fk_col > $p_cr_tbl)" `
  ($p_fk_col -gt $p_cr_tbl)

# ================================================================
Write-Host ""
Write-Host "=== SECTION 6: DATA SAFETY ==="
Write-Host ""

$badKw = @("DROP TABLE","TRUNCATE TABLE","DELETE FROM","DROP SCHEMA","DROP DATABASE","DROP FUNCTION")
$i = 1
foreach ($kw in $badKw) {
  Check "SAF-$i" "No '$kw' in migration" `
    (-not [bool]($sqlOnly -match [regex]::Escape($kw)))
  $i++
}
Check "SAF-7" "No ALTER TABLE ... DROP COLUMN" `
  (-not [bool]($sqlOnly -match "ALTER TABLE.*DROP COLUMN"))

foreach ($t in @("submissions","ai_evaluations","activity_events","fraud_alerts","user_roles")) {
  Check "SAF-$t" "Table '$t' not dropped or truncated" `
    (-not [bool]($sqlOnly -match "DROP TABLE.*$t") -and -not [bool]($sqlOnly -match "TRUNCATE.*$t"))
}

# ================================================================
Write-Host ""
Write-Host "=== SECTION 7: COMPLETENESS ==="
Write-Host ""

$items = @(
  @{d="assignments.difficulty";                    p=[bool]($sql -match "ADD COLUMN IF NOT EXISTS difficulty")},
  @{d="assignments.expected_skill_level";          p=[bool]($sql -match "ADD COLUMN IF NOT EXISTS expected_skill_level")},
  @{d="assignments.language";                      p=[bool]($sql -match "ADD COLUMN IF NOT EXISTS language")},
  @{d="assignments.classroom_id";                  p=[bool]($sql -match "ADD COLUMN IF NOT EXISTS classroom_id")},
  @{d="profiles.is_suspended";                     p=[bool]($sql -match "ADD COLUMN IF NOT EXISTS is_suspended")},
  @{d="submissions.behavioral_log";                p=[bool]($sql -match "ADD COLUMN IF NOT EXISTS behavioral_log")},
  @{d="ai_evaluations.risk_level";                 p=[bool]($sql -match "ADD COLUMN IF NOT EXISTS risk_level")},
  @{d="ai_evaluations.integrity_verdict";          p=[bool]($sql -match "ADD COLUMN IF NOT EXISTS integrity_verdict")},
  @{d="ai_evaluations.suspicious_segments";        p=[bool]($sql -match "ADD COLUMN IF NOT EXISTS suspicious_segments")},
  @{d="ai_evaluations.ai_indicators";              p=[bool]($sql -match "ADD COLUMN IF NOT EXISTS ai_indicators")},
  @{d="ai_evaluations.plagiarism_indicators";      p=[bool]($sql -match "ADD COLUMN IF NOT EXISTS plagiarism_indicators")},
  @{d="ai_evaluations.faculty_review_recommended"; p=[bool]($sql -match "ADD COLUMN IF NOT EXISTS faculty_review_recommended")},
  @{d="ai_evaluations.style_inconsistency_detected";p=[bool]($sql -match "ADD COLUMN IF NOT EXISTS style_inconsistency_detected")},
  @{d="ai_evaluations.paste_suspected";            p=[bool]($sql -match "ADD COLUMN IF NOT EXISTS paste_suspected")},
  @{d="ai_evaluations.complexity_jump_detected";   p=[bool]($sql -match "ADD COLUMN IF NOT EXISTS complexity_jump_detected")},
  @{d="ai_evaluations.peer_similarity_scores";     p=[bool]($sql -match "ADD COLUMN IF NOT EXISTS peer_similarity_scores")},
  @{d="ai_evaluations.highest_peer_similarity";    p=[bool]($sql -match "ADD COLUMN IF NOT EXISTS highest_peer_similarity")},
  @{d="ai_evaluations.peer_ai_verdict";            p=[bool]($sql -match "ADD COLUMN IF NOT EXISTS peer_ai_verdict")},
  @{d="TABLE: classrooms";                         p=[bool]($sql -match "CREATE TABLE IF NOT EXISTS public\.classrooms")},
  @{d="TABLE: classroom_students";                 p=[bool]($sql -match "CREATE TABLE IF NOT EXISTS public\.classroom_students")},
  @{d="ENUM: admin value";                         p=[bool]($sql -match "ALTER TYPE public\.app_role ADD VALUE")},
  @{d="FUNC: has_role() updated";                  p=[bool]($sql -match "CREATE OR REPLACE FUNCTION public\.has_role")},
  @{d="FUNC: handle_new_user() with ON CONFLICT";  p=[bool]($sql -match "ON CONFLICT.*DO NOTHING")},
  @{d="INDEX: idx_classrooms_teacher";             p=[bool]($sql -match "idx_classrooms_teacher")},
  @{d="INDEX: idx_classrooms_code";                p=[bool]($sql -match "idx_classrooms_code")},
  @{d="INDEX: idx_classroom_students_classroom";   p=[bool]($sql -match "idx_classroom_students_classroom")},
  @{d="INDEX: idx_classroom_students_student";     p=[bool]($sql -match "idx_classroom_students_student")},
  @{d="INDEX: idx_assignments_classroom";          p=[bool]($sql -match "idx_assignments_classroom")},
  @{d="INDEX: idx_assignments_created_by";         p=[bool]($sql -match "idx_assignments_created_by")},
  @{d="TRIGGER: classrooms updated_at";            p=[bool]($sql -match "update_classrooms_updated_at")},
  @{d="VERIFY: Phase 16 query present";            p=[bool]($sql -match "PHASE 16")}
)
$ci = 1
foreach ($item in $items) {
  Check "CMP-$ci" $item.d $item.p
  $ci++
}

# ================================================================
Write-Host ""
Write-Host "================================================================"
Write-Host "  FINAL VALIDATION REPORT"
Write-Host "================================================================"
$total = $passCount + $failCount
Write-Host "  PASS : $passCount / $total"
Write-Host "  FAIL : $failCount / $total"
Write-Host ""

if ($failures.Count -gt 0) {
  Write-Host "  FAILED CHECKS:"
  $failures | ForEach-Object { Write-Host "    - $_" }
  Write-Host ""
}

if ($failCount -eq 0) {
  Write-Host "  RESULT: MIGRATION IS SAFE TO EXECUTE"
} else {
  Write-Host "  RESULT: MIGRATION HAS ISSUES - REVIEW BEFORE EXECUTING"
}
Write-Host "================================================================"

if ($failCount -gt 0) { exit 1 } else { exit 0 }
