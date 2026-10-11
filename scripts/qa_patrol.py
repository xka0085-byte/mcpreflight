# -*- coding: utf-8 -*-
"""QA patrol: find recent open GitHub issues asking about MCP server testing/connectivity."""
import json, subprocess, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

QUERIES = [
    '"mcp server" "connection closed" is:issue is:open created:>=2026-09-25',
    '"mcp" "tools/list" fail is:issue is:open created:>=2026-09-25',
    '"mcp server" "how to test" is:issue is:open created:>=2026-09-20',
    '"model context protocol" "not connecting" is:issue is:open created:>=2026-09-25',
]

def gh(q):
    r = subprocess.run(["gh", "api", "-X", "GET", "search/issues",
                        "-f", "q=" + q, "-f", "per_page=6"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
    if r.returncode != 0:
        return []
    try:
        return json.loads(r.stdout).get("items", [])
    except Exception:
        return []

seen = set()
for q in QUERIES:
    print("=== " + q)
    for it in gh(q):
        if it["id"] in seen:
            continue
        seen.add(it["id"])
        title = (it.get("title") or "")[:110]
        print(f"- [{it['state']}] {it['repository_url'].split('repos/')[-1]} | {title}")
        print(f"  {it['html_url']}")
print("TOTAL", len(seen))
