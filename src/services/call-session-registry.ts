import type { WebSocket } from "ws";

export interface RuntimeCallSession {
  callControlId: string;
  callSessionId: string;
  connectionId: string | undefined;
  websocketRequestId: string | undefined;
  mediaSocket: WebSocket | undefined;
  lastEventType: string | undefined;
  updatedAt: string;
}

export class CallSessionRegistry {
  private readonly sessions = new Map<string, RuntimeCallSession>();

  upsert(session: RuntimeCallSession) {
    this.sessions.set(session.callSessionId, session);
  }

  get(callSessionId: string) {
    return this.sessions.get(callSessionId);
  }

  attachSocket(callSessionId: string, requestId: string, mediaSocket: WebSocket) {
    const existing = this.sessions.get(callSessionId);

    if (!existing) {
      return;
    }

    this.sessions.set(callSessionId, {
      ...existing,
      websocketRequestId: requestId,
      mediaSocket,
      updatedAt: new Date().toISOString()
    });
  }

  detachSocket(callSessionId: string, requestId: string) {
    const existing = this.sessions.get(callSessionId);

    if (!existing || existing.websocketRequestId !== requestId) {
      return;
    }

    this.sessions.set(callSessionId, {
      ...existing,
      websocketRequestId: undefined,
      mediaSocket: undefined,
      updatedAt: new Date().toISOString()
    });
  }

  delete(callSessionId: string) {
    this.sessions.delete(callSessionId);
  }

  clear() {
    this.sessions.clear();
  }
}
