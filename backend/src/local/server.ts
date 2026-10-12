import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { routeApi } from "../api/routes.js";
import { MemoryIncidentStore } from "../store/memory-store.js";
import { runScenario } from "./scenarios.js";

const store = new MemoryIncidentStore();

async function seed(): Promise<void> {
  await runScenario("public-s3", store);
  await runScenario("open-ssh", store);
  await runScenario("unknown", store);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(body));
}

export function createLocalServer() {
  return createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      send(res, 204, {});
      return;
    }
    try {
      const raw = await readBody(req);
      const body = raw ? (JSON.parse(raw) as unknown) : undefined;
      const result = await routeApi(req.method ?? "GET", req.url ?? "/", body, {
        store,
        allowSimulate: true,
      });
      send(res, result.status, result.body);
    } catch (error) {
      send(res, 500, { error: error instanceof Error ? error.message : "Local API failed" });
    }
  });
}

const port = Number(process.env.PORT ?? "8787");
const isEntry = process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js");

if (isEntry) {
  await seed();
  createLocalServer().listen(port, () => {
    console.log(`SentinelOps local API listening on http://localhost:${port}`);
  });
}
