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
