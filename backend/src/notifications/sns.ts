import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import type { Incident } from "../domain/types.js";
import { formatAlert } from "./format.js";
import type { Notifier } from "./types.js";

export class SnsNotifier implements Notifier {
  constructor(
    private readonly sns: SNSClient,
    private readonly topicArn: string,
  ) {}

  async notify(incident: Incident): Promise<void> {
    await this.sns.send(
      new PublishCommand({
        TopicArn: this.topicArn,
        Subject: `${incident.severity} ${incident.type}`.slice(0, 100),
        Message: formatAlert(incident),
      }),
    );
  }
}
