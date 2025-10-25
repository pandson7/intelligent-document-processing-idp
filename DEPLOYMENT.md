# 🚀 Deployment Guide - Intelligent Document Processing Application

This guide provides step-by-step instructions to deploy the complete IDP application in your AWS environment.

## 📋 Prerequisites

### Required Tools
- **AWS CLI** (v2.0+) - [Installation Guide](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html)
- **Node.js** (v16+) - [Download](https://nodejs.org/)
- **AWS CDK CLI** (v2.0+) - Install with `npm install -g aws-cdk`
- **Git** - [Installation Guide](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)

### AWS Account Setup
- AWS Account with administrative access
- AWS CLI configured with credentials
- Sufficient service limits for Lambda, API Gateway, S3, DynamoDB

### Required AWS Permissions
Your AWS user/role needs permissions for:
- Lambda (create, update, invoke functions)
- API Gateway (create, manage APIs)
- S3 (create buckets, manage objects)
- DynamoDB (create tables, read/write data)
- IAM (create roles and policies)
- CloudFormation (create/update stacks)
- EventBridge (create rules and targets)
- Textract (analyze documents)
- Comprehend (detect entities)

## 🛠️ Step-by-Step Deployment

### Step 1: Clone Repository
```bash
git clone https://github.com/pandson7/intelligent-document-processing-idp.git
cd intelligent-document-processing-idp
```

### Step 2: Configure AWS CLI
```bash
# Configure AWS credentials
aws configure

# Verify configuration
aws sts get-caller-identity
```

### Step 3: Bootstrap CDK (First Time Only)
```bash
# Bootstrap CDK in your AWS account/region
cdk bootstrap aws://ACCOUNT-NUMBER/REGION

# Example:
cdk bootstrap aws://123456789012/us-east-1
```

### Step 4: Deploy Infrastructure
```bash
cd cdk-app

# Install dependencies
npm install

# Review what will be deployed
cdk diff

# Deploy the stack
cdk deploy

# Confirm deployment when prompted
```

**Expected Output:**
```
✅  CdkAppStack

✨  Deployment time: 180.45s

Outputs:
CdkAppStack.ApiEndpoint = https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod/
CdkAppStack.S3BucketName = idp-documents-xxxxxxxxxx
CdkAppStack.DynamoDBTableName = idp-documents-xxxxxxxxxx

Stack ARN:
arn:aws:cloudformation:us-east-1:123456789012:stack/CdkAppStack/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### Step 5: Setup Frontend
```bash
cd ../frontend

# Install dependencies
npm install

# Update API endpoint (if different from default)
# Edit src/App.tsx and update the API_BASE_URL constant

# Start development server
npm start
```

**Expected Output:**
```
Compiled successfully!

You can now view frontend in the browser.

  Local:            http://localhost:3001
  On Your Network:  http://192.168.1.100:3001
```

### Step 6: Verify Deployment
```bash
cd ..

# Run quick validation test
node quick-test.js

# Run comprehensive end-to-end tests
node test-e2e.js
```

## 🔧 Configuration

### Environment Variables
The application automatically configures itself using CDK outputs. No manual environment variable setup is required.

### Custom Configuration
If you need to customize the deployment:

1. **Change Region**: Update `cdk-app/bin/cdk-app.ts`
2. **Modify Resources**: Edit `cdk-app/lib/cdk-app-stack.ts`
3. **Update Frontend**: Modify `frontend/src/App.tsx`

### Resource Naming
Resources are automatically named with timestamps to avoid conflicts:
- S3 Bucket: `idp-documents-{timestamp}`
- DynamoDB Table: `idp-documents-{timestamp}`
- Lambda Functions: `CdkAppStack-{FunctionName}-{hash}`

## 🧪 Testing Your Deployment

### 1. Frontend Testing
1. Open http://localhost:3001
2. Upload a test document from `test-docs/` folder
3. Monitor processing stages in real-time
4. Verify results display correctly

### 2. API Testing
```bash
# Get API endpoint from CDK output
API_ENDPOINT="https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod"

# Test upload endpoint
curl -X POST $API_ENDPOINT/documents \
  -H "Content-Type: application/json" \
  -d '{"fileName": "test.pdf", "fileType": "application/pdf"}'

# Test status endpoint (replace {documentId} with actual ID)
curl $API_ENDPOINT/documents/{documentId}
```

### 3. Automated Testing
```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e
```

## 📊 Monitoring and Troubleshooting

### CloudWatch Logs
Monitor application logs:
```bash
# List log groups
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/CdkAppStack"

# View specific function logs
aws logs tail /aws/lambda/CdkAppStack-UploadFunction-XXXXXXXXX --follow
```

### Common Issues and Solutions

#### 1. CDK Deployment Fails
**Error**: `Resource already exists`
**Solution**: 
```bash
cdk destroy
cdk deploy
```

#### 2. Frontend Can't Connect to API
**Error**: CORS or network errors
**Solution**: 
- Verify API Gateway endpoint URL
- Check CORS configuration in CDK stack
- Ensure API Gateway is deployed correctly

#### 3. Lambda Function Timeouts
**Error**: Function timeout errors in CloudWatch
**Solution**: 
- Increase timeout in CDK stack
- Optimize function code
- Check for infinite loops or blocking operations

#### 4. S3 Upload Fails
**Error**: Access denied or invalid presigned URL
**Solution**: 
- Verify S3 bucket permissions
- Check IAM role policies
- Ensure presigned URL hasn't expired

#### 5. DynamoDB Throttling
**Error**: ProvisionedThroughputExceededException
**Solution**: 
- Enable auto-scaling (already configured)
- Increase provisioned capacity
- Implement exponential backoff

### Debug Commands
```bash
# Check CDK stack status
cdk list
cdk diff

# Verify AWS resources
aws s3 ls | grep idp-documents
aws dynamodb list-tables | grep idp-documents
aws lambda list-functions | grep CdkAppStack

# Test individual Lambda functions
aws lambda invoke --function-name CdkAppStack-UploadFunction-XXXXXXXXX \
  --payload '{"test": "data"}' response.json
```

## 🔄 Updates and Maintenance

### Updating the Application
```bash
# Pull latest changes
git pull origin main

# Update infrastructure
cd cdk-app
npm install
cdk deploy

# Update frontend
cd ../frontend
npm install
npm start
```

### Monitoring Costs
- Monitor AWS billing dashboard
- Set up billing alerts
- Review CloudWatch metrics for usage patterns
- Use AWS Cost Explorer for detailed analysis

### Backup and Recovery
- S3 versioning is enabled for document storage
- DynamoDB point-in-time recovery is enabled
- CloudFormation templates provide infrastructure as code

## 🚨 Security Considerations

### Production Deployment
For production environments:

1. **Enable CloudTrail** for audit logging
2. **Configure VPC** for network isolation
3. **Enable WAF** for API Gateway protection
4. **Use Secrets Manager** for sensitive configuration
5. **Implement proper monitoring** and alerting
6. **Regular security updates** for dependencies

### Access Control
- Use least privilege IAM policies
- Enable MFA for AWS console access
- Regularly rotate access keys
- Monitor access patterns

## 📞 Support

### Getting Help
1. Check the troubleshooting section above
2. Review CloudWatch logs for errors
3. Consult AWS documentation for service-specific issues
4. Open an issue in the GitHub repository

### Useful Resources
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [API Gateway Documentation](https://docs.aws.amazon.com/apigateway/)
- [React Documentation](https://reactjs.org/docs/)

## 🎯 Next Steps

After successful deployment:
1. Customize the UI to match your branding
2. Add additional document types and processing rules
3. Implement user authentication and authorization
4. Add batch processing capabilities
5. Integrate with your existing systems
6. Set up production monitoring and alerting

---

**Deployment Status**: Ready for Production ✅
**Estimated Deployment Time**: 15-20 minutes
**Support Level**: Community Support Available
