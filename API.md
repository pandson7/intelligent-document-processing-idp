# 📡 API Documentation - Intelligent Document Processing

Complete API reference for the IDP application with examples and response formats.

## 🌐 Base URL

```
https://cgokmva617.execute-api.us-east-1.amazonaws.com/prod/
```

## 🔐 Authentication

Currently, the API uses AWS IAM for authentication. For development, CORS is enabled for `http://localhost:3001`.

## 📋 Endpoints

### 1. Upload Document

Initiates document upload and processing pipeline.

**Endpoint:** `POST /documents`

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "fileName": "document.pdf",
  "fileType": "application/pdf"
}
```

**Supported File Types:**
- `application/pdf` - PDF documents
- `image/jpeg` - JPEG images
- `image/png` - PNG images

**Response (200 OK):**
```json
{
  "documentId": "550e8400-e29b-41d4-a716-446655440000",
  "uploadUrl": "https://idp-documents-102520251840.s3.amazonaws.com/550e8400-e29b-41d4-a716-446655440000?X-Amz-Algorithm=...",
  "fileName": "document.pdf",
  "status": "upload_ready",
  "createdAt": "2024-10-25T19:33:40.653Z"
}
```

**Error Responses:**
```json
// 400 Bad Request - Invalid file type
{
  "error": "Invalid file type",
  "message": "Only PDF, JPEG, and PNG files are supported",
  "supportedTypes": ["application/pdf", "image/jpeg", "image/png"]
}

// 500 Internal Server Error
{
  "error": "Internal server error",
  "message": "Failed to generate upload URL"
}
```

**Example Usage:**
```bash
curl -X POST https://cgokmva617.execute-api.us-east-1.amazonaws.com/prod/documents \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "invoice.pdf",
    "fileType": "application/pdf"
  }'
```

### 2. Upload File to S3

After receiving the upload URL, upload the actual file to S3.

**Endpoint:** `PUT {uploadUrl}` (from previous response)

**Request Headers:**
```
Content-Type: {fileType}
```

**Request Body:** Binary file data

**Response (200 OK):** Empty response body

**Example Usage:**
```bash
curl -X PUT "https://idp-documents-102520251840.s3.amazonaws.com/550e8400-e29b-41d4-a716-446655440000?X-Amz-Algorithm=..." \
  -H "Content-Type: application/pdf" \
  --data-binary @document.pdf
```

### 3. Get Document Status

Retrieves current processing status and results for a document.

**Endpoint:** `GET /documents/{documentId}`

**Path Parameters:**
- `documentId` (string, required) - UUID of the document

**Response (200 OK):**
```json
{
  "documentId": "550e8400-e29b-41d4-a716-446655440000",
  "fileName": "invoice.pdf",
  "fileType": "application/pdf",
  "status": "completed",
  "stage": "display",
  "progress": {
    "upload": {
      "status": "completed",
      "completedAt": "2024-10-25T19:33:45.123Z"
    },
    "extract": {
      "status": "completed",
      "completedAt": "2024-10-25T19:34:12.456Z"
    },
    "classify": {
      "status": "completed",
      "completedAt": "2024-10-25T19:34:18.789Z"
    },
    "summarize": {
      "status": "completed",
      "completedAt": "2024-10-25T19:34:25.012Z"
    },
    "display": {
      "status": "completed",
      "completedAt": "2024-10-25T19:34:25.345Z"
    }
  },
  "extractedText": "INVOICE\nInvoice #: INV-2024-001\nDate: October 25, 2024\n...",
  "classification": {
    "documentType": "invoice",
    "confidence": 0.95,
    "entities": [
      {
        "type": "ORGANIZATION",
        "text": "Acme Corporation",
        "confidence": 0.98,
        "beginOffset": 45,
        "endOffset": 60
      },
      {
        "type": "DATE",
        "text": "October 25, 2024",
        "confidence": 0.99,
        "beginOffset": 85,
        "endOffset": 101
      },
      {
        "type": "QUANTITY",
        "text": "$1,250.00",
        "confidence": 0.97,
        "beginOffset": 150,
        "endOffset": 159
      }
    ]
  },
  "summary": {
    "keyPoints": [
      "Invoice from Acme Corporation dated October 25, 2024",
      "Total amount: $1,250.00",
      "Services provided: Software development consulting"
    ],
    "documentInsights": {
      "totalAmount": "$1,250.00",
      "vendor": "Acme Corporation",
      "invoiceDate": "2024-10-25",
      "dueDate": "2024-11-25"
    }
  },
  "createdAt": "2024-10-25T19:33:40.653Z",
  "updatedAt": "2024-10-25T19:34:25.345Z"
}
```

**Processing Status Values:**
- `upload_ready` - Ready for file upload
- `processing` - Document is being processed
- `completed` - All stages completed successfully
- `failed` - Processing failed at some stage

**Stage Values:**
- `upload` - File upload stage
- `extract` - Text extraction stage
- `classify` - Classification and entity extraction stage
- `summarize` - Document summarization stage
- `display` - Results ready for display

**Error Responses:**
```json
// 404 Not Found
{
  "error": "Document not found",
  "message": "No document found with ID: 550e8400-e29b-41d4-a716-446655440000"
}

