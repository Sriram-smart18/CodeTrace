$files = @(
  "src\pages\teacher\Monitoring.tsx",
  "src\components\ProtectedRoute.tsx",
  "src\pages\admin\Teachers.tsx",
  "src\pages\admin\Students.tsx",
  "src\pages\teacher\Assignments.tsx",
  "src\pages\teacher\Dashboard.tsx"
)

Write-Host "=== TASK STATUS AUDIT ==="
Write-Host ""

foreach ($f in $files) {
  $content = [System.IO.File]::ReadAllText("c:\Users\patar\OneDrive\Desktop\Tracecode\$f")
  $anyCount = [regex]::Matches($content, " as any").Count
  $status = if ($anyCount -eq 0) { "CLEAN" } else { "HAS $anyCount 'as any'" }
  Write-Host "[$status] $f"
}

Write-Host ""
Write-Host "=== SPECIFIC CHECKS ==="

# Task 1: Monitoring - single channel, no duplicate
$mon = [System.IO.File]::ReadAllText("c:\Users\patar\OneDrive\Desktop\Tracecode\src\pages\teacher\Monitoring.tsx")
$channelCount = [regex]::Matches($mon, "supabase\.channel\(").Count
$setupRealtimeExists = $mon -match "setupRealtime"
$cleanupExists = $mon -match "supabase\.removeChannel"
Write-Host "Task 1 - Monitoring:"
Write-Host "  supabase.channel() calls : $channelCount (should be 1)"
Write-Host "  setupRealtime() removed  : $(-not $setupRealtimeExists)"
Write-Host "  cleanup removeChannel    : $cleanupExists"

# Task 2: ProtectedRoute - no as any on is_suspended
$pr = [System.IO.File]::ReadAllText("c:\Users\patar\OneDrive\Desktop\Tracecode\src\components\ProtectedRoute.tsx")
$suspendedTyped = $pr -match "profile\.is_suspended"
$suspendedAny = $pr -match "as any"
Write-Host ""
Write-Host "Task 2 - ProtectedRoute:"
Write-Host "  profile.is_suspended typed : $suspendedTyped"
Write-Host "  no 'as any'                : $(-not $suspendedAny)"

# Task 3: Admin pages - no as any on is_suspended update
$teachers = [System.IO.File]::ReadAllText("c:\Users\patar\OneDrive\Desktop\Tracecode\src\pages\admin\Teachers.tsx")
$students = [System.IO.File]::ReadAllText("c:\Users\patar\OneDrive\Desktop\Tracecode\src\pages\admin\Students.tsx")
Write-Host ""
Write-Host "Task 3 - Admin pages:"
Write-Host "  Teachers.tsx no 'as any'  : $(-not ($teachers -match ' as any'))"
Write-Host "  Students.tsx no 'as any'  : $(-not ($students -match ' as any'))"

# Task 4: Assignments - useCallback + proper deps
$asgn = [System.IO.File]::ReadAllText("c:\Users\patar\OneDrive\Desktop\Tracecode\src\pages\teacher\Assignments.tsx")
$hasCallback = $asgn -match "useCallback"
$hasDep = $asgn -match "user\?\.id"
$hasEffect = $asgn -match "useEffect.*fetchAssignments"
Write-Host ""
Write-Host "Task 4 - Assignments useEffect:"
Write-Host "  useCallback used          : $hasCallback"
Write-Host "  user?.id as dep           : $hasDep"
Write-Host "  useEffect deps correct    : $hasEffect"

# Task 5: Dashboard - classrooms query returns data + count
$dash = [System.IO.File]::ReadAllText("c:\Users\patar\OneDrive\Desktop\Tracecode\src\pages\teacher\Dashboard.tsx")
$hasCountExact = $dash -match 'count: "exact"'
$hasDataClassrooms = $dash -match "data: classrooms"
$hasCountClassrooms = $dash -match "count: classroomCount"
$setsRecentClassrooms = $dash -match "setRecentClassrooms\(classrooms"
Write-Host ""
Write-Host "Task 5 - Dashboard query:"
Write-Host "  count: exact used         : $hasCountExact"
Write-Host "  data: classrooms captured : $hasDataClassrooms"
Write-Host "  count: classroomCount     : $hasCountClassrooms"
Write-Host "  setRecentClassrooms used  : $setsRecentClassrooms"

Write-Host ""
Write-Host "=== RESULT ==="
$allClean = $true
foreach ($f in $files) {
  $content = [System.IO.File]::ReadAllText("c:\Users\patar\OneDrive\Desktop\Tracecode\$f")
  $anyCount = [regex]::Matches($content, " as any").Count
  if ($anyCount -gt 0) { $allClean = $false }
}
if ($allClean -and $channelCount -eq 1 -and $cleanupExists -and $hasCallback -and $setsRecentClassrooms) {
  Write-Host "ALL TASKS COMPLETE - READY FOR MIGRATION"
} else {
  Write-Host "ISSUES REMAIN - CHECK ABOVE"
}
