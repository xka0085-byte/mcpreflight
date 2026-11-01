Cross-checked 226 of the 4536 GitHub repos in this list against the official MCP Registry scan (read-only initialize + tools/list, 35,327 endpoints, updated weekly).

84 matched servers currently do not complete a clean anonymous handshake (of which auth-gated by design is possible — the reports show the exact failing step):

| repo | registry name | status | finding | report |
|---|---|---|---|---|
| [thinkchainai/mcpbundles]() | com.mcpbundles/uk-public-services-health | AUTH_GATED | `AUTH_GATE_DETECTED` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/com.mcpbundles-uk-public-services-health.html) |
| [waystation-ai/mcp]() | ai.waystation/wrike | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/ai.waystation-wrike.html) |
| [withoneai/mcp]() | ai.withone/mcp | AUTH_GATED | `AUTH_GATE_VERIFIED` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/ai.withone-mcp.html) |
| [tribeunal/mcp-server]() | com.tribeunal/mcp | AUTH_GATED | `AUTH_GATE_VERIFIED` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/com.tribeunal-mcp.html) |
| [signdocsbrasil/signdocs-mcp-server]() | br.com.signdocs/mcp-server | AUTH_GATED | `AUTH_GATE_VERIFIED` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/br.com.signdocs-mcp-server.html) |
| [creativeclawco/creative-claw-marketplace]() | co.creativeclaw/creative-claw | AUTH_GATED | `AUTH_GATE_VERIFIED` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/co.creativeclaw-creative-claw.html) |
| [yuna0x0/anilist-mcp]() | ai.smithery/yuna0x0-anilist-mcp | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/ai.smithery-yuna0x0-anilist-mcp.html) |
| [luvi-io/luw-mcp]() | ai.luw/mcp | AUTH_GATED | `AUTH_GATE_VERIFIED` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/ai.luw-mcp.html) |
| [yenchieh/diagramzu-mcp]() | ai.diagramzu/mcp | AUTH_GATED | `AUTH_GATE_VERIFIED` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/ai.diagramzu-mcp.html) |
| [fulcradynamics/fulcra-context-mcp]() | com.fulcradynamics/context | AUTH_GATED | `AUTH_GATE_VERIFIED` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/com.fulcradynamics-context.html) |
| [screenshotscout/screenshotscout-mcp]() | com.screenshotscout/mcp | AUTH_GATED | `AUTH_GATE_DETECTED` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/com.screenshotscout-mcp.html) |
| [snapshot-site/snapshot-site-mcp]() | com.snapshot-site/screenshots | AUTH_GATED | `AUTH_GATE_VERIFIED` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/com.snapshot-site-screenshots.html) |
| [anythink-cloud/anythink-cli]() | cloud.anythink/anythink | AUTH_GATED | `AUTH_GATE_VERIFIED` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/cloud.anythink-anythink.html) |
| [gagarin-cloud/mcp]() | cloud.gagarin/gagarin | AUTH_GATED | `AUTH_GATE_VERIFIED` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/cloud.gagarin-gagarin.html) |
| [oborseth/porkbun-mcp]() | com.porkbun/mcp | AUTH_GATED | `AUTH_GATE_VERIFIED` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/com.porkbun-mcp.html) |
| [stevysmith/stacktree-mcp]() | ee.stacktr/publish | AUTH_GATED | `AUTH_GATE_VERIFIED` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/ee.stacktr-publish.html) |
| [danieldoderlein/llm-bus]() | com.llm-bus/llm-bus | AUTH_GATED | `AUTH_GATE_VERIFIED` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/com.llm-bus-llm-bus.html) |
| [plori-ai/plori]() | ai.plori/plori | AUTH_GATED | `AUTH_GATE_VERIFIED` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/ai.plori-plori.html) |
| [albretsen/mcpemails]() | com.mcpemails/emails | AUTH_GATED | `AUTH_GATE_VERIFIED` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/com.mcpemails-emails.html) |
| [infobip/mcp]() | com.infobip/mcp | AUTH_GATED | `AUTH_GATE_VERIFIED` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/com.infobip-mcp.html) |
| [thesameabramovych/qmailing-mcp-server]() | com.qmailing/mcp-server | AUTH_GATED | `AUTH_GATE_VERIFIED` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/com.qmailing-mcp-server.html) |
| [kojott/mailmcp-dist]() | ai.mailmcp/mailmcp | AUTH_GATED | `AUTH_GATE_VERIFIED` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/ai.mailmcp-mailmcp.html) |
| [lettio-eu/mcp]() | eu.lettio/mcp | AUTH_GATED | `AUTH_GATE_DETECTED` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/eu.lettio-mcp.html) |
| [multimail-dev/mcp-server]() | dev.multimail/mcp-server | AUTH_GATED | `AUTH_GATE_VERIFIED` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/dev.multimail-mcp-server.html) |
| [pingfyr/mcp]() | com.pingfyr/pingfyr | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcpreflight/trust/p/com.pingfyr-pingfyr.html) |

Reproduce any line: `npx @eidonze/mcpreflight schema <endpoint>` · methodology + limitations: https://xka0085-byte.github.io/mcpreflight/trust/
