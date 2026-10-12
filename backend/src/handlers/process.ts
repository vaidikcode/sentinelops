import { parseEvent } from "../events/parse.js";
import { handleSignal } from "../pipeline/handle-signal.js";
import { processorDeps } from "../aws/runtime.js";
import type { SqsBatchResponse, SqsEvent } from "./http.js";

const deps = processorDeps();

export async function handler(event: SqsEvent): Promise<SqsBatchResponse> {
  const failures: { itemIdentifier: string }[] = [];

  for (const record of event.Records ?? []) {
    try {
      const receiveCount = Number(record.attributes?.ApproximateReceiveCount ?? "1");
      const signal = parseEvent(JSON.parse(record.body) as unknown, receiveCount);
      if (!signal) continue;
      await handleSignal(signal, deps);
    } catch (error) {
      console.error("Incident processing failed", {
        messageId: record.messageId,
        error: error instanceof Error ? error.message : "unknown",
      });
      failures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures: failures };
}
