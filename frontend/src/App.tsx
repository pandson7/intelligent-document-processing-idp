import React, { useState, useCallback } from 'react';
import './App.css';

const API_BASE_URL = 'https://cgokmva617.execute-api.us-east-1.amazonaws.com/prod';

interface DocumentStage {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  timestamp?: number;
  result?: any;
  error?: string;
}

interface DocumentData {
  documentId: string;
  fileName: string;
  fileType: string;
  status: string;
  stage: string;
  extractedText?: string;
  classification?: string;
  entities?: Array<{text: string, type: string, confidence: number}>;
  summary?: string;
  stages: {
    upload: DocumentStage;
    extraction: DocumentStage;
    classification: DocumentStage;
    summarization: DocumentStage;
    display: DocumentStage;
  };
}

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [documentData, setDocumentData] = useState<DocumentData | null>(null);
  const [error, setError] = useState<string>('');

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      if (allowedTypes.includes(file.type)) {
        setSelectedFile(file);
        setError('');
      } else {
        setError('Please select a PDF, JPEG, or PNG file');
        setSelectedFile(null);
      }
    }
  }, []);

  const uploadFile = async (file: File, presignedUrl: string) => {
    const response = await fetch(presignedUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });
    
    if (!response.ok) {
      throw new Error('Failed to upload file to S3');
    }
  };

  const pollDocumentStatus = async (documentId: string) => {
    const maxAttempts = 60; // 5 minutes with 5-second intervals
    let attempts = 0;

    const poll = async (): Promise<void> => {
      try {
        const response = await fetch(`${API_BASE_URL}/documents/${documentId}`);
        if (response.ok) {
          const data = await response.json();
          setDocumentData(data);
          
          // Continue polling if not completed or failed
          if (data.status === 'processing' && attempts < maxAttempts) {
            attempts++;
            setTimeout(poll, 5000);
          }
        }
      } catch (error) {
        console.error('Error polling status:', error);
        if (attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, 5000);
        }
      }
    };

    poll();
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setError('');
    setDocumentData(null);

    try {
      // Step 1: Get presigned URL
      const uploadResponse = await fetch(`${API_BASE_URL}/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileType: selectedFile.type,
        }),
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { documentId, presignedUrl } = await uploadResponse.json();

      // Step 2: Upload file to S3
      await uploadFile(selectedFile, presignedUrl);

      // Step 3: Start polling for status
      pollDocumentStatus(documentId);

    } catch (error) {
      console.error('Upload error:', error);
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const getStageStatus = (stage: DocumentStage) => {
    switch (stage.status) {
      case 'completed':
        return '✅ Completed';
      case 'processing':
        return '⏳ Processing...';
      case 'failed':
        return '❌ Failed';
      default:
        return '⏸️ Pending';
    }
  };

  const getStageColor = (stage: DocumentStage) => {
    switch (stage.status) {
      case 'completed':
        return '#4CAF50';
      case 'processing':
        return '#FF9800';
      case 'failed':
        return '#F44336';
      default:
        return '#9E9E9E';
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>🔍 Intelligent Document Processing</h1>
        <p>5-Stage Pipeline: Upload → Extract → Classify → Summarize → Display</p>
      </header>

      <main className="App-main">
        {/* Stage 1: File Upload */}
        <div className="stage-section">
          <h2>📁 Stage 1: File Upload</h2>
          <div className="upload-area">
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileSelect}
              disabled={uploading}
            />
            {selectedFile && (
              <div className="file-info">
                <p><strong>Selected:</strong> {selectedFile.name}</p>
                <p><strong>Size:</strong> {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                <p><strong>Type:</strong> {selectedFile.type}</p>
              </div>
            )}
            <button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="upload-button"
            >
              {uploading ? 'Uploading...' : 'Upload & Process Document'}
            </button>
          </div>
          {error && <div className="error">{error}</div>}
        </div>

        {/* Pipeline Status */}
        {documentData && (
          <div className="pipeline-status">
            <h2>📊 Processing Pipeline Status</h2>
            <div className="stages-container">
              <div className="stage-item">
                <div className="stage-header" style={{ color: getStageColor(documentData.stages.upload) }}>
                  📁 Upload
                </div>
                <div className="stage-status">{getStageStatus(documentData.stages.upload)}</div>
              </div>

              <div className="stage-arrow">→</div>

              <div className="stage-item">
                <div className="stage-header" style={{ color: getStageColor(documentData.stages.extraction) }}>
                  📄 Extraction
                </div>
                <div className="stage-status">{getStageStatus(documentData.stages.extraction)}</div>
              </div>

              <div className="stage-arrow">→</div>

              <div className="stage-item">
                <div className="stage-header" style={{ color: getStageColor(documentData.stages.classification) }}>
                  🏷️ Classification
                </div>
                <div className="stage-status">{getStageStatus(documentData.stages.classification)}</div>
              </div>

              <div className="stage-arrow">→</div>

              <div className="stage-item">
                <div className="stage-header" style={{ color: getStageColor(documentData.stages.summarization) }}>
                  📝 Summarization
                </div>
                <div className="stage-status">{getStageStatus(documentData.stages.summarization)}</div>
              </div>

              <div className="stage-arrow">→</div>

              <div className="stage-item">
                <div className="stage-header" style={{ color: getStageColor(documentData.stages.display) }}>
                  📺 Display
                </div>
                <div className="stage-status">{getStageStatus(documentData.stages.display)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Stage 2: Data Extraction Results */}
        {documentData?.stages.extraction.status === 'completed' && documentData.extractedText && (
          <div className="stage-section">
            <h2>📄 Stage 2: Data Extraction (JSON Format)</h2>
            <div className="result-container">
              <h3>Extracted Text:</h3>
              <pre className="json-display">
                {JSON.stringify({ extractedText: documentData.extractedText }, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Stage 3: Classification Results */}
        {documentData?.stages.classification.status === 'completed' && documentData.classification && (
          <div className="stage-section">
            <h2>🏷️ Stage 3: Document Classification</h2>
            <div className="result-container">
              <h3>Classification Result:</h3>
              <div className="classification-result">
                <p><strong>Document Type:</strong> {documentData.classification}</p>
              </div>
              
              {documentData.entities && documentData.entities.length > 0 && (
                <>
                  <h3>Extracted Entities:</h3>
                  <div className="entities-list">
                    {documentData.entities.map((entity, index) => (
                      <div key={index} className="entity-item">
                        <span className="entity-text">{entity.text}</span>
                        <span className="entity-type">{entity.type}</span>
                        <span className="entity-confidence">{(entity.confidence * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Stage 4: Summarization Results */}
        {documentData?.stages.summarization.status === 'completed' && documentData.summary && (
          <div className="stage-section">
            <h2>📝 Stage 4: Document Summarization</h2>
            <div className="result-container">
              <h3>AI-Generated Summary:</h3>
              <div className="summary-result">
                <p>{documentData.summary}</p>
              </div>
            </div>
          </div>
        )}

        {/* Stage 5: Final Results Display */}
        {documentData?.stages.display.status === 'completed' && (
          <div className="stage-section">
            <h2>📺 Stage 5: Complete Results Display</h2>
            <div className="result-container">
              <div className="final-results">
                <div className="result-section">
                  <h3>📋 Document Information</h3>
                  <p><strong>File Name:</strong> {documentData.fileName}</p>
                  <p><strong>Document Type:</strong> {documentData.classification}</p>
                  <p><strong>Processing Status:</strong> {documentData.status}</p>
                </div>

                <div className="result-section">
                  <h3>📄 Extracted Content</h3>
                  <div className="extracted-text">
                    {documentData.extractedText?.substring(0, 500)}
                    {documentData.extractedText && documentData.extractedText.length > 500 && '...'}
                  </div>
                </div>

                <div className="result-section">
                  <h3>📝 Summary</h3>
                  <div className="summary-text">
                    {documentData.summary}
                  </div>
                </div>

                {documentData.entities && documentData.entities.length > 0 && (
                  <div className="result-section">
                    <h3>🏷️ Key Entities</h3>
                    <div className="entities-grid">
                      {documentData.entities.slice(0, 6).map((entity, index) => (
                        <div key={index} className="entity-card">
                          <div className="entity-name">{entity.text}</div>
                          <div className="entity-meta">{entity.type}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
