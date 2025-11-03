variable "project" {
  type        = string
  description = "Project name prefix"
  default     = "jmap-serverless"
}

variable "region" {
  type        = string
  description = "AWS region for regional resources (API Gateway, Route53 operations)"
}

variable "root_domain_name" {
  type        = string
  description = "Root domain name (e.g., example.com)"
}

variable "sam_http_api_id" {
  type        = string
  description = "HTTP API (ApiGatewayV2) ID from SAM Outputs.HttpApiId"
}


