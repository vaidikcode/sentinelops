output "audit_bucket" {
  value = aws_s3_bucket.audit.id
}

output "incidents_table" {
  value = aws_dynamodb_table.incidents.name
}

output "events_table" {
  value = aws_dynamodb_table.events.name
}

output "incident_queue_url" {
  value = aws_sqs_queue.incidents.url
}

output "dead_letter_queue_url" {
  value = aws_sqs_queue.dlq.url
}

output "sns_topic_arn" {
  value = aws_sns_topic.incidents.arn
}

output "api_endpoint" {
  value = aws_apigatewayv2_api.http.api_endpoint
}

output "event_bus_name" {
  value = aws_cloudwatch_event_bus.sentinelops.name
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.ops.id
}

output "cognito_client_id" {
  value = aws_cognito_user_pool_client.dashboard.id
}

output "cognito_domain" {
  value = aws_cognito_user_pool_domain.ops.domain
}
