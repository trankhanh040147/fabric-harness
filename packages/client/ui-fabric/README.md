---
description: "Fabric page: agent-fabric worker roster, ops-dashboard read views, and the engine toggle."
kind: "reference"
---
# @deepseek-ai/dsh-client-ui-fabric

English | [中文](README.zh.md)

## Summary

Adds one main page and one sidebar panel entry named Fabric. The page shows a
slim engine toolbar (toggle, MCP/dashboard state, live worker count) and embeds
the complete agent-fabric operations cockpit from `/fabric/app`, which the host
proxies from the loopback dashboard so the cockpit's own API calls stay
same-origin. A compact worker tab and a Settings section expose the same
toggle.

## Model Experience

None, as the page, tab, and settings card only read the loopback fabric surface.

#### KV Cache effect

None; every Fabric surface is independent of model request context.

## Known Limitations and Deferred Work

- **Dashboard process required** — the cockpit is served from the agent-fabric
  ops dashboard; the host auto-starts it when `dashboardAutoStart` is on,
  otherwise the page shows a start hint.
- **Polling toolbar** — the toolbar polls `/fabric/status` every eight seconds;
  the embedded cockpit keeps its own live stream.
