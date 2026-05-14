# Pizza Voice Orchestrator

Backend-only orchestrator scaffold for a Telnyx Call Control pizza voice pilot.

## Scope

This project intentionally includes only:

- Node.js + TypeScript service
- Fastify HTTP server
- WebSocket endpoint support
- Structured logging
- Telnyx-facing webhook and media-stream entrypoints
- In-memory runtime orchestration primitives

This project intentionally does **not** include:

- frontend
- database
- LLM integration
- TTS integration
- menu logic
- order management

## Run

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env
```

3. Start in development:

```bash
npm run dev
```

## Endpoints

- `GET /health`
- `POST /v1/telnyx/webhooks/call-control`
- `GET /v1/telnyx/ws/media`

## Suggested next backend steps

- implement Telnyx webhook signature verification
- add concrete Call Control command execution against Telnyx APIs
- define the call state machine for greeting, interruption, retry, and hangup handling
