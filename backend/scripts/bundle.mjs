import { mkdir } from "node:fs/promises";
import { build } from "esbuild";

await mkdir("dist/lambda", { recursive: true });

await build({
  entryPoints: {
    process: "src/handlers/process.ts",
    dlq: "src/handlers/dlq.ts",
    api: "src/handlers/api.ts",
    "remediate-s3": "src/handlers/remediate-s3.ts",
    "remediate-ec2": "src/handlers/remediate-ec2.ts",
    "remediate-sg": "src/handlers/remediate-sg.ts",
    "remediate-queue": "src/handlers/remediate-queue.ts",
    verify: "src/handlers/verify.ts",
  },
  outdir: "dist/lambda",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  sourcemap: true,
  logLevel: "info",
});
