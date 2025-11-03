output "root_nameservers" {
  description = "Route 53 hosted zone nameservers"
  value       = aws_route53_zone.root.name_servers
}

output "api_domain_name" {
  description = "HTTP API custom domain"
  value       = aws_apigatewayv2_domain_name.jmap.domain_name
}

output "root_distribution_domain" {
  description = "CloudFront distribution domain for root"
  value       = aws_cloudfront_distribution.root.domain_name
}


