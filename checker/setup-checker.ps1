# One-time Checker setup. Run it yourself in PowerShell:
#   cd C:\Users\herei\Quantitative-Finance_Joyeb\checker
#   powershell -ExecutionPolicy Bypass -File .\setup-checker.ps1
# It creates the private D1 database, loads the schema, and stores three secrets.
# You type the login password; the two random tokens are generated here and go
# straight into Cloudflare / GitHub without being printed or saved to a file.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function New-Token { $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') }) }

# 1) Database (skipped if wrangler.toml already has a real id)
$toml = Get-Content wrangler.toml -Raw
if ($toml -match 'REPLACE_WITH_ID') {
  Write-Host 'Creating D1 database "checker"...'
  $out = npx wrangler d1 create checker 2>&1 | Out-String
  if ($out -notmatch '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})') { throw "Could not read database id:`n$out" }
  $toml = $toml -replace 'REPLACE_WITH_ID_FROM_wrangler_d1_create_checker', $Matches[1]
  [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'wrangler.toml'), $toml, (New-Object Text.UTF8Encoding $false))
  Write-Host "Database id saved in wrangler.toml"
}
npx wrangler d1 execute checker --remote --file=./schema.sql --yes

# 2) Login password (typed by you, hidden)
$p1 = Read-Host 'Choose the Checker login password (12+ characters)' -AsSecureString
$p2 = Read-Host 'Type it again' -AsSecureString
$plain1 = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p1))
$plain2 = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p2))
if ($plain1 -ne $plain2) { throw 'Passwords did not match. Run the script again.' }
if ($plain1.Length -lt 12) { throw 'Use at least 12 characters.' }
$plain1 | npx wrangler secret put CHECKER_PASSWORD
Remove-Variable plain1, plain2

# 3) Session signing key and the hunter's ingest token
(New-Token) | npx wrangler secret put SESSION_SECRET
$ingest = New-Token
$ingest | npx wrangler secret put INGEST_TOKEN
$ingest | gh secret set CHECKER_INGEST_TOKEN --repo Kashyeb57/Job-hunting
Remove-Variable ingest
Write-Host ''
Write-Host 'Done. Checker secrets are on Cloudflare; CHECKER_INGEST_TOKEN is on the Job-hunting repo.'
Write-Host 'Next: commit + push checker/ (the deploy workflow ships it), then open https://joyebkashyeb.com.np/checker'
