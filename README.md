# JMAP Server

RFC 8620 compliant JMAP server with autodiscovery support.

## Architecture

- **JMAP API**: `jmap.yourdomain.com` (AWS Lambda + API Gateway)
- **Autodiscovery**: `yourdomain.com/.well-known/jmap` → 301 redirect to `subdomain.domain/jmap/session` (CloudFront)
- **Authentication**: AWS Cognito (Basic Auth + Bearer tokens)
- **Protocol**: RFC 8620 JMAP Core
- **Infrastructure**: Serverless (AWS SAM + Terraform)

## Features

- RFC 8620 JMAP Core protocol support
- HTTP-based autodiscovery (`.well-known/jmap` redirects to `/jmap/session`) and SRV records
- Multiple authentication methods (Basic, Bearer tokens, refresh tokens)
- Cookie-based sessions with automatic refresh
- CORS support for multiple web clients
- Fully serverless (Lambda + API Gateway)
- External DNS support (works with any DNS provider)

## Prerequisites

- **AWS SAM CLI** - [Install](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html)
- **Node.js 22+** - [Install](https://nodejs.org/en/)
- **Docker** - [Install](https://hub.docker.com/search/?type=edition&offering=community) (for local testing)
- **Terraform** - [Install](https://developer.hashicorp.com/terraform/downloads)
- **AWS CLI** - [Install](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- **DNS Provider Access** - Ability to create DNS records

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure

```bash
# Deployment config
cp config.mk.example config.mk
# Edit: REGION, ROOT_DOMAIN, ALLOWED_ORIGINS

# Admin credentials
cp .env.example .env
# Edit: ADMIN_USERNAME, ADMIN_PASSWORD
```

### 3. Deploy

```bash
aws configure sso  # Configure AWS credentials
source .env
make deploy       # First run: creates certificates
```

Follow the on-screen instructions to create DNS records, then:

```bash
make validate-dns # Optional: check if certificates are validated
make deploy       # Second run: completes infrastructure
```

See [docs/DEPLOYMENT_FLOW.md](docs/DEPLOYMENT_FLOW.md) for complete instructions.

## DNS Requirements

This server requires 5 DNS records at your DNS provider:

| Record | Purpose | When to Create |
|--------|---------|----------------|
| 2× CNAME | ACM certificate validation | Stage 1 (temporary) |
| 1× CNAME | `jmap.yourdomain.com` → API Gateway | Stage 2 (permanent) |
| 1× A/CNAME | `yourdomain.com` → CloudFront | Stage 2 (permanent) |
| 1× SRV | `_jmap._tcp.yourdomain.com` | Stage 2 (permanent) |

Exact values are provided in the Terraform output after each deployment stage.

See [docs/DEPLOYMENT_FLOW.md](docs/DEPLOYMENT_FLOW.md) for detailed DNS setup instructions.

## Client Configuration

This server supports multiple clients (web, desktop, mobile) simultaneously.

### Web Clients

Add client origins to `ALLOWED_ORIGINS` in `config.mk`:

```makefile
ALLOWED_ORIGINS = https://webclient1.com,https://webclient2.com,http://localhost:5173
```

Then redeploy:

```bash
make deploy
```

### Desktop/Mobile Clients

Configure clients to connect directly to:

```
https://jmap.yourdomain.com
```

Or use autodiscovery:
- Email: `user@yourdomain.com`
- Client will autodiscover via SRV or HTTP redirect

## Autodiscovery (RFC 8620)

This server implements both JMAP autodiscovery methods:

### 1. SRV Record (DNS-based)

```
_jmap._tcp.yourdomain.com → jmap.yourdomain.com:443
```

### 2. HTTP Redirect (Well-known URL)

```
https://yourdomain.com/.well-known/jmap
  → 301 redirect to
https://jmap.yourdomain.com/jmap/session
```

Clients can use either method to discover the JMAP server.

## Authentication

The server uses AWS Cognito with three authentication methods:

1. **Basic Auth** - Username/password (RFC 7617)
2. **Bearer Token** - JWT access tokens (RFC 6750)
3. **Refresh Token** - Long-lived tokens for obtaining new access tokens

Cookie-based sessions with automatic refresh are supported for web clients.

See [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md) for details.

### Admin User

- Created during deployment: `admin@<ROOT_DOMAIN>`
- Password set via `.env` file
- Password requirements:
  - Minimum 8 characters
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number

## Local Development

Run the server locally:

```bash
make local
```

Server runs at: `http://localhost:3001`

Test locally:

```bash
curl http://localhost:3001/jmap/session
```

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
# JMAP session endpoint
sam logs -n jmapSessionFunction --stack-name jmap-server --tail

# JMAP RPC endpoint
sam logs -n jmapFunction --stack-name jmap-server --tail

# Auth endpoints
sam logs -n authTokenFunction --stack-name jmap-server --tail
sam logs -n authLogoutFunction --stack-name jmap-server --tail
```

Or via AWS Console:
- CloudWatch → Log groups → `/aws/lambda/<function-name>`

## Troubleshooting

### Deployment Issues

For deployment-related problems (certificate validation, Terraform errors, DNS setup), see [docs/DEPLOYMENT_FLOW.md](docs/DEPLOYMENT_FLOW.md).

### CORS Errors in Web Client

**Problem:** Browser blocks requests with CORS error.

**Solution:**
1. Add client origin to `ALLOWED_ORIGINS` in `config.mk`
2. Redeploy: `make deploy`
3. Clear browser cache
4. Verify CORS headers:
```bash
curl -I -H "Origin: https://your-client.com" https://jmap.yourdomain.com/jmap/session
```

### API Returns 404

**Problem:** `https://yourdomain.com/.well-known/jmap` returns 404 or doesn't redirect properly.

**Solution:**
1. Verify DNS records are correct (check Terraform output)
2. Wait 10-15 minutes for DNS propagation
3. Test DNS: `dig yourdomain.com` and `dig jmap.yourdomain.com`
4. Check CloudFront distribution status in AWS Console

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

## Architecture Details

### Components

- **Lambda Functions** (Node.js 22, ARM64):
  - `jmapSessionFunction` - JMAP session endpoint
  - `jmapFunction` - JMAP RPC endpoint
  - `authLoginFunction` - Get access token
  - `authLogoutFunction` - Clear session cookie

- **API Gateway HTTP API**:
  - Custom domain: `jmap.yourdomain.com`
  - CORS configured for allowed origins
  - Rate limiting: 20 req/s, burst 100

- **CloudFront Distribution**:
  - Domain: `yourdomain.com`
  - When S3 web client is enabled: Serves web client from S3, redirects `/.well-known/jmap` to `jmap.yourdomain.com/jmap/session`
  - When S3 web client is disabled: Redirects `/.well-known/jmap` to `jmap.yourdomain.com/jmap/session`, returns 404 for all other paths

- **ACM Certificates**:
  - API Gateway (regional, in deployment region)
  - CloudFront (us-east-1, required by CloudFront)

- **Cognito User Pool**:
  - User authentication
  - Password policy enforcement
  - JWT token generation

### Cost Estimate

Free Tier (first 12 months):
- Lambda: 1M requests/month free
- API Gateway: 1M requests/month free
- CloudFront: 1TB transfer/month free
- Cognito: 50,000 MAU free

After Free Tier:
- ~$0.01-0.10/month for light usage
- Scales with request volume

## Compatible Clients

- [jmap-web-client](https://github.com/yourname/jmap-web-client) - React web client
- Any RFC 8620 compliant JMAP client

## Resources

- [Deployment Guide](docs/DEPLOYMENT_FLOW.md) - Complete deployment instructions
- [Authentication Documentation](docs/AUTHENTICATION.md) - Auth flow details
- [JMAP Specification (RFC 8620)](https://jmap.io/) - Protocol reference
- [AWS SAM Developer Guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html)