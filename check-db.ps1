# Quick REST check against active Supabase project (reads .env)
$envFile = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envFile)) { throw ".env not found" }
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

$base = "$($env:VITE_SUPABASE_URL)/rest/v1"
$anon = $env:VITE_SUPABASE_ANON_KEY
if (-not $anon) { $anon = $env:VITE_SUPABASE_PUBLISHABLE_KEY }
$headers = @{
  apikey        = $anon
  Authorization = "Bearer $anon"
}

@("classrooms", "profiles", "assignments", "classroom_students") | ForEach-Object {
  $table = $_
  try {
    $r = Invoke-WebRequest -Uri "$base/$table`?select=*&limit=1" -Headers $headers -UseBasicParsing
    Write-Host "$table : $($r.StatusCode)"
  } catch {
    Write-Host "$table : ERROR $($_.Exception.Message)"
  }
}
