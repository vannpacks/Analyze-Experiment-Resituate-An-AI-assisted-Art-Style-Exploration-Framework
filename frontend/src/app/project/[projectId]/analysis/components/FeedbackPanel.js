'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { StorageManager } from '../../../../../utils/storageManager';
import styles from './FeedbackPanel.module.css';

export default function FeedbackPanel({
  generationFeedback,
  currentFeedbackIndex,
  setCurrentFeedbackIndex,
  expandedAgent,
  setExpandedAgent,
  projectId,
  replacingImage,
  onReplaceImage,  // NEW: Callback to replace images in AnalysisContent
  onFeedbackComment,
}) {
  const [previewImageIndex, setPreviewImageIndex] = useState(null);
  const [feedbackImages, setFeedbackImages] = useState({});
  const [loadingImages, setLoadingImages] = useState({});
  
  // NEW: Image action menu state with position
  const [imageActionMenu, setImageActionMenu] = useState(null); // { feedbackId, top, left }
  const actionButtonRefs = useRef({}); // Store refs for each button
  const [singleAgentFeedbackState, setSingleAgentFeedbackState] = useState({});
  const [agentFeedbackHydrated, setAgentFeedbackHydrated] = useState(false);
  const [feedbackCommentDialogState, setFeedbackCommentDialogState] = useState({
    isOpen: false,
    imageId: null,
    content: null,
    userComment: '',
    boxKey: null,
  });

  // Agent display names mapping
  const agentDisplayNames = {
    professionalAgent: 'Professional Artist',
    trendingAgent: 'Trending Audience',
    fansAgent: 'Fan'
  };

  useEffect(() => {
    if (!projectId) {
      setAgentFeedbackHydrated(false);
      return;
    }

    const loadSingleAgentFeedbackState = async () => {
      try {
        const stored = await StorageManager.loadFromIndexedDB(`agent_feedback_state_${projectId}`, true);
        if (stored && typeof stored === 'object') {
          setSingleAgentFeedbackState(stored);
        }
      } catch (error) {
        console.error('Failed to load agent feedback state:', error);
      } finally {
        setAgentFeedbackHydrated(true);
      }
    };

    loadSingleAgentFeedbackState();
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !agentFeedbackHydrated) return;

    const persistSingleAgentFeedbackState = async () => {
      try {
        await StorageManager.saveToIndexedDB(`agent_feedback_state_${projectId}`, singleAgentFeedbackState, true);
      } catch (error) {
        console.error('Failed to save agent feedback state:', error);
      }
    };

    persistSingleAgentFeedbackState();
  }, [projectId, singleAgentFeedbackState, agentFeedbackHydrated]);

  // Load images for feedback items
  useEffect(() => {
    const loadFeedbackImages = async () => {
      for (const feedbackItem of generationFeedback) {
        if (!feedbackItem.image_set_id || feedbackImages[feedbackItem.id]) continue;
        
        setLoadingImages(prev => ({ ...prev, [feedbackItem.id]: true }));
        
        try {
          const setKey = `imageset_${projectId}_${feedbackItem.image_set_id}`;
          const imageSetData = await StorageManager.loadFromIndexedDB(setKey, true);
          
          if (imageSetData) {
            const images = {};
            
            if (imageSetData.referenceWork?.base64) {
              const response = await fetch(imageSetData.referenceWork.base64);
              const blob = await response.blob();
              images.referenceWork = {
                url: URL.createObjectURL(blob),
                base64: imageSetData.referenceWork.base64,
                name: imageSetData.referenceWork.name
              };
            }
            
            if (imageSetData.uploadedArtwork?.base64) {
              const response = await fetch(imageSetData.uploadedArtwork.base64);
              const blob = await response.blob();
              images.uploadedArtwork = {
                url: URL.createObjectURL(blob),
                base64: imageSetData.uploadedArtwork.base64,
                name: imageSetData.uploadedArtwork.name
              };
            }
            
            setFeedbackImages(prev => ({ ...prev, [feedbackItem.id]: images }));
          }
        } catch (error) {
          console.error('Error loading feedback images:', error);
        } finally {
          setLoadingImages(prev => ({ ...prev, [feedbackItem.id]: false }));
        }
      }
    };
    
    if (generationFeedback.length > 0 && projectId) {
      loadFeedbackImages();
    }
  }, [generationFeedback, projectId]);

  const handleCarouselNext = () => {
    if (currentFeedbackIndex < generationFeedback.length - 1) {
      setCurrentFeedbackIndex(currentFeedbackIndex + 1);
      setExpandedAgent(null);
    }
  };

  const handleCarouselPrev = () => {
    if (currentFeedbackIndex > 0) {
      setCurrentFeedbackIndex(currentFeedbackIndex - 1);
      setExpandedAgent(null);
    }
  };

  const handleCarouselIndicatorClick = (index) => {
    setCurrentFeedbackIndex(index);
    setExpandedAgent(null);
  };

  const handleFeedbackAgentClick = (agentKey) => {
    setExpandedAgent(agentKey);
  };

  const handleBackToAgentList = () => {
    setExpandedAgent(null);
  };

  const handlePreviewClick = (e) => {
    e.stopPropagation();
    setPreviewImageIndex(currentFeedbackIndex);
  };

  const closePreview = () => {
    setPreviewImageIndex(null);
  };

  const handlePreviewOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      closePreview();
    }
  };

  // NEW: Handle image action button click
  const handleImageActionClick = (e, feedbackId, feedbackItem) => {
    if (
      replacingImage ||
      !feedbackItem ||
      feedbackItem.isLoading ||
      feedbackItem.generated_image_id === null ||
      feedbackItem.generated_image_id === undefined
    ) return;
    e.stopPropagation();
    
    // Toggle menu - if already open for this item, close it
    if (imageActionMenu?.feedbackId === feedbackId) {
      setImageActionMenu(null);
      return;
    }
    
    // Get button position for portal positioning
    const button = actionButtonRefs.current[feedbackId];
    if (button) {
      const rect = button.getBoundingClientRect();
      setImageActionMenu({
        feedbackId,
        top: rect.bottom + 8,  // 8px below button
        left: rect.left
      });
    }
  };

  // NEW: Handle replace image action
  const handleReplaceImage = async (targetType, feedbackId) => {
    if (!onReplaceImage) return;
    setImageActionMenu(null);
    
    try {
      const feedbackItem = generationFeedback.find(item => item.id === feedbackId);
      if (!feedbackItem) return;
      if (
        feedbackItem.isLoading ||
        feedbackItem.generated_image_id === null ||
        feedbackItem.generated_image_id === undefined
      ) {
        return;
      }
      
      // Create image data object with generated_image_id
      const imageData = {
        generated_image_id: feedbackItem.generated_image_id,
        images: feedbackItem.selectedImage,
        url: feedbackItem.selectedImage,
        user_image_id: feedbackItem.user_image_id,
        iteration_id: feedbackItem.iteration_id,
        sourceType: 'feedback_result'
      };
      // Call the replacement callback with generated_image_id
      const replaceType = targetType === 'reference'
        ? 'replace_reference_genResult_Simulate'
        : 'replace_user_image_genResult_Simulate';

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

  // Helper function to render description content
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

  const buildFeedbackPanelContent = (agentName, agentData) => ({
    feedbackAgentName: agentName || '',
    summaryComment: agentData?.summary_comment || '',
    predictedImpact: agentData?.predictedImpact || '',
    improvementSuggestions: agentData?.improvementSuggestions || '',
  });

  const getFeedbackThumbKey = (feedbackItem, agentKey) => {
    const hasImageIdentity = feedbackItem?.generated_image_id !== null && feedbackItem?.generated_image_id !== undefined;
    if (hasImageIdentity) {
      const safeIteration = feedbackItem?.iteration_id ?? 'no_iteration';
      return `${safeIteration}:${feedbackItem.generated_image_id}:${agentKey}`;
    }

    // Fallback keeps behavior stable for legacy/missing data.
    return `${feedbackItem?.id}:${agentKey}`;
  };

  const sendFeedbackComment = async ({ commentType, imageId, content, userComment = '' }) => {
    if (!onFeedbackComment) return;

    const payloadContent = {
      ...content,
    };

    if (userComment) {
      payloadContent.userComment = userComment;
    }

    await onFeedbackComment({
      comment_type: commentType,
      image_id: imageId,
      content: payloadContent,
    });
  };

  const handleSingleAgentThumbToggle = async ({ boxKey, imageId, targetState, content }) => {
    const currentState = singleAgentFeedbackState[boxKey] || null;
    const isDeactivating = currentState === targetState;
    const nextState = isDeactivating ? null : targetState;

    setSingleAgentFeedbackState((prev) => ({
      ...prev,
      [boxKey]: nextState,
    }));

    const commentType = targetState === 'up'
      ? (isDeactivating ? 'Deactivate-Thumbs-up' : 'Thumbs-up')
      : (isDeactivating ? 'Deactivate-Thumbs-down' : 'Thumbs-down');

    await sendFeedbackComment({
      commentType,
      imageId,
      content,
    });
  };

  const openFeedbackCommentDialog = ({ boxKey, imageId, content }) => {
    setFeedbackCommentDialogState({
      isOpen: true,
      imageId,
      content,
      userComment: '',
      boxKey,
    });
  };

  const closeFeedbackCommentDialog = () => {
    setFeedbackCommentDialogState({
      isOpen: false,
      imageId: null,
      content: null,
      userComment: '',
      boxKey: null,
    });
  };

  const handleFeedbackCommentSend = async () => {
    const trimmedComment = feedbackCommentDialogState.userComment.trim();
    if (
      !trimmedComment ||
      feedbackCommentDialogState.imageId === null ||
      feedbackCommentDialogState.imageId === undefined ||
      !feedbackCommentDialogState.content
    ) return;

    await sendFeedbackComment({
      commentType: 'Comment',
      imageId: feedbackCommentDialogState.imageId,
      content: feedbackCommentDialogState.content,
      userComment: trimmedComment,
    });

    closeFeedbackCommentDialog();
  };

  if (!generationFeedback || generationFeedback.length === 0) {
    return null;
  }

  return (
    <>
      <div className={styles.feedbackSection}>
        <div className={styles.feedbackPanel}>
          <h3 className={styles.feedbackSectionTitle}>Agent Feedback</h3>
          
          <div className={styles.feedbackCarousel}>
            <div 
              className={styles.feedbackCarouselTrack}
              style={{ transform: `translateX(-${currentFeedbackIndex * 100}%)` }}
            >
              {generationFeedback.map((feedbackItem, index) => (
                <div key={feedbackItem.id} className={styles.feedbackCard}>
                  {/* Left side - Selected Image (1/3) */}
                  <div className={styles.feedbackImageSection}>
                    <div className={styles.feedbackImageContainer}>
                      <div className={styles.feedbackImageInner}>
                        <img 
                          src={feedbackItem.selectedImage} 
                          alt="Selected style result"
                          className={styles.feedbackImage}
                          onError={(e) => {
                            console.error('Failed to load feedback image:', e);
                          }}
                        />
                        
                        {/* NEW: Image action button */}
                        <div className={styles.feedbackImageActionContainer}>
                          {(() => {
                            const canUseImageAction = !replacingImage && !feedbackItem.isLoading && feedbackItem.generated_image_id !== null && feedbackItem.generated_image_id !== undefined;
                            return (
                          <button
                            ref={(el) => (actionButtonRefs.current[feedbackItem.id] = el)}
                            className={styles.feedbackImageActionButton}
                            onClick={(e) => handleImageActionClick(e, feedbackItem.id, feedbackItem)}
                            disabled={!canUseImageAction}
                            title={canUseImageAction ? 'Replace image' : 'Image actions are available after feedback finishes loading'}
                          >
                            ⋮
                          </button>
                            );
                          })()}
                        </div>
                        
                        {/* Magnifying glass button */}
                        <button 
                          className={styles.magnifyButton}
                          onClick={handlePreviewClick}
                          title="Preview comparison"
                        >
                          ⌕
                        </button>
                      </div>
                    </div>
                    <div className={styles.feedbackImageDescription}>
                      {renderDescription(feedbackItem.description)}
                    </div>
                  </div>

                  {/* Right side - Agent Feedback (2/3) */}
                  <div className={styles.feedbackAgentsSection}>
                    {feedbackItem.isLoading ? (
                      <div className={styles.loadingState}>
                        <div className={styles.loadingSpinner}>
                          <div className={styles.spinner}></div>
                        </div>
                        <div className={styles.loadingText}>
                          <h5>Getting agent feedback...</h5>
                          <p>Please wait while our agents analyze your style result</p>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.agentsList}>
                        {expandedAgent && expandedAgent.startsWith(`${feedbackItem.id}-`) ? (
                          (() => {
                            const agentKey = expandedAgent.replace(`${feedbackItem.id}-`, '');
                            const agentData = feedbackItem.feedbackData[agentKey];
                            const boxKey = getFeedbackThumbKey(feedbackItem, agentKey);
                            const imageId = feedbackItem.generated_image_id;
                            const feedbackState = singleAgentFeedbackState[boxKey] || null;
                            const content = buildFeedbackPanelContent(agentDisplayNames[agentKey] || agentKey, agentData);
                            
                            return (
                              <div className={styles.singleAgentView}>
                                <div className={styles.singleAgentHeader}>
                                  <button 
                                    className={styles.backToListButton}
                                    onClick={handleBackToAgentList}
                                    title="Back to all agents"
                                  >
                                    《 Back to all agents
                                  </button>
                                </div>

                                <div className={styles.singleAgentContent}>
                                  <div className={styles.singleAgentTitle}>
                                    <h5 className={styles.feedbackAgentName}>
                                      {agentDisplayNames[agentKey] || agentKey}
                                    </h5>
                                  </div>
                                  
                                  <div className={styles.feedbackDetailContent}>
                                    {agentData.summary_comment && (
                                      <div className={styles.feedbackDetailBlock}>
                                        <h6 className={styles.feedbackDetailSubtitle}>Summary Comment</h6>
                                        <p className={styles.feedbackDetailText}>{agentData.summary_comment}</p>
                                      </div>
                                    )}
                                    
                                    {agentData.predictedImpact && (
                                      <div className={styles.feedbackDetailBlock}>
                                        <h6 className={styles.feedbackDetailSubtitle}>Predicted Impact</h6>
                                        <p className={styles.feedbackDetailText}>{agentData.predictedImpact}</p>
                                      </div>
                                    )}

                                    {agentData.improvementSuggestions && (
                                      <div className={styles.feedbackDetailBlock}>
                                        <h6 className={styles.feedbackDetailSubtitle}>Improvement Suggestions</h6>
                                        <p className={styles.feedbackDetailText}>{agentData.improvementSuggestions}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className={styles.singleAgentFooter}>
                                  <div className={styles.singleAgentFeedbackActions}>
                                    {(feedbackState === null || feedbackState === 'up') && (
                                      <button
                                        className={`${styles.singleAgentFeedbackButton} ${feedbackState === 'up' ? styles.singleAgentFeedbackButtonActive : ''}`}
                                        onClick={() => handleSingleAgentThumbToggle({
                                          boxKey,
                                          imageId,
                                          targetState: 'up',
                                          content,
                                        })}
                                        title="Thumbs up"
                                      >
                                        <i className={`bi ${feedbackState === 'up' ? 'bi-hand-thumbs-up-fill' : 'bi-hand-thumbs-up'} ${styles.singleAgentFeedbackButtonIcon}`}></i>
                                      </button>
                                    )}
                                    {(feedbackState === null || feedbackState === 'down') && (
                                      <button
                                        className={`${styles.singleAgentFeedbackButton} ${feedbackState === 'down' ? styles.singleAgentFeedbackButtonActive : ''}`}
                                        onClick={() => handleSingleAgentThumbToggle({
                                          boxKey,
                                          imageId,
                                          targetState: 'down',
                                          content,
                                        })}
                                        title="Thumbs down"
                                      >
                                        <i className={`bi ${feedbackState === 'down' ? 'bi-hand-thumbs-down-fill' : 'bi-hand-thumbs-down'} ${styles.singleAgentFeedbackButtonIcon}`}></i>
                                      </button>
                                    )}
                                    <button
                                      className={styles.singleAgentFeedbackButton}
                                      onClick={() => openFeedbackCommentDialog({
                                        boxKey,
                                        imageId,
                                        content,
                                      })}
                                      title="Add comment"
                                    >
                                      <i className={`bi bi-chat-square-text ${styles.singleAgentFeedbackButtonIcon}`}></i>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          feedbackItem.feedbackData && Object.entries(feedbackItem.feedbackData).map(([agentKey, agentData]) => (
                            <div key={agentKey}>
                              <div 
                                className={styles.feedbackAgentItem}
                                onClick={() => handleFeedbackAgentClick(`${feedbackItem.id}-${agentKey}`)}
                              >
                                <div className={styles.feedbackAgentHeader}>
                                  <div className={styles.feedbackAgentInfo}>
                                    <h5 className={styles.feedbackAgentName}>
                                      {agentDisplayNames[agentKey] || agentKey}
                                    </h5>
                                    <p className={styles.feedbackAgentPreview}>
                                      {agentData.summary_comment || agentData.predictedImpact}
                                    </p>
                                  </div>
                                  <div className={styles.feedbackExpandIndicator}>
                                    ⟩
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Carousel Navigation */}
          {generationFeedback.length > 1 && (
            <div className={styles.carouselNavigation}>
              <button 
                className={styles.carouselButton}
                onClick={handleCarouselPrev}
                disabled={currentFeedbackIndex === 0}
                title="Previous feedback"
              >
                ←
              </button>
              
              <div className={styles.carouselIndicators}>
                {generationFeedback.map((feedbackItem, index) => (
                  <div
                    key={index}
                    className={`${styles.carouselIndicator} ${index === currentFeedbackIndex ? styles.active : ''} ${feedbackItem.isLoading ? styles.loading : ''}`}
                    onClick={() => handleCarouselIndicatorClick(index)}
                    title={feedbackItem.isLoading ? 'Loading feedback...' : `Feedback ${index + 1}`}
                  />
                ))}
              </div>
              
              <button 
                className={styles.carouselButton}
                onClick={handleCarouselNext}
                disabled={currentFeedbackIndex === generationFeedback.length - 1}
                title="Next feedback"
              >
                →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Image Comparison Preview Popup with THREE images */}
      {previewImageIndex !== null && generationFeedback[previewImageIndex] && (
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
                    {loadingImages[generationFeedback[previewImageIndex].id] ? (
                      <div className={styles.comparisonImagePlaceholder}>
                        <div className={styles.spinner} style={{ width: '24px', height: '24px' }}></div>
                        <p>Loading reference...</p>
                      </div>
                    ) : feedbackImages[generationFeedback[previewImageIndex].id]?.referenceWork?.url || 
                       feedbackImages[generationFeedback[previewImageIndex].id]?.referenceWork?.base64 ? (
                      <img 
                        src={feedbackImages[generationFeedback[previewImageIndex].id].referenceWork.url || 
                             feedbackImages[generationFeedback[previewImageIndex].id].referenceWork.base64} 
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
                    {loadingImages[generationFeedback[previewImageIndex].id] ? (
                      <div className={styles.comparisonImagePlaceholder}>
                        <div className={styles.spinner} style={{ width: '24px', height: '24px' }}></div>
                        <p>Loading original...</p>
                      </div>
                    ) : feedbackImages[generationFeedback[previewImageIndex].id]?.uploadedArtwork?.url || 
                       feedbackImages[generationFeedback[previewImageIndex].id]?.uploadedArtwork?.base64 ? (
                      <img 
                        src={feedbackImages[generationFeedback[previewImageIndex].id].uploadedArtwork.url || 
                             feedbackImages[generationFeedback[previewImageIndex].id].uploadedArtwork.base64} 
                        alt="Your artwork"
                        className={styles.comparisonImage}
                        onError={(e) => {
                          console.error('Failed to load your artwork:', e);
                        }}
                      />
                    ) : (
                      <div className={styles.comparisonImagePlaceholder}>
                        <p>Your artwork not available</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className={styles.comparisonDivider}></div>

              <div className={`${styles.comparisonSection} ${styles.generatedSection}`}>
                <div className={styles.comparisonHeader}>
                  <h3 className={styles.comparisonTitle}>Selected Result</h3>
                </div>
                <div className={styles.comparisonImageContainer}>
                  <img 
                    src={generationFeedback[previewImageIndex].selectedImage} 
                    alt="Selected style result"
                    className={styles.comparisonImage}
                    onError={(e) => {
                      console.error('Failed to load result image:', e);
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Description at the bottom */}
            {generationFeedback[previewImageIndex].description && (
              <div className={styles.previewDescription}>
                {renderDescription(generationFeedback[previewImageIndex].description)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Portal menu - rendered at document.body to avoid clipping */}
      {imageActionMenu && typeof window !== 'undefined' && createPortal(
        <div 
          className={styles.feedbackImageActionMenuPortal}
          style={{
            position: 'fixed',
            top: `${imageActionMenu.top}px`,
            left: `${imageActionMenu.left}px`,
            zIndex: 9999
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className={styles.feedbackImageActionMenuItem}
            onClick={() => handleReplaceImage('reference', imageActionMenu.feedbackId)}
            disabled={replacingImage}
          >
            Set as new reference image
          </button>
          <button
            className={styles.feedbackImageActionMenuItem}
            onClick={() => handleReplaceImage('target', imageActionMenu.feedbackId)}
            disabled={replacingImage}
          >
            Set as target tweaking style
          </button>
        </div>,
        document.body
      )}

      {feedbackCommentDialogState.isOpen && (
        <div className={styles.feedbackCommentDialogOverlay}>
          <div className={styles.feedbackCommentDialog}>
            <button className={styles.feedbackCommentDialogClose} onClick={closeFeedbackCommentDialog}>
              ×
            </button>
            <h4 className={styles.feedbackCommentDialogTitle}>Add Comment</h4>
            <textarea
              className={styles.feedbackCommentDialogTextarea}
              placeholder="Type your feedback"
              value={feedbackCommentDialogState.userComment}
              onChange={(e) => setFeedbackCommentDialogState((prev) => ({ ...prev, userComment: e.target.value }))}
            />
            <button
              className={styles.feedbackCommentDialogSend}
              onClick={handleFeedbackCommentSend}
              disabled={!feedbackCommentDialogState.userComment.trim()}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}