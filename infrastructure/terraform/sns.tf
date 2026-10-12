resource "aws_sns_topic" "incidents" {
  name              = "${var.project_name}-incidents"
  kms_master_key_id = "alias/aws/sns"
  tags              = local.tags
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alert_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.incidents.arn
  protocol  = "email"
  endpoint  = var.alert_email
}
