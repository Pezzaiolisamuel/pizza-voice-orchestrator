import * as speechSdk from "microsoft-cognitiveservices-speech-sdk";

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
  let closed = false;

  recognizer.recognizing = (_sender, event) => {
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
      logger.error({ callSessionId, error }, "failed to start Azure STT session");
    }
  );

  return {
    pushAudio(buffer: Buffer) {
      if (closed) {
        logger.debug({ callSessionId }, "ignored audio for closed Azure STT session");
        return;
      }

      const audioBytes = new Uint8Array(buffer.byteLength);
      audioBytes.set(buffer);
      pushStream.write(audioBytes.buffer);
    },

    async close() {
      if (closed) {
        return;
      }

      closed = true;
      pushStream.close();

      await new Promise<void>((resolve) => {
        recognizer.stopContinuousRecognitionAsync(
          () => {
            resolve();
          },
          (error) => {
            logger.warn({ callSessionId, error }, "failed to stop Azure STT session");
            resolve();
          }
        );
      });

      await new Promise<void>((resolve) => {
        recognizer.close(
          () => {
            logger.info({ callSessionId }, "Azure STT recognizer closed");
            resolve();
          },
          (error) => {
            logger.warn(
              { callSessionId, error },
              "failed to close Azure STT recognizer"
            );
            resolve();
          }
        );
      });

      audioConfig.close();
    }
  };
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
