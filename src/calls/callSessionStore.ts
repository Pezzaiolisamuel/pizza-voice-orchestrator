import {
  getCallControlId,
  getCallSessionId,
  getEventType,
  getOccurredAt,
  type TelnyxWebhookPayload
} from "../telnyx/telnyx-events.js";

export enum CallState {
  CALL_INITIATED = "CALL_INITIATED",
  CALL_ANSWERING = "CALL_ANSWERING",
  CALL_ANSWERED = "CALL_ANSWERED",
  STREAMING_STARTING = "STREAMING_STARTING",
  STREAMING_STARTED = "STREAMING_STARTED",
  TRANSCRIBING = "TRANSCRIBING",
  STREAMING_STOPPED = "STREAMING_STOPPED",
  CALL_ENDED = "CALL_ENDED",
  ERROR = "ERROR"
}

export type SafeCallError = {
  timestamp: string;
  source: string;
  message: string;
  code?: string;
};

export interface CallSession {
  callSessionId: string;
  callControlId: string;
  streamId?: string;
  state: CallState;
  startedAt?: string;
  answeredAt?: string;
  streamingStartedAt?: string;
  endedAt?: string;
  mediaFrames: number;
  totalMediaBytes: number;
  partialTranscripts: string[];
  finalTranscripts: string[];
  errors: SafeCallError[];
}

const sessionsByCallSessionId = new Map<string, CallSession>();
const callSessionIdByCallControlId = new Map<string, string>();

export function createOrUpdateSessionFromTelnyxEvent(
  event: TelnyxWebhookPayload
): CallSession | null {
  const callSessionId = getCallSessionId(event);
  const callControlId = getCallControlId(event);

  if (!callSessionId || !callControlId) {
    return null;
  }

  const eventType = getEventType(event);
  const occurredAt = getOccurredAt(event) ?? new Date().toISOString();
  const existing = sessionsByCallSessionId.get(callSessionId);
  const session =
    existing ??
    createSession({
      callSessionId,
      callControlId,
      startedAt: occurredAt
    });

  if (session.callControlId !== callControlId) {
    callSessionIdByCallControlId.delete(session.callControlId);
    session.callControlId = callControlId;
  }

  callSessionIdByCallControlId.set(callControlId, callSessionId);
  applyStateFromTelnyxEvent(session, eventType, occurredAt);
  sessionsByCallSessionId.set(callSessionId, session);

  return session;
}

export function getSessionByCallSessionId(callSessionId: string) {
  return sessionsByCallSessionId.get(callSessionId) ?? null;
}

export function getSessionByCallControlId(callControlId: string) {
  const callSessionId = callSessionIdByCallControlId.get(callControlId);
  return callSessionId ? getSessionByCallSessionId(callSessionId) : null;
}

export function attachStreamId(callSessionId: string, streamId: string) {
  const session = sessionsByCallSessionId.get(callSessionId);

  if (!session) {
    return null;
  }

  session.streamId = streamId;
  return session;
}

export function incrementMediaStats(callSessionId: string, mediaBytes: number) {
  const session = sessionsByCallSessionId.get(callSessionId);

  if (!session) {
    return null;
  }

  session.mediaFrames += 1;
  session.totalMediaBytes += mediaBytes;
  return session;
}

export function addPartialTranscript(callSessionId: string, text: string) {
  const session = sessionsByCallSessionId.get(callSessionId);

  if (!session) {
    return null;
  }

  session.partialTranscripts.push(text);
  return session;
}

export function addFinalTranscript(callSessionId: string, text: string) {
  const session = sessionsByCallSessionId.get(callSessionId);

  if (!session) {
    return null;
  }

  session.finalTranscripts.push(text);
  return session;
}

export function addSafeError(callSessionId: string, error: SafeCallError) {
  const session = sessionsByCallSessionId.get(callSessionId);

  if (!session) {
    return null;
  }

  session.errors.push(error);
  session.state = CallState.ERROR;
  return session;
}

export function transitionCallState(
  callSessionId: string,
  newState: CallState
) {
  const session = sessionsByCallSessionId.get(callSessionId);

  if (!session) {
    return null;
  }

  session.state = newState;
  return session;
}

export function endSession(callSessionId: string) {
  const session = sessionsByCallSessionId.get(callSessionId);

  if (!session) {
    return null;
  }

  session.state = CallState.CALL_ENDED;
  session.endedAt = session.endedAt ?? new Date().toISOString();
  return session;
}

function createSession({
  callSessionId,
  callControlId,
  startedAt
}: {
  callSessionId: string;
  callControlId: string;
  startedAt: string;
}): CallSession {
  return {
    callSessionId,
    callControlId,
    state: CallState.CALL_INITIATED,
    startedAt,
    mediaFrames: 0,
    totalMediaBytes: 0,
    partialTranscripts: [],
    finalTranscripts: [],
    errors: []
  };
}

function applyStateFromTelnyxEvent(
  session: CallSession,
  eventType: string | null,
  occurredAt: string
) {
  switch (eventType) {
    case "call.initiated":
      session.state = CallState.CALL_INITIATED;
      session.startedAt = session.startedAt ?? occurredAt;
      break;
    case "call.answered":
      session.state = CallState.CALL_ANSWERED;
      session.answeredAt = session.answeredAt ?? occurredAt;
      break;
    case "streaming.started":
      session.state = CallState.STREAMING_STARTED;
      session.streamingStartedAt = session.streamingStartedAt ?? occurredAt;
      break;
    case "streaming.stopped":
      session.state = CallState.STREAMING_STOPPED;
      break;
    case "call.ended":
    case "call.hangup":
      session.state = CallState.CALL_ENDED;
      session.endedAt = session.endedAt ?? occurredAt;
      break;
    case "call.bridged":
    case "call.machine.detection.ended":
      break;
    default:
      break;
  }
}
