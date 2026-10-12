resource "aws_cloudwatch_event_bus" "sentinelops" {
  name = var.project_name
  tags = local.tags
}

resource "aws_cloudwatch_event_rule" "alarms" {
  name = "${var.project_name}-alarms"
  event_pattern = jsonencode({
    source      = ["aws.cloudwatch"]
    detail-type = ["CloudWatch Alarm State Change"]
    detail = {
      alarmName = [{ prefix = "${var.project_name}-" }]
      state     = { value = ["ALARM"] }
    }
  })
  tags = local.tags
}

resource "aws_cloudwatch_event_rule" "config" {
  name = "${var.project_name}-config"
  event_pattern = jsonencode({
    source      = ["aws.config"]
    detail-type = ["Config Rules Compliance Change"]
    detail = {
      configRuleName = [
        "S3_BUCKET_PUBLIC_READ_PROHIBITED",
        "S3_BUCKET_PUBLIC_WRITE_PROHIBITED",
        "INCOMING_SSH_DISABLED",
        "${var.project_name}-s3-public",
        "${var.project_name}-ssh"
      ]
      newEvaluationResult = { complianceType = ["NON_COMPLIANT"] }
    }
  })
  tags = local.tags
}

resource "aws_cloudwatch_event_rule" "custom" {
  name           = "${var.project_name}-direct"
  event_bus_name = aws_cloudwatch_event_bus.sentinelops.name
  event_pattern = jsonencode({
    source = ["${var.project_name}.incidents"]
  })
  tags = local.tags
}

resource "aws_cloudwatch_event_target" "alarms" {
  rule = aws_cloudwatch_event_rule.alarms.name
  arn  = aws_sqs_queue.incidents.arn
}

resource "aws_cloudwatch_event_target" "config" {
  rule = aws_cloudwatch_event_rule.config.name
  arn  = aws_sqs_queue.incidents.arn
}

resource "aws_cloudwatch_event_target" "custom" {
  rule           = aws_cloudwatch_event_rule.custom.name
  event_bus_name = aws_cloudwatch_event_bus.sentinelops.name
  arn            = aws_sqs_queue.incidents.arn
}
