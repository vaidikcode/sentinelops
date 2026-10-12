import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Incident } from "../domain/types.js";
import type { Archiver } from "./types.js";

export class S3Archiver implements Archiver {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
  ) {}

  async archive(incident: Incident): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: `incidents/${incident.incidentId}.json`,
        Body: JSON.stringify(incident, null, 2),
        ContentType: "application/json",
        ServerSideEncryption: "AES256",
      }),
    );
  }
}
