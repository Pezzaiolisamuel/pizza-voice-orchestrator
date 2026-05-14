import "fastify";

import type { CallSessionRegistry } from "../services/call-session-registry.js";
import type { TelnyxCallOrchestrator } from "../services/telnyx-call-orchestrator.js";

declare module "fastify" {
  interface FastifyInstance {
    sessionRegistry: CallSessionRegistry;
    orchestrator: TelnyxCallOrchestrator;
  }
}
