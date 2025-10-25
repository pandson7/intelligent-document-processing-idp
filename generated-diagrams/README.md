# AWS Architecture Diagrams for 5-Stage IDP Application

This directory contains three comprehensive AWS architecture diagrams for the Intelligent Document Processing (IDP) application based on the technical design specifications.

## Generated Diagrams

### 1. IDP Architecture Overview (`idp_architecture.png`)
- **Purpose**: High-level view of the complete serverless architecture
- **Key Components**: 
  - React frontend with API Gateway
  - Lambda functions for each processing stage
  - S3 for document storage
  - DynamoDB tables for metadata and processed results
  - Amazon Textract and Comprehend for AI/ML processing
  - EventBridge for event orchestration
- **Flow**: Shows the overall data flow from user upload to search and display

### 2. 5-Stage Pipeline Flow (`idp_pipeline_flow.png`)
- **Purpose**: Detailed view of the sequential 5-stage processing pipeline
- **Stages Illustrated**:
  1. **Document Upload**: User → React Frontend → API Gateway → Lambda → S3
  2. **Text Extraction**: S3 Event → EventBridge → Lambda → Textract → DynamoDB
  3. **Classification**: EventBridge → Lambda → Comprehend (Classification)
  4. **Entity Extraction & Summarization**: EventBridge → Lambda → Comprehend → DynamoDB
  5. **Search & Display**: API Gateway → Search Lambda → Search Index → Frontend
- **Flow**: Emphasizes the event-driven nature and sequential processing stages

### 3. Complete Serverless Architecture (`idp_complete_architecture.png`)
- **Purpose**: Comprehensive view showing all AWS services and their interactions
- **Detailed Components**:
  - Client layer with web browser and React application
  - API Gateway with specific endpoints (POST /documents, GET /documents/{id}, GET /search)
  - Six Lambda functions for different responsibilities
  - Three DynamoDB tables with their schemas
  - Separate Comprehend services for classification and entity extraction
  - Monitoring with CloudWatch Logs and Metrics
- **Security**: Shows encryption (AES-256) and proper service isolation

## Architecture Highlights

### Serverless Event-Driven Design
- **No Infrastructure Management**: All compute runs on AWS Lambda
- **Auto-Scaling**: Services automatically scale based on demand
- **Pay-per-Use**: Cost-effective with no idle resource charges

### 5-Stage Processing Pipeline
1. **Upload Stage**: Secure document upload to encrypted S3 bucket
2. **Extraction Stage**: Amazon Textract extracts text from documents
3. **Classification Stage**: Amazon Comprehend classifies document types
4. **Summarization Stage**: Amazon Comprehend extracts entities and key information
5. **Display Stage**: Processed results available via search API

### Key AWS Services Used
- **Frontend**: React.js (local development)
- **API**: Amazon API Gateway (REST endpoints)
- **Compute**: AWS Lambda (6 functions)
- **Storage**: Amazon S3 (encrypted document storage)
- **Database**: Amazon DynamoDB (3 tables)
- **AI/ML**: Amazon Textract, Amazon Comprehend
- **Events**: Amazon EventBridge
- **Monitoring**: Amazon CloudWatch

### Data Flow Summary
```
User Upload → S3 Storage → EventBridge Trigger → 
Text Extraction (Textract) → Classification (Comprehend) → 
Entity Extraction (Comprehend) → Search Index → User Display
```

### Security Features
- S3 bucket encryption (AES-256)
- DynamoDB encryption at rest
- IAM roles with least privilege access
- VPC endpoints for service communication
- No hardcoded credentials

### Scalability & Performance
- Lambda auto-scaling for concurrent processing
- DynamoDB on-demand scaling
- S3 automatic scaling and durability
- EventBridge for reliable event processing
- Target: 100+ concurrent users, <30s processing time

## File Locations
All diagrams are saved as PNG files in this directory:
- `/home/pandson/echo-architect-artifacts/intelligent-document-processing-102520251840/generated-diagrams/`

## Technical Implementation Notes
- **Event-Driven Architecture**: Uses EventBridge to coordinate the processing pipeline
- **Microservices Pattern**: Each Lambda function handles a specific responsibility
- **Data Consistency**: DynamoDB provides ACID transactions for metadata updates
- **Error Handling**: Dead letter queues and retry logic for failed processing
- **Monitoring**: Comprehensive CloudWatch logging and metrics collection
