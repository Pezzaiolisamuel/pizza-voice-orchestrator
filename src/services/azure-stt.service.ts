import * as speechSdk from "microsoft-cognitiveservices-speech-sdk";

import {
  addFinalTranscript,
  addPartialTranscript,
  addSafeError,
  CallState,
  transitionCallState,
  type SafeCallError
} from "../calls/callSessionStore.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export type AzureSttSession = {
  pushAudio(buffer: Buffer): void;
  close(): Promise<void>;
};

const telnyxPcmuAudioFormat = speechSdk.AudioStreamFormat.getWaveFormat(
  8000,
  8,
  1,
  speechSdk.AudioFormatTag.MuLaw
);

export function createAzureSttSession(callSessionId: string): AzureSttSession {
  if (!env.AZURE_STT_ENABLED) {
    logger.info({ callSessionId }, "Azure STT is disabled");
    return createNoopAzureSttSession(callSessionId);
  }

  if (!env.AZURE_SPEECH_KEY || !env.AZURE_SPEECH_REGION) {
    throw new Error(
      "AZURE_SPEECH_KEY and AZURE_SPEECH_REGION are required when AZURE_STT_ENABLED=true"
    );
  }

  const pushStream = speechSdk.PushAudioInputStream.create(telnyxPcmuAudioFormat);
  const audioConfig = speechSdk.AudioConfig.fromStreamInput(pushStream);
  const speechConfig = speechSdk.SpeechConfig.fromSubscription(
    env.AZURE_SPEECH_KEY,
    env.AZURE_SPEECH_REGION
  );

  speechConfig.speechRecognitionLanguage = env.AZURE_STT_LANGUAGE;

  const recognizer = new speechSdk.SpeechRecognizer(speechConfig, audioConfig);
  let isClosing = false;
  let isClosed = false;
  let closePromise: Promise<void> | null = null;
  let pushStreamClosed = false;
  let sessionStopped = false;
  let transcribing = false;

  recognizer.recognizing = (_sender, event) => {
    transitionToTranscribing(callSessionId, transcribing);
    transcribing = true;

    const text = event.result.text.trim();
    if (text.length > 0) {
      addPartialTranscript(callSessionId, text);
    }

    logger.info(
      {
        callSessionId,
        text: event.result.text,
        reason: speechSdk.ResultReason[event.result.reason]
      },
      "Azure STT recognizing partial transcript"
    );
  };

  recognizer.recognized = (_sender, event) => {
    transitionToTranscribing(callSessionId, transcribing);
    transcribing = true;

    const text = event.result.text.trim();
    if (text.length > 0) {
      addFinalTranscript(callSessionId, text);
    }

    logger.info(
      {
        callSessionId,
        text: event.result.text,
        reason: speechSdk.ResultReason[event.result.reason]
      },
      "Azure STT recognized final transcript"
    );
  };

  recognizer.canceled = (_sender, event) => {
    addSafeError(callSessionId, {
      timestamp: new Date().toISOString(),
      source: "azure.stt.canceled",
      message: event.errorDetails || "Azure STT recognition canceled",
      code: speechSdk.CancellationErrorCode[event.errorCode]
    });

    logger.warn(
      {
        callSessionId,
        reason: speechSdk.CancellationReason[event.reason],
        errorCode: speechSdk.CancellationErrorCode[event.errorCode],
        errorDetails: event.errorDetails
      },
      "Azure STT recognition canceled"
    );
  };

  recognizer.sessionStopped = (_sender, event) => {
    sessionStopped = true;
    addSafeError(callSessionId, {
      timestamp: new Date().toISOString(),
      source: "azure.stt.session_stopped",
      message: "Azure STT session stopped",
      code: event.sessionId
    });

    logger.info(
      {
        callSessionId,
        sessionId: event.sessionId
      },
      "Azure STT session stopped"
    );
  };

  recognizer.startContinuousRecognitionAsync(
    () => {
      logger.info(
        {
          callSessionId,
          language: env.AZURE_STT_LANGUAGE,
          audioFormat: "PCMU 8000Hz 8-bit mono"
        },
        "Azure STT session started"
      );
    },
    (error) => {
      const safeError = toSafeCallError("azure.stt.start", error);
      addSafeError(callSessionId, safeError);
      logger.error(
        { callSessionId, error: safeError },
        "failed to start Azure STT session"
      );
    }
  );

  return {
    pushAudio(buffer: Buffer) {
      if (isClosing || isClosed) {
        logger.debug({ callSessionId }, "ignored audio for closed Azure STT session");
        return;
      }

      transitionToTranscribing(callSessionId, transcribing);
      transcribing = true;

      const audioBytes = new Uint8Array(buffer.byteLength);
      audioBytes.set(buffer);

      try {
        pushStream.write(audioBytes.buffer);
      } catch (error) {
        const safeError = toSafeCallError("azure.stt.push_audio", error);
        addSafeError(callSessionId, safeError);
        logger.warn(
          { callSessionId, error: safeError },
          "failed to push audio to Azure STT session"
        );
        throw error;
      }
    },

    async close() {
      if (isClosed) {
        return;
      }

      if (closePromise) {
        return closePromise;
      }

      isClosing = true;
      closePromise = (async () => {
        try {
          if (!pushStreamClosed) {
            pushStream.close();
            pushStreamClosed = true;
          }

          if (!sessionStopped) {
            await new Promise<void>((resolve) => {
              recognizer.stopContinuousRecognitionAsync(
                () => {
                  resolve();
                },
                (error) => {
                  if (!isBenignRecognizerCloseError(error)) {
                    const safeError = toSafeCallError("azure.stt.stop", error);
                    addSafeError(callSessionId, safeError);
                    logger.warn(
                      { callSessionId, error: safeError },
                      "failed to stop Azure STT session"
                    );
                  } else {
                    logger.debug(
                      { callSessionId },
                      "Azure STT session was already stopped"
                    );
                  }
                  resolve();
                }
              );
            });
          }

          await new Promise<void>((resolve) => {
            recognizer.close(
              () => {
                logger.info({ callSessionId }, "Azure STT recognizer closed");
                resolve();
              },
              (error) => {
                if (!isBenignRecognizerCloseError(error)) {
                  const safeError = toSafeCallError("azure.stt.close", error);
                  addSafeError(callSessionId, safeError);
                  logger.warn(
                    { callSessionId, error: safeError },
                    "failed to close Azure STT recognizer"
                  );
                } else {
                  logger.debug(
                    { callSessionId },
                    "Azure STT recognizer was already closed"
                  );
                }
                resolve();
              }
            );
          });

          audioConfig.close();
          isClosed = true;
        } finally {
          isClosing = false;
        }
      })();

      return closePromise;
    }
  };
}

