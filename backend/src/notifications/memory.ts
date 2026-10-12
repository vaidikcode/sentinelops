import type { Incident } from "../domain/types.js";
import type { Notifier } from "./types.js";

export class MemoryNotifier implements Notifier {
  readonly sent: Incident[] = [];

  async notify(incident: Incident): Promise<void> {
    this.sent.push(structuredClone(incident));
  }
}
