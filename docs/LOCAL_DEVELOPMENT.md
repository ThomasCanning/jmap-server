# Local Development

This document describes how to run and test the JMAP server locally.

## Prerequisites

- **Node.js 22+** - [Install](https://nodejs.org/en/)
- **Docker** - [Install](https://hub.docker.com/search/?type=edition&offering=community) (required for SAM local)
- **AWS SAM CLI** - [Install](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment (optional, for testing with real Cognito):
```bash
cp .env.example .env
# Edit .env with your AWS credentials and Cognito details
```

## Running Locally

Start the local server:

```bash
make local
```

Server runs at: `http://localhost:3001`

## Testing Locally

### Test Session Endpoint

```bash
curl http://localhost:3001/jmap/session
```

### Test with Authentication

```bash
# Basic auth
curl -u "user@example.com:password" \
  http://localhost:3001/jmap/session

# Bearer token
curl -H "Authorization: Bearer <token>" \
  http://localhost:3001/jmap/session
```

### Test RPC Endpoint

```bash
curl -X POST http://localhost:3001/jmap \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"methodCalls":[]}'
```

## Running Tests

### All Tests

```bash
npm test
```

### Specific Test File

```bash
npm test -- auth.test.ts
```

### Watch Mode

```bash
npm test -- --watch
```

## Development Workflow

1. Make code changes
2. Run tests: `npm test`
3. Test locally: `make local`
4. Deploy to AWS: `make deploy` (when ready)

## Debugging

### SAM Local Logs

View logs from local server:
```bash
# In another terminal while `make local` is running
# Logs appear in the terminal running `make local`
```

### Debug Tests

Use Node.js debugger:
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

Then attach debugger in VS Code or Chrome DevTools.

## Environment Variables

Local development uses environment variables from:
- `.env` file (if exists)
- SAM local environment configuration
- Default values in code

Key variables:
- `USER_POOL_CLIENT_ID` - Cognito User Pool Client ID
- `AWS_REGION` - AWS region
- `LOG_LEVEL` - Logging level (optional)

## Limitations

Local development has some limitations:
- Uses SAM local which may behave differently than production
- Cognito integration requires AWS credentials
- Some AWS services may not be available locally
- CORS may behave differently

For production-like testing, deploy to a development AWS environment.

