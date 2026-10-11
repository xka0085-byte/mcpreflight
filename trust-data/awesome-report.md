Cross-checked 202 of the 4150 GitHub repos in this list against the official MCP Registry scan (read-only initialize + tools/list, 9991 servers, updated weekly).

95 matched servers currently do not complete a clean anonymous handshake (of which auth-gated by design is possible — the reports show the exact failing step):

| repo | registry name | status | finding | report |
|---|---|---|---|---|
| [garphengate/moltline-mcp]() | com.moltlinestudio/vision | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/com.moltlinestudio-vision.html) |
| [thinkchainai/mcpbundles]() | com.mcpbundles/uk-public-services-health | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/com.mcpbundles-uk-public-services-health.html) |
| [waystation-ai/mcp]() | ai.waystation/wrike | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/ai.waystation-wrike.html) |
| [withoneai/mcp]() | ai.withone/mcp | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/ai.withone-mcp.html) |
| [mcccsm/x402-list-mcp]() | com.x402-list/x402-list-mcp | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/com.x402-list-x402-list-mcp.html) |
| [tribeunal/mcp-server]() | com.tribeunal/mcp | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/com.tribeunal-mcp.html) |
| [creativeclawco/creative-claw-marketplace]() | co.creativeclaw/creative-claw | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/co.creativeclaw-creative-claw.html) |
| [memebo-at/memeboat-mcp]() | at.memebo/memeboat-mcp | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/at.memebo-memeboat-mcp.html) |
| [yuna0x0/anilist-mcp]() | ai.smithery/yuna0x0-anilist-mcp | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/ai.smithery-yuna0x0-anilist-mcp.html) |
| [yenchieh/diagramzu-mcp]() | ai.diagramzu/mcp | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/ai.diagramzu-mcp.html) |
| [fulcradynamics/fulcra-context-mcp]() | com.fulcradynamics/context | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/com.fulcradynamics-context.html) |
| [screenshotscout/screenshotscout-mcp]() | com.screenshotscout/mcp | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/com.screenshotscout-mcp.html) |
| [snapshot-site/snapshot-site-mcp]() | com.snapshot-site/screenshots | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/com.snapshot-site-screenshots.html) |
| [anythink-cloud/anythink-cli]() | cloud.anythink/anythink | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/cloud.anythink-anythink.html) |
| [novence-ai/mcp]() | ai.novence/mcp | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/ai.novence-mcp.html) |
| [oborseth/porkbun-mcp]() | com.porkbun/mcp | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/com.porkbun-mcp.html) |
| [stevysmith/stacktree-mcp]() | ee.stacktr/publish | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/ee.stacktr-publish.html) |
| [danieldoderlein/llm-bus]() | com.llm-bus/llm-bus | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/com.llm-bus-llm-bus.html) |
| [plori-ai/plori]() | ai.plori/plori | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/ai.plori-plori.html) |
| [albretsen/mcpemails]() | com.mcpemails/emails | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/com.mcpemails-emails.html) |
| [infobip/mcp]() | com.infobip/mcp | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/com.infobip-mcp.html) |
| [thesameabramovych/qmailing-mcp-server]() | com.qmailing/mcp-server | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/com.qmailing-mcp-server.html) |
| [kojott/mailmcp-dist]() | ai.mailmcp/mailmcp | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/ai.mailmcp-mailmcp.html) |
| [lettio-eu/mcp]() | eu.lettio/mcp | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/eu.lettio-mcp.html) |
| [multimail-dev/mcp-server]() | dev.multimail/mcp-server | UNKNOWN | `NO_RESPONSE` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/dev.multimail-mcp-server.html) |

Reproduce any line: `npx @eidonze/mcpdoctor schema <endpoint>` · methodology + limitations: https://xka0085-byte.github.io/mcp-doctor/trust/
