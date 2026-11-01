---
description: "Agent-fabric engine plugin: peer worker status, a toggleable fabric LLM provider, and a dashboard proxy."
kind: "reference"
---
# @deepseek-ai/dsh-fabric

English | [中文](README.zh.md)

## Summary

Mounts the `fabric` LLM provider route, whose model ids are agent-fabric worker
targets. The browser half reads `GET /fabric/status` for worker heartbeats,
`POST /fabric/engine` to toggle the engine, and `GET /fabric/dashboard?path=…`
for a loopback ops-dashboard proxy. When `dashboardApp` is on, `/fabric/app`
proxies the full operations cockpit and injects a same-origin URL shim for its
relative API calls; `dashboardAutoStart` launches the dashboard process when it
is unreachable. The MCP server is spawned lazily and reconnected on demand; the
`enabled` setting unregisters the provider route so model catalogs stop
offering peers.

## Model Experience

Indirectly, through the peer provider's flattened prompt: the adapter forwards the conversation as one text request and the peer worker owns the model-visible turn.

#### KV Cache effect

None; each peer worker request is independent and DSH-side prompts are unchanged.

## Known Limitations and Deferred Work

- **Text-only peer channel** — the peer harness cannot call DSH tools, so a
  Fabric-model turn answers text instead of executing tools.
- **Loopback HTTP surface** — the status/toggle/cockpit routes are guarded by
  peer address, not by the Connection cookie fence.
- **Dashboard command path** — auto-start needs `dashboardArgs` to name the
  agent-fabric `dashboard/server.ts` entry; without it the cockpit only works
  while the dashboard runs externally.
