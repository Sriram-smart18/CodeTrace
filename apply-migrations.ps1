# ============================================================
# TraceCode — Apply Migrations via Supabase CLI
# 
# USAGE:
#   .\apply-migrations.ps1 -Token "your-supabase-personal-access-token"
#
# Get your token at: https://supabase.com/dashboard/account/tokens
# ============================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$Token,
    
    [Parameter(Mandatory=$false)]
    [string]$DbPassword = ""
)

$ProjectRef = "uvuximrxlogvtgirtlsc"
$ErrorActionPreference = "Stop"

Write-Host "TraceCode Migration Tool" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan

# Step 1: Login with token
Write-Host "`n[1/4] Logging in to Supabase..." -ForegroundColor Yellow
supabase login --token $Token
if ($LASTEXITCODE -ne 0) {
    Write-Host "Login failed. Check your token." -ForegroundColor Red
    exit 1
}
Write-Host "Login successful." -ForegroundColor Green

# Step 2: Link project
Write-Host "`n[2/4] Linking project $ProjectRef..." -ForegroundColor Yellow
if ($DbPassword -ne "") {
    supabase link --project-ref $ProjectRef --password $DbPassword
} else {
    supabase link --project-ref $ProjectRef
}
if ($LASTEXITCODE -ne 0) {
    Write-Host "Link failed." -ForegroundColor Red
    exit 1
}
Write-Host "Project linked." -ForegroundColor Green

# Step 3: Check migration status
Write-Host "`n[3/4] Checking migration status..." -ForegroundColor Yellow
supabase migration list --linked

# Step 4: Push migrations
Write-Host "`n[4/4] Pushing migrations to remote database..." -ForegroundColor Yellow
if ($DbPassword -ne "") {
    supabase db push --linked --password $DbPassword
} else {
    supabase db push --linked
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "Migration push failed." -ForegroundColor Red
    Write-Host "Try the SQL Editor method instead: open APPLY_TO_SUPABASE_SQL_EDITOR.sql" -ForegroundColor Yellow
    exit 1
}

Write-Host "`nMigrations applied successfully!" -ForegroundColor Green

# Step 5: Regenerate types
Write-Host "`n[Bonus] Regenerating TypeScript types..." -ForegroundColor Yellow
supabase gen types typescript --project-id $ProjectRef | Out-File -FilePath "src\integrations\supabase\types.ts" -Encoding utf8
if ($LASTEXITCODE -eq 0) {
    Write-Host "Types regenerated at src/integrations/supabase/types.ts" -ForegroundColor Green
} else {
    Write-Host "Type generation skipped (non-critical)." -ForegroundColor Yellow
}

Write-Host "`nDone! Restart your dev server: npm run dev" -ForegroundColor Cyan
