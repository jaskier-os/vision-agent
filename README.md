# vision-agent

Image-analysis agent for the orchestrator. It connects over WebSocket, receives requests
with an attached image, and runs a tool-calling loop with two tools: `analyze_image`
(sends the image to the communicator/LLM gateway for description, identification, or Q&A)
and `reverse_image_search` (calls the MCP web-search server's reverse image search).
Entry point is `src/agent-entry.js`.

## Build / run

```bash
npm install

npm run agent    # connects to ORCHESTRATOR_URL
npm run dev      # auto-reload via nodemon
```

Docker:

```bash
docker build -f Dockerfile.agent -t vision-agent .
docker run --env-file .env vision-agent
```

## Configuration

Config is env vars; `.env.example` is the source of truth. Copy it to `.env` and edit.
All URLs default to localhost ports, so it runs against a local stack out of the box. Key
vars:

- `ORCHESTRATOR_URL` -- orchestrator WebSocket URL
- `COMMUNICATOR_URL` -- LLM gateway used for image analysis
- `MCP_URL` -- web-search server providing `reverse_image_search`
- `API_KEY`, `MODEL`
- `HEALTH_PORT` (0 disables), `OCR_URL` (optional)

## Dependencies

Node 20+. No local model weights -- all inference happens in the communicator and the
MCP web-search server. `@orchestrator/sdk` is vendored in `./sdk` (`file:./sdk`): a
point-in-time copy of the SDK from the `jaskier-os/orchestrator` repo, not a published
package.
