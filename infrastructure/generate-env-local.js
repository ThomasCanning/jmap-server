//AI Generated script to generate env.json for SAM local development

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

const templatePath = path.join(__dirname, '..', 'template.yaml');
const envJsonPath = path.join(__dirname, '..', 'env.json');

// Get values from environment or use defaults
const region = process.env.REGION || process.env.AWS_REGION || 'eu-west-2';
const userPoolClientId = process.env.USER_POOL_CLIENT_ID || '';
const apiBase = process.env.API_BASE || 'http://localhost:3001';

// Read and parse template.yaml
// Suppress warnings about CloudFormation intrinsic functions (!Ref, !Sub, etc.)
// We only need to detect if keys exist, not evaluate them
const originalEmitWarning = process.emitWarning;
process.emitWarning = () => {}; // Suppress YAML warnings

const templateContent = fs.readFileSync(templatePath, 'utf8');
const template = yaml.parse(templateContent);

process.emitWarning = originalEmitWarning; // Restore warnings

// Extract functions and their environment variables
const envJson = {};

for (const [resourceName, resource] of Object.entries(template.Resources || {})) {
  if (resource.Type === 'AWS::Serverless::Function') {
    const envVars = {};
    
    // Get environment variables from function definition
    const envVarsDef = resource.Properties?.Environment?.Variables || {};
    
    // Always set IS_LOCAL_DEV to true for local development
    envVars.IS_LOCAL_DEV = "true";
    
    // Only add env vars that are actually defined in the template
    // Check for USER_POOL_CLIENT_ID (can be !Ref UserPoolClient or explicit value)
    if (envVarsDef.USER_POOL_CLIENT_ID !== undefined) {
      envVars.USER_POOL_CLIENT_ID = userPoolClientId;
    }
    
    // Check for API_URL (can be !Sub expression or explicit value)
    if (envVarsDef.API_URL !== undefined) {
      envVars.API_URL = `${apiBase}/jmap`;
    }
    
    // Add AWS_REGION for local dev (Lambda sets it automatically in production)
    // Only needed if function uses AWS SDK services (like Cognito)
    // Check if function needs it by looking for USER_POOL_CLIENT_ID (indicates Cognito usage)
    if (envVarsDef.USER_POOL_CLIENT_ID !== undefined) {
      envVars.AWS_REGION = region;
    }
    
    // Always add to env.json (even if only IS_LOCAL_DEV is set)
    envJson[resourceName] = envVars;
  }
}

// Write env.json
fs.writeFileSync(envJsonPath, JSON.stringify(envJson, null, 2) + '\n');
console.log(`Wrote env.json (region=${region}, client_id=${userPoolClientId || '<unset>'})`);
console.log(`Functions: ${Object.keys(envJson).join(', ')}`);

