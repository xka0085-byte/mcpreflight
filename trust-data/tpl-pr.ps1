# File template-integration PRs: add optional MCP trust check workflow to MCP server templates.
# Usage: powershell -File tpl-pr.ps1
$ErrorActionPreference = 'Stop'
$targets = @(
  @{ repo = 'hostinger/selfhosted-mcp-server-template' },
  @{ repo = 'InteractionCo/mcp-server-template' }
)

$workflow = @'
name: MCP Trust Check

on:
  workflow_dispatch:
  pull_request:

permissions:
  contents: read

jobs:
  mcp-trust:
    # Runs only after you set the MCP_ENDPOINT repository variable, so CI stays green out of the box.
    if: ${{ vars.MCP_ENDPOINT != '' }}
    runs-on: ubuntu-latest
    steps:
      - uses: xka0085-byte/mcp-doctor@v1
        with:
          endpoint: ${{ vars.MCP_ENDPOINT }}
          mode: schema
          format: markdown
          fail-on: false # informational by default; set to true once you want the report to gate merges
'@

$bodyText = @'
Adds an optional, read-only MCP trust check that runs against your deployed server.

Out of the box it does nothing: the job only runs once a repository variable `MCP_ENDPOINT` is set (Settings - Secrets and variables - Actions - Variables), so CI stays green for everyone who clones the template. When set, every PR gets an MCP handshake + tool-schema report (`initialize` + `tools/list` only, never calls tools, no keys needed). `fail-on: false` keeps it informational; flip it to `true` when you want the check to gate merges.

Powered by [mcpdoctor](https://github.com/xka0085-byte/mcp-doctor) (MIT, zero-dep, also on the GitHub Marketplace as `mcp-trust-check`).

Happy to adjust the file name, path, or trigger setup to fit the template's conventions.
'@

foreach ($t in $targets) {
  $repo = $t.repo
  Write-Output "=== $repo ==="

  # 1) skip if upstream already has such a workflow
  try {
    $null = gh api "repos/$repo/contents/.github/workflows/mcp-trust-check.yml" 2>$null
    if ($LASTEXITCODE -eq 0) { Write-Output "SKIP: workflow already exists upstream"; continue }
  } catch { }

  # 2) fork (idempotent; "already exists" is fine)
  try { gh repo fork $repo --clone=false 2>&1 | Out-Null } catch { }
  $ErrorActionPreference = 'Continue'
  gh repo fork $repo --clone=false 2>&1 | Out-Null
  $ErrorActionPreference = 'Stop'
  Start-Sleep -Seconds 4
  $fork = "xka0085-byte/" + ($repo.Split('/')[1])
  try { $null = gh api "repos/$fork"; if ($LASTEXITCODE -ne 0) { throw "fork not ready" } } catch { Start-Sleep -Seconds 6 }

  # 3) default branch + base sha
  $def = (gh api "repos/$repo" --jq '.default_branch')
  $base = (gh api "repos/$fork/git/ref/heads/$def" | ConvertFrom-Json).object.sha
  $branch = 'add-mcp-trust-check'

  # 4) create branch on fork
  $refBody = @{ ref = "refs/heads/$branch"; sha = $base } | ConvertTo-Json
  $refFile = Join-Path $env:TEMP 'gh-ref.json'
  [IO.File]::WriteAllText($refFile, $refBody)
  gh api "repos/$fork/git/refs" --method POST --input "$refFile" 2>&1 | Out-Null

  # 5) commit workflow file on the branch
  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($workflow))
  $putBody = @{ message = 'Add optional MCP trust check (off until MCP_ENDPOINT is set)'; content = $b64; branch = $branch } | ConvertTo-Json
  $putFile = Join-Path $env:TEMP 'gh-put.json'
  [IO.File]::WriteAllText($putFile, $putBody)
  gh api "repos/$fork/contents/.github/workflows/mcp-trust-check.yml" --method PUT --input "$putFile" 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Output "ERR: commit failed"; continue }

  # 6) open PR
  $prBodyFile = Join-Path $env:TEMP ('pr-body-' + ($repo.Split('/')[1]) + '.md')
  $bodyText | Out-File -Encoding ascii $prBodyFile
  $pr = gh pr create -R $repo --head "xka0085-byte:$branch" --base $def `
    --title 'Add optional MCP trust check (read-only, off until configured)' `
    --body-file $prBodyFile 2>&1
  Write-Output "PR: $pr"
}
