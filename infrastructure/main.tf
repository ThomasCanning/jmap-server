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
  api_subdomain = "api"
  fqdn      = "${local.api_subdomain}.${var.root_domain_name}"
  # Parse allowed origins into a list for the CloudFront function
  allowed_origins_list = var.allowed_origins != "" ? split(",", var.allowed_origins) : []
  # Create JavaScript array string for CloudFront function
  allowed_origins_js = var.allowed_origins != "" ? join(",", [for origin in local.allowed_origins_list : "'${trimspace(origin)}'"]) : ""
}

########################
# ACM Certificates
########################

# Certificate for jmap.domain.com (API Gateway)
resource "aws_acm_certificate" "api" {
  domain_name       = local.fqdn
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
  domain_name = local.fqdn
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

# CloudFront function for JMAP autodiscovery redirect with CORS support
resource "aws_cloudfront_function" "autodiscovery_redirect" {
  name    = "jmap-autodiscovery-redirect"
  runtime = "cloudfront-js-1.0"
  publish = true
  comment = "RFC 8620 JMAP autodiscovery redirect with CORS - redirects /.well-known/jmap to /jmap/session, returns 404 for other paths when S3 disabled"
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      var origin = request.headers.origin ? request.headers.origin.value : '';
      
      // Parse allowed origins from the function configuration
      var allowedOrigins = ${local.allowed_origins_js != "" ? "[${local.allowed_origins_js}]" : "[]"};
      
      // Helper function to check if origin is allowed
      function isOriginAllowed(origin) {
        if (!origin || allowedOrigins.length === 0) return false;
        for (var i = 0; i < allowedOrigins.length; i++) {
          if (allowedOrigins[i] === origin) return true;
        }
        return false;
      }
      
      // Helper function to get CORS headers
      function getCorsHeaders(origin) {
        var headers = {};
        if (isOriginAllowed(origin)) {
          headers['access-control-allow-origin'] = { value: origin };
          headers['access-control-allow-methods'] = { value: 'GET, OPTIONS' };
          headers['access-control-allow-headers'] = { value: 'Content-Type, Authorization' };
          headers['access-control-max-age'] = { value: '3600' };
        }
        return headers;
      }
      
      // Handle OPTIONS preflight request
      if (request.method === 'OPTIONS' && request.uri === '/.well-known/jmap') {
        var corsHeaders = getCorsHeaders(origin);
        corsHeaders['cache-control'] = { value: 'public, max-age=3600' };
        return {
          statusCode: 204,
          statusDescription: 'No Content',
          headers: corsHeaders
        };
      }
      
      // Handle GET request to /.well-known/jmap
      if (request.uri === '/.well-known/jmap') {
        var corsHeaders = getCorsHeaders(origin);
        corsHeaders['location'] = { value: 'https://${local.fqdn}/jmap/session' };
        corsHeaders['cache-control'] = { value: 'public, max-age=3600' };
        return {
          statusCode: 301,
          statusDescription: 'Moved Permanently',
          headers: corsHeaders
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
      allowed_methods        = ["GET", "HEAD", "OPTIONS"]
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


