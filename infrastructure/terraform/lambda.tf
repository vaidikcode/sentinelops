data "archive_file" "process" {
  type        = "zip"
  source_file = "${path.module}/../../backend/dist/lambda/process.js"
  output_path = "${path.module}/../../backend/dist/lambda/process.zip"
}

data "archive_file" "dlq" {
  type        = "zip"
  source_file = "${path.module}/../../backend/dist/lambda/dlq.js"
  output_path = "${path.module}/../../backend/dist/lambda/dlq.zip"
}

data "archive_file" "api" {
  type        = "zip"
  source_file = "${path.module}/../../backend/dist/lambda/api.js"
  output_path = "${path.module}/../../backend/dist/lambda/api.zip"
}

data "archive_file" "remediate_s3" {
  type        = "zip"
  source_file = "${path.module}/../../backend/dist/lambda/remediate-s3.js"
  output_path = "${path.module}/../../backend/dist/lambda/remediate-s3.zip"
}

data "archive_file" "remediate_ec2" {
  type        = "zip"
  source_file = "${path.module}/../../backend/dist/lambda/remediate-ec2.js"
  output_path = "${path.module}/../../backend/dist/lambda/remediate-ec2.zip"
}

data "archive_file" "remediate_sg" {
  type        = "zip"
  source_file = "${path.module}/../../backend/dist/lambda/remediate-sg.js"
  output_path = "${path.module}/../../backend/dist/lambda/remediate-sg.zip"
}

data "archive_file" "remediate_queue" {
  type        = "zip"
  source_file = "${path.module}/../../backend/dist/lambda/remediate-queue.js"
  output_path = "${path.module}/../../backend/dist/lambda/remediate-queue.zip"
}

data "archive_file" "verify" {
  type        = "zip"
  source_file = "${path.module}/../../backend/dist/lambda/verify.js"
  output_path = "${path.module}/../../backend/dist/lambda/verify.zip"
}

resource "aws_cloudwatch_log_group" "lambda" {
  for_each          = toset(["process", "dlq", "api", "remediate-s3", "remediate-ec2", "remediate-sg", "remediate-queue", "verify"])
  name              = "/aws/lambda/${var.project_name}-${each.key}"
  retention_in_days = 30
  tags              = local.tags
}

resource "aws_lambda_function" "process" {
  function_name    = "${var.project_name}-process"
  role             = aws_iam_role.processor.arn
  filename         = data.archive_file.process.output_path
  source_code_hash = data.archive_file.process.output_base64sha256
  handler          = "process.handler"
  runtime          = "nodejs20.x"
  timeout          = 60
  memory_size      = 256
  depends_on       = [aws_cloudwatch_log_group.lambda]

  environment {
    variables = {
      INCIDENTS_TABLE          = aws_dynamodb_table.incidents.name
      EVENTS_TABLE             = aws_dynamodb_table.events.name
      SNS_TOPIC_ARN            = aws_sns_topic.incidents.arn
      AUDIT_BUCKET             = aws_s3_bucket.audit.id
      VERIFY_FUNCTION          = aws_lambda_function.verify.function_name
      REMEDIATE_S3_FUNCTION    = aws_lambda_function.remediate_s3.function_name
      REMEDIATE_EC2_FUNCTION   = aws_lambda_function.remediate_ec2.function_name
      REMEDIATE_SG_FUNCTION    = aws_lambda_function.remediate_sg.function_name
      REMEDIATE_QUEUE_FUNCTION = aws_lambda_function.remediate_queue.function_name
    }
  }

  tags = local.tags
}

