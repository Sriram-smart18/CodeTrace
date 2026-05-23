# Deep audit - find exact lines with as any and check monitoring channel
$root = "c:\Users\patar\OneDrive\Desktop\Tracecode\src"

Write-Host "=== EXACT 'as any' LOCATIONS ==="
$files = Get-ChildItem -Path $root -Recurse -Include "*.tsx","*.ts" | Where-Object { $_.FullName -notmatch "node_modules" }
foreach ($f in $files) {
  $lines = [System.IO.File]::ReadAllLines($f.FullName)
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match " as any") {
      $rel = $f.FullName.Replace("c:\Users\patar\OneDrive\Desktop\Tracecode\", "")
      Write-Host "  $rel : line $($i+1) : $($lines[$i].Trim())"
    }
  }
}

Write-Host ""
Write-Host "=== MONITORING CHANNEL VERIFICATION ==="
$mon = [System.IO.File]::ReadAllText("c:\Users\patar\OneDrive\Desktop\Tracecode\src\pages\teacher\Monitoring.tsx")
# Count all channel-related calls
$ch1 = [regex]::Matches($mon, "supabase\.channel\(").Count
$ch2 = [regex]::Matches($mon, "\.channel\(").Count
$ch3 = [regex]::Matches($mon, "removeChannel").Count
Write-Host "  supabase.channel() calls : $ch1"
Write-Host "  .channel() calls total   : $ch2"
Write-Host "  removeChannel calls      : $ch3"
# Check for the channel variable assignment
$hasChannelVar = $mon -match "channel\s*="
$hasChannelNull = $mon -match "channel.*null"
Write-Host "  channel variable assigned: $hasChannelVar"
Write-Host "  channel initialized null : $hasChannelNull"

Write-Host ""
Write-Host "=== REALTIME SUBSCRIPTION AUDIT (all files) ==="
foreach ($f in $files) {
  $content = [System.IO.File]::ReadAllText($f.FullName)
  $subCount = [regex]::Matches($content, "\.subscribe\(").Count
  $removeCount = [regex]::Matches($content, "removeChannel").Count
  if ($subCount -gt 0) {
    $rel = $f.FullName.Replace("c:\Users\patar\OneDrive\Desktop\Tracecode\", "")
    $balanced = if ($subCount -eq $removeCount) { "OK" } else { "UNBALANCED sub=$subCount remove=$removeCount" }
    Write-Host "  [$balanced] $rel"
  }
}

Write-Host ""
Write-Host "=== NULL SAFETY AUDIT (key fields) ==="
$nullChecks = @(
  @{field="behavioral_log"; pattern="behavioral_log\?\."},
  @{field="integrity_verdict"; pattern="integrity_verdict\?"},
  @{field="suspicious_segments"; pattern="suspicious_segments\?"},
  @{field="peer_similarity_scores"; pattern="peer_similarity_scores\?"},
  @{field="classroom_id"; pattern="classroom_id\?"}
)
foreach ($check in $nullChecks) {
  $found = $false
  foreach ($f in $files) {
    $content = [System.IO.File]::ReadAllText($f.FullName)
    if ($content -match $check.pattern) { $found = $true; break }
  }
  Write-Host "  $($check.field) null-safe: $found"
}

Write-Host ""
Write-Host "=== ROUTE PROTECTION AUDIT ==="
$app = [System.IO.File]::ReadAllText("c:\Users\patar\OneDrive\Desktop\Tracecode\src\App.tsx")
$adminRoutes = [regex]::Matches($app, "ProtectedRoute requiredRole=.admin.").Count
$teacherRoutes = [regex]::Matches($app, "ProtectedRoute requiredRole=.teacher.").Count
$studentRoutes = [regex]::Matches($app, "ProtectedRoute requiredRole=.student.").Count
Write-Host "  Admin protected routes  : $adminRoutes"
Write-Host "  Teacher protected routes: $teacherRoutes"
Write-Host "  Student protected routes: $studentRoutes"
