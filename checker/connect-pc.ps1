# Gives this PC its own copy of Checker's hunter key, so PC hunter runs and the
# resume uploader can send to Checker. Run it yourself, once:
#   cd C:\Users\herei\Quantitative-Finance_Joyeb\checker
#   powershell -ExecutionPolicy Bypass -File .\connect-pc.ps1
# It makes a NEW random key and stores it in three places, without printing it:
#   Cloudflare (INGEST_TOKEN), GitHub Job-hunting secret (CHECKER_INGEST_TOKEN),
#   and C:\Users\herei\.ai-toolbox\private\checker.env (readable only by you).
# The old key stops working, which is fine: these are the only three users.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
$token = -join ($b | ForEach-Object { $_.ToString('x2') })

$token | npx wrangler secret put INGEST_TOKEN
$token | gh secret set CHECKER_INGEST_TOKEN --repo Kashyeb57/Job-hunting

$dir = Join-Path $env:USERPROFILE '.ai-toolbox\private'
New-Item -ItemType Directory -Force $dir | Out-Null
$file = Join-Path $dir 'checker.env'
[IO.File]::WriteAllText($file, "CHECKER_INGEST_TOKEN=$token`r`n", (New-Object Text.UTF8Encoding $false))
# Only your Windows account may read it.
icacls $file /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
Remove-Variable token

Write-Host ''
Write-Host "Done. This PC can now send to Checker. Key saved privately in $file"