resource "aws_lambda_function" "dlq" {
  function_name    = "${var.project_name}-dlq"
  role             = aws_iam_role.dlq.arn
  filename         = data.archive_file.dlq.output_path
  source_code_hash = data.archive_file.dlq.output_base64sha256
  handler          = "dlq.handler"
  runtime          = "nodejs20.x"
  timeout          = 30
  depends_on       = [aws_cloudwatch_log_group.lambda]

  environment {
    variables = {
      INCIDENTS_TABLE          = aws_dynamodb_table.incidents.name
      EVENTS_TABLE             = aws_dynamodb_table.events.name
      SNS_TOPIC_ARN            = aws_sns_topic.incidents.arn
      AUDIT_BUCKET             = aws_s3_bucket.audit.id
      VERIFY_FUNCTION          = aws_lambda_function.verify.function_name
      REMEDIATE_S3_FUNCTION    = aws_lambda_function.remediate_s3.function_name
      REMEDIATE_EC2_FUNCTION   = aws_lambda_function.remediate_ec2.function_name
      REMEDIATE_SG_FUNCTION    = aws_lambda_function.remediate_sg.function_name
      REMEDIATE_QUEUE_FUNCTION = aws_lambda_function.remediate_queue.function_name
    }
  }

  tags = local.tags
}

resource "aws_lambda_function" "api" {
  function_name    = "${var.project_name}-api"
  role             = aws_iam_role.api.arn
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  handler          = "api.handler"
  runtime          = "nodejs20.x"
  timeout          = 15
  depends_on       = [aws_cloudwatch_log_group.lambda]

  environment {
    variables = {
      INCIDENTS_TABLE = aws_dynamodb_table.incidents.name
      EVENTS_TABLE    = aws_dynamodb_table.events.name
    }
  }

  tags = local.tags
}

resource "aws_lambda_function" "remediate_s3" {
  function_name    = "${var.project_name}-remediate-s3"
  role             = aws_iam_role.remediate_s3.arn
  filename         = data.archive_file.remediate_s3.output_path
  source_code_hash = data.archive_file.remediate_s3.output_base64sha256
  handler          = "remediate-s3.handler"
  runtime          = "nodejs20.x"
  timeout          = 20
  depends_on       = [aws_cloudwatch_log_group.lambda]
  tags             = local.tags
}

resource "aws_lambda_function" "remediate_ec2" {
  function_name    = "${var.project_name}-remediate-ec2"
  role             = aws_iam_role.remediate_ec2.arn
  filename         = data.archive_file.remediate_ec2.output_path
  source_code_hash = data.archive_file.remediate_ec2.output_base64sha256
  handler          = "remediate-ec2.handler"
  runtime          = "nodejs20.x"
  timeout          = 20
  depends_on       = [aws_cloudwatch_log_group.lambda]
  tags             = local.tags
}

resource "aws_lambda_function" "remediate_sg" {
  function_name    = "${var.project_name}-remediate-sg"
  role             = aws_iam_role.remediate_sg.arn
  filename         = data.archive_file.remediate_sg.output_path
  source_code_hash = data.archive_file.remediate_sg.output_base64sha256
  handler          = "remediate-sg.handler"
  runtime          = "nodejs20.x"
  timeout          = 20
  depends_on       = [aws_cloudwatch_log_group.lambda]
  tags             = local.tags
}

resource "aws_lambda_function" "remediate_queue" {
  function_name    = "${var.project_name}-remediate-queue"
  role             = aws_iam_role.remediate_queue.arn
  filename         = data.archive_file.remediate_queue.output_path
  source_code_hash = data.archive_file.remediate_queue.output_base64sha256
  handler          = "remediate-queue.handler"
  runtime          = "nodejs20.x"
  timeout          = 20
  depends_on       = [aws_cloudwatch_log_group.lambda]
  tags             = local.tags
}

resource "aws_lambda_function" "verify" {
  function_name    = "${var.project_name}-verify"
  role             = aws_iam_role.verify.arn
  filename         = data.archive_file.verify.output_path
  source_code_hash = data.archive_file.verify.output_base64sha256
  handler          = "verify.handler"
  runtime          = "nodejs20.x"
  timeout          = 20
  depends_on       = [aws_cloudwatch_log_group.lambda]
  tags             = local.tags
}

resource "aws_lambda_event_source_mapping" "process" {
  event_source_arn        = aws_sqs_queue.incidents.arn
  function_name           = aws_lambda_function.process.arn
  batch_size              = 5
  function_response_types = ["ReportBatchItemFailures"]
}

resource "aws_lambda_event_source_mapping" "dlq" {
  event_source_arn = aws_sqs_queue.dlq.arn
  function_name    = aws_lambda_function.dlq.arn
  batch_size       = 5
}
