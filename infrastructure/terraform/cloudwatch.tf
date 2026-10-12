resource "aws_cloudwatch_metric_alarm" "cpu" {
  count               = var.demo_instance_id == "" ? 0 : 1
  alarm_name          = "${var.project_name}-ec2-cpu-${var.demo_instance_id}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = var.cpu_threshold
  treat_missing_data  = "notBreaching"

  dimensions = {
    InstanceId = var.demo_instance_id
  }

  tags = local.tags
}

resource "aws_cloudwatch_metric_alarm" "status" {
  count               = var.demo_instance_id == "" ? 0 : 1
  alarm_name          = "${var.project_name}-ec2-status-${var.demo_instance_id}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "StatusCheckFailed"
  namespace           = "AWS/EC2"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    InstanceId = var.demo_instance_id
  }

  tags = local.tags
}

resource "aws_cloudwatch_metric_alarm" "queue" {
  count               = var.demo_queue_name == "" ? 0 : 1
  alarm_name          = "${var.project_name}-sqs-backlog-${var.demo_queue_name}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = var.queue_depth_threshold
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = var.demo_queue_name
  }

  tags = local.tags
}
