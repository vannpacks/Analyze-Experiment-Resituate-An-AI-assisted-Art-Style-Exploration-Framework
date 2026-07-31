'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { StorageManager } from '../../../../../utils/storageManager';
import styles from './ResultsPanel.module.css';

export default function ResultsPanel({
  generationResult,
  generatingImages,
  replacingImage,
  selectedImageIndex,
  setSelectedImageIndex,
  previewImageIndex,
  setPreviewImageIndex,
  gettingFeedback,
  onGetFeedback,
  saveCurrentState,
  uploadedArtwork,
  referenceWork,
  projectId,
  onReplaceImage,  // NEW: Callback to replace images in AnalysisContent
  onResultComment,
}) {
  // History state management
  const [generationHistory, setGenerationHistory] = useState([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Track original image AND reference image for current generation
  const [currentOriginalImage, setCurrentOriginalImage] = useState(null);
  const [currentReferenceImage, setCurrentReferenceImage] = useState(null);
  const [loadingOriginalImage, setLoadingOriginalImage] = useState(false);
  const [loadingReferenceImage, setLoadingReferenceImage] = useState(false);

  // NEW: Image action menu state with position
  const [imageActionMenu, setImageActionMenu] = useState(null); // { imageIndex, top, left, imageUrl, etc. }
  const actionButtonRefs = useRef({}); // Store refs for each button
  const [previewFeedbackState, setPreviewFeedbackState] = useState({});
  const [previewFeedbackHydrated, setPreviewFeedbackHydrated] = useState(false);
  const [commentDialogState, setCommentDialogState] = useState({
    isOpen: false,
    generatedImageId: null,
    content: null,
    userComment: '',
  });

  // Track previous generatingImages state to detect when generation starts
  const prevGeneratingRef = useRef(generatingImages);

  useEffect(() => {
    if (!projectId) {
      setPreviewFeedbackHydrated(false);
      return;
    }

    const loadPreviewFeedbackState = async () => {
      try {
        const stored = await StorageManager.loadFromIndexedDB(`result_feedback_state_${projectId}`, true);
        if (stored && typeof stored === 'object') {
          setPreviewFeedbackState(stored);
        }
      } catch (error) {
        console.error('Failed to load result feedback state:', error);
      } finally {
        setPreviewFeedbackHydrated(true);
      }
    };

    loadPreviewFeedbackState();
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !previewFeedbackHydrated) return;

    const persistPreviewFeedbackState = async () => {
      try {
        await StorageManager.saveToIndexedDB(`result_feedback_state_${projectId}`, previewFeedbackState, true);
      } catch (error) {
        console.error('Failed to save result feedback state:', error);
      }
    };

    persistPreviewFeedbackState();
  }, [projectId, previewFeedbackState, previewFeedbackHydrated]);

  // Load generation history on mount and when new results come in
  useEffect(() => {
    if (!projectId) return;
    
    const loadHistory = async () => {
      setLoadingHistory(true);
      try {
        const history = await StorageManager.loadProjectGenerationHistory(projectId);
        
        // Reverse to make it oldest -> newest (so newest appears on the right like FeedbackPanel)
        const ordered = [...history].reverse();
        setGenerationHistory(ordered);
        
        // If not generating, show the latest (rightmost)
        if (generationResult && ordered.length > 0 && !generatingImages) {
          setCurrentHistoryIndex(ordered.length - 1);
        }
      } catch (error) {
        console.error('Error loading history:', error);
      } finally {
        setLoadingHistory(false);
      }
    };

    loadHistory();
  }, [projectId, generationResult, generatingImages]);

  // Reset to rightmost index when generation FIRST starts (one-time reset)
  useEffect(() => {
    if (generatingImages && !prevGeneratingRef.current) {
      console.log('New generation started, showing generating card at rightmost position');
      // Generating card is appended to the end (rightmost)
      setCurrentHistoryIndex(generationHistory.length);
    }
    prevGeneratingRef.current = generatingImages;
  }, [generatingImages, generationHistory.length]);


  // Load both original image AND reference image when history index changes
  useEffect(() => {
    if (!projectId) {
      setCurrentOriginalImage(null);
      setCurrentReferenceImage(null);
      return;
    }

    const loadImages = async () => {
      setLoadingOriginalImage(true);
      setLoadingReferenceImage(true);
      try {
        console.log('Loading images for historyIndex:', currentHistoryIndex);
        
        const generatingIndex = generationHistory.length; // rightmost when generating
        
        if (generatingImages && currentHistoryIndex === generatingIndex) {
          console.log('Using current uploaded artwork and reference (generating)');
          setCurrentOriginalImage(uploadedArtwork);
          setCurrentReferenceImage(referenceWork);
          setLoadingOriginalImage(false);
          setLoadingReferenceImage(false);
          return;
        }

        if (generationHistory.length === 0) {
          console.log('No history, using current images');
          setCurrentOriginalImage(uploadedArtwork);
          setCurrentReferenceImage(referenceWork);
          setLoadingOriginalImage(false);
          setLoadingReferenceImage(false);
          return;
        }

        const currentGenerationData = getHistoryItemForIndex(currentHistoryIndex);
        console.log('Current generation data:', currentGenerationData);

        if (currentHistoryIndex === generationHistory.length - 1 && !generatingImages && uploadedArtwork && referenceWork) {
          if (currentGenerationData?.image_set_id && 
              uploadedArtwork?.setId && 
              currentGenerationData.image_set_id === uploadedArtwork.setId) {
            console.log('Using current images (same set)');
            setCurrentOriginalImage(uploadedArtwork);
            setCurrentReferenceImage(referenceWork);
            setLoadingOriginalImage(false);
            setLoadingReferenceImage(false);
            return;
          }
        }

        if (currentGenerationData?.image_set_id) {
          const setKey = `imageset_${projectId}_${currentGenerationData.image_set_id}`;
          console.log('Loading image set:', setKey);
          
          const imageSetData = await StorageManager.loadFromIndexedDB(setKey, true);
          console.log('Loaded image set data:', imageSetData);
          
          if (imageSetData?.uploadedArtwork?.base64) {
            try {
              const base64Data = imageSetData.uploadedArtwork.base64;
              const response = await fetch(base64Data);
              const blob = await response.blob();
              const objectUrl = URL.createObjectURL(blob);
              
              const historicalImage = {
                url: objectUrl,
                name: imageSetData.uploadedArtwork.name || 'Historical Image',
                base64: base64Data,
                setId: currentGenerationData.image_set_id,
                status: imageSetData.status,
                isHistorical: true
              };
              
              console.log('Created historical original image:', historicalImage.name);
              setCurrentOriginalImage(historicalImage);
              setLoadingOriginalImage(false);
            } catch (error) {
              console.error('Error creating historical original image URL:', error);
              // For historical entries, show placeholder instead of falling back to current image
              setCurrentOriginalImage(null);
              setLoadingOriginalImage(false);
            }
          } else {
            console.warn('No uploadedArtwork.base64 found in image set');
            // For historical entries, show placeholder instead of falling back to current image
            setCurrentOriginalImage(null);
            setLoadingOriginalImage(false);
          }

          if (imageSetData?.referenceWork?.base64) {
            try {
              const base64Data = imageSetData.referenceWork.base64;
              const response = await fetch(base64Data);
              const blob = await response.blob();
              const objectUrl = URL.createObjectURL(blob);
              
              const historicalReference = {
                url: objectUrl,
                name: imageSetData.referenceWork.name || 'Historical Reference',
                base64: base64Data,
                setId: currentGenerationData.image_set_id,
                status: imageSetData.status,
                isHistorical: true
              };
              
              console.log('Created historical reference image:', historicalReference.name);
              setCurrentReferenceImage(historicalReference);
              setLoadingReferenceImage(false);
            } catch (error) {
              console.error('Error creating historical reference image URL:', error);
              // For historical entries, show placeholder instead of falling back to current image
              setCurrentReferenceImage(null);
              setLoadingReferenceImage(false);
            }
          } else {
            console.warn('No referenceWork.base64 found in image set');
            // For historical entries, show placeholder instead of falling back to current image
            setCurrentReferenceImage(null);
            setLoadingReferenceImage(false);
          }
        } else {
          console.warn('No image_set_id found in generation data');
          // For historical entries, show placeholder instead of falling back to current images
          setCurrentOriginalImage(null);
          setCurrentReferenceImage(null);
          setLoadingOriginalImage(false);
          setLoadingReferenceImage(false);
        }
        
      } catch (error) {
        console.error('Error loading images:', error);
        // For historical entries, show placeholder instead of falling back to current images
        setCurrentOriginalImage(null);
        setCurrentReferenceImage(null);
        setLoadingOriginalImage(false);
        setLoadingReferenceImage(false);
      }
    };

    loadImages();
  }, [currentHistoryIndex, generationHistory, uploadedArtwork, referenceWork, generatingImages, projectId]);

  // NEW: Handle image action button click
  const handleImageActionClick = (e, imageIndex, item) => {
    if (replacingImage) return;
    e.stopPropagation();
    
    // Toggle menu - if already open for this item, close it
    if (imageActionMenu?.imageIndex === imageIndex) {
      setImageActionMenu(null);
      return;
    }
    
    // Get button position for portal positioning
    const button = actionButtonRefs.current[imageIndex];
    if (button) {
      const rect = button.getBoundingClientRect();
      setImageActionMenu({
        imageIndex,
        imageUrl: item.images,
        generated_image_id: item.generated_image_id,
        item: item,
        sourceType: 'generated',
        top: rect.bottom + 8,  // 8px below button
        left: rect.left
      });
    }
  };

  // NEW: Handle replace image action
  const handleReplaceImage = async (targetType) => {
    if (!imageActionMenu || !onReplaceImage) return;
    setImageActionMenu(null);
    
    try {
      // Create image data object with generated_image_id
      const imageData = {
        generated_image_id: imageActionMenu.generated_image_id,
        images: imageActionMenu.imageUrl,
        url: imageActionMenu.imageUrl,
        user_image_id: imageActionMenu.item.user_image_id,
        iteration_id: imageActionMenu.item.iteration_id,
        sourceType: 'generated_result'
      };

      console.log('Replacing image with data:', imageData);

      // Call the replacement callback with generated_image_id
      const replaceType = targetType === 'reference'
        ? 'replace_reference_genResult_Demonstrate'
        : 'replace_user_image_genResult_Demonstrate';

      await onReplaceImage(targetType, imageData, replaceType);
    } catch (error) {
      console.error('Error replacing image:', error);
      alert('Failed to replace image. Please try again.');
    }
  };

  // Close menu on scroll or click outside
  useEffect(() => {
    if (!imageActionMenu) return;

    const handleScroll = () => {
      setImageActionMenu(null);
    };

    const handleClickOutside = () => {
      setImageActionMenu(null);
    };

    // Add scroll listener with capture to catch all scroll events
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    document.addEventListener('click', handleClickOutside);
    
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [imageActionMenu]);

  useEffect(() => {
    if (replacingImage) {
      setImageActionMenu(null);
    }
  }, [replacingImage]);

  // Helper to get history item with proper offset during generation
  const getHistoryItemForIndex = (idx) => {
    if (!generationHistory.length) return null;

    // When generating, the last index is the live card, so history exists only below it
    if (generatingImages && idx >= generationHistory.length) return null;

    return generationHistory[idx] || null;
  };

  // Get current generation based on history index
  const getCurrentGeneration = () => {
    const generatingIndex = generationHistory.length; // rightmost when generating
    
    // Live generating card is at the rightmost position
    if (generatingImages && currentHistoryIndex === generatingIndex) {
      // Return live data even if empty -> spinners render immediately
      return generationResult || { items: [] };
    }

    const historyItem = getHistoryItemForIndex(currentHistoryIndex);
    if (!historyItem) return null;

    // Support both formats just in case
    if (Array.isArray(historyItem.items)) return historyItem;
    if (historyItem.generationResult?.items) return historyItem.generationResult;

    return null;
  };

  const getCurrentGenerationData = () => {
    const generatingIndex = generationHistory.length; // rightmost when generating
    if (generatingImages && currentHistoryIndex === generatingIndex) return null;
    return getHistoryItemForIndex(currentHistoryIndex);
  };

  const currentGeneration = getCurrentGeneration();
  const previewNavigableIndexes = (currentGeneration?.items || [])
    .map((item, index) => (item?.images ? index : -1))
    .filter((index) => index !== -1);
  const currentPreviewNavPosition = previewNavigableIndexes.indexOf(previewImageIndex);
  const hasPreviousPreview = currentPreviewNavPosition > 0;
  const hasNextPreview = currentPreviewNavPosition >= 0 && currentPreviewNavPosition < previewNavigableIndexes.length - 1;

  const getTotalCarouselItems = () => {
    const historyCount = generationHistory.length;
    return generatingImages ? historyCount + 1 : Math.max(historyCount, 1);
  };

  const handleImageClick = (imageIndex) => {
    if (!currentGeneration?.items?.[imageIndex]) return;
    const newIndex = selectedImageIndex === imageIndex ? null : imageIndex;
    setSelectedImageIndex(newIndex);
    if (saveCurrentState) {
      saveCurrentState(true, true);
    }
  };

  const handlePreviewClick = (e, imageIndex) => {
    e.stopPropagation();
    if (!currentGeneration?.items?.[imageIndex]) return;
    setPreviewImageIndex(imageIndex);
  };

  const closePreview = () => {
    setPreviewImageIndex(null);
  };

  const handlePreviewOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      closePreview();
    }
  };

  const handlePreviousPreview = () => {
    if (!hasPreviousPreview) return;
    setPreviewImageIndex(previewNavigableIndexes[currentPreviewNavPosition - 1]);
  };

  const handleNextPreview = () => {
    if (!hasNextPreview) return;
    setPreviewImageIndex(previewNavigableIndexes[currentPreviewNavPosition + 1]);
  };

  const handleConfirmSelect = () => {
    // Allow getting feedback for images that have already arrived
    if (selectedImageIndex !== null && currentGeneration?.items?.[selectedImageIndex] && !gettingFeedback) {
      const currentGenerationData = getCurrentGenerationData();
      onGetFeedback({
        currentGeneration,
        currentHistoryIndex,
        currentGenerationData,
        selectedImageIndex,
      });
    }
  };

  const handlePreviousGeneration = () => {
    if (currentHistoryIndex > 0) {
      setCurrentHistoryIndex(currentHistoryIndex - 1);
      setSelectedImageIndex(null);
    }
  };

  const handleNextGeneration = () => {
    const maxIndex = getTotalCarouselItems() - 1;
    if (currentHistoryIndex < maxIndex) {
      setCurrentHistoryIndex(currentHistoryIndex + 1);
      setSelectedImageIndex(null);
    }
  };

  const renderCarouselDots = () => {
    const totalItems = getTotalCarouselItems();
    const dots = [];
    
    for (let i = 0; i < totalItems; i++) {
      const isActive = i === currentHistoryIndex;
      const isLoading = i === generationHistory.length && generatingImages; // rightmost when generating
      
      dots.push(
        <div
          key={i}
          className={`${styles.carouselDot} ${isActive ? styles.active : ''} ${isLoading ? styles.loading : ''}`}
          onClick={() => {
            setCurrentHistoryIndex(i);
            setSelectedImageIndex(null);
          }}
          title={isLoading ? 'Generating...' : `Generation ${i + 1}`}
        />
      );
    }
    
    return dots;
  };

  const renderDescription = (description) => {
    if (!description) return 'No description available';
    
    if (typeof description === 'object' && description.focus && description.target_effect && description.description) {
      return (
        <div className={styles.structuredDescription}>
          {description.focus && description.focus.length > 0 && (
            <div className={styles.focusSection}>
              {description.focus.map((focusItem, index) => (
                <span key={index} className={styles.focusAspect}>
                  {focusItem}
                </span>
              ))}
            </div>
          )}
          
          {description.target_effect && (
            <div className={styles.targetEffectSection}>
              <strong>Target Effect</strong>: {description.target_effect}
            </div>
          )}
          
          {description.description && (
            <div className={styles.descriptionSection}>
              <strong>Description</strong>: {description.description}
            </div>
          )}
        </div>
      );
    }
    
    return typeof description === 'string' ? description : 'No description available';
  };

  const buildResultCommentContent = (description) => {
    if (typeof description === 'object' && description !== null) {
      return {
        focusAspect: Array.isArray(description.focus) ? description.focus : [],
        TargetEffect: description.target_effect || '',
        Description: description.description || '',
      };
    }

    return {
      focusAspect: [],
      TargetEffect: '',
      Description: typeof description === 'string' ? description : '',
    };
  };

  const getResultFeedbackKey = (iterationId, generatedImageId) => {
    const safeIteration = iterationId ?? 'no_iteration';
    return `${safeIteration}:${generatedImageId}`;
  };

  const sendResultComment = async ({ commentType, generatedImageId, content, userComment = '' }) => {
    if (!onResultComment) return;

    const payloadContent = {
      ...content,
    };

    if (userComment) {
      payloadContent.userComment = userComment;
    }

    await onResultComment({
      comment_type: commentType,
      image_id: generatedImageId,
      content: payloadContent,
    });
  };

  const handlePreviewThumbToggle = async ({ feedbackKey, generatedImageId, targetState, content }) => {
    const currentState = previewFeedbackState[feedbackKey] || null;
    const isDeactivating = currentState === targetState;
    const nextState = isDeactivating ? null : targetState;

    setPreviewFeedbackState((prev) => ({
      ...prev,
      [feedbackKey]: nextState,
    }));

    const commentType = targetState === 'up'
      ? (isDeactivating ? 'Deactivate-Thumbs-up' : 'Thumbs-up')
      : (isDeactivating ? 'Deactivate-Thumbs-down' : 'Thumbs-down');

    await sendResultComment({
      commentType,
      generatedImageId,
      content,
    });
  };

  const openCommentDialog = ({ generatedImageId, content }) => {
    setCommentDialogState({
      isOpen: true,
      generatedImageId,
      content,
      userComment: '',
    });
  };

  const closeCommentDialog = () => {
    setCommentDialogState({
      isOpen: false,
      generatedImageId: null,
      content: null,
      userComment: '',
    });
  };

  const handleCommentSend = async () => {
    const trimmedComment = commentDialogState.userComment.trim();
    if (
      !trimmedComment ||
      commentDialogState.generatedImageId === null ||
      commentDialogState.generatedImageId === undefined ||
      !commentDialogState.content
    ) return;

    await sendResultComment({
      commentType: 'Comment',
      generatedImageId: commentDialogState.generatedImageId,
      content: commentDialogState.content,
      userComment: trimmedComment,
    });

    closeCommentDialog();
  };

  if (!generationResult && !generatingImages && generationHistory.length === 0) {
    return null;
  }

  return (
    <>
      <div className={styles.resultsSection}>
        <div className={styles.resultsPanel}>
          <div className={styles.resultsHeader}>
            <h3 className={styles.resultsSectionTitle}>Simulated Styles</h3>
          </div>
          
          <div className={styles.resultsGrid}>
            <div className={styles.imagesSection}>
              <div className={styles.imagesGrid}>
                {/* PROGRESSIVE RENDERING: Show images as they arrive, spinners for pending slots */}
                {Array.from({ length: 4 }).map((_, slotIndex) => {
                  const generatingIndex = generationHistory.length;
                  const isGeneratingLatest = generatingImages && currentHistoryIndex === generatingIndex;
                  const item = isGeneratingLatest 
                    ? generationResult?.items?.[slotIndex]  
                    : currentGeneration?.items?.[slotIndex];

                  if (item) {
                    return (
                      <div 
                        key={slotIndex}
                        className={`${styles.gridImageContainer} ${selectedImageIndex === slotIndex ? styles.selected : ''}`}
                        onClick={() => handleImageClick(slotIndex)}
                      >
                        <img 
                          src={item.images} 
                          alt={`Generated result ${slotIndex + 1}`}
                          className={styles.gridImage}
                          onError={(e) => {
                            console.error('Failed to load generated image:', e);
                          }}
                        />
                        {!generatingImages && (
                          <div className={styles.imageActionContainer}>
                            <button
                              ref={(el) => (actionButtonRefs.current[slotIndex] = el)}
                              className={styles.imageActionButton}
                              onClick={(e) => handleImageActionClick(e, slotIndex, item)}
                              disabled={replacingImage}
                              title="Replace image"
                            >
                              ⋮
                            </button>
                          </div>
                        )}
                        
                        {selectedImageIndex === slotIndex && (
                          <button 
                            className={styles.magnifyButton}
                            onClick={(e) => handlePreviewClick(e, slotIndex)}
                            title="Preview comparison"
                          >
                            ⌕
                          </button>
                        )}
                      </div>
                    );
                  }
                  
                  // Slot is empty but we're still generating - show spinner
                  if (isGeneratingLatest) {
                    return (
                      <div key={`loading-${slotIndex}`} className={styles.gridImageContainer}>
                        <div className={styles.imageLoadingSpinner}>
                          <div className={styles.spinner}></div>
                        </div>
                      </div>
                    );
                  }
                  
                  // Slot is empty and not generating - show empty slot
                  return (
                    <div key={`empty-${slotIndex}`} className={styles.gridImageContainer}>
                      <div className={styles.emptySlot}>
                        <p>Empty</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={styles.descriptionPanel}>
              <div className={styles.variationInfo}>
                {(generatingImages && currentHistoryIndex === generationHistory.length) ? (
                  <div className={styles.placeholderText}>
                    <div className={styles.spinner}></div>
                    <h3>Generating Images...</h3>
                    <p>Please wait while we create your style variations</p>
                  </div>
                ) : selectedImageIndex !== null && currentGeneration?.items ? (
                  <>
                    <h3 className={styles.variationTitle}>
                      Variation {selectedImageIndex + 1}
                    </h3>
                    <div className={styles.variationDescription}>
                      {renderDescription(currentGeneration.items[selectedImageIndex]?.description)}
                    </div>
                  </>
                ) : (
                  <div className={styles.placeholderText}>
                    <h3>Select an Image</h3>
                    <p>Click on any illustration simulation to see its description</p>
                  </div>
                )}
              </div>
              
              <button 
                className={styles.confirmSelectButton}
                onClick={handleConfirmSelect}
                disabled={
                  selectedImageIndex === null || 
                  gettingFeedback || 
                  !currentGeneration?.items?.[selectedImageIndex] ||
                  (generatingImages && currentHistoryIndex === generationHistory.length) // Disable when viewing generating card
                }
              >
                {gettingFeedback 
                  ? 'Getting feedback...' 
                  : (generatingImages && currentHistoryIndex === generationHistory.length)
                    ? 'Generating...'
                  : selectedImageIndex !== null && currentGeneration?.items?.[selectedImageIndex]
                    ? `Get Simulated Audience Feedback (Variation ${selectedImageIndex + 1})` 
                    : 'Get Simulated Audience Feedback'
                }
              </button>
            </div>
          </div>

          {getTotalCarouselItems() > 1 && (
            <div className={styles.carouselNavigation}>
              <button 
                className={styles.carouselButton}
                onClick={handlePreviousGeneration}
                disabled={currentHistoryIndex === 0}
                title="Previous generation (older)"
              >
                ←
              </button>

              <div className={styles.carouselDots}>
                {renderCarouselDots()}
              </div>

              <button 
                className={styles.carouselButton}
                onClick={handleNextGeneration}
                disabled={currentHistoryIndex === getTotalCarouselItems() - 1}
                title="Next generation (newer)"
              >
                →
              </button>
            </div>
          )}

          {loadingHistory && (
            <div style={{ textAlign: 'center', padding: '10px', color: '#888' }}>
              Loading generation history...
            </div>
          )}
        </div>
      </div>

      {/* Image Comparison Preview with THREE images */}
      {previewImageIndex !== null && currentGeneration?.items[previewImageIndex] && (
        <div className={styles.previewOverlay} onClick={handlePreviewOverlayClick}>
          <div className={styles.previewContainer}>
            <button 
              className={styles.closePreviewButton}
              onClick={closePreview}
              title="Close preview"
            >
              ×
            </button>
            
            <div className={styles.comparisonContainer}>
              <div className={styles.leftStackColumn}>
                <div className={styles.comparisonSection}>
                  <div className={styles.comparisonHeader}>
                    <h3 className={styles.comparisonTitle}>Reference Artwork</h3>
                  </div>
                  <div className={styles.comparisonImageContainer}>
                    {loadingReferenceImage ? (
                      <div className={styles.comparisonImagePlaceholder}>
                        <div className={styles.spinner} style={{ width: '24px', height: '24px' }}></div>
                        <p>Loading reference...</p>
                      </div>
                    ) : currentReferenceImage?.url || currentReferenceImage?.base64 ? (
                      <img 
                        src={currentReferenceImage.url || currentReferenceImage.base64} 
                        alt="Reference artwork"
                        className={styles.comparisonImage}
                        onError={(e) => {
                          console.error('Failed to load reference artwork:', e);
                        }}
                      />
                    ) : (
                      <div className={styles.comparisonImagePlaceholder}>
                        <p>Reference not available</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.comparisonSection}>
                  <div className={styles.comparisonHeader}>
                    <h3 className={styles.comparisonTitle}>Your Artwork</h3>
                  </div>
                  <div className={styles.comparisonImageContainer}>
                    {loadingOriginalImage ? (
                      <div className={styles.comparisonImagePlaceholder}>
                        <div className={styles.spinner} style={{ width: '24px', height: '24px' }}></div>
                        <p>Loading original...</p>
                      </div>
                    ) : currentOriginalImage?.url || currentOriginalImage?.base64 ? (
                      <img 
                        src={currentOriginalImage.url || currentOriginalImage.base64} 
                        alt="Original artwork"
                        className={styles.comparisonImage}
                        onError={(e) => {
                          console.error('Failed to load original artwork:', e);
                        }}
                      />
                    ) : (
                      <div className={styles.comparisonImagePlaceholder}>
                        <p>Original not available</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className={styles.comparisonDivider}></div>

              <div className={`${styles.comparisonSection} ${styles.generatedSection}`}>
                <div className={styles.comparisonHeader}>
                  <h3 className={styles.comparisonTitle}>
                    Variation {previewImageIndex + 1}
                  </h3>
                </div>
                <div className={styles.comparisonImageContainer}>
                  <img 
                    src={currentGeneration.items[previewImageIndex].images} 
                    alt={`Generated result ${previewImageIndex + 1}`}
                    className={styles.comparisonImage}
                    onError={(e) => {
                      console.error('Failed to load preview image:', e);
                    }}
                  />
                </div>
              </div>
            </div>

            {(currentGeneration.items[previewImageIndex]?.description || previewNavigableIndexes.length > 1) && (
              <div className={styles.previewDescription}>
                {currentGeneration.items[previewImageIndex]?.description && (
                  renderDescription(currentGeneration.items[previewImageIndex].description)
                )}
              </div>
            )}

            {(() => {
              const previewItem = currentGeneration.items[previewImageIndex];
              const generatedImageId = previewItem?.generated_image_id;
              const iterationId = previewItem?.iteration_id;
              const feedbackKey = (generatedImageId !== null && generatedImageId !== undefined)
                ? getResultFeedbackKey(iterationId, generatedImageId)
                : null;
              const content = buildResultCommentContent(previewItem?.description);
              const feedbackState = feedbackKey
                ? (previewFeedbackState[feedbackKey] || null)
                : null;

              if (generatedImageId === null || generatedImageId === undefined) return null;

              return (
                <div className={styles.previewFeedbackRow}>
                  <div className={styles.previewBottomControls}>
                    <div className={styles.previewNavSlotLeft}>
                      {previewNavigableIndexes.length > 1 && (
                        <button
                          className={styles.previewNavButton}
                          onClick={handlePreviousPreview}
                          disabled={!hasPreviousPreview}
                        >
                          ← Previous
                        </button>
                      )}
                    </div>

                    <div className={styles.previewFeedbackActions}>
                      {(feedbackState === null || feedbackState === 'up') && (
                        <button
                          className={`${styles.previewFeedbackButton} ${feedbackState === 'up' ? styles.previewFeedbackButtonActive : ''}`}
                          onClick={() => handlePreviewThumbToggle({
                            feedbackKey,
                            generatedImageId,
                            targetState: 'up',
                            content,
                          })}
                          title="Thumbs up"
                        >
                          <i className={`bi ${feedbackState === 'up' ? 'bi-hand-thumbs-up-fill' : 'bi-hand-thumbs-up'} ${styles.previewFeedbackButtonIcon}`}></i>
                        </button>
                      )}
                      {(feedbackState === null || feedbackState === 'down') && (
                        <button
                          className={`${styles.previewFeedbackButton} ${feedbackState === 'down' ? styles.previewFeedbackButtonActive : ''}`}
                          onClick={() => handlePreviewThumbToggle({
                            feedbackKey,
                            generatedImageId,
                            targetState: 'down',
                            content,
                          })}
                          title="Thumbs down"
                        >
                          <i className={`bi ${feedbackState === 'down' ? 'bi-hand-thumbs-down-fill' : 'bi-hand-thumbs-down'} ${styles.previewFeedbackButtonIcon}`}></i>
                        </button>
                      )}
                      <button
                        className={styles.previewFeedbackButton}
                        onClick={() => openCommentDialog({
                          generatedImageId,
                          content,
                        })}
                        title="Add comment"
                      >
                        <i className={`bi bi-chat-square-text ${styles.previewFeedbackButtonIcon}`}></i>
                      </button>
                    </div>

                    <div className={styles.previewNavSlotRight}>
                      {previewNavigableIndexes.length > 1 && (
                        <button
                          className={styles.previewNavButton}
                          onClick={handleNextPreview}
                          disabled={!hasNextPreview}
                        >
                          Next →
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Portal menu - rendered at document.body to avoid clipping */}
      {imageActionMenu && typeof window !== 'undefined' && createPortal(
        <div 
          className={styles.imageActionMenuPortal}
          style={{
            position: 'fixed',
            top: `${imageActionMenu.top}px`,
            left: `${imageActionMenu.left}px`,
            zIndex: 9999
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className={styles.imageActionMenuItem}
            onClick={() => handleReplaceImage('reference')}
            disabled={replacingImage}
          >
            Set as new reference image
          </button>
          <button
            className={styles.imageActionMenuItem}
            onClick={() => handleReplaceImage('target')}
            disabled={replacingImage}
          >
            Set as target tweaking style
          </button>
        </div>,
        document.body
      )}

      {commentDialogState.isOpen && (
        <div className={styles.commentDialogOverlay}>
          <div className={styles.commentDialog}>
            <button className={styles.commentDialogClose} onClick={closeCommentDialog}>
              ×
            </button>
            <h4 className={styles.commentDialogTitle}>Add Comment</h4>
            <textarea
              className={styles.commentDialogTextarea}
              placeholder="Type your feedback"
              value={commentDialogState.userComment}
              onChange={(e) => setCommentDialogState((prev) => ({ ...prev, userComment: e.target.value }))}
            />
            <button
              className={styles.commentDialogSend}
              onClick={handleCommentSend}
              disabled={!commentDialogState.userComment.trim()}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}