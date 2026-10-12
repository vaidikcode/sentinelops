import assert from "node:assert/strict";
import test from "node:test";
import { routeApi } from "../src/api/routes.js";
import { runScenario } from "../src/local/scenarios.js";
import { MemoryIncidentStore } from "../src/store/memory-store.js";

test("local API lists seeded incidents and runs a duplicate scenario", async () => {
  const store = new MemoryIncidentStore();
  await runScenario("public-s3", store);
  const summary = await routeApi("GET", "/api/summary", undefined, { store, allowSimulate: true });
  assert.equal(summary.status, 200);
  assert.equal((summary.body as { total: number }).total, 1);

  const simulated = await routeApi("POST", "/simulate", { scenario: "duplicate" }, {
    store,
    allowSimulate: true,
  });
  assert.equal(simulated.status, 200);
  const notes = (simulated.body as { notes: string[] }).notes.join(" ");
  assert.match(notes, /duplicate/);
  assert.match(notes, /Remediation calls: 1/);

  const hidden = await routeApi("POST", "/simulate", { scenario: "public-s3" }, {
    store,
    allowSimulate: false,
  });
  assert.equal(hidden.status, 404);
});
