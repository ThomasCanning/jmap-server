# Architecture

This document describes the architecture and components of the JMAP server.

## Overview

The server is a fully serverless JMAP implementation built on AWS, compliant with RFC 8620.

## Components

### Lambda Functions (Node.js 22, ARM64)

- **`jmapSessionFunction`** - JMAP session discovery endpoint (`GET /jmap/session`)
- **`jmapFunction`** - JMAP RPC endpoint (`POST /jmap`)
- **`authLoginFunction`** - Authentication token endpoint (`GET /auth/token`)
- **`authLogoutFunction`** - Session logout endpoint (`POST /auth/logout`)

### API Gateway HTTP API

- **Custom Domain**: `jmap.yourdomain.com`
- **CORS**: Configured for allowed origins
- **Rate Limiting**: 20 requests/second, burst 100
- **Methods**: Enforced at API Gateway level
  - `GET /jmap/session`
  - `POST /jmap`
  - `POST /auth/logout`
  - `GET /auth/token`

### CloudFront Distribution

- **Domain**: `yourdomain.com`
- **S3 Web Client Enabled**: Serves web client from S3, redirects `/.well-known/jmap` to `jmap.yourdomain.com/jmap/session`
- **S3 Web Client Disabled**: Redirects `/.well-known/jmap` to `jmap.yourdomain.com/jmap/session`, returns 404 for all other paths

### ACM Certificates

- **API Gateway Certificate**: Regional certificate (in deployment region)
- **CloudFront Certificate**: Global certificate (us-east-1, required by CloudFront)

### Cognito User Pool

- User authentication and management
- Password policy enforcement
- JWT token generation (access and refresh tokens)
- **Deletion Policy**: Retain (must be manually deleted from AWS Console)

## Architecture Diagram

```
┌─────────────────┐
│   DNS Provider  │
│  (External)     │
└────────┬────────┘
         │
         ├─── jmap.yourdomain.com ───┐
         │                           │
         └─── yourdomain.com ────────┼───┐
                                     │   │
                                     ▼   ▼
                          ┌──────────────────────┐
                          │   CloudFront (CF)     │
                          │  yourdomain.com       │
                          └──────────┬───────────┘
                                     │
                                     ├─── /.well-known/jmap → 301 redirect
                                     │
                          ┌──────────▼───────────┐
                          │  API Gateway (HTTP)  │
                          │ jmap.yourdomain.com  │
                          └──────────┬───────────┘
                                     │
                ┌───────────────────┼───────────────────┐
                │                   │                   │
                ▼                   ▼                   ▼
        ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
        │   Lambda     │  │   Lambda     │  │   Lambda     │
        │   Session    │  │     RPC      │  │    Auth      │
        └──────────────┘  └──────────────┘  └──────┬───────┘
                                                     │
                                          ┌──────────▼──────────┐
                                          │  Cognito User Pool  │
                                          └─────────────────────┘
```

## Autodiscovery

The server implements both RFC 8620 autodiscovery methods:

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

## Cost Estimate

### Free Tier (First 12 Months)
- **Lambda**: 1M requests/month free
- **API Gateway**: 1M requests/month free
- **CloudFront**: 1TB transfer/month free
- **Cognito**: 50,000 MAU (Monthly Active Users) free

### After Free Tier
- **Light Usage**: ~$0.01-0.10/month
- **Scales**: With request volume

## Infrastructure as Code

- **AWS SAM**: Serverless application definition (Lambda, API Gateway)
- **Terraform**: Infrastructure resources (CloudFront, ACM, DNS configuration)

## Security

- All cookies use `HttpOnly`, `Secure`, and `SameSite=Lax` attributes
- JWT tokens verified against Cognito JWKS
- CORS restricted to configured origins
- Rate limiting at API Gateway level

