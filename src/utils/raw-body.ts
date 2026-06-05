import type { FastifyRequest } from "fastify";

export function attachRawBody(request: FastifyRequest, rawBody: string) {
  request.rawBody = rawBody;
}
