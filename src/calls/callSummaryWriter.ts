import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CallSession, SafeCallError } from "./callSessionStore.js";

export type CallSummary = {
  callSessionId: string;
  callControlId: string;
  streamId?: string;
  startedAt?: string;
  answeredAt?: string;
  streamingStartedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  mediaFrames: number;
  totalMediaBytes: number;
  transcriptCount: number;
  finalTranscripts: string[];
  errors: SafeCallError[];
};

const callSummariesDir = path.resolve(process.cwd(), "tmp", "call-summaries");

export async function writeCallSummary(session: CallSession) {
  await mkdir(callSummariesDir, { recursive: true });

  const summary = buildCallSummary(session);
  const filePath = path.join(
    callSummariesDir,
    `${sanitizeFileSegment(session.callSessionId)}.json`
  );

  await writeFile(filePath, JSON.stringify(summary, null, 2), "utf8");

  return filePath;
}

function buildCallSummary(session: CallSession): CallSummary {
  const durationSeconds = calculateDurationSeconds(
    session.startedAt,
    session.endedAt
  );
  const summary: CallSummary = {
    callSessionId: session.callSessionId,
    callControlId: session.callControlId,
    mediaFrames: session.mediaFrames,
    totalMediaBytes: session.totalMediaBytes,
    transcriptCount: session.finalTranscripts.length,
    finalTranscripts: [...session.finalTranscripts],
    errors: [...session.errors]
  };

  if (session.streamId) {
    summary.streamId = session.streamId;
  }

  if (session.startedAt) {
    summary.startedAt = session.startedAt;
  }

  if (session.answeredAt) {
    summary.answeredAt = session.answeredAt;
  }

  if (session.streamingStartedAt) {
    summary.streamingStartedAt = session.streamingStartedAt;
  }

  if (session.endedAt) {
    summary.endedAt = session.endedAt;
  }

  if (durationSeconds !== undefined) {
    summary.durationSeconds = durationSeconds;
  }

  return summary;
}

function calculateDurationSeconds(startedAt?: string, endedAt?: string) {
  if (!startedAt || !endedAt) {
    return undefined;
  }

  const startedMs = Date.parse(startedAt);
  const endedMs = Date.parse(endedAt);

  if (Number.isNaN(startedMs) || Number.isNaN(endedMs) || endedMs < startedMs) {
    return undefined;
  }

  return Math.round((endedMs - startedMs) / 1000);
}

function sanitizeFileSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}
