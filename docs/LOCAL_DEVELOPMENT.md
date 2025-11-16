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

The `env.json` file is automatically generated from `template.yaml` when you run `make local`. It includes all Lambda functions and their required environment variables.

**Note:** You don't need to manually update `env.json` when adding new functions—the script reads from `template.yaml` automatically.

Key variables:

- `USER_POOL_CLIENT_ID` - Cognito User Pool Client ID (fetched from deployed stack)
- `AWS_REGION` - AWS region
- `API_URL` - Base API URL (for session endpoint)
- `IS_LOCAL_DEV` - Automatically set to `"true"` when running `make local` (controls cookie SameSite attribute). Not set in production deployments.

## Troubleshooting

### "ENOENT: no such file or directory, uv_cwd" Error

If you see this error, it's a SAM local runtime issue. Try:

1. **Clean rebuild:**

   ```bash
   rm -rf .aws-sam
   make local
   ```

2. **Ensure you're in the project root:**

   ```bash
   pwd  # Should be in jmap-server directory
   ```

3. **Check Docker is running:**
   ```bash
   docker info
   ```

### Other Issues

- **Build errors:** Run `sam build --use-container` manually
- **Missing env vars:** Check `env.json` exists and has all functions
- **Port already in use:** Stop other services on port 3001

## Limitations

Local development has some limitations:

- Uses SAM local which may behave differently than production
- Cognito integration requires AWS credentials
- Some AWS services may not be available locally
- CORS may behave differently

For production-like testing, deploy to a development AWS environment.
