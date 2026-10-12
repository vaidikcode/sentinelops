data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "processor" {
  name               = "${var.project_name}-processor"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = local.tags
}

resource "aws_iam_role" "dlq" {
  name               = "${var.project_name}-dlq"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = local.tags
}

resource "aws_iam_role" "api" {
  name               = "${var.project_name}-api"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = local.tags
}

resource "aws_iam_role" "remediate_s3" {
  name               = "${var.project_name}-remediate-s3"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = local.tags
}

resource "aws_iam_role" "remediate_ec2" {
  name               = "${var.project_name}-remediate-ec2"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = local.tags
}

resource "aws_iam_role" "remediate_sg" {
  name               = "${var.project_name}-remediate-sg"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = local.tags
}

resource "aws_iam_role" "remediate_queue" {
  name               = "${var.project_name}-remediate-queue"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = local.tags
}

resource "aws_iam_role" "verify" {
  name               = "${var.project_name}-verify"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = local.tags
}

data "aws_iam_policy_document" "logs" {
  statement {
    sid       = "WriteOwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:*:*:log-group:/aws/lambda/${var.project_name}-*:*"]
  }
}

resource "aws_iam_policy" "logs" {
  name   = "${var.project_name}-lambda-logs"
  policy = data.aws_iam_policy_document.logs.json
}

resource "aws_iam_role_policy_attachment" "logs" {
  for_each = {
    processor       = aws_iam_role.processor.name
    dlq             = aws_iam_role.dlq.name
    api             = aws_iam_role.api.name
    remediate_s3    = aws_iam_role.remediate_s3.name
    remediate_ec2   = aws_iam_role.remediate_ec2.name
    remediate_sg    = aws_iam_role.remediate_sg.name
    remediate_queue = aws_iam_role.remediate_queue.name
    verify          = aws_iam_role.verify.name
  }
  role       = each.value
  policy_arn = aws_iam_policy.logs.arn
}

