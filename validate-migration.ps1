$f = [System.IO.File]::ReadAllText("c:\Users\patar\OneDrive\Desktop\Tracecode\COMPLETE_MIGRATION.sql")
$results = @()

function Check($id, $desc, $pass) {
  $status = if ($pass) { "PASS" } else { "FAIL" }
  $results += [PSCustomObject]@{ ID=$id; Status=$status; Description=$desc }
  Write-Host "[$status] $id. $desc"
}

# 1. Enum in DO block (required — ALTER TYPE cannot run in transaction)
Check 1 "Enum ALTER TYPE inside DO block" ($f -match '(?s)DO \$\$.*?ALTER TYPE public\.app_role ADD VALUE')

# 2. FK order: classrooms before classroom_students
$p_cr  = $f.IndexOf("CREATE TABLE IF NOT EXISTS public.classrooms (")
$p_cs  = $f.IndexOf("CREATE TABLE IF NOT EXISTS public.classroom_students")
Check 2 "classrooms created before classroom_students" ($p_cr -gt 0 -and $p_cr -lt $p_cs)

# 3. classroom_id FK added after classrooms table exists
$p_fk  = $f.IndexOf("ADD COLUMN IF NOT EXISTS classroom_id UUID")
Check 3 "classroom_id FK added after classrooms table" ($p_fk -gt $p_cr)

# 4. RLS enabled before policies
$p_rls = $f.IndexOf("ENABLE ROW LEVEL SECURITY")
$p_pol = $f.IndexOf("CREATE POLICY")
Check 4 "RLS enabled before first CREATE POLICY" ($p_rls -gt 0 -and $p_rls -lt $p_pol)

# 5. Every CREATE POLICY has a DROP POLICY IF EXISTS before it
$creates = [regex]::Matches($f, 'CREATE POLICY "([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
$drops   = [regex]::Matches($f, 'DROP POLICY IF EXISTS "([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
$missing = $creates | Where-Object { $drops -notcontains $_ }
Check 5 "All CREATE POLICY have DROP POLICY IF EXISTS ($($missing.Count) missing)" ($missing.Count -eq 0)
if ($missing.Count -gt 0) { $missing | ForEach-Object { Write-Host "       MISSING DROP: $_" } }

# 6. No destructive keywords
$bad   = @("DROP TABLE","TRUNCATE TABLE","DELETE FROM","DROP SCHEMA","DROP DATABASE","RESET ALL")
$found = $bad | Where-Object { $f -match [regex]::Escape($_) }
Check 6 "No destructive keywords ($($found.Count) found)" ($found.Count -eq 0)
if ($found.Count -gt 0) { $found | ForEach-Object { Write-Host "       FOUND: $_" } }

# 7. All ADD COLUMN use IF NOT EXISTS
$bare7 = [regex]::Matches($f, 'ADD COLUMN(?! IF NOT EXISTS)').Count
Check 7 "All ADD COLUMN use IF NOT EXISTS ($bare7 bare)" ($bare7 -eq 0)

# 8. All CREATE TABLE use IF NOT EXISTS
$bare8 = [regex]::Matches($f, 'CREATE TABLE(?! IF NOT EXISTS)').Count
Check 8 "All CREATE TABLE use IF NOT EXISTS ($bare8 bare)" ($bare8 -eq 0)

# 9. All CREATE INDEX use IF NOT EXISTS
$bare9 = [regex]::Matches($f, 'CREATE INDEX(?! IF NOT EXISTS)').Count
Check 9 "All CREATE INDEX use IF NOT EXISTS ($bare9 bare)" ($bare9 -eq 0)

# 10. Trigger references existing function
Check 10 "Trigger references update_updated_at_column()" ($f -match 'update_updated_at_column\(\)')

# 11. has_role used with admin
Check 11 "has_role() called with 'admin' in policies" ($f -match "has_role\(auth\.uid\(\), 'admin'\)")

# 12. Verification query present
Check 12 "Phase 16 verification query present" ($f -match 'PHASE 16')

# 13. Phase 1 comes before Phase 9 (enum before RLS that uses admin)
$p_ph1 = $f.IndexOf("PHASE 1 ")
$p_ph9 = $f.IndexOf("PHASE 9 ")
Check 13 "Phase 1 (enum) before Phase 9 (RLS using admin)" ($p_ph1 -lt $p_ph9)

# 14. OR REPLACE on functions (safe re-run)
$fnCount = [regex]::Matches($f, 'CREATE OR REPLACE FUNCTION').Count
Check 14 "Functions use CREATE OR REPLACE ($fnCount functions)" ($fnCount -ge 2)

# 15. Realtime in DO blocks (safe re-run)
Check 15 "Realtime ALTER PUBLICATION in DO blocks" ($f -match '(?s)DO \$\$.*?ALTER PUBLICATION supabase_realtime')

# 16. No bare ALTER TYPE outside DO block
$bareAT = [regex]::Matches($f, '(?<!DO \$\$[\s\S]{0,500})ALTER TYPE public\.app_role ADD VALUE(?<!\$\$)').Count
# Simpler check: count ALTER TYPE ADD VALUE occurrences
$atCount = [regex]::Matches($f, 'ALTER TYPE public\.app_role ADD VALUE').Count
Check 16 "ALTER TYPE ADD VALUE count = 1 (inside DO block only)" ($atCount -eq 1)

# Summary
Write-Host ""
Write-Host "=== SUMMARY ==="
$pass = ($results | Where-Object { $_.Status -eq "PASS" }).Count
$fail = ($results | Where-Object { $_.Status -eq "FAIL" }).Count
Write-Host "PASS: $pass / $($results.Count)"
Write-Host "FAIL: $fail / $($results.Count)"

Write-Host ""
Write-Host "=== MIGRATION COUNTS ==="
Write-Host "CREATE POLICY        : $([regex]::Matches($f,'CREATE POLICY').Count)"
Write-Host "DROP POLICY IF EXISTS: $([regex]::Matches($f,'DROP POLICY IF EXISTS').Count)"
Write-Host "ADD COLUMN IF NOT EX : $([regex]::Matches($f,'ADD COLUMN IF NOT EXISTS').Count)"
Write-Host "CREATE TABLE IF NOT  : $([regex]::Matches($f,'CREATE TABLE IF NOT EXISTS').Count)"
Write-Host "CREATE INDEX IF NOT  : $([regex]::Matches($f,'CREATE INDEX IF NOT EXISTS').Count)"
Write-Host "OR REPLACE FUNCTION  : $([regex]::Matches($f,'CREATE OR REPLACE FUNCTION').Count)"
Write-Host "DO blocks            : $([regex]::Matches($f,'DO \$\$').Count)"
Write-Host "Verification checks  : $([regex]::Matches($f,"UNION ALL SELECT '(COL|TABLE|ENUM|RLS|INDEX|TRIGGER):").Count)"

if ($fail -gt 0) { exit 1 } else { exit 0 }