function transitionToTranscribing(callSessionId: string, alreadyTranscribing: boolean) {
  if (!alreadyTranscribing) {
    transitionCallState(callSessionId, CallState.TRANSCRIBING);
  }
}

function toSafeCallError(source: string, error: unknown): SafeCallError {
  const safeError: SafeCallError = {
    timestamp: new Date().toISOString(),
    source,
    message: error instanceof Error ? error.message : String(error)
  };

  const code = getErrorCode(error);

  if (code) {
    safeError.code = code;
  }

  return safeError;
}

function getErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const code = (error as { code?: unknown; statusCode?: unknown }).code;
  const statusCode = (error as { code?: unknown; statusCode?: unknown }).statusCode;

  if (typeof code === "string") {
    return code;
  }

  if (typeof statusCode === "number" || typeof statusCode === "string") {
    return String(statusCode);
  }

  return undefined;
}

function isBenignRecognizerCloseError(error: unknown) {
  if (error === undefined || error === null) {
    return true;
  }

  if (typeof error === "string") {
    const normalized = error.trim().toLowerCase();
    return (
      normalized.length === 0 ||
      normalized.includes("already") ||
      normalized.includes("closed") ||
      normalized.includes("stopped")
    );
  }

  if (error instanceof Error) {
    return isBenignRecognizerCloseError(error.message);
  }

  if (typeof error === "object") {
    return Object.keys(error).length === 0;
  }

  return false;
}

function createNoopAzureSttSession(callSessionId: string): AzureSttSession {
  return {
    pushAudio(_buffer: Buffer) {
      logger.debug({ callSessionId }, "ignored audio for disabled Azure STT session");
    },
    async close() {
      logger.debug({ callSessionId }, "closed disabled Azure STT session");
    }
  };
}