// 500 Internal Server Error
{
  "error": "Internal server error",
  "message": "Failed to retrieve document status"
}
```

**Example Usage:**
```bash
curl https://cgokmva617.execute-api.us-east-1.amazonaws.com/prod/documents/550e8400-e29b-41d4-a716-446655440000
```

## 📊 Document Classification Types

The system automatically classifies documents into the following types:

### Invoice
**Characteristics:**
- Contains invoice numbers, amounts, dates
- Has vendor and customer information
- Includes line items and totals

**Sample Entities:**
- `ORGANIZATION` - Vendor/customer names
- `DATE` - Invoice date, due date
- `QUANTITY` - Amounts, quantities
- `PERSON` - Contact persons

### Receipt
**Characteristics:**
- Transaction records from purchases
- Contains merchant information and amounts
- Usually shorter than invoices

**Sample Entities:**
- `ORGANIZATION` - Merchant name
- `DATE` - Transaction date
- `QUANTITY` - Purchase amounts
- `LOCATION` - Store location

### ID Document
**Characteristics:**
- Government-issued identification
- Contains personal information
- Has official formatting and numbers

**Sample Entities:**
- `PERSON` - Name on document
- `DATE` - Birth date, expiration date
- `LOCATION` - Address, place of birth
- `OTHER` - ID numbers, license numbers

### Contract
**Characteristics:**
- Legal agreements between parties
- Contains terms, conditions, signatures
- Usually longer documents with formal language

**Sample Entities:**
- `PERSON` - Contracting parties
- `ORGANIZATION` - Companies involved
- `DATE` - Contract dates, deadlines
- `LOCATION` - Addresses, jurisdictions

## 🔄 Processing Pipeline

### Stage Flow
1. **Upload** → Document uploaded to S3
2. **Extract** → Text extracted using AWS Textract
3. **Classify** → Document classified and entities extracted using AWS Comprehend
4. **Summarize** → Key insights and summary generated
5. **Display** → Results formatted and ready for presentation

### Event-Driven Architecture
The pipeline uses AWS EventBridge for stage coordination:
- Each stage completion triggers the next stage
- Failed stages can be retried independently
- Real-time status updates via DynamoDB

## 📈 Rate Limits and Quotas

### API Gateway Limits
- **Requests per second**: 10,000 (default)
- **Burst capacity**: 5,000 requests
- **Payload size**: 10 MB maximum

### AWS Service Limits
- **Textract**: 15 pages per document
- **Comprehend**: 5,000 characters per request
- **S3 upload**: 5 GB per file (presigned URL)
- **Lambda timeout**: 15 minutes maximum

### Recommended Usage
- **Concurrent uploads**: Up to 100 simultaneous
- **File size**: Under 10 MB for optimal performance
- **Polling frequency**: Every 2-3 seconds for status updates

## 🛠️ SDK Examples

### JavaScript/Node.js
```javascript
const axios = require('axios');

class IDPClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async uploadDocument(fileName, fileType, fileBuffer) {
    // Step 1: Get upload URL
    const response = await axios.post(`${this.baseUrl}/documents`, {
      fileName,
      fileType
    });

    const { documentId, uploadUrl } = response.data;