data "aws_iam_policy_document" "processor" {
  statement {
    sid = "IncidentRecords"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:Query",
      "dynamodb:TransactWriteItems"
    ]
    resources = [
      aws_dynamodb_table.incidents.arn,
      "${aws_dynamodb_table.incidents.arn}/index/*",
      aws_dynamodb_table.events.arn
    ]
  }

  statement {
    sid       = "ReadIncidentQueue"
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:ChangeMessageVisibility"]
    resources = [aws_sqs_queue.incidents.arn]
  }

  statement {
    sid       = "Notify"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.incidents.arn]
  }

  statement {
    sid       = "ArchiveIncident"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.audit.arn}/incidents/*"]
  }

  statement {
    sid     = "InvokeWorkers"
    actions = ["lambda:InvokeFunction"]
    resources = [
      aws_lambda_function.remediate_s3.arn,
      aws_lambda_function.remediate_ec2.arn,
      aws_lambda_function.remediate_sg.arn,
      aws_lambda_function.remediate_queue.arn,
      aws_lambda_function.verify.arn
    ]
  }

  statement {
    sid       = "PublishEncryptedTopic"
    actions   = ["kms:GenerateDataKey", "kms:Decrypt"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["sns.${var.aws_region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "processor" {
  name   = "processor"
  role   = aws_iam_role.processor.id
  policy = data.aws_iam_policy_document.processor.json
}

data "aws_iam_policy_document" "dlq" {
  statement {
    sid = "IncidentRecords"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:Query",
      "dynamodb:TransactWriteItems"
    ]
    resources = [
      aws_dynamodb_table.incidents.arn,
      "${aws_dynamodb_table.incidents.arn}/index/*",
      aws_dynamodb_table.events.arn
    ]
  }

  statement {
    sid       = "ReadDeadLetterQueue"
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
    resources = [aws_sqs_queue.dlq.arn]
  }

  statement {
    sid       = "Notify"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.incidents.arn]
  }

  statement {
    sid       = "ArchiveIncident"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.audit.arn}/incidents/*"]
  }

  statement {
    sid       = "PublishEncryptedTopic"
    actions   = ["kms:GenerateDataKey", "kms:Decrypt"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["sns.${var.aws_region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "dlq" {
  name   = "dlq"
  role   = aws_iam_role.dlq.id
  policy = data.aws_iam_policy_document.dlq.json
}

data "aws_iam_policy_document" "api" {
  statement {
    sid     = "ReadIncidents"
    actions = ["dynamodb:GetItem", "dynamodb:Query"]
    resources = [
      aws_dynamodb_table.incidents.arn,
      "${aws_dynamodb_table.incidents.arn}/index/*"
    ]
  }
}

resource "aws_iam_role_policy" "api" {
  name   = "api"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

data "aws_iam_policy_document" "remediate_s3" {
  statement {
    sid = "BlockPublicAccess"
    actions = [
      "s3:GetBucketPublicAccessBlock",
      "s3:PutBucketPublicAccessBlock"
    ]
    resources = ["arn:aws:s3:::*"]
  }
}

resource "aws_iam_role_policy" "remediate_s3" {
  name   = "remediate-s3"
  role   = aws_iam_role.remediate_s3.id
  policy = data.aws_iam_policy_document.remediate_s3.json
}

data "aws_iam_policy_document" "remediate_ec2" {
  statement {
    sid       = "ReadInstances"
    actions   = ["ec2:DescribeInstances", "ec2:DescribeInstanceStatus", "autoscaling:DescribeAutoScalingGroups"]
    resources = ["*"]
  }

  statement {
    sid       = "RebootTaggedInstances"
    actions   = ["ec2:RebootInstances"]
    resources = ["arn:aws:ec2:*:*:instance/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/sentinelops:auto-recover"
      values   = ["true"]
    }
  }

  statement {
    sid       = "ScaleTaggedGroups"
    actions   = ["autoscaling:SetDesiredCapacity"]
    resources = ["arn:aws:autoscaling:*:*:autoScalingGroup:*:autoScalingGroupName/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/sentinelops:scale"
      values   = ["true"]
    }
  }
}

resource "aws_iam_role_policy" "remediate_ec2" {
  name   = "remediate-ec2"
  role   = aws_iam_role.remediate_ec2.id
  policy = data.aws_iam_policy_document.remediate_ec2.json
}

data "aws_iam_policy_document" "remediate_sg" {
  statement {
    sid       = "ReadGroups"
    actions   = ["ec2:DescribeSecurityGroups"]
    resources = ["*"]
  }

  statement {
    sid       = "RevokeIngress"
    actions   = ["ec2:RevokeSecurityGroupIngress"]
    resources = ["arn:aws:ec2:*:*:security-group/*"]
  }
}

resource "aws_iam_role_policy" "remediate_sg" {
  name   = "remediate-sg"
  role   = aws_iam_role.remediate_sg.id
  policy = data.aws_iam_policy_document.remediate_sg.json
}

data "aws_iam_policy_document" "remediate_queue" {
  statement {
    sid       = "ReadGroups"
    actions   = ["autoscaling:DescribeAutoScalingGroups"]
    resources = ["*"]
  }

  statement {
    sid       = "ScaleTaggedGroups"
    actions   = ["autoscaling:SetDesiredCapacity"]
    resources = ["arn:aws:autoscaling:*:*:autoScalingGroup:*:autoScalingGroupName/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/sentinelops:scale"
      values   = ["true"]
    }
  }
}

resource "aws_iam_role_policy" "remediate_queue" {
  name   = "remediate-queue"
  role   = aws_iam_role.remediate_queue.id
  policy = data.aws_iam_policy_document.remediate_queue.json
}

data "aws_iam_policy_document" "verify" {
  statement {
    sid       = "ReadBucketBlock"
    actions   = ["s3:GetBucketPublicAccessBlock"]
    resources = ["arn:aws:s3:::*"]
  }

  statement {
    sid       = "ReadCompute"
    actions   = ["ec2:DescribeSecurityGroups", "ec2:DescribeInstanceStatus", "cloudwatch:GetMetricStatistics"]
    resources = ["*"]
  }

  statement {
    sid       = "ReadQueues"
    actions   = ["sqs:GetQueueAttributes", "sqs:GetQueueUrl"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "verify" {
  name   = "verify"
  role   = aws_iam_role.verify.id
  policy = data.aws_iam_policy_document.verify.json
}
