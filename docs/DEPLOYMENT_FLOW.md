# Deployment guide

1. Configure deployment settings:
```bash
cp config.mk.example config.mk
# Edit config.mk: set REGION, ROOT_DOMAIN, ALLOWED_ORIGINS

cp .env.example .env
# Edit .env: set ADMIN_USERNAME, ADMIN_PASSWORD
```

2. Configure AWS credentials (see https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html):
```bash
aws configure sso
aws sso login
```

3. Run initial deployment:
```bash
source .env
make deploy
```

   During deployment, you'll be prompted:
   - "Do you want to serve the web client from this CloudFront? (y/n)"
   - If yes: Enter the S3 website endpoint (or press Enter to skip for now)
   
   **Note:** If you plan to integrate a web client, answer "y" but you can skip the S3 endpoint initially. You'll add it after deploying the web client.

4. Create the 2 validation DNS records at your DNS provider. Records are in `infrastructure/dns-records.txt`.
   Note: Record names are shown without the zone suffix (most providers add it automatically).

5. Wait until DNS records propagate, you can verify with:
```bash
make validate-dns
```

6. Once both certificates show `ISSUED`, complete deployment:
```bash
make deploy
```

7. Create the 3 permanent DNS records at your DNS provider. Records are in `infrastructure/dns-records.txt`:
   - `jmap` CNAME
   - `@` CNAME (root domain)
   - `_jmap._tcp` SRV
   Note: Record names are shown without the zone suffix (most providers add it automatically).

8. Wait for DNS propagation, you can verify with:
```bash
make validate-dns
```

## Web Client Integration (Optional)

If you want to serve a web client from the same CloudFront distribution:

### Step 1: Get CloudFront Distribution ID

After the server is deployed, get the CloudFront Distribution ID:

```bash
cd infrastructure && terraform output cloudfront_distribution_id
```

Or check `infrastructure/variableoutputs.txt` for all outputs including the CloudFront Distribution ID.

### Step 2: Deploy Web Client

If using jmapbox web client, deploy in shared mode:

```bash
make deploy
```

When prompted:
- Choose option `2` (shared mode)
- Enter the CloudFront Distribution ID from Step 1
- After deployment, note the S3 website endpoint from the output

Otherwise manually have your web clients s3 link to the server cloudfront

### Step 3: Update Server Configuration

Update the server's `config.mk` with the S3 endpoint:

**Option A: Interactive**
```bash
make update-s3-endpoint
```
Then enter the S3 website endpoint when prompted.

**Option B: Non-interactive**
```bash
make update-s3-endpoint ENDPOINT=jmap-web-example-com.s3-website.eu-west-2.amazonaws.com
```

Replace `jmap-web-example-com.s3-website.eu-west-2.amazonaws.com` with your actual S3 website endpoint from the web client deployment.

### Step 4: Redeploy Server

Redeploy the server to integrate the S3 origin:

```bash
make deploy
```

The server will now serve the web client from CloudFront at your root domain, while `/.well-known/jmap` redirects to `jmap.yourdomain.com/.well-known/jmap`.

## Output Files

After deployment, check these files in the `infrastructure/` directory:

- `dns-records.txt` - DNS records to configure at your DNS provider
- `variableoutputs.txt` - Important outputs including CloudFront Distribution ID, API URLs, etc.

## Troubleshooting

- **CloudFront Distribution ID not found**: Run `cd infrastructure && terraform refresh` or `make deploy` to update outputs
- **S3 endpoint not working**: Ensure `SERVE_WEB_CLIENT = yes` and `WEB_CLIENT_S3_ENDPOINT` are set in `config.mk`, then redeploy
- **DNS not propagating**: Use `make validate-dns` to check status. DNS propagation can take 5-15 minutes


