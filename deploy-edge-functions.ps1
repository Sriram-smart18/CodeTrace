# Deploy all TraceCode Edge Functions to the active Supabase project (fnvkthngkbrodsmjbuft)
# Prerequisites: supabase CLI logged in, project linked (supabase link --project-ref fnvkthngkbrodsmjbuft)

$ErrorActionPreference = "Stop"

Write-Host "Deploying Edge Functions to fnvkthngkbrodsmjbuft..." -ForegroundColor Cyan

$functions = @(
  "evaluate-submission",
  "detect-fraud",
  "check-plagiarism",
  "execute-code"
)

foreach ($fn in $functions) {
  Write-Host "  -> $fn" -ForegroundColor Yellow
  supabase functions deploy $fn --no-verify-jwt
  if ($LASTEXITCODE -ne 0) { throw "Deploy failed for $fn" }
}

Write-Host ""
Write-Host "Done. Set Groq API secret (required for AI Evaluate):" -ForegroundColor Green
Write-Host "  supabase secrets set GROQ_API_KEY=gsk_your_groq_key"
Write-Host ""
Write-Host "List deployed functions:" -ForegroundColor Green
supabase functions list
