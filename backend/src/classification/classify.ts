import type { IncidentType, NormalizedSignal } from "../domain/types.js";

export const CPU_THRESHOLD_PERCENT = 80;
export const CPU_DURATION_MINUTES = 5;

export interface Classification {
  type: IncidentType;
}

export function classifySignal(signal: NormalizedSignal): Classification | null {
  switch (signal.kind) {
    case "CPU_HIGH":
      if (signal.cpuPercent > CPU_THRESHOLD_PERCENT && signal.durationMinutes >= CPU_DURATION_MINUTES) {
        return { type: "EC2_CPU_OVERLOAD" };
      }
      return null;
    case "EC2_STATUS_CHECK_FAILED":
      return { type: "EC2_UNHEALTHY" };
    case "S3_PUBLIC":
      return signal.publicAccess ? { type: "PUBLIC_S3_BUCKET" } : null;
    case "SG_PUBLIC_SSH":
      if (signal.port === 22 && (signal.cidr === "0.0.0.0/0" || signal.cidr === "::/0")) {
        return { type: "DANGEROUS_SECURITY_GROUP" };
      }
      return null;
    case "QUEUE_BACKLOG":
      return signal.depth > signal.threshold ? { type: "SQS_QUEUE_BACKLOG" } : null;
    case "UNKNOWN":
      return { type: "UNKNOWN" };
  }
}
