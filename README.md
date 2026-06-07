# Vision Agent

An orchestrator agent that analyzes images using an LLM vision model and performs
reverse image search. It connects to a central orchestrator over WebSocket, receives
requests that include an attached image, and runs an agentic tool-calling loop with two
tools:

- `analyze_image` -- sends the image to the communicator (LLM gateway) for description,
  identification, or question answering.
- `reverse_image_search` -- calls the MCP web-search server's `reverse_image_search`
  tool (Yandex) to find matching/similar images across the web.

It can also delegate to other agents (for example a web-search agent) for tasks outside
its own capabilities, and surface device commands (such as "take a photo") back through
the orchestrator.

## Prerequisites

- Node.js 20+
- A running orchestrator (WebSocket endpoint)
- A running communicator / LLM gateway (HTTP)
- A running MCP web-search server (for reverse image search)
- Optional: an OCR microservice

## Setup

Copy the example environment file and fill in the values:

```bash
cp .env.example .env
```

Environment variables:

| Variable          | Description                                                           |
| ----------------- | --------------------------------------------------------------------- |
| `ORCHESTRATOR_URL`| WebSocket URL of the orchestrator this agent connects to.             |
| `COMMUNICATOR_URL`| Communicator (LLM gateway) base URL used for image analysis.          |
| `MCP_URL`         | MCP web-search server base URL (provides `reverse_image_search`).     |
| `API_KEY`         | API key for the communicator / MCP services. Set to your own value.   |
| `MODEL`           | LLM model id used for vision analysis (e.g. `sonnet`).                 |
| `HEALTH_PORT`     | Local HTTP port for the health endpoint (`0` disables it).            |
| `OCR_URL`         | Optional OCR microservice base URL. Leave unset if unused.            |

All URLs default to `localhost` ports if unset, so the agent runs against a local stack
with no further configuration. Point them at your own hosts via the env vars; there are
no hardcoded hosts or IPs in the code.

## Build

Install dependencies (this also resolves the vendored SDK at `./sdk`):

```bash
npm install
```

## Run

```bash
npm run agent
```

For auto-reload during development:

```bash
npm run dev
```

A convenience script `run.sh` installs dependencies and starts the agent.

### Docker

```bash
docker build -f Dockerfile.agent -t vision-agent .
docker run --env-file .env vision-agent
```

## Vendored orchestrator SDK

This repo depends on `@orchestrator/sdk`, which is vendored into `./sdk` and referenced
via `file:./sdk` in `package.json`. The vendored copy is a point-in-time snapshot. The
canonical source is the `orchestrator` repository (group `jaskier-os`, repo
`orchestrator`, path `sdk/`). To update the SDK, re-vendor the `sdk/` directory from
that repository and reinstall.

## TLS / VPN

No TLS certificate or VPN is required. The agent connects to the configured hosts using
plain HTTP/WebSocket by default. If you need secure connectivity, point the `*_URL`
variables at `https://` / `wss://` endpoints terminated by your own reverse proxy or
gateway; no cert files are read or committed by this project.

## Notes on secrets and removed code

Earlier internal versions bundled a Google Cloud service account and an unused
`@google-cloud/vision` integration for Google Lens-style search. That dead, commented-out
code and its credential file have been removed. Reverse image search is provided entirely
through the MCP web-search server, so no Google Cloud credentials are needed.

## Model weights

This agent uses no local model weights. All vision/LLM inference happens in external
services (the communicator and the MCP web-search server), so there is nothing to
download.
