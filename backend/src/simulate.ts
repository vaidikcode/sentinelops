import { MemoryIncidentStore } from "./store/memory-store.js";
import { runScenario, isScenarioName } from "./local/scenarios.js";

const name = process.argv[2] ?? "public-s3";
if (!isScenarioName(name)) {
  console.error(`Unknown scenario "${name}".`);
  process.exit(1);
}

const store = new MemoryIncidentStore();
const outcome = await runScenario(name, store);
console.log(JSON.stringify(outcome, null, 2));
