variable "region" {
  type        = string
  description = "AWS region for regional resources"
}

variable "root_domain_name" {
  type        = string
  description = "Root domain (e.g., jmapbox.com)"
}

variable "sam_http_api_id" {
  type        = string
  description = "HTTP API ID from SAM outputs"
}

variable "wait_for_certificate_validation" {
  type        = bool
  description = "Whether to wait for certificate validation (set false on first deploy)"
  default     = false
}

variable "web_client_s3_endpoint" {
  type        = string
  description = "S3 website endpoint for web client (e.g., bucket.s3-website.region.amazonaws.com). If set, CloudFront will serve the web client from S3."
  default     = ""
}

variable "allowed_origins" {
  type        = string
  description = "Comma-separated list of allowed CORS origins (e.g., https://jmap.io,https://jmapbox.com)"
  default     = ""
}
