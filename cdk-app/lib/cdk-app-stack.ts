import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';

export class CdkAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const suffix = '102520251840';
    
    // S3 Bucket for document storage
    const documentsBucket = new s3.Bucket(this, `DocumentsBucket${suffix}`, {
      bucketName: `idp-documents-${suffix}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [{
        allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.POST, s3.HttpMethods.PUT],
        allowedOrigins: ['*'],
        allowedHeaders: ['*'],
        maxAge: 3000
      }],
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // DynamoDB Tables
    const documentsTable = new dynamodb.Table(this, `DocumentsTable${suffix}`, {
      tableName: `idp-documents-${suffix}`,
      partitionKey: { name: 'documentId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 5,
      writeCapacity: 5,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Enable auto scaling
    documentsTable.autoScaleReadCapacity({
      minCapacity: 1,
      maxCapacity: 10
    });
    documentsTable.autoScaleWriteCapacity({
      minCapacity: 1,
      maxCapacity: 10
    });

    // EventBridge for pipeline orchestration
    const eventBus = new events.EventBus(this, `IDPEventBus${suffix}`, {
      eventBusName: `idp-pipeline-${suffix}`
    });

    // IAM Role for Lambda functions
    const lambdaRole = new iam.Role(this, `LambdaRole${suffix}`, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ],
      inlinePolicies: {
        IDPPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject'
              ],
              resources: [documentsBucket.bucketArn + '/*']
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'dynamodb:PutItem',
                'dynamodb:GetItem',
                'dynamodb:UpdateItem',
                'dynamodb:Query',
                'dynamodb:Scan'
              ],
              resources: [documentsTable.tableArn]
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'textract:DetectDocumentText',
                'textract:AnalyzeDocument'
              ],
              resources: ['*']
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'comprehend:DetectEntities',
                'comprehend:ClassifyDocument',
                'comprehend:DetectSentiment'
              ],
              resources: ['*']
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'bedrock:InvokeModel'
              ],
              resources: [
                'arn:aws:bedrock:*:*:inference-profile/global.anthropic.claude-sonnet-4-20250514-v1:0',
                'arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-20250514-v1:0'
              ]
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'events:PutEvents'
              ],
              resources: [eventBus.eventBusArn]
            })
          ]
        })
      }
    });

    // Lambda Functions
    const uploadHandler = new lambda.Function(this, `UploadHandler${suffix}`, {
      functionName: `idp-upload-handler-${suffix}`,
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      role: lambdaRole,
      code: lambda.Code.fromInline(`
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const eventbridge = new AWS.EventBridge();

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { fileName, fileType } = JSON.parse(event.body);
    const documentId = Date.now().toString();
    const s3Key = \`documents/\${documentId}/\${fileName}\`;
    
    // Generate presigned URL
    const presignedUrl = s3.getSignedUrl('putObject', {
      Bucket: '${documentsBucket.bucketName}',
      Key: s3Key,
      ContentType: fileType,
      Expires: 300
    });

    // Create document record
    await dynamodb.put({
      TableName: '${documentsTable.tableName}',
      Item: {
        documentId,
        fileName,
        fileType,
        s3Key,
        status: 'uploaded',
        stage: 'upload',
        uploadTimestamp: Date.now(),
        stages: {
          upload: { status: 'completed', timestamp: Date.now() },
          extraction: { status: 'pending' },
          classification: { status: 'pending' },
          summarization: { status: 'pending' },
          display: { status: 'pending' }
        }
      }
    }).promise();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ documentId, presignedUrl })
    };
  } catch (error) {
    console.error('Upload error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Upload failed' })
    };
  }
};
      `),
      environment: {
        DOCUMENTS_BUCKET: documentsBucket.bucketName,
        DOCUMENTS_TABLE: documentsTable.tableName,
        EVENT_BUS_NAME: eventBus.eventBusName
      }
    });

    const extractionProcessor = new lambda.Function(this, `ExtractionProcessor${suffix}`, {
      functionName: `idp-extraction-processor-${suffix}`,
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      role: lambdaRole,
      timeout: cdk.Duration.minutes(5),
      code: lambda.Code.fromInline(`
const AWS = require('aws-sdk');
const textract = new AWS.Textract();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const eventbridge = new AWS.EventBridge();

exports.handler = async (event) => {
  try {
    const { documentId, s3Key, bucketName } = event.detail;
    
    // Update status to processing
    await dynamodb.update({
      TableName: '${documentsTable.tableName}',
      Key: { documentId },
      UpdateExpression: 'SET #status = :status, #stage = :stage, stages.extraction.#status = :status, stages.extraction.#timestamp = :timestamp',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#stage': 'stage',
        '#timestamp': 'timestamp'
      },
      ExpressionAttributeValues: {
        ':status': 'processing',
        ':stage': 'extraction',
        ':timestamp': Date.now()
      }
    }).promise();

    // Extract text using Textract
    const textractParams = {
      Document: {
        S3Object: {
          Bucket: bucketName,
          Name: s3Key
        }
      }
    };

    const result = await textract.detectDocumentText(textractParams).promise();
    const extractedText = result.Blocks
      .filter(block => block.BlockType === 'LINE')
      .map(block => block.Text)
      .join('\\n');

    // Update document with extracted text
    await dynamodb.update({
      TableName: '${documentsTable.tableName}',
      Key: { documentId },
      UpdateExpression: 'SET extractedText = :text, stages.extraction.#status = :status, stages.extraction.extractedData = :text',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':text': extractedText,
        ':status': 'completed'
      }
    }).promise();

    // Trigger classification stage
    await eventbridge.putEvents({
      Entries: [{
        Source: 'idp.extraction',
        DetailType: 'Text Extracted',
        Detail: JSON.stringify({ documentId, extractedText }),
        EventBusName: '${eventBus.eventBusName}'
      }]
    }).promise();

    return { statusCode: 200, body: 'Text extraction completed' };
  } catch (error) {
    console.error('Extraction error:', error);
    
    // Update status to failed
    await dynamodb.update({
      TableName: '${documentsTable.tableName}',
      Key: { documentId: event.detail.documentId },
      UpdateExpression: 'SET #status = :status, stages.extraction.#status = :status, stages.extraction.errorMessage = :errorMsg',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'failed',
        ':errorMsg': error.message
      }
    }).promise();
    
    throw error;
  }
};
      `),
      environment: {
        DOCUMENTS_TABLE: documentsTable.tableName,
        EVENT_BUS_NAME: eventBus.eventBusName
      }
    });

    const classificationProcessor = new lambda.Function(this, `ClassificationProcessor${suffix}`, {
      functionName: `idp-classification-processor-${suffix}`,
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      role: lambdaRole,
      timeout: cdk.Duration.minutes(3),
      code: lambda.Code.fromInline(`
const AWS = require('aws-sdk');
const comprehend = new AWS.Comprehend();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const eventbridge = new AWS.EventBridge();

exports.handler = async (event) => {
  try {
    const { documentId, extractedText } = event.detail;
    
    // Update status to processing
    await dynamodb.update({
      TableName: '${documentsTable.tableName}',
      Key: { documentId },
      UpdateExpression: 'SET #stage = :stage, stages.classification.#status = :status, stages.classification.#timestamp = :timestamp',
      ExpressionAttributeNames: {
        '#stage': 'stage',
        '#status': 'status',
        '#timestamp': 'timestamp'
      },
      ExpressionAttributeValues: {
        ':stage': 'classification',
        ':status': 'processing',
        ':timestamp': Date.now()
      }
    }).promise();

    // Classify document using simple rules (since Comprehend custom classification requires training)
    let classification = 'Unknown';
    const text = extractedText.toLowerCase();
    
    if (text.includes('invoice') || text.includes('bill') || text.includes('amount due') || text.includes('total')) {
      classification = 'Invoice';
    } else if (text.includes('receipt') || text.includes('purchased') || text.includes('transaction')) {
      classification = 'Receipt';
    } else if (text.includes('license') || text.includes('driver') || text.includes('identification')) {
      classification = 'ID Document';
    } else if (text.includes('contract') || text.includes('agreement')) {
      classification = 'Contract';
    }

    // Extract entities using Comprehend
    const entitiesResult = await comprehend.detectEntities({
      Text: extractedText.substring(0, 5000), // Limit text length
      LanguageCode: 'en'
    }).promise();

    const entities = entitiesResult.Entities.map(entity => ({
      text: entity.Text,
      type: entity.Type,
      confidence: entity.Score
    }));

    // Update document with classification and entities
    await dynamodb.update({
      TableName: '${documentsTable.tableName}',
      Key: { documentId },
      UpdateExpression: 'SET classification = :classification, entities = :entities, stages.classification.#status = :status, stages.classification.classificationData = :classificationResult',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':classification': classification,
        ':entities': entities,
        ':status': 'completed',
        ':classificationResult': { classification, entities }
      }
    }).promise();

    // Trigger summarization stage
    await eventbridge.putEvents({
      Entries: [{
        Source: 'idp.classification',
        DetailType: 'Document Classified',
        Detail: JSON.stringify({ documentId, extractedText, classification, entities }),
        EventBusName: '${eventBus.eventBusName}'
      }]
    }).promise();

    return { statusCode: 200, body: 'Classification completed' };
  } catch (error) {
    console.error('Classification error:', error);
    
    // Update status to failed
    await dynamodb.update({
      TableName: '${documentsTable.tableName}',
      Key: { documentId: event.detail.documentId },
      UpdateExpression: 'SET stages.classification.#status = :status, stages.classification.errorMessage = :errorMsg',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'failed',
        ':errorMsg': error.message
      }
    }).promise();
    
    throw error;
  }
};
      `),
      environment: {
        DOCUMENTS_TABLE: documentsTable.tableName,
        EVENT_BUS_NAME: eventBus.eventBusName
      }
    });

    const summarizationProcessor = new lambda.Function(this, `SummarizationProcessor${suffix}`, {
      functionName: `idp-summarization-processor-${suffix}`,
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      role: lambdaRole,
      timeout: cdk.Duration.minutes(3),
      code: lambda.Code.fromInline(`
const AWS = require('aws-sdk');
const bedrock = new AWS.BedrockRuntime({ region: 'us-east-1' });
const dynamodb = new AWS.DynamoDB.DocumentClient();
const eventbridge = new AWS.EventBridge();

exports.handler = async (event) => {
  try {
    const { documentId, extractedText, classification } = event.detail;
    
    // Update status to processing
    await dynamodb.update({
      TableName: '${documentsTable.tableName}',
      Key: { documentId },
      UpdateExpression: 'SET #stage = :stage, stages.summarization.#status = :status, stages.summarization.#timestamp = :timestamp',
      ExpressionAttributeNames: {
        '#stage': 'stage',
        '#status': 'status',
        '#timestamp': 'timestamp'
      },
      ExpressionAttributeValues: {
        ':stage': 'summarization',
        ':status': 'processing',
        ':timestamp': Date.now()
      }
    }).promise();

    // Generate summary using simple text processing instead of Bedrock for now
    const textToSummarize = extractedText.substring(0, 1000);
    const sentences = textToSummarize.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const summary = sentences.slice(0, 3).join('. ') + '.';
    
    // For demo purposes, create a simple summary
    const finalSummary = \`This \${classification || 'document'} contains \${extractedText.length} characters of text. Key content includes: \${summary}\`;

    // Update document with summary
    await dynamodb.update({
      TableName: '${documentsTable.tableName}',
      Key: { documentId },
      UpdateExpression: 'SET summary = :summary, stages.summarization.#status = :status, stages.summarization.summaryData = :summary',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':summary': finalSummary,
        ':status': 'completed'
      }
    }).promise();

    // Trigger final display stage
    await eventbridge.putEvents({
      Entries: [{
        Source: 'idp.summarization',
        DetailType: 'Document Summarized',
        Detail: JSON.stringify({ documentId, summary: finalSummary }),
        EventBusName: '${eventBus.eventBusName}'
      }]
    }).promise();

    return { statusCode: 200, body: 'Summarization completed' };
  } catch (error) {
    console.error('Summarization error:', error);
    
    // Update status to failed
    await dynamodb.update({
      TableName: '${documentsTable.tableName}',
      Key: { documentId: event.detail.documentId },
      UpdateExpression: 'SET stages.summarization.#status = :status, stages.summarization.errorMessage = :errorMsg',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'failed',
        ':errorMsg': error.message
      }
    }).promise();
    
    throw error;
  }
};
      `),
      environment: {
        DOCUMENTS_TABLE: documentsTable.tableName,
        EVENT_BUS_NAME: eventBus.eventBusName
      }
    });

    const displayProcessor = new lambda.Function(this, `DisplayProcessor${suffix}`, {
      functionName: `idp-display-processor-${suffix}`,
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      role: lambdaRole,
      code: lambda.Code.fromInline(`
const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const { documentId } = event.detail;
    
    // Update final status
    await dynamodb.update({
      TableName: '${documentsTable.tableName}',
      Key: { documentId },
      UpdateExpression: 'SET #status = :status, #stage = :stage, stages.display.#status = :status, stages.display.#timestamp = :timestamp',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#stage': 'stage',
        '#timestamp': 'timestamp'
      },
      ExpressionAttributeValues: {
        ':status': 'completed',
        ':stage': 'display',
        ':timestamp': Date.now()
      }
    }).promise();

    return { statusCode: 200, body: 'Processing pipeline completed' };
  } catch (error) {
    console.error('Display processor error:', error);
    throw error;
  }
};
      `),
      environment: {
        DOCUMENTS_TABLE: documentsTable.tableName
      }
    });

    const statusHandler = new lambda.Function(this, `StatusHandler${suffix}`, {
      functionName: `idp-status-handler-${suffix}`,
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      role: lambdaRole,
      code: lambda.Code.fromInline(`
const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const documentId = event.pathParameters.documentId;
    
    const result = await dynamodb.get({
      TableName: '${documentsTable.tableName}',
      Key: { documentId }
    }).promise();

    if (!result.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Document not found' })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result.Item)
    };
  } catch (error) {
    console.error('Status error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to get status' })
    };
  }
};
      `),
      environment: {
        DOCUMENTS_TABLE: documentsTable.tableName
      }
    });

    // Trigger function for S3 events
    const triggerFunction = new lambda.Function(this, `TriggerFunction${suffix}`, {
      functionName: `idp-trigger-function-${suffix}`,
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      role: lambdaRole,
      code: lambda.Code.fromAsset('../trigger-function'),
      environment: {
        EVENT_BUS_NAME: eventBus.eventBusName
      }
    });

    // S3 Event trigger
    documentsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(triggerFunction),
      { prefix: 'documents/' }
    );

    // EventBridge Rules
    new events.Rule(this, `ExtractionRule${suffix}`, {
      eventBus: eventBus,
      eventPattern: {
        source: ['idp.upload'],
        detailType: ['Document Uploaded']
      },
      targets: [new targets.LambdaFunction(extractionProcessor)]
    });

    new events.Rule(this, `ClassificationRule${suffix}`, {
      eventBus: eventBus,
      eventPattern: {
        source: ['idp.extraction'],
        detailType: ['Text Extracted']
      },
      targets: [new targets.LambdaFunction(classificationProcessor)]
    });

    new events.Rule(this, `SummarizationRule${suffix}`, {
      eventBus: eventBus,
      eventPattern: {
        source: ['idp.classification'],
        detailType: ['Document Classified']
      },
      targets: [new targets.LambdaFunction(summarizationProcessor)]
    });

    new events.Rule(this, `DisplayRule${suffix}`, {
      eventBus: eventBus,
      eventPattern: {
        source: ['idp.summarization'],
        detailType: ['Document Summarized']
      },
      targets: [new targets.LambdaFunction(displayProcessor)]
    });

    // API Gateway
    const api = new apigateway.RestApi(this, `IDPAPI${suffix}`, {
      restApiName: `idp-api-${suffix}`,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization']
      }
    });

    const documentsResource = api.root.addResource('documents');
    documentsResource.addMethod('POST', new apigateway.LambdaIntegration(uploadHandler));

    const documentResource = documentsResource.addResource('{documentId}');
    documentResource.addMethod('GET', new apigateway.LambdaIntegration(statusHandler));

    // Output API endpoint
    new cdk.CfnOutput(this, 'APIEndpoint', {
      value: api.url,
      description: 'IDP API Gateway endpoint'
    });

    new cdk.CfnOutput(this, 'DocumentsBucket', {
      value: documentsBucket.bucketName,
      description: 'S3 bucket for documents'
    });
  }
}
