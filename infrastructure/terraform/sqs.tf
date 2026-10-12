resource "aws_sqs_queue" "dlq" {
  name                      = "${var.project_name}-incident-events-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
  tags                      = local.tags
}

resource "aws_sqs_queue" "incidents" {
  name                       = "${var.project_name}-incident-events"
  visibility_timeout_seconds = 180
  message_retention_seconds  = 345600
  sqs_managed_sse_enabled    = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })
  tags = local.tags
}

data "aws_iam_policy_document" "incidents_queue" {
  statement {
    sid       = "AllowEventBridge"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.incidents.arn]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values = [
        aws_cloudwatch_event_rule.alarms.arn,
        aws_cloudwatch_event_rule.config.arn,
        aws_cloudwatch_event_rule.custom.arn
      ]
    }
  }
}

resource "aws_sqs_queue_policy" "incidents" {
  queue_url = aws_sqs_queue.incidents.id
  policy    = data.aws_iam_policy_document.incidents_queue.json
}
