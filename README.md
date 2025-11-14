# JMAP Server

RFC 8620 compliant JMAP server with autodiscovery support, built on AWS serverless infrastructure.

## Features

- RFC 8620 JMAP Core protocol support
- HTTP-based autodiscovery (`.well-known/jmap` redirects to `/jmap/session`) and SRV records
- Multiple authentication methods (Basic, Bearer tokens, refresh tokens)
- Cookie-based sessions with automatic refresh
- CORS support for multiple web clients
- Fully serverless (Lambda + API Gateway)
- External DNS support (works with any DNS provider)

## Architecture

- **JMAP API**: `jmap.yourdomain.com` (AWS Lambda + API Gateway)
- **Autodiscovery**: `yourdomain.com/.well-known/jmap` → 301 redirect to `jmap.yourdomain.com/jmap/session` (CloudFront)
- **Authentication**: AWS Cognito (Basic Auth + Bearer tokens)
- **Protocol**: RFC 8620 JMAP Core
- **Infrastructure**: Serverless (AWS SAM + Terraform)

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture information.

## Prerequisites

- **AWS SAM CLI** - [Install](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html)
- **Node.js 22+** - [Install](https://nodejs.org/en/)
- **Docker** - [Install](https://hub.docker.com/search/?type=edition&offering=community) (for local testing)
- **Terraform** - [Install](https://developer.hashicorp.com/terraform/downloads)
- **AWS CLI** - [Install](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- **DNS Provider Access** - Ability to create DNS records

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure:**
   ```bash
   cp config.mk.example config.mk
   # Edit: REGION, ROOT_DOMAIN, ALLOWED_ORIGINS
   
   cp .env.example .env
   # Edit: ADMIN_USERNAME, ADMIN_PASSWORD
   ```

3. **Deploy:**
   ```bash
   aws configure sso  # Configure AWS credentials
   source .env
   make deploy
   ```

See [docs/DEPLOYMENT_FLOW.md](docs/DEPLOYMENT_FLOW.md) for complete deployment instructions.

## Documentation

- **[Deployment Guide](docs/DEPLOYMENT_FLOW.md)** - Complete deployment instructions and DNS setup
- **[Authentication](docs/AUTHENTICATION.md)** - Authentication flows and token management
- **[API Examples](docs/API_EXAMPLES.md)** - Example API commands
- **[Client Configuration](docs/CLIENT_CONFIGURATION.md)** - How to configure web, desktop, and mobile clients
- **[Architecture](docs/ARCHITECTURE.md)** - Detailed architecture and components
- **[Local Development](docs/LOCAL_DEVELOPMENT.md)** - Running and testing locally

## Testing

Run unit tests:
```bash
npm test
```

Run specific test:
```bash
npm test -- auth.test.ts
```

## Logs

View Lambda function logs:
```bash
sam logs -n jmapSessionFunction --stack-name jmap-server --tail
sam logs -n jmapFunction --stack-name jmap-server --tail
sam logs -n authLoginFunction --stack-name jmap-server --tail
sam logs -n authTokenFunction --stack-name jmap-server --tail
sam logs -n authLogoutFunction --stack-name jmap-server --tail
```

Or via AWS Console: CloudWatch → Log groups → `/aws/lambda/<function-name>`

## Cleanup

Delete the application:
```bash
# Delete terraform resources
cd infrastructure
terraform destroy -var="region=<region>" -var="root_domain_name=<domain>" -var="sam_http_api_id=dummy"

# Delete SAM stack
sam delete --stack-name jmap-server
```

**Note:** The User Pool has `DeletionPolicy: Retain` and must be deleted manually from AWS Console if needed.

Don't forget to remove DNS records from your DNS provider.

## Resources

- [JMAP Specification (RFC 8620)](https://jmap.io/) - Protocol reference
- [AWS SAM Developer Guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html)