    // Step 2: Upload file to S3
    await axios.put(uploadUrl, fileBuffer, {
      headers: { 'Content-Type': fileType }
    });

    return documentId;
  }

  async getDocumentStatus(documentId) {
    const response = await axios.get(`${this.baseUrl}/documents/${documentId}`);
    return response.data;
  }

  async waitForCompletion(documentId, timeout = 300000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const status = await this.getDocumentStatus(documentId);
      
      if (status.status === 'completed') {
        return status;
      } else if (status.status === 'failed') {
        throw new Error('Document processing failed');
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    throw new Error('Processing timeout');
  }
}

// Usage
const client = new IDPClient('https://cgokmva617.execute-api.us-east-1.amazonaws.com/prod');

async function processDocument() {
  try {
    const fs = require('fs');
    const fileBuffer = fs.readFileSync('document.pdf');
    
    const documentId = await client.uploadDocument('document.pdf', 'application/pdf', fileBuffer);
    console.log('Document uploaded:', documentId);
    
    const result = await client.waitForCompletion(documentId);
    console.log('Processing completed:', result);
  } catch (error) {
    console.error('Error:', error.message);
  }
}
```

### Python
```python
import requests
import time
import json

class IDPClient:
    def __init__(self, base_url):
        self.base_url = base_url
    
    def upload_document(self, file_name, file_type, file_data):
        # Step 1: Get upload URL
        response = requests.post(f"{self.base_url}/documents", json={
            "fileName": file_name,
            "fileType": file_type
        })
        response.raise_for_status()
        
        data = response.json()
        document_id = data["documentId"]
        upload_url = data["uploadUrl"]
        
        # Step 2: Upload file to S3
        requests.put(upload_url, data=file_data, headers={
            "Content-Type": file_type
        }).raise_for_status()
        
        return document_id
    
    def get_document_status(self, document_id):
        response = requests.get(f"{self.base_url}/documents/{document_id}")
        response.raise_for_status()
        return response.json()
    
    def wait_for_completion(self, document_id, timeout=300):
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            status = self.get_document_status(document_id)
            
            if status["status"] == "completed":
                return status
            elif status["status"] == "failed":
                raise Exception("Document processing failed")
            
            time.sleep(2)
        
        raise Exception("Processing timeout")

# Usage
client = IDPClient("https://cgokmva617.execute-api.us-east-1.amazonaws.com/prod")

with open("document.pdf", "rb") as f:
    file_data = f.read()

document_id = client.upload_document("document.pdf", "application/pdf", file_data)
print(f"Document uploaded: {document_id}")

result = client.wait_for_completion(document_id)
print(f"Processing completed: {json.dumps(result, indent=2)}")
```

## 🔍 Monitoring and Analytics

### CloudWatch Metrics
The API automatically publishes metrics to CloudWatch:
- Request count and latency
- Error rates by endpoint
- Processing duration by stage
- Document type distribution

### Custom Metrics
```bash
# View API Gateway metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name Count \
  --dimensions Name=ApiName,Value=CdkAppStack-Api \
  --start-time 2024-10-25T00:00:00Z \
  --end-time 2024-10-25T23:59:59Z \
  --period 3600 \
  --statistics Sum

# View Lambda metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=CdkAppStack-ExtractFunction \
  --start-time 2024-10-25T00:00:00Z \
  --end-time 2024-10-25T23:59:59Z \
  --period 300 \
  --statistics Average
```

## 🚨 Error Handling

### Common Error Codes
- `400` - Bad Request (invalid input)
- `404` - Not Found (document doesn't exist)
- `413` - Payload Too Large (file size exceeded)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error (processing failure)

### Retry Strategy
Implement exponential backoff for transient errors:
```javascript
async function retryRequest(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.response?.status >= 500 && i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        continue;
      }
      throw error;
    }
  }
}
```

## 📞 Support

For API support:
1. Check CloudWatch logs for detailed error information
2. Verify request format matches the documentation
3. Ensure proper authentication and permissions
4. Review rate limits and quotas
5. Open an issue in the GitHub repository

---

**API Version**: 1.0  
**Last Updated**: October 25, 2024  
**Status**: Production Ready ✅
