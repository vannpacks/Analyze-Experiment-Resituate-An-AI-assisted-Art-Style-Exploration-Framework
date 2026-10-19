'use client';

import { Suspense, useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { StorageManager } from '../../utils/storageManager';
import { apiFetchJson } from '../../utils/api';
import SettingsButton from '../../components/SettingsButton';
import { DEFAULT_PROJECT_ID } from '../../utils/projectConfig';
import styles from './page.module.css';

function ArtworkUploadContent() {
  const [uploadedArtwork, setUploadedArtwork] = useState(null);
  const [referenceWork, setReferenceWork] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const artworkInputRef = useRef(null);
  const referenceInputRef = useRef(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('id') || DEFAULT_PROJECT_ID;

  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
  const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg']);

  const validateImageFile = (file) => {
    if (!file) {
      return { ok: false, message: 'No file selected' };
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return { ok: false, message: 'Only PNG/JPG images are allowed' };
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return { ok: false, message: 'File size must be less than 10MB' };
    }

    return { ok: true };
  };

  // Load existing images if any
  useEffect(() => {
    const loadExistingImages = async () => {
      if (!projectId) return;

      try {
        const projectImages = await StorageManager.createObjectURLsFromActiveImageSet(projectId);
        
        if (projectImages.referenceWork) {
          setReferenceWork(projectImages.referenceWork);
        }
        
        if (projectImages.uploadedArtwork) {
          setUploadedArtwork(projectImages.uploadedArtwork);
        }
      } catch (error) {
        console.error('Error loading existing images:', error);
      }
    };

    loadExistingImages();
  }, [projectId]);

  const handleArtworkUpload = async (event) => {
    const file = event.target.files[0];
    const validation = validateImageFile(file);
    if (!validation.ok) {
      alert(validation.message);
      event.target.value = '';
      return;
    }

    if (file) {
      try {
        const objectUrl = URL.createObjectURL(file);
        const base64Data = await StorageManager.convertToBase64(file);
        
        const imageData = {
          url: objectUrl,
          name: file.name,
          file: file,
          base64: base64Data
        };
        
        setUploadedArtwork(imageData);
        
        try {
          const { success, setId } = await StorageManager.saveProjectImageSet(
            projectId,
            referenceWork,
            imageData,
            null,
            'temporary',
            null // iteration_id will be set after upload
          );
          
          if (success) {
            setUploadedArtwork(prev => ({ ...prev, setId, status: 'temporary' }));
          }
        } catch (storageError) {
          console.warn('Failed to save to project storage:', storageError);
        }
        
      } catch (error) {
        console.error('Error converting file to base64:', error);
        alert('Error processing image. Please try again.');
      }
    }
  };

  const handleReferenceUpload = async (event) => {
    const file = event.target.files[0];
    const validation = validateImageFile(file);
    if (!validation.ok) {
      alert(validation.message);
      event.target.value = '';
      return;
    }

    if (file) {
      try {
        const objectUrl = URL.createObjectURL(file);
        const base64Data = await StorageManager.convertToBase64(file);
        
        const imageData = {
          url: objectUrl,
          name: file.name,
          file: file,
          base64: base64Data
        };
        
        setReferenceWork(imageData);
        
        try {
          const { success, setId } = await StorageManager.saveProjectImageSet(
            projectId,
            imageData,
            uploadedArtwork,
            null,
            'temporary',
            null // iteration_id will be set after upload
          );
          
          if (success) {
            setReferenceWork(prev => ({ ...prev, setId, status: 'temporary' }));
          }
        } catch (storageError) {
          console.warn('Failed to save to project storage:', storageError);
        }
        
      } catch (error) {
        console.error('Error converting file to base64:', error);
        alert('Error processing image. Please try again.');
      }
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const handleArtworkDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    const validation = validateImageFile(file);
    if (!validation.ok) {
      alert(validation.message);
      return;
    }

    if (file) {
      const fakeEvent = { target: { files: [file] } };
      handleArtworkUpload(fakeEvent);
    }
  };

  const handleReferenceDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    const validation = validateImageFile(file);
    if (!validation.ok) {
      alert(validation.message);
      return;
    }

    if (file) {
      const fakeEvent = { target: { files: [file] } };
      handleReferenceUpload(fakeEvent);
    }
  };

  const resetUpload = async () => {
    if (uploadedArtwork?.url?.startsWith('blob:')) {
      URL.revokeObjectURL(uploadedArtwork.url);
    }
    if (referenceWork?.url?.startsWith('blob:')) {
      URL.revokeObjectURL(referenceWork.url);
    }
    
    try {
      await StorageManager.clearSessionStorageOnly();
    } catch (error) {
      console.warn('Error clearing storage:', error);
    }
    
    setUploadedArtwork(null);
    setReferenceWork(null);
  };

  const handleClearAll = async () => {
    try {
      await StorageManager.clearAllStorage();
      alert('Successfully cleared all session Storage.');
      window.location.reload();
    } catch (error) {
      alert('Cleared failed.');
    }
  };

  const handleNextClick = async () => {
    if (!uploadedArtwork?.base64 || !referenceWork?.base64) return;

    setIsLoading(true);
    
    await StorageManager.clearSessionStorageOnly();
    
    try {
      const payload = {
        reference_image: {
          name: referenceWork.name,
          data: referenceWork.base64
        },
        user_image: {
          name: uploadedArtwork.name,
          data: uploadedArtwork.base64
        },
        project_id: projectId
      };

      console.log('Sending base64 data to API with projectId:', projectId);

      const data = await apiFetchJson('/style/upload_base64', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      
      console.log('Upload response:', data);
      
      // Extract iteration_id from response
      const iterationId = data.iteration_id;
      const referenceImageId = data.reference_image_id;
      const userImageId = data.user_image_id;
      
      if (!iterationId) {
        console.error('No iteration_id returned from backend');
        throw new Error('Backend did not return iteration_id');
      }
      
      console.log('Received iteration_id:', iterationId);
      
      const analysisData = {
        technical_analysis: data.technical_analysis,
        conceptual_analysis: data.conceptual_analysis
      };
      
      const newProjectIds = {
        reference_image_id: referenceImageId,
        user_image_id: userImageId,
        iteration_id: iterationId,
        project_id: projectId,
        uploadTimestamp: new Date().toISOString()
      };

      // Save images with backend IDs and iteration_id to project storage
      const { success, setId } = await StorageManager.saveProjectImageSet(
        projectId,
        {
          name: referenceWork.name,
          base64: referenceWork.base64,
          file: referenceWork.file
        },
        {
          name: uploadedArtwork.name,
          base64: uploadedArtwork.base64,
          file: uploadedArtwork.file
        },
        null,
        'generated',
        iterationId
      );

      if (success) {
        // Update image set with backend IDs and iteration_id
        await StorageManager.updateImageSetStatus(projectId, setId, 'generated', {
          reference_image_id: referenceImageId,
          user_image_id: userImageId,
          iteration_id: iterationId
        });

        // FIX: Store the setId in sessionStorage so analysis page can load it
        sessionStorage.setItem(`last_set_${projectId}`, setId);
        console.log(`[FIX] Stored setId in sessionStorage: last_set_${projectId} = ${setId}`);
      }

      // Save to project-based storage with the analysis data, backend IDs, and iteration_id
      await StorageManager.saveAnalysisPageState({
        analysisData,
        projectIds: newProjectIds,
        referenceWork: {
          ...referenceWork,
          setId,
          status: 'generated',
          iteration_id: iterationId
        },
        uploadedArtwork: {
          ...uploadedArtwork,
          setId,
          status: 'generated',
          iteration_id: iterationId
        },
        generationResult: null,
        userInput: '',
        droppedReferences: [],
        selectedImageIndex: null,
        showResultsPanel: false,
        generatingImages: false,
        generationFeedback: [],
        skipGenerationSave: true
      });

      // New iteration started: keep only the newest generation/feedback history
      await StorageManager.pruneProjectHistory(projectId, 15, 15);

      // Pass the file objects through window object for immediate use
      const analysisDataForWindow = {
        analysis: data,
        iterationId: iterationId,
        referenceWork: {
          name: referenceWork.name,
          file: referenceWork.file
        },
        uploadedArtwork: {
          name: uploadedArtwork.name,
          file: uploadedArtwork.file
        }
      };

      window.__appData = analysisDataForWindow;

      // Navigate to analysis page with projectId
      router.push(`/project/analysis/?id=${encodeURIComponent(projectId)}`);
    } catch (error) {
      console.error('Error uploading images:', error);
      alert(error.message || 'Failed to upload images. Please try again.');
    } finally {
      setIsLoading(false);
    }

  };

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (uploadedArtwork?.url?.startsWith('blob:')) {
        URL.revokeObjectURL(uploadedArtwork.url);
      }


      if (referenceWork?.url?.startsWith('blob:')) {
        URL.revokeObjectURL(referenceWork.url);
      }
    };
  }, [uploadedArtwork, referenceWork]);

  useEffect(() => {
    console.log('Upload page loaded with projectId:', projectId);
  }, [projectId]);

  return (
    <div className={styles.container}>
      {isLoading && <LoadingOverlay />}
      
      <div className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>✦</span>
          <span className={styles.logoText}>Style-AER</span>
        </div>
        <div className={styles.projectInfo}>
          <button 
            className={styles.restoreButton}
            onClick={handleClearAll}
            title="Clear All Sessions"
          >
            Clear All Sessions
          </button>
          <SettingsButton />
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.workSection}>
          {/* Left Panel - Reference Work */}
          <div className={styles.leftPanel}>
            <h2 className={styles.sectionTitle}>Reference Work</h2>
            {referenceWork ? (
              <div className={styles.artworkContainer}>
                <img 
                  src={referenceWork.url || referenceWork.base64} 
                  alt="Reference work"
                  className={styles.artworkImage}
                />
                <button 
                  className={styles.resetButton}
                  onClick={() => {
                    if (referenceWork.url?.startsWith('blob:')) {
                      URL.revokeObjectURL(referenceWork.url);
                    }
                    setReferenceWork(null);
                  }}
                  title="Remove reference work"
                >
                  ×
                </button>
              </div>
            ) : (
              <div 
                className={styles.dropZone}
                onDragOver={handleDragOver}
                onDrop={handleReferenceDrop}
                onClick={() => referenceInputRef.current?.click()}
              >
                <div className={styles.dropContent}>
                  <p className={styles.dropText}>Drag and drop reference work here</p>
                  <p className={styles.orText}>Or click to upload</p>
                  <button className={styles.browseButton}>
                    Browse Files
                  </button>
                </div>
              </div>
            )}
            <input
              ref={referenceInputRef}
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleReferenceUpload}
              className={styles.hiddenInput}
            />
          </div>

          {/* Right Panel - Your Artwork */}
          <div className={styles.rightPanel}>
            <h2 className={styles.sectionTitle}>Your Work</h2>
            {uploadedArtwork ? (
              <div className={styles.artworkContainer}>
                <img 
                  src={uploadedArtwork.url || uploadedArtwork.base64} 
                  alt="Uploaded artwork"
                  className={styles.artworkImage}
                />
                <button 
                  className={styles.resetButton}
                  onClick={() => {
                    if (uploadedArtwork.url?.startsWith('blob:')) {
                      URL.revokeObjectURL(uploadedArtwork.url);
                    }
                    setUploadedArtwork(null);
                  }}
                  title="Remove your work"
                >
                  ×
                </button>
              </div>
            ) : (
              <div 
                className={styles.dropZone}
                onDragOver={handleDragOver}
                onDrop={handleArtworkDrop}
                onClick={() => artworkInputRef.current?.click()}
              >
                <div className={styles.dropContent}>
                  <p className={styles.dropText}>Drag and drop your artwork here</p>
                  <p className={styles.orText}>Or click to upload</p>
                  <button className={styles.browseButton}>
                    Browse Files
                  </button>
                </div>
              </div>
            )}
            <input
              ref={artworkInputRef}
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleArtworkUpload}
              className={styles.hiddenInput}
            />
          </div>
        </div>
      </div>

      {/* Next Button */}
      {uploadedArtwork && referenceWork && !isLoading && (
        <div className={styles.nextButtonContainer}>
          <button 
            className={styles.nextButton}
            onClick={handleNextClick}
            disabled={isLoading}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// Loading Overlay Component
function LoadingOverlay() {
  return (
    <div className={styles.loadingOverlay}>
      <div className={styles.loadingContent}>
        <div className={styles.spinner}></div>
        <p className={styles.loadingText}>Analyzing Artwork...</p>
      </div>
    </div>
  );
}

export default function ArtworkUpload() {
  return (
    <Suspense fallback={<div>Loading project...</div>}>
      <ArtworkUploadContent />
    </Suspense>
  );
}