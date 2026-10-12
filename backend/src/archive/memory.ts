import type { Incident } from "../domain/types.js";
import type { Archiver } from "./types.js";

export class MemoryArchiver implements Archiver {
  readonly objects: Incident[] = [];

  async archive(incident: Incident): Promise<void> {
    this.objects.push(structuredClone(incident));
  }
}
