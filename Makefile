# JMAP Server Makefile
#
# User-facing targets:
#   - deploy           : Deploy to AWS (run twice: once to create certs, once to complete)
#   - validate-dns     : Check DNS propagation and certificate validation status
#   - local            : Run backend locally on http://localhost:3001
#
# Internal helper targets (used by deploy; you generally do not run directly):
#   - tf-apply, sam-deploy, set-admin-password, ensure-config

-include config.mk
-include .env
export ADMIN_USERNAME
export ADMIN_PASSWORD

TF_DIR      ?= infrastructure
# Derive SAM stack name from samconfig.toml if not provided via env
STACK_NAME  ?= $(shell awk -F'=' '/^stack_name/ {gsub(/[ "\r\t]/, "", $$2); print $$2}' samconfig.toml)

.PHONY: deploy tf-apply sam-deploy set-admin-password validate-password validate-dns
.PHONY: deployment-stage1-complete deployment-complete generate-outputs
.PHONY: local gen-env-local ensure-config update-s3-endpoint

gen-env-local:
	@STACK_ID=$$(AWS_REGION=$(REGION) aws cloudformation describe-stacks --stack-name $(STACK_NAME) --query 'Stacks[0].StackId' --output text 2>/dev/null || true); \
	USER_POOL_CLIENT_ID=$$(AWS_REGION=$(REGION) aws cloudformation describe-stacks --stack-name $(STACK_NAME) --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' --output text 2>/dev/null || true); \
	REG=$(REGION); API_BASE="http://localhost:3001"; \
	printf '{\n  "jmapSessionFunction": {\n    "API_URL": "%s/jmap",\n    "USER_POOL_CLIENT_ID": "%s",\n    "AWS_REGION": "%s"\n  },\n  "jmapFunction": {\n    "USER_POOL_CLIENT_ID": "%s",\n    "AWS_REGION": "%s"\n  },\n  "authLoginFunction": {\n    "USER_POOL_CLIENT_ID": "%s",\n    "AWS_REGION": "%s"\n  },\n  "authLogoutFunction": {}\n}\n' "$$API_BASE" "$$USER_POOL_CLIENT_ID" "$$REG" "$$USER_POOL_CLIENT_ID" "$$REG" "$$USER_POOL_CLIENT_ID" "$$REG" > env.json; \
	echo "Wrote env.json (region=$(REGION), client_id=$${USER_POOL_CLIENT_ID:-<unset>})"

deploy: ensure-config sam-deploy set-admin-password tf-apply

tf-apply:
	@# Read SAM outputs to feed Terraform variables
	@HTTP_API_ID=$$(AWS_REGION=$(REGION) aws cloudformation describe-stacks \
		--stack-name $(STACK_NAME) --query 'Stacks[0].Outputs[?OutputKey==`HttpApiId`].OutputValue' --output text); \
	AWS_REGION=$(REGION) terraform -chdir=$(TF_DIR) init -upgrade >/dev/null; \
	CERTS_VALIDATED=false; \
	if terraform -chdir=$(TF_DIR) state list 2>/dev/null | grep -q 'aws_acm_certificate.api'; then \
		API_CERT_ARN=$$(cd $(TF_DIR) && terraform state show aws_acm_certificate.api 2>/dev/null | grep '^[[:space:]]*arn[[:space:]]*=' | head -1 | sed 's/.*= "\(.*\)"/\1/' || true); \
		ROOT_CERT_ARN=$$(cd $(TF_DIR) && terraform state show aws_acm_certificate.root_autodiscovery 2>/dev/null | grep '^[[:space:]]*arn[[:space:]]*=' | head -1 | sed 's/.*= "\(.*\)"/\1/' || true); \
		if [ -n "$$API_CERT_ARN" ]; then \
			API_STATUS=$$(AWS_REGION=$(REGION) aws acm describe-certificate --certificate-arn "$$API_CERT_ARN" --query 'Certificate.Status' --output text 2>/dev/null || echo "PENDING"); \
		else \
			API_STATUS="NOT_FOUND"; \
		fi; \
		if [ -n "$$ROOT_CERT_ARN" ]; then \
			ROOT_STATUS=$$(AWS_REGION=us-east-1 aws acm describe-certificate --certificate-arn "$$ROOT_CERT_ARN" --query 'Certificate.Status' --output text 2>/dev/null || echo "PENDING"); \
		else \
			ROOT_STATUS="NOT_FOUND"; \
		fi; \
		if [ "$$API_STATUS" = "ISSUED" ] && [ "$$ROOT_STATUS" = "ISSUED" ]; then \
			CERTS_VALIDATED=true; \
			echo "Certificates validated. Completing infrastructure..."; \
		else \
			echo "Certificate status: API=$$API_STATUS Root=$$ROOT_STATUS"; \
		fi; \
	fi; \
	if [ "$$CERTS_VALIDATED" = "true" ]; then \
		if [ "$(SERVE_WEB_CLIENT)" = "yes" ] && [ -n "$(WEB_CLIENT_S3_ENDPOINT)" ]; then \
			AWS_REGION=$(REGION) terraform -chdir=$(TF_DIR) apply \
				-var="region=$(REGION)" \
				-var="root_domain_name=$(ROOT_DOMAIN)" \
				-var="sam_http_api_id=$$HTTP_API_ID" \
				-var="web_client_s3_endpoint=$(WEB_CLIENT_S3_ENDPOINT)" \
				-var="wait_for_certificate_validation=true" \
				-auto-approve; \
		else \
			AWS_REGION=$(REGION) terraform -chdir=$(TF_DIR) apply \
				-var="region=$(REGION)" \
				-var="root_domain_name=$(ROOT_DOMAIN)" \
				-var="sam_http_api_id=$$HTTP_API_ID" \
				-var="wait_for_certificate_validation=true" \
				-auto-approve; \
		fi; \
		$(MAKE) deployment-complete; \
	else \
		if [ "$(SERVE_WEB_CLIENT)" = "yes" ] && [ -n "$(WEB_CLIENT_S3_ENDPOINT)" ]; then \
			AWS_REGION=$(REGION) terraform -chdir=$(TF_DIR) apply \
				-var="region=$(REGION)" \
				-var="root_domain_name=$(ROOT_DOMAIN)" \
				-var="sam_http_api_id=$$HTTP_API_ID" \
				-var="web_client_s3_endpoint=$(WEB_CLIENT_S3_ENDPOINT)" \
				-auto-approve; \
		else \
			AWS_REGION=$(REGION) terraform -chdir=$(TF_DIR) apply \
				-var="region=$(REGION)" \
				-var="root_domain_name=$(ROOT_DOMAIN)" \
				-var="sam_http_api_id=$$HTTP_API_ID" \
				-auto-approve; \
		fi; \
		$(MAKE) deployment-stage1-complete; \
	fi

.PHONY: deployment-stage1-complete
deployment-stage1-complete:
	@# Generate DNS records file
	@echo "Type	Name	Value	TTL" > $(TF_DIR)/dns-records.txt; \
	API_VALIDATION=$$(cd $(TF_DIR) && terraform output -json cert_validation_records 2>/dev/null | grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4 | sed 's/\.$$//'); \
	API_VALUE=$$(cd $(TF_DIR) && terraform output -json cert_validation_records 2>/dev/null | grep -o '"value"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4 | sed 's/\.$$//'); \
	ROOT_VALIDATION=$$(cd $(TF_DIR) && terraform output -json cert_validation_records 2>/dev/null | grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' | tail -1 | cut -d'"' -f4 | sed 's/\.$$//'); \
	ROOT_VALUE=$$(cd $(TF_DIR) && terraform output -json cert_validation_records 2>/dev/null | grep -o '"value"[[:space:]]*:[[:space:]]*"[^"]*"' | tail -1 | cut -d'"' -f4 | sed 's/\.$$//'); \
	echo "CNAME	$$API_VALIDATION	$$API_VALUE	300" >> $(TF_DIR)/dns-records.txt; \
	if [ "$$ROOT_VALIDATION" != "$$API_VALIDATION" ]; then \
		echo "CNAME	$$ROOT_VALIDATION	$$ROOT_VALUE	300" >> $(TF_DIR)/dns-records.txt; \
	fi
	@# Note: The validation record name already includes the subdomain (e.g., _hash.api.jmapbox.com)
	@# so it will be correctly written to dns-records.txt
	@$(MAKE) generate-outputs
	@echo ""
	@echo "DNS setup required. Set the values in $(TF_DIR)/dns-records.txt at your DNS provider."
	@echo "Wait for propagation (or check with: make validate-dns), then run: make deploy"
	@echo ""

.PHONY: deployment-complete
deployment-complete:
	@# Generate DNS records file
	@API_TARGET=$$(cd $(TF_DIR) && terraform output -raw api_gateway_target 2>/dev/null); \
	CF_TARGET=$$(cd $(TF_DIR) && terraform output -raw cloudfront_autodiscovery_target 2>/dev/null); \
	API_SUBDOMAIN=$$(cd $(TF_DIR) && terraform output -raw api_subdomain 2>/dev/null || echo "jmap"); \
	echo "Type	Name	Value	TTL" > $(TF_DIR)/dns-records.txt; \
	echo "CNAME	$$API_SUBDOMAIN	$$API_TARGET	300" >> $(TF_DIR)/dns-records.txt; \
	echo "ALIAS	@	$$CF_TARGET	300" >> $(TF_DIR)/dns-records.txt; \
	echo "SRV	_jmap._tcp	0 1 443 $$API_SUBDOMAIN.$(ROOT_DOMAIN)	3600" >> $(TF_DIR)/dns-records.txt
	@$(MAKE) generate-outputs
	@echo ""
	@echo "Deployment complete. Set the values in $(TF_DIR)/dns-records.txt at your DNS provider."
	@echo "Wait for propagation (or check with: make validate-dns)"
	@echo ""

.PHONY: validate-dns
validate-dns:
	@if ! terraform -chdir=$(TF_DIR) state list 2>/dev/null | grep -q 'aws_acm_certificate.api'; then \
		echo "Error: No certificates found. Run 'make deploy' first."; \
		exit 1; \
	fi
	@echo "Checking DNS and certificate status..."; \
	echo ""; \
	API_DNS_OK=false; ROOT_DNS_OK=false; \
	API_VALIDATION=$$(cd $(TF_DIR) && terraform output -json cert_validation_records 2>/dev/null | grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4); \
	ROOT_VALIDATION=$$(cd $(TF_DIR) && terraform output -json cert_validation_records 2>/dev/null | grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' | tail -1 | cut -d'"' -f4); \
	if [ -n "$$API_VALIDATION" ]; then \
		if dig +short "$$API_VALIDATION" | grep -q .; then \
			echo "[OK] API validation DNS: $$API_VALIDATION"; \
			API_DNS_OK=true; \
		else \
			echo "[MISSING] API validation DNS: $$API_VALIDATION"; \
		fi; \
	fi; \
	if [ -n "$$ROOT_VALIDATION" ] && [ "$$ROOT_VALIDATION" != "$$API_VALIDATION" ]; then \
		if dig +short "$$ROOT_VALIDATION" | grep -q .; then \
			echo "[OK] Root validation DNS: $$ROOT_VALIDATION"; \
			ROOT_DNS_OK=true; \
		else \
			echo "[MISSING] Root validation DNS: $$ROOT_VALIDATION"; \
		fi; \
	fi; \
	echo ""; \
	API_CERT_ARN=$$(cd $(TF_DIR) && terraform state show aws_acm_certificate.api 2>/dev/null | grep '^[[:space:]]*arn[[:space:]]*=' | head -1 | sed 's/.*= "\(.*\)"/\1/' || true); \
	ROOT_CERT_ARN=$$(cd $(TF_DIR) && terraform state show aws_acm_certificate.root_autodiscovery 2>/dev/null | grep '^[[:space:]]*arn[[:space:]]*=' | head -1 | sed 's/.*= "\(.*\)"/\1/' || true); \
	API_CERT_OK=false; ROOT_CERT_OK=false; \
	if [ -n "$$API_CERT_ARN" ]; then \
		API_STATUS=$$(AWS_REGION=$(REGION) aws acm describe-certificate --certificate-arn "$$API_CERT_ARN" --query 'Certificate.Status' --output text 2>/dev/null || echo "UNKNOWN"); \
		echo "API certificate ($(REGION)): $$API_STATUS"; \
		if [ "$$API_STATUS" = "ISSUED" ]; then API_CERT_OK=true; fi; \
	fi; \
	if [ -n "$$ROOT_CERT_ARN" ]; then \
		ROOT_STATUS=$$(AWS_REGION=us-east-1 aws acm describe-certificate --certificate-arn "$$ROOT_CERT_ARN" --query 'Certificate.Status' --output text 2>/dev/null || echo "UNKNOWN"); \
		echo "Root certificate (us-east-1): $$ROOT_STATUS"; \
		if [ "$$ROOT_STATUS" = "ISSUED" ]; then ROOT_CERT_OK=true; fi; \
	fi; \
	echo ""; \
	if terraform -chdir=$(TF_DIR) state list 2>/dev/null | grep -q 'aws_apigatewayv2_domain_name.jmap'; then \
		PERM_DNS_OK=true; \
		API_SUBDOMAIN=$$(cd $(TF_DIR) && terraform output -raw api_subdomain 2>/dev/null || echo "jmap"); \
		if dig +short $$API_SUBDOMAIN.$(ROOT_DOMAIN) | grep -q .; then \
			echo "[OK] $$API_SUBDOMAIN.$(ROOT_DOMAIN)"; \
		else \
			echo "[MISSING] $$API_SUBDOMAIN.$(ROOT_DOMAIN)"; \
			PERM_DNS_OK=false; \
		fi; \
		if dig +short $(ROOT_DOMAIN) | grep -q .; then \
			echo "[OK] $(ROOT_DOMAIN)"; \
		else \
			echo "[MISSING] $(ROOT_DOMAIN)"; \
			PERM_DNS_OK=false; \
		fi; \
		if dig +short SRV _jmap._tcp.$(ROOT_DOMAIN) | grep -q .; then \
			echo "[OK] _jmap._tcp.$(ROOT_DOMAIN)"; \
		else \
			echo "[MISSING] _jmap._tcp.$(ROOT_DOMAIN)"; \
			PERM_DNS_OK=false; \
		fi; \
		echo ""; \
		if [ "$$PERM_DNS_OK" = "true" ]; then \
			echo "STATUS: All DNS records configured correctly"; \
		else \
			echo "STATUS: FAILED - Some permanent DNS records are missing"; \
			echo "Action: Create missing DNS records from $(TF_DIR)/dns-records.txt"; \
		fi; \
	else \
		if [ "$$API_CERT_OK" = "true" ] && [ "$$ROOT_CERT_OK" = "true" ]; then \
			echo "STATUS: READY - Certificates validated"; \
			echo "Action: Run 'make deploy' to complete infrastructure"; \
		elif [ "$$API_DNS_OK" = "true" ] && [ "$$ROOT_DNS_OK" = "true" ]; then \
			echo "STATUS: WAITING - DNS records found, waiting for certificate validation (5-15 minutes)"; \
			echo "Action: Wait for AWS to validate certificates"; \
		else \
			echo "STATUS: WAITING - Certificate validation in progress"; \
			if [ "$$API_DNS_OK" = "false" ] || [ "$$ROOT_DNS_OK" = "false" ]; then \
				echo "Action: Create missing DNS records from $(TF_DIR)/dns-records.txt"; \
			else \
				echo "Action: Wait for DNS propagation and certificate validation (5-15 minutes)"; \
			fi; \
		fi; \
	fi; \
	echo ""

validate-password:
	@if [ -z "$$ADMIN_PASSWORD" ]; then \
	  echo "ERROR: ADMIN_PASSWORD environment variable is required"; \
	  echo "Set it via: export ADMIN_PASSWORD=yourpass"; \
	  echo "Or create a .env file (already gitignored) containing ADMIN_PASSWORD=..."; \
	  exit 1; \
	fi
	@# Check length (minimum 8 characters)
	@if [ $$(printf '%s' "$$ADMIN_PASSWORD" | wc -c | tr -d ' ') -lt 8 ]; then \
	  echo "ERROR: Password must be at least 8 characters"; \
	  exit 1; \
	fi
	@# Check for uppercase letter
	@if ! printf '%s' "$$ADMIN_PASSWORD" | grep -q '[A-Z]'; then \
	  echo "ERROR: Password must contain at least one uppercase letter"; \
	  exit 1; \
	fi
	@# Check for lowercase letter
	@if ! printf '%s' "$$ADMIN_PASSWORD" | grep -q '[a-z]'; then \
	  echo "ERROR: Password must contain at least one lowercase letter"; \
	  exit 1; \
	fi
	@# Check for number
	@if ! printf '%s' "$$ADMIN_PASSWORD" | grep -q '[0-9]'; then \
	  echo "ERROR: Password must contain at least one number"; \
	  exit 1; \
	fi

sam-deploy: validate-password
	AWS_REGION=$(REGION) sam build
	AWS_REGION=$(REGION) sam deploy --no-confirm-changeset --region $(REGION) \
		--parameter-overrides \
			RootDomainName=$(ROOT_DOMAIN) \
			AdminUsername=$(or $(ADMIN_USERNAME),admin) \
			AllowedClientOrigins="$(ALLOWED_ORIGINS)"

set-admin-password: validate-password
	@echo "Setting admin user password..."
	@USER_POOL_ID=$$(AWS_REGION=$(REGION) aws cloudformation describe-stacks \
		--stack-name $(STACK_NAME) --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' --output text 2>/dev/null); \
	if [ -z "$$USER_POOL_ID" ]; then \
	  echo "Warning: User Pool not found. Stack may not be deployed yet."; \
	  exit 0; \
	fi; \
	ADMIN_USER=$${ADMIN_USERNAME:-admin}; \
	echo "Waiting for admin user to be created (max 30 seconds)..."; \
	MAX_RETRIES=6; RETRY=0; \
	while [ $$RETRY -lt $$MAX_RETRIES ]; do \
	  if AWS_REGION=$(REGION) aws cognito-idp admin-get-user \
		--user-pool-id $$USER_POOL_ID \
		--username $${ADMIN_USER}@$(ROOT_DOMAIN) \
		--region $(REGION) >/dev/null 2>&1; then \
	    break; \
	  fi; \
	  RETRY=$$((RETRY + 1)); \
	  echo "  User not found yet, waiting (attempt $$RETRY/$$MAX_RETRIES)..."; \
	  sleep 5; \
	done; \
	USER_STATUS=$$(AWS_REGION=$(REGION) aws cognito-idp admin-get-user \
		--user-pool-id $$USER_POOL_ID \
		--username $${ADMIN_USER}@$(ROOT_DOMAIN) \
		--region $(REGION) --query 'UserStatus' --output text 2>/dev/null); \
	if [ "$$USER_STATUS" = "CONFIRMED" ]; then \
	  echo "Admin user already has permanent password. Skipping."; \
	else \
	  if AWS_REGION=$(REGION) aws cognito-idp admin-set-user-password \
		--user-pool-id $$USER_POOL_ID \
		--username $${ADMIN_USER}@$(ROOT_DOMAIN) \
		--password "$$ADMIN_PASSWORD" \
		--region $(REGION) \
		--permanent \
		--no-cli-pager 2>/dev/null; then \
	    echo "Admin password set"; \
	  else \
	    echo "ERROR: Failed to set admin password"; \
	    echo "User status: $$USER_STATUS"; \
	    echo "Try setting password manually:"; \
	    echo "  AWS_REGION=$(REGION) aws cognito-idp admin-set-user-password \\"; \
	    echo "    --user-pool-id $$USER_POOL_ID \\"; \
	    echo "    --username $${ADMIN_USER}@$(ROOT_DOMAIN) \\"; \
	    echo "    --password \"$$ADMIN_PASSWORD\" \\"; \
	    echo "    --permanent"; \
	    exit 1; \
	  fi; \
	fi

.PHONY: generate-outputs
generate-outputs:
	@# Generate infrastructure/variableoutputs.txt with all important outputs
	@echo "Generating infrastructure/variableoutputs.txt..."
	@echo "# Infrastructure Outputs" > $(TF_DIR)/variableoutputs.txt; \
	echo "# Generated: $$(date)" >> $(TF_DIR)/variableoutputs.txt; \
	echo "" >> $(TF_DIR)/variableoutputs.txt; \
	if terraform -chdir=$(TF_DIR) state list 2>/dev/null | grep -q 'aws_cloudfront_distribution.autodiscovery'; then \
	  CF_ID=$$(cd $(TF_DIR) && terraform output -raw cloudfront_distribution_id 2>/dev/null); \
	  CF_DOMAIN=$$(cd $(TF_DIR) && terraform output -raw cloudfront_autodiscovery_target 2>/dev/null); \
	  API_TARGET=$$(cd $(TF_DIR) && terraform output -raw api_gateway_target 2>/dev/null); \
	  API_URL=$$(cd $(TF_DIR) && terraform output -raw jmap_api_url 2>/dev/null); \
	  SESSION_ENDPOINT=$$(cd $(TF_DIR) && terraform output -raw jmap_session_endpoint 2>/dev/null); \
	  echo "CloudFront Distribution ID: $$CF_ID" >> $(TF_DIR)/variableoutputs.txt; \
	  echo "CloudFront Domain: $$CF_DOMAIN" >> $(TF_DIR)/variableoutputs.txt; \
	  echo "API Gateway Target: $$API_TARGET" >> $(TF_DIR)/variableoutputs.txt; \
	  echo "JMAP API URL: $$API_URL" >> $(TF_DIR)/variableoutputs.txt; \
	  echo "JMAP Session Endpoint: $$SESSION_ENDPOINT" >> $(TF_DIR)/variableoutputs.txt; \
	  echo "" >> $(TF_DIR)/variableoutputs.txt; \
	  echo "# For web client integration:" >> $(TF_DIR)/variableoutputs.txt; \
	  echo "# Use CloudFront Distribution ID: $$CF_ID" >> $(TF_DIR)/variableoutputs.txt; \
	  echo "# This is needed when deploying the web client in shared mode" >> $(TF_DIR)/variableoutputs.txt; \
	else \
	  echo "CloudFront Distribution ID: Not yet deployed" >> $(TF_DIR)/variableoutputs.txt; \
	  echo "# Run 'make deploy' to create the CloudFront distribution" >> $(TF_DIR)/variableoutputs.txt; \
	fi; \
	echo "" >> $(TF_DIR)/variableoutputs.txt; \
	echo "# To check outputs manually:" >> $(TF_DIR)/variableoutputs.txt; \
	echo "#   cd infrastructure && terraform output" >> $(TF_DIR)/variableoutputs.txt; \
	echo "#   cd infrastructure && terraform output cloudfront_distribution_id" >> $(TF_DIR)/variableoutputs.txt
	@echo "Outputs written to $(TF_DIR)/variableoutputs.txt"

.PHONY: update-s3-endpoint
update-s3-endpoint:
	@# Update S3 endpoint in config.mk (can be called after web client deployment)
	@if [ -z "$(ENDPOINT)" ]; then \
	  echo ""; \
	  echo "Enter the S3 website endpoint (e.g., jmap-web-jmapbox-com.s3-website.eu-west-2.amazonaws.com):"; \
	  read -r s3_endpoint; \
	else \
	  s3_endpoint="$(ENDPOINT)"; \
	fi; \
	if [ -z "$$s3_endpoint" ]; then \
	  echo "ERROR: S3 endpoint cannot be empty"; \
	  exit 1; \
	fi; \
	if [ ! -f config.mk ]; then \
	  echo "ERROR: config.mk not found. Run 'make deploy' first."; \
	  exit 1; \
	fi; \
	if ! grep -q "^SERVE_WEB_CLIENT" config.mk || ! grep -q "^SERVE_WEB_CLIENT.*yes" config.mk; then \
	  echo "Setting SERVE_WEB_CLIENT = yes"; \
	  if grep -q "^SERVE_WEB_CLIENT" config.mk; then \
	    sed -i.bak "s|^SERVE_WEB_CLIENT.*|SERVE_WEB_CLIENT = yes|" config.mk; \
	  else \
	    echo "SERVE_WEB_CLIENT = yes" >> config.mk; \
	  fi; \
	fi; \
	if grep -q "^WEB_CLIENT_S3_ENDPOINT" config.mk; then \
	  sed -i.bak "s|^WEB_CLIENT_S3_ENDPOINT.*|WEB_CLIENT_S3_ENDPOINT = $$s3_endpoint|" config.mk; \
	  echo "Updated WEB_CLIENT_S3_ENDPOINT in config.mk"; \
	else \
	  echo "WEB_CLIENT_S3_ENDPOINT = $$s3_endpoint" >> config.mk; \
	  echo "Added WEB_CLIENT_S3_ENDPOINT to config.mk"; \
	fi; \
	rm -f config.mk.bak; \
	echo "Configuration updated. Run 'make deploy' to integrate the S3 endpoint."

.PHONY: ensure-config
ensure-config:
	@if [ -z "$(REGION)" ] || [ -z "$(ROOT_DOMAIN)" ]; then \
	  echo "ERROR: Set AWS_REGION and ROOT_DOMAIN in config.mk"; exit 1; \
	fi
	@# Interactive prompt for web client integration
	@if [ -z "$(SERVE_WEB_CLIENT)" ]; then \
	  echo ""; \
	  echo "Do you want to serve the web client from this CloudFront? (y/n)"; \
	  read -r answer; \
	  if [ "$$answer" = "y" ] || [ "$$answer" = "Y" ]; then \
	    echo "Enter the S3 website endpoint (e.g., jmap-web-jmapbox-com.s3-website.eu-west-2.amazonaws.com):"; \
	    echo "(Press Enter to skip for now - you can add it later after deploying the web client)"; \
	    read -r s3_endpoint; \
	    if [ -f config.mk ]; then \
	      if grep -q "^SERVE_WEB_CLIENT" config.mk; then \
	        sed -i.bak "s|^SERVE_WEB_CLIENT.*|SERVE_WEB_CLIENT = yes|" config.mk; \
	      else \
	        echo "SERVE_WEB_CLIENT = yes" >> config.mk; \
	      fi; \
	      if [ -n "$$s3_endpoint" ]; then \
	        if grep -q "^WEB_CLIENT_S3_ENDPOINT" config.mk; then \
	          sed -i.bak "s|^WEB_CLIENT_S3_ENDPOINT.*|WEB_CLIENT_S3_ENDPOINT = $$s3_endpoint|" config.mk; \
	        else \
	          echo "WEB_CLIENT_S3_ENDPOINT = $$s3_endpoint" >> config.mk; \
	        fi; \
	      else \
	        if grep -q "^WEB_CLIENT_S3_ENDPOINT" config.mk; then \
	          sed -i.bak "/^WEB_CLIENT_S3_ENDPOINT/d" config.mk; \
	        fi; \
	        echo "Note: S3 endpoint not set. Deploy server first, then web client, then update config.mk with the S3 endpoint and redeploy."; \
	      fi; \
	      rm -f config.mk.bak; \
	    else \
	      echo "SERVE_WEB_CLIENT = yes" > config.mk; \
	      if [ -n "$$s3_endpoint" ]; then \
	        echo "WEB_CLIENT_S3_ENDPOINT = $$s3_endpoint" >> config.mk; \
	      fi; \
	    fi; \
	    echo "Configuration saved to config.mk"; \
	  else \
	    if [ -f config.mk ]; then \
	      if grep -q "^SERVE_WEB_CLIENT" config.mk; then \
	        sed -i.bak "s|^SERVE_WEB_CLIENT.*|SERVE_WEB_CLIENT = no|" config.mk; \
	      else \
	        echo "SERVE_WEB_CLIENT = no" >> config.mk; \
	      fi; \
	      if grep -q "^WEB_CLIENT_S3_ENDPOINT" config.mk; then \
	        sed -i.bak "/^WEB_CLIENT_S3_ENDPOINT/d" config.mk; \
	      fi; \
	      rm -f config.mk.bak; \
	    else \
	      echo "SERVE_WEB_CLIENT = no" > config.mk; \
	    fi; \
	  fi; \
	  echo ""; \
	fi



# Run backend (SAM) locally
local:
	@command -v sam >/dev/null || (echo "ERROR: AWS SAM CLI not found"; exit 1)
	@docker info >/dev/null 2>&1 || (echo "ERROR: Docker is not running"; exit 1)
	@$(MAKE) gen-env-local >/dev/null || true
	@mkdir -p .logs
	@env -u AWS_PROFILE -u AWS_DEFAULT_PROFILE \
	  AWS_REGION=$(or $(REGION),eu-west-2) AWS_DEFAULT_REGION=$(or $(REGION),eu-west-2) \
	  sam build --region $(or $(REGION),eu-west-2)
	@echo "Starting SAM CLI local API Gateway..."
	@echo "JMAP server will be available at http://localhost:3001"
	@echo "Press Ctrl+C to stop"
	@echo ""
	@env -u AWS_PROFILE -u AWS_DEFAULT_PROFILE \
	  AWS_REGION=$(or $(REGION),eu-west-2) AWS_DEFAULT_REGION=$(or $(REGION),eu-west-2) AWS_EC2_METADATA_DISABLED=true \
	  sam local start-api --region $(or $(REGION),eu-west-2) --host 127.0.0.1 --port 3001 \
	  --env-vars env.json 2>&1 | grep -v "This is a development server" || true

