output "api_subdomain" {
  description = "API subdomain name"
  value       = local.api_subdomain
}

output "dns_setup_instructions" {
  value = join("\n", concat(
    length(aws_apigatewayv2_domain_name.jmap) > 0 ? [
      "",
      "DNS Records (Permanent):",
      "",
      "Name:  ${local.api_subdomain}.${var.root_domain_name}",
      "Type:  CNAME",
      "Value: ${aws_apigatewayv2_domain_name.jmap[0].domain_name_configuration[0].target_domain_name}",
      "TTL:   300",
      "",
      "Name:  ${var.root_domain_name}",
      "Type:  ALIAS (or ANAME/CNAME with flattening)",
      "Value: ${aws_cloudfront_distribution.autodiscovery[0].domain_name}",
      "TTL:   300",
      "",
      "Name:  _jmap._tcp.${var.root_domain_name}",
      "Type:  SRV",
      "Value: 0 1 443 ${local.api_subdomain}.${var.root_domain_name}",
      "TTL:   3600",
      ""
    ] : [
      "",
      "DNS Records (Certificate Validation):",
      "",
      "Name:  ${try(tolist(aws_acm_certificate.api.domain_validation_options)[0].resource_record_name, "Loading...")}",
      "Type:  CNAME",
      "Value: ${try(tolist(aws_acm_certificate.api.domain_validation_options)[0].resource_record_value, "Loading...")}",
      "TTL:   300",
      "",
      "Name:  ${try(tolist(aws_acm_certificate.root_autodiscovery.domain_validation_options)[0].resource_record_name, "Loading...")}",
      "Type:  CNAME",
      "Value: ${try(tolist(aws_acm_certificate.root_autodiscovery.domain_validation_options)[0].resource_record_value, "Loading...")}",
      "TTL:   300",
      ""
    ]
  ))
}

output "jmap_api_url" {
  description = "JMAP API base URL"
  value       = "https://${local.api_subdomain}.${var.root_domain_name}"
}

output "jmap_session_endpoint" {
  description = "JMAP session endpoint"
  value       = "https://${local.api_subdomain}.${var.root_domain_name}/jmap/session"
}

output "autodiscovery_test" {
  description = "Test autodiscovery redirect"
  value       = "curl -I https://${var.root_domain_name}/.well-known/jmap"
}

output "api_gateway_target" {
  description = "Target domain for API subdomain CNAME"
  value       = try(aws_apigatewayv2_domain_name.jmap[0].domain_name_configuration[0].target_domain_name, "Pending - complete certificate validation first")
}

output "cloudfront_autodiscovery_target" {
  description = "Target domain for root domain ALIAS/ANAME record"
  value       = try(aws_cloudfront_distribution.autodiscovery[0].domain_name, "Pending - complete certificate validation first")
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (needed for web client integration)"
  value       = try(aws_cloudfront_distribution.autodiscovery[0].id, "Pending - complete certificate validation first")
}

output "cert_validation_records" {
  description = "Certificate validation CNAME records"
  value = {
    api_cert = try({
      name  = tolist(aws_acm_certificate.api.domain_validation_options)[0].resource_record_name
      value = tolist(aws_acm_certificate.api.domain_validation_options)[0].resource_record_value
    }, {})
    root_cert = try({
      name  = tolist(aws_acm_certificate.root_autodiscovery.domain_validation_options)[0].resource_record_name
      value = tolist(aws_acm_certificate.root_autodiscovery.domain_validation_options)[0].resource_record_value
    }, {})
  }
}
