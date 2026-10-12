import { parseEvent } from "../events/parse.js";
import { markFromDeadLetter } from "../pipeline/handle-signal.js";
import { processorDeps } from "../aws/runtime.js";
import type { SqsEvent } from "./http.js";

const deps = processorDeps();

export async function handler(event: SqsEvent): Promise<void> {
  for (const record of event.Records ?? []) {
    const receiveCount = Number(record.attributes?.ApproximateReceiveCount ?? "1");
    let body: unknown;
    try {
      body = JSON.parse(record.body) as unknown;
    } catch {
      body = {
        source: "sentinelops.incidents",
        id: record.messageId,
        time: new Date().toISOString(),
        detail: {
          kind: "UNKNOWN",
          resourceId: record.messageId,
          resourceType: "UNKNOWN",
          trigger: "Unreadable dead-letter message",
          rawType: "invalid-json",
        },
      };
    }

    try {
      const signal = parseEvent(body, receiveCount) ?? {
        kind: "UNKNOWN" as const,
        eventId: record.messageId,
        observedAt: new Date().toISOString(),
        receiveCount,
        resourceId: record.messageId,
        resourceType: "UNKNOWN" as const,
        trigger: "Dead-letter message produced no signal",
        rawType: "empty",
      };
      await markFromDeadLetter(signal, deps);
    } catch (error) {
      console.error("Dead-letter handling failed", {
        messageId: record.messageId,
        error: error instanceof Error ? error.message : "unknown",
      });
      throw error;
    }
  }
}
