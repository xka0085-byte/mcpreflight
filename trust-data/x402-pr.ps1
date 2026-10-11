$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$row = Get-Content trust-data\.x402-row.md -Raw
$existing = (Get-Content trust-data\x402-extensions.md -Raw).TrimEnd() + "`n"
$new = $existing + $row
Set-Content -Path trust-data\.x402-new.md -Value $new -NoNewline -Encoding UTF8
$sha = gh api repos/x402-foundation/x402/contents/docs/dev-tools/third-party-extensions.md --jq .sha
$mainSha = gh api repos/xka0085-byte/x402/git/ref/heads/main --jq .object.sha
gh api -X POST repos/xka0085-byte/x402/git/refs -f ref="refs/heads/mcpdoctor-ecosystem" -f sha="$mainSha" --jq .object.sha
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($new))
gh api -X PUT repos/xka0085-byte/x402/contents/docs/dev-tools/third-party-extensions.md -f message="Add mcpdoctor to third-party extensions" -f branch="mcpdoctor-ecosystem" -f sha="$sha" -f content="$b64" --jq .commit.sha
gh pr create -R x402-foundation/x402 --head "xka0085-byte:mcpdoctor-ecosystem" --title "Add mcpdoctor (read-only x402 endpoint preflight) to third-party extensions" --body-file trust-data\.x402-pr-body.md
