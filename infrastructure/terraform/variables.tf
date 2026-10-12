variable "aws_region" {
  description = "Region for the incident platform."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short name used in resource names."
  type        = string
  default     = "sentinelops"
}

variable "alert_email" {
  description = "Optional address subscribed to the incident topic. Leave empty to skip the subscription."
  type        = string
  default     = ""
}

variable "dashboard_callback_url" {
  description = "Cognito callback URL for the dashboard."
  type        = string
  default     = "http://localhost:5173"
}

variable "cpu_threshold" {
  description = "CPU percent that opens an EC2 overload incident when a demo instance is set."
  type        = number
  default     = 80
}

variable "queue_depth_threshold" {
  description = "Visible message count that opens a backlog incident when a demo queue is set."
  type        = number
  default     = 100
}

variable "demo_instance_id" {
  description = "Optional EC2 instance id. Alarms are created only when this is set."
  type        = string
  default     = ""
}

variable "demo_queue_name" {
  description = "Optional SQS queue name. A backlog alarm is created only when this is set."
  type        = string
  default     = ""
}
