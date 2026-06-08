# CLAUDE.md -- Vision Agent

Guidance for Claude Code working in this standalone repo.

IMPORTANT: NEVER USE EMOJIS ANYWHERE IN LOGGING, CODE OR OTHER TEXT!

IMPORTANT: Treat this codebase as work in progress. Never do backwards-compatibility or legacy support unless explicitly asked. Remove code that becomes redundant.

## What this service is

Image analysis agent. It connects OUTBOUND to the orchestrator over a WebSocket, receives requests, and runs an agentic LLM loop (max 5 iterations). Tools:
- `analyze_image` -- multimodal LLM via the Communicator gateway
- `extract_text` -- OCR via the OCR service
- `reverse_image_search` -- Yandex reverse image search via the web-search MCP server

It can delegate to the web-search agent (`needs_agent`) when deeper research is needed.

Health endpoint on port 10005.

This is one specialized agent in a larger orchestration system: devices (glasses/phone/PC) -> Orchestrator (intent classification + routing) -> specialized agents over WebSocket -> Communicator (LLM gateway). For the big picture, the full port map, and the protocol spec, see the orchestrator repo (`jaskier-os/orchestrator`, its `CLAUDE.md` / `docs/`). Do not duplicate that map here.

## Vendored SDK

`@orchestrator/sdk` lives in `./sdk` (referenced as `file:./sdk` in `package.json`). It is a POINT-IN-TIME COPY whose source of truth is `jaskier-os/orchestrator` (`sdk/`). Treat it as read-only; do not hand-edit it to fix agent behavior. If the SDK genuinely needs a change, change it in the orchestrator repo and re-vendor.

The SDK provides `BaseAgent` (WS auto-reconnect, manifest registration, graceful shutdown), the message-envelope protocol, and `AGENT_RESPONSE_STATUS` constants.

## Agent interface contract

The agent extends `BaseAgent` and implements `handle(request)` returning `{ requestId, status, text }`.

**Response statuses:** `success` / `error` / `partial` (final), `needs_input` (needs device input, e.g. a camera image), `needs_agent` (delegate to another agent).

Adding a tool requires no orchestrator changes -- the classifier discovers registered agents from their manifests.

## Key files

```
src/
  agent-entry.js   -- Agent entrypoint (connects to orchestrator, starts health server)
  agent.js         -- VisionAgent with agentic loop (max 5 iterations)
sdk/               -- vendored @orchestrator/sdk (source: jaskier-os/orchestrator)
run.sh             -- Startup script
```

## Common commands

```bash
npm run agent    # node src/agent-entry.js
npm run dev      # nodemon src/agent-entry.js
./run.sh         # production startup
```

## Environment variables

See `.env.example`:
- `ORCHESTRATOR_URL` -- WebSocket URL for orchestrator
- `COMMUNICATOR_URL` -- LLM API gateway URL
- `MCP_URL` -- web-search MCP server (for reverse_image_search)
- `OCR_URL` -- OCR service (for extract_text)
- `API_KEY` -- API key for communicator
- `MODEL` -- LLM model (default sonnet)
- `HEALTH_PORT` -- health endpoint port (10005)

## Build & deployment

`.gitlab-ci.yml` builds this repo's `Dockerfile.agent` with `docker buildx --push` on push to main, then the deploy stage bumps the image tag in the `infrastructure/deploy` repo and Flux reconciles it onto the cluster.

**Server-side auto-deploy:** services deploy automatically on git push to main. No manual restart needed -- just commit and push.

NEVER restart a deployed service or modify Kubernetes directly (`kubectl set env/edit/patch`). All changes to deployed services go through the `infrastructure/deploy` manifests via CI -> Flux. Direct changes get overwritten and cause drift.
