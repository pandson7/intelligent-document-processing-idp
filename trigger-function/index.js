const AWS = require('aws-sdk');
const eventbridge = new AWS.EventBridge();

exports.handler = async (event) => {
  console.log('S3 Event received:', JSON.stringify(event, null, 2));
  
  try {
    for (const record of event.Records) {
      if (record.eventName.startsWith('ObjectCreated')) {
        const bucketName = record.s3.bucket.name;
        const s3Key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
        
        // Extract document ID from S3 key (documents/{documentId}/{fileName})
        const pathParts = s3Key.split('/');
        if (pathParts.length >= 3 && pathParts[0] === 'documents') {
          const documentId = pathParts[1];
          
          console.log(`Triggering extraction for document ${documentId}`);
          
          // Trigger extraction stage
          await eventbridge.putEvents({
            Entries: [{
              Source: 'idp.upload',
              DetailType: 'Document Uploaded',
              Detail: JSON.stringify({ 
                documentId, 
                s3Key, 
                bucketName 
              }),
              EventBusName: process.env.EVENT_BUS_NAME
            }]
          }).promise();
          
          console.log(`Successfully triggered extraction for ${documentId}`);
        }
      }
    }
    
    return { statusCode: 200, body: 'Pipeline triggered successfully' };
  } catch (error) {
    console.error('Error triggering pipeline:', error);
    throw error;
  }
};
