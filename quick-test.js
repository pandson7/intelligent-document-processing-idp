const fs = require('fs');
const path = require('path');
const https = require('https');

const API_BASE_URL = 'https://cgokmva617.execute-api.us-east-1.amazonaws.com/prod';

async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = res.statusCode >= 200 && res.statusCode < 300 
            ? JSON.parse(data) 
            : { error: data, statusCode: res.statusCode };
          resolve(result);
        } catch (e) {
          resolve({ error: data, statusCode: res.statusCode });
        }
      });
    });
    
    req.on('error', reject);
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

async function quickTest() {
  console.log('🚀 Quick Test - Receipt Processing');
  
  const fileName = 'Receipt_26Aug2025_084539.pdf';
  const filePath = path.join(__dirname, 'test-docs', fileName);
  const fileType = 'application/pdf';
  
  try {
    // Step 1: Get presigned URL
    console.log('📤 Getting presigned URL...');
    const uploadResponse = await makeRequest(`${API_BASE_URL}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, fileType }),
    });

    if (uploadResponse.error) {
      throw new Error(`Failed to get upload URL: ${uploadResponse.error}`);
    }

    const { documentId, presignedUrl } = uploadResponse;
    console.log(`✅ Got document ID: ${documentId}`);

    // Step 2: Upload file to S3
    console.log('📁 Uploading file to S3...');
    const fileBuffer = fs.readFileSync(filePath);
    
    const uploadToS3 = new Promise((resolve, reject) => {
      const url = new URL(presignedUrl);
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'PUT',
        headers: {
          'Content-Type': fileType,
          'Content-Length': fileBuffer.length
        }
      };

      const req = https.request(options, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`S3 upload failed: ${res.statusCode}`));
        }
      });

      req.on('error', reject);
      req.write(fileBuffer);
      req.end();
    });

    await uploadToS3;
    console.log('✅ File uploaded to S3');

    // Step 3: Monitor processing
    console.log('⏳ Monitoring processing...');
    let attempts = 0;
    const maxAttempts = 30; // 2.5 minutes

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;

      const statusResponse = await makeRequest(`${API_BASE_URL}/documents/${documentId}`);
      
      if (statusResponse.error) {
        console.log(`⚠️  Status check failed: ${statusResponse.error}`);
        continue;
      }

      console.log(`📊 Status: ${statusResponse.status} | Stage: ${statusResponse.stage}`);

      if (statusResponse.status === 'completed') {
        console.log('🎉 Processing completed!');
        console.log(`📄 Extracted text: ${statusResponse.extractedText?.length || 0} characters`);
        console.log(`🏷️  Classification: ${statusResponse.classification || 'N/A'}`);
        console.log(`🔍 Entities: ${statusResponse.entities?.length || 0} found`);
        console.log(`📝 Summary: ${statusResponse.summary ? 'Generated' : 'N/A'}`);
        return;
      }

      if (statusResponse.status === 'failed') {
        console.log('❌ Processing failed');
        return;
      }
    }

    console.log('⏰ Timeout - processing taking longer than expected');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

quickTest();
