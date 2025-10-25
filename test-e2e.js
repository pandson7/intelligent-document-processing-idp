const fs = require('fs');
const path = require('path');
const https = require('https');

const API_BASE_URL = 'https://cgokmva617.execute-api.us-east-1.amazonaws.com/prod';

// Test files
const testFiles = [
  { name: 'Receipt_26Aug2025_084539.pdf', type: 'application/pdf' },
  { name: 'DriversLicense.jpeg', type: 'image/jpeg' },
  { name: 'Invoice.png', type: 'image/png' }
];

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

async function uploadFile(filePath, fileName, fileType) {
  console.log(`\n🔄 Testing ${fileName}...`);
  
  try {
    // Step 1: Get presigned URL
    console.log('  📤 Getting presigned URL...');
    const uploadResponse = await makeRequest(`${API_BASE_URL}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: fileName,
        fileType: fileType,
      }),
    });

    if (uploadResponse.error) {
      throw new Error(`Failed to get upload URL: ${uploadResponse.error}`);
    }

    const { documentId, presignedUrl } = uploadResponse;
    console.log(`  ✅ Got document ID: ${documentId}`);

    // Step 2: Upload file to S3
    console.log('  📁 Uploading file to S3...');
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
    console.log('  ✅ File uploaded to S3');

    // Step 3: Poll for processing status
    console.log('  ⏳ Polling for processing status...');
    let attempts = 0;
    const maxAttempts = 24; // 2 minutes with 5-second intervals

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;

      const statusResponse = await makeRequest(`${API_BASE_URL}/documents/${documentId}`);
      
      if (statusResponse.error) {
        console.log(`  ⚠️  Status check failed: ${statusResponse.error}`);
        continue;
      }

      console.log(`  📊 Status: ${statusResponse.status} | Stage: ${statusResponse.stage}`);

      // Check each stage
      const stages = statusResponse.stages || {};
      console.log(`    📁 Upload: ${stages.upload?.status || 'unknown'}`);
      console.log(`    📄 Extraction: ${stages.extraction?.status || 'unknown'}`);
      console.log(`    🏷️  Classification: ${stages.classification?.status || 'unknown'}`);
      console.log(`    📝 Summarization: ${stages.summarization?.status || 'unknown'}`);
      console.log(`    📺 Display: ${stages.display?.status || 'unknown'}`);

      if (statusResponse.status === 'completed') {
        console.log(`  🎉 Processing completed for ${fileName}!`);
        
        // Display results
        if (statusResponse.extractedText) {
          console.log(`  📄 Extracted text length: ${statusResponse.extractedText.length} characters`);
        }
        
        if (statusResponse.classification) {
          console.log(`  🏷️  Classification: ${statusResponse.classification}`);
        }
        
        if (statusResponse.entities && statusResponse.entities.length > 0) {
          console.log(`  🔍 Found ${statusResponse.entities.length} entities`);
          statusResponse.entities.slice(0, 3).forEach(entity => {
            console.log(`    - ${entity.text} (${entity.type})`);
          });
        }
        
        if (statusResponse.summary) {
          console.log(`  📝 Summary: ${statusResponse.summary.substring(0, 100)}...`);
        }
        
        return { success: true, documentId, data: statusResponse };
      }

      if (statusResponse.status === 'failed') {
        console.log(`  ❌ Processing failed for ${fileName}`);
        return { success: false, documentId, error: 'Processing failed' };
      }
    }

    console.log(`  ⏰ Timeout waiting for ${fileName} to complete`);
    return { success: false, documentId, error: 'Timeout' };

  } catch (error) {
    console.log(`  ❌ Error testing ${fileName}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('🚀 Starting End-to-End IDP Testing');
  console.log('=====================================');
  
  const results = [];
  
  for (const testFile of testFiles) {
    const filePath = path.join(__dirname, 'test-docs', testFile.name);
    const result = await uploadFile(filePath, testFile.name, testFile.type);
    results.push({ file: testFile.name, ...result });
  }
  
  console.log('\n📊 Test Results Summary');
  console.log('========================');
  
  let successCount = 0;
  results.forEach(result => {
    const status = result.success ? '✅ PASSED' : '❌ FAILED';
    console.log(`${status} - ${result.file}`);
    if (result.success) successCount++;
  });
  
  console.log(`\n🎯 Overall: ${successCount}/${results.length} tests passed`);
  
  if (successCount === results.length) {
    console.log('🎉 All tests passed! The 5-stage IDP pipeline is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Check the logs above for details.');
  }
}

// Run the tests
runTests().catch(console.error);
