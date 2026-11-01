---
description: "Fabric page: agent-fabric worker roster, ops-dashboard read views, and the engine toggle."
kind: "reference"
---
# @deepseek-ai/dsh-client-ui-fabric

English | [中文](README.zh.md)

## Summary

Adds one main page and one sidebar panel entry named Fabric. The page polls the
host `/fabric/status` surface for engine state, MCP connection, worker
heartbeats, and offered peer models, toggles the engine through
`POST /fabric/engine`, and mirrors the loopback ops dashboard through
`GET /fabric/dashboard`.

## Model Experience

### Request context

#### What the model sees

None; this package contributes no prompt or tool schema text.

#### Token effect

None.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **JSON read views** — dashboard tabs render JSON rather than reconstructed
  tables and charts; a later pass should map each ops view to real components.
- **Polling only** — the page polls every five seconds and has no streaming
  subscription.
