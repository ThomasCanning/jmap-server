terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

locals {
  jmap_subdomain = "jmap"
  jmap_fqdn      = "${local.jmap_subdomain}.${var.root_domain_name}"
}

########################
# ACM Certificates
########################

# Certificate for jmap.domain.com (API Gateway)
resource "aws_acm_certificate" "api" {
  domain_name       = local.jmap_fqdn
  validation_method = "DNS"
}

resource "aws_acm_certificate_validation" "api" {
  count           = var.wait_for_certificate_validation ? 1 : 0
  certificate_arn = aws_acm_certificate.api.arn
}

# Certificate for domain.com (autodiscovery CloudFront)
resource "aws_acm_certificate" "root_autodiscovery" {
  provider          = aws.us_east_1
  domain_name       = var.root_domain_name
  validation_method = "DNS"
}

resource "aws_acm_certificate_validation" "root_autodiscovery" {
  count           = var.wait_for_certificate_validation ? 1 : 0
  provider        = aws.us_east_1
  certificate_arn = aws_acm_certificate.root_autodiscovery.arn
}

########################
# API Gateway Custom Domain (jmap.domain.com)
########################

resource "aws_apigatewayv2_domain_name" "jmap" {
  count       = var.wait_for_certificate_validation ? 1 : 0
  domain_name = local.jmap_fqdn
  domain_name_configuration {
    certificate_arn = aws_acm_certificate.api.arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
  depends_on = [aws_acm_certificate_validation.api]
}

resource "aws_apigatewayv2_api_mapping" "jmap" {
  count       = var.wait_for_certificate_validation ? 1 : 0
  api_id      = var.sam_http_api_id
  domain_name = aws_apigatewayv2_domain_name.jmap[0].domain_name
  stage       = "$default"
}

########################
# CloudFront Autodiscovery (domain.com/.well-known/jmap)
########################

# CloudFront function for JMAP autodiscovery redirect
resource "aws_cloudfront_function" "autodiscovery_redirect" {
  name    = "jmap-autodiscovery-redirect"
  runtime = "cloudfront-js-1.0"
  publish = true
  comment = "RFC 8620 JMAP autodiscovery redirect - redirects /.well-known/jmap, returns 404 for other paths when S3 disabled"
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      if (request.uri === '/.well-known/jmap') {
        return {
          statusCode: 301,
          statusDescription: 'Moved Permanently',
          headers: {
            location: { value: 'https://${local.jmap_fqdn}/.well-known/jmap' },
            'cache-control': { value: 'public, max-age=3600' }
          }
        };
      }
      // When used on default cache behavior (S3 disabled), return 404 for other paths
      // When used on /.well-known/jmap cache behavior (S3 enabled), this won't be reached
      return {
        statusCode: 404,
        body: 'Not Found'
      };
    }
  EOT
}

# CloudFront distribution for autodiscovery (and optionally web client)
resource "aws_cloudfront_distribution" "autodiscovery" {
  count           = var.wait_for_certificate_validation ? 1 : 0
  enabled         = true
  aliases         = [var.root_domain_name]
  comment         = var.web_client_s3_endpoint != "" ? "JMAP autodiscovery + web client" : "JMAP autodiscovery redirect only (RFC 8620)"
  price_class     = "PriceClass_100"
  is_ipv6_enabled = true

  # S3 origin for web client (only if web_client_s3_endpoint is set)
  dynamic "origin" {
    for_each = var.web_client_s3_endpoint != "" ? [1] : []
    content {
      domain_name = var.web_client_s3_endpoint
      origin_id   = "s3-web-client"
      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "http-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  # Dummy origin (only used when S3 is disabled - CloudFront function handles everything)
  dynamic "origin" {
    for_each = var.web_client_s3_endpoint == "" ? [1] : []
    content {
      domain_name = "unused.example.com"
      origin_id   = "unused"
      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  # Cache behavior for /.well-known/jmap (MUST come before default_cache_behavior)
  # Only used when S3 is enabled - redirects to jmap.domain.com
  dynamic "ordered_cache_behavior" {
    for_each = var.web_client_s3_endpoint != "" ? [1] : []
    content {
      path_pattern           = "/.well-known/jmap"
      target_origin_id       = "s3-web-client"  # Dummy - function handles response
      viewer_protocol_policy = "redirect-to-https"
      allowed_methods        = ["GET", "HEAD"]
      cached_methods         = ["GET", "HEAD"]

      # Use CloudFront function to redirect to jmap.domain.com
      function_association {
        event_type   = "viewer-request"
        function_arn = aws_cloudfront_function.autodiscovery_redirect.arn
      }

      forwarded_values {
        query_string = false
        cookies {
          forward = "none"
        }
      }

      min_ttl     = 0
      default_ttl = 3600
      max_ttl     = 86400
      compress    = false
    }
  }

  # Default cache behavior
  # Routes to S3 when enabled, otherwise uses CloudFront function
  default_cache_behavior {
    target_origin_id       = var.web_client_s3_endpoint != "" ? "s3-web-client" : "unused"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]

    # CloudFront function only used when S3 is disabled
    dynamic "function_association" {
      for_each = var.web_client_s3_endpoint == "" ? [1] : []
      content {
        event_type   = "viewer-request"
        function_arn = aws_cloudfront_function.autodiscovery_redirect.arn
      }
    }

    # Forwarded values (required for CloudFront cache behaviors)
    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
    compress    = var.web_client_s3_endpoint != "" ? true : false
  }

  # Custom error responses for SPA routing (only when S3 is enabled)
  dynamic "custom_error_response" {
    for_each = var.web_client_s3_endpoint != "" ? [403, 404] : []
    content {
      error_caching_min_ttl = 300
      error_code            = custom_error_response.value
      response_code         = 200
      response_page_path    = "/index.html"
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.root_autodiscovery.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  depends_on = [aws_acm_certificate_validation.root_autodiscovery]
}


