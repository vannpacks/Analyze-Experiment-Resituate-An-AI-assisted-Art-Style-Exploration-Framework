'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './AnalysisContent.module.css';

export default function AnalysisContent({
  analysisData,
  referenceWork,
  uploadedArtwork,
  userInput,
  setUserInput,
  droppedReferences,
  setDroppedReferences,
  expandedSection,
  setExpandedSection,
  submitting,
  onSubmit,
  saveCurrentState,
  toggleEnabled,
  setToggleEnabled,
  replacingReferenceImage, 
  optimisticReferenceSrc, 
  optimisticTargetSrc, 
  isReplacingReference, 
  isReplacingTarget,
  onUploadReplace,
  onReAnalyze,
  canReAnalyze,
  onAnalysisComment,
}) {
  const [dragOverInput, setDragOverInput] = useState(false);
  const [openActionMenu, setOpenActionMenu] = useState(null);
  const [boxFeedbackState, setBoxFeedbackState] = useState({});
  const [commentDialogState, setCommentDialogState] = useState({
    isOpen: false,
    boxKey: null,
    aspectName: '',
    description: '',
    relatedTechnicalAspects: [],
    userComment: '',
  });
  const actionMenuRef = useRef(null);

  useEffect(() => {
    if (!openActionMenu) return;

    const handleClickOutside = (event) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target)) {
        setOpenActionMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openActionMenu]);

  useEffect(() => {
    if (submitting) {
      setOpenActionMenu(null);
    }
  }, [submitting]);

  useEffect(() => {
    // New analysis payload should start with clean local feedback UI state.
    setBoxFeedbackState({});
    setCommentDialogState({
      isOpen: false,
      boxKey: null,
      aspectName: '',
      description: '',
      relatedTechnicalAspects: [],
      userComment: '',
    });
  }, [analysisData]);

  // NEW: File upload handlers for image replacement
  const handleFileSelect = (targetType, event) => {
    const file = event.target.files?.[0];
    if (file && onUploadReplace) {
      onUploadReplace(targetType, file);
    }
    // Reset input so same file can be selected again
    event.target.value = '';
  };

  const triggerFileInput = (targetType) => {
    const inputId = targetType === 'reference' ? 'referenceFileInput' : 'targetFileInput';
    document.getElementById(inputId)?.click();
    setOpenActionMenu(null);
  };

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const handleToggleChange = () => {
    setToggleEnabled(!toggleEnabled);
    saveCurrentState(false);
  };

  const handleDragStart = (e, category, itemIndex, item, type = 'conceptual') => {
    const dragData = {
      category,
      itemIndex,
      item,
      type,
      aspectName: category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    };
    e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverInput(true);
  };

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverInput(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOverInput(false);
    
    try {
      const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
      
      const existingRef = droppedReferences.find(ref => 
        ref.category === dragData.category && 
        ref.itemIndex === dragData.itemIndex &&
        ref.type === dragData.type
      );
      
      if (!existingRef) {
        const newReference = {
          id: Date.now(),
          category: dragData.category,
          itemIndex: dragData.itemIndex,
          type: dragData.type,
          aspectName: dragData.aspectName,
          description: dragData.type === 'conceptual' ? dragData.item.description : dragData.item,
          relatedAspects: dragData.type === 'conceptual' ? (dragData.item.related_aspects || []) : []
        };
        
        const updatedReferences = [...droppedReferences, newReference];
        setDroppedReferences(updatedReferences);
        saveCurrentState(true);
      }
    } catch (error) {
      console.error('Error handling drop:', error);
    }
  };

  const removeReference = (referenceId) => {
    const updatedReferences = droppedReferences.filter(ref => ref.id !== referenceId);
    setDroppedReferences(updatedReferences);
    saveCurrentState(true);
  };

  const handleUserInputChange = (e) => {
    const value = e.target.value;
    setUserInput(value);
    saveCurrentState(false);
  };

  const handleSubmit = () => {
    if (!userInput.trim() && droppedReferences.length === 0) return;
    onSubmit();
  };

  const handleReAnalyze = () => {
    if (onReAnalyze) {
      onReAnalyze();
    }
    setOpenActionMenu(null);
  };

  const toggleImageActionMenu = (menuType) => {
    setOpenActionMenu((prev) => (prev === menuType ? null : menuType));
  };

  const buildFeedbackContent = ({ aspectName, description, relatedTechnicalAspects, userComment = '' }) => {
    const payload = {
      aspectName,
      description,
      relatedTechnicalAspects: relatedTechnicalAspects || [],
    };

    if (userComment) {
      payload.userComment = userComment;
    }

    return payload;
  };

  const sendAnalysisComment = async ({ commentType, aspectName, description, relatedTechnicalAspects, userComment = '' }) => {
    if (!onAnalysisComment) return;

    await onAnalysisComment({
      comment_type: commentType,
      content: buildFeedbackContent({
        aspectName,
        description,
        relatedTechnicalAspects,
        userComment,
      }),
    });
  };

  const handleThumbToggle = async ({ boxKey, targetState, aspectName, description, relatedTechnicalAspects }) => {
    const currentState = boxFeedbackState[boxKey] || null;
    const isDeactivating = currentState === targetState;
    const nextState = isDeactivating ? null : targetState;

    setBoxFeedbackState((prev) => ({
      ...prev,
      [boxKey]: nextState,
    }));

    const commentType = targetState === 'up'
      ? (isDeactivating ? 'Deactivate-Thumbs-up' : 'Thumbs-up')
      : (isDeactivating ? 'Deactivate-Thumbs-down' : 'Thumbs-down');

    await sendAnalysisComment({
      commentType,
      aspectName,
      description,
      relatedTechnicalAspects,
    });
  };

  const openCommentDialog = ({ boxKey, aspectName, description, relatedTechnicalAspects }) => {
    setCommentDialogState({
      isOpen: true,
      boxKey,
      aspectName,
      description,
      relatedTechnicalAspects,
      userComment: '',
    });
  };

  const closeCommentDialog = () => {
    setCommentDialogState({
      isOpen: false,
      boxKey: null,
      aspectName: '',
      description: '',
      relatedTechnicalAspects: [],
      userComment: '',
    });
  };

  const handleCommentSend = async () => {
    const trimmedComment = commentDialogState.userComment.trim();
    if (!trimmedComment) return;

    await sendAnalysisComment({
      commentType: 'Comment',
      aspectName: commentDialogState.aspectName,
      description: commentDialogState.description,
      relatedTechnicalAspects: commentDialogState.relatedTechnicalAspects,
      userComment: trimmedComment,
    });

    closeCommentDialog();
  };

  return (
    <div className={styles.analysisContent}>
      {/* Left Panel - Reference & Analysis (2/3) */}
      <div className={styles.analysisLeftPanel}>
        {/* Reference Image */}
        <div className={styles.referenceSection}>
          <h2 className={styles.analysisSectionTitle}>Referenced Artwork</h2>
          <div className={styles.analysisImageContainer}>
            {(optimisticReferenceSrc || referenceWork?.url) ? (
              <div className={styles.imageWithButton}>
                <div className={styles.imageOverlayWrapper}>
                  <img 
                    src={optimisticReferenceSrc || referenceWork.url} 
                    alt="Referenced artwork"
                    className={`${styles.analysisImage} ${isReplacingReference ? styles.analysisImageReplacing : ''}`}
                  />
                  <div className={styles.imageActionContainer} ref={openActionMenu === 'reference' ? actionMenuRef : null}>
                    <button 
                      className={styles.imageActionButton}
                      onClick={() => toggleImageActionMenu('reference')}
                      disabled={submitting || isReplacingReference}
                      title="Image actions"
                    >
                      ⋮
                    </button>
                    {openActionMenu === 'reference' && (
                      <div className={styles.imageActionMenu}>
                        <button
                          className={styles.imageActionMenuItem}
                          onClick={() => triggerFileInput('reference')}
                        >
                          ReUpload
                        </button>
                        <button
                          className={styles.imageActionMenuItem}
                          onClick={handleReAnalyze}
                          disabled={!canReAnalyze || submitting || replacingReferenceImage}
                        >
                          ReAnalyze
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <input
                  type="file"
                  id="referenceFileInput"
                  accept="image/png,image/jpeg"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileSelect('reference', e)}
                />
              </div>
            ) : (
              <div className={styles.imagePlaceholder}>
                <p>Reference image not available</p>
                <small>Image data was too large for storage</small>
              </div>
            )}
          </div>
        </div>

        {/* Analysis Panel - Show loading when replacing reference */}
        <div className={styles.analysisPanel}>
          {replacingReferenceImage ? (
            <div className={styles.analysisPanelLoading}>
              <div className={styles.spinner}></div>
              <p className={styles.loadingText}>Analyzing new reference image...</p>
            </div>
          ) : (
            <>
              {/* Conceptual Aspect */}
              <div className={styles.aspectSection}>
                <h3 className={styles.aspectTitle}>Conceptual Aspect</h3>
                
                {Object.entries(analysisData.conceptual_analysis || {}).map(([key, items]) => (
                  <div key={key} className={styles.analysisItem}>
                    <button 
                      className={styles.analysisItemHeader}
                      onClick={() => toggleSection(`conceptual_${key}`)}
                    >
                      <span className={styles.analysisItemTitle}>
                        {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                      <span className={styles.expandIcon}>
                        {expandedSection === `conceptual_${key}` ? '▲' : '▼'}
                      </span>
                    </button>
                    {expandedSection === `conceptual_${key}` && (
                      <div className={styles.analysisItemContent}>
                        {Array.isArray(items) ? (
                          items.map((item, index) => (
                            (() => {
                              const boxKey = `conceptual_${key}_${index}`;
                              const feedbackState = boxFeedbackState[boxKey] || null;
                              const aspectName = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                              const description = item.description || '';
                              const relatedTechnicalAspects = item.related_aspects || [];

                              return (
                            <div 
                              key={index} 
                              className={styles.conceptualDetailBox}
                            >
                              <div 
                                className={`${styles.dragHandle} ${styles.conceptualDragHandle}`}
                                draggable="true"
                                onDragStart={(e) => handleDragStart(e, key, index, item, 'conceptual')}
                              >
                                ⋮⋮
                              </div>
                              
                              <div className={styles.selectableContent}>
                                <p className={styles.conceptualDescription}>{item.description}</p>
                                {item.related_aspects && (
                                  <div className={styles.relatedAspects}>
                                    {item.related_aspects.map((aspect, aspectIndex) => (
                                      <span key={aspectIndex} className={styles.relatedAspect}>
                                        {aspect}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* <div className={styles.feedbackActions}>
                                  {(feedbackState === null || feedbackState === 'up') && (
                                    <button
                                      className={`${styles.feedbackButton} ${feedbackState === 'up' ? styles.feedbackButtonActive : ''}`}
                                      onClick={() => handleThumbToggle({
                                        boxKey,
                                        targetState: 'up',
                                        aspectName,
                                        description,
                                        relatedTechnicalAspects,
                                      })}
                                      title="Thumbs up"
                                    >
                                      <i className={`bi ${feedbackState === 'up' ? 'bi-hand-thumbs-up-fill' : 'bi-hand-thumbs-up'} ${styles.feedbackButtonIcon}`}></i>
                                    </button>
                                  )}
                                  {(feedbackState === null || feedbackState === 'down') && (
                                    <button
                                      className={`${styles.feedbackButton} ${feedbackState === 'down' ? styles.feedbackButtonActive : ''}`}
                                      onClick={() => handleThumbToggle({
                                        boxKey,
                                        targetState: 'down',
                                        aspectName,
                                        description,
                                        relatedTechnicalAspects,
                                      })}
                                      title="Thumbs down"
                                    >
                                      <i className={`bi ${feedbackState === 'down' ? 'bi-hand-thumbs-down-fill' : 'bi-hand-thumbs-down'} ${styles.feedbackButtonIcon}`}></i>
                                    </button>
                                  )}
                                  <button
                                    className={styles.feedbackButton}
                                    onClick={() => openCommentDialog({
                                      boxKey,
                                      aspectName,
                                      description,
                                      relatedTechnicalAspects,
                                    })}
                                    title="Add comment"
                                  >
                                    <i className={`bi bi-chat-square-text ${styles.feedbackButtonIcon}`}></i>
                                  </button>
                                </div> */}
                              </div>
                            </div>
                              );
                            })()
                          ))
                        ) : (
                          <p>{items}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Technical Aspect */}
              <div className={styles.aspectSection}>
                <h3 className={styles.aspectTitle}>Technical Aspect</h3>
                
                {Object.entries(analysisData.technical_analysis || {}).map(([key, items]) => (
                  <div key={key} className={styles.analysisItem}>
                    <button 
                      className={styles.analysisItemHeader}
                      onClick={() => toggleSection(`technical_${key}`)}
                    >
                      <span className={styles.analysisItemTitle}>
                        {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                      <span className={styles.expandIcon}>
                        {expandedSection === `technical_${key}` ? '▲' : '▼'}
                      </span>
                    </button>
                    {expandedSection === `technical_${key}` && (
                      <div className={styles.analysisItemContent}>
                        {Array.isArray(items) ? (
                          items.map((item, index) => (
                            (() => {
                              const boxKey = `technical_${key}_${index}`;
                              const feedbackState = boxFeedbackState[boxKey] || null;
                              const aspectName = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                              const description = item || '';
                              const relatedTechnicalAspects = [key];

                              return (
                            <div 
                              key={index} 
                              className={styles.technicalDetailBox}
                            >
                              <div 
                                className={`${styles.dragHandle} ${styles.technicalDragHandle}`}
                                draggable="true"
                                onDragStart={(e) => handleDragStart(e, key, index, item, 'technical')}
                              >
                                ⋮⋮
                              </div>
                              <div className={styles.selectableContent}>
                                <p className={styles.technicalDescription}>{item}</p>
                                {/* <div className={styles.feedbackActions}>
                                  {(feedbackState === null || feedbackState === 'up') && (
                                    <button
                                      className={`${styles.feedbackButton} ${feedbackState === 'up' ? styles.feedbackButtonActive : ''}`}
                                      onClick={() => handleThumbToggle({
                                        boxKey,
                                        targetState: 'up',
                                        aspectName,
                                        description,
                                        relatedTechnicalAspects,
                                      })}
                                      title="Thumbs up"
                                    >
                                      <i className={`bi ${feedbackState === 'up' ? 'bi-hand-thumbs-up-fill' : 'bi-hand-thumbs-up'} ${styles.feedbackButtonIcon}`}></i>
                                    </button>
                                  )}
                                  {(feedbackState === null || feedbackState === 'down') && (
                                    <button
                                      className={`${styles.feedbackButton} ${feedbackState === 'down' ? styles.feedbackButtonActive : ''}`}
                                      onClick={() => handleThumbToggle({
                                        boxKey,
                                        targetState: 'down',
                                        aspectName,
                                        description,
                                        relatedTechnicalAspects,
                                      })}
                                      title="Thumbs down"
                                    >
                                      <i className={`bi ${feedbackState === 'down' ? 'bi-hand-thumbs-down-fill' : 'bi-hand-thumbs-down'} ${styles.feedbackButtonIcon}`}></i>
                                    </button>
                                  )}
                                  <button
                                    className={styles.feedbackButton}
                                    onClick={() => openCommentDialog({
                                      boxKey,
                                      aspectName,
                                      description,
                                      relatedTechnicalAspects,
                                    })}
                                    title="Add comment"
                                  >
                                    <i className={`bi bi-chat-square-text ${styles.feedbackButtonIcon}`}></i>
                                  </button>
                                </div> */}
                              </div>
                            </div>
                              );
                            })()
                          ))
                        ) : (
                          <p>{items}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right Panel - User's Work & Input (1/3) */}
      <div className={styles.analysisRightPanel}>
        <div className={styles.targetSection}>
          <h2 className={styles.analysisSectionTitle}>Target Tweaking Style</h2>
          <div className={styles.analysisImageContainer}>
            {(optimisticTargetSrc || uploadedArtwork?.url) ? (
              <div className={styles.imageWithButton}>
                <div className={styles.imageOverlayWrapper}>
                  <img 
                    src={optimisticTargetSrc || uploadedArtwork.url} 
                    alt="Your artwork"
                    className={`${styles.analysisImage} ${isReplacingTarget ? styles.analysisImageReplacing : ''}`}
                  />
                  <div className={styles.imageActionContainer} ref={openActionMenu === 'target' ? actionMenuRef : null}>
                    <button 
                      className={styles.imageActionButton}
                      onClick={() => toggleImageActionMenu('target')}
                      disabled={submitting || isReplacingTarget}
                      title="Image actions"
                    >
                      ⋮
                    </button>
                    {openActionMenu === 'target' && (
                      <div className={styles.imageActionMenu}>
                        <button
                          className={styles.imageActionMenuItem}
                          onClick={() => triggerFileInput('target')}
                        >
                          ReUpload
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <input
                  type="file"
                  id="targetFileInput"
                  accept="image/png,image/jpeg"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileSelect('target', e)}
                />
              </div>
            ) : (
              <div className={styles.imagePlaceholder}>
                <p>Your artwork not available</p>
                <small>Image data was too large for storage</small>
              </div>
            )}
          </div>
        </div>

        <div 
          className={`${styles.inputSection} ${dragOverInput ? styles.dragOverInput : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Reference boxes */}
          {droppedReferences.length > 0 && (
            <div className={styles.referencesContainer}>
              {droppedReferences.map((reference) => (
                <div 
                  key={reference.id} 
                  className={`${styles.referenceBox} ${reference.type === 'technical' ? styles.technicalReferenceBox : ''}`}
                >
                  <button 
                    className={styles.removeReference}
                    onClick={() => removeReference(reference.id)}
                  >
                    ×
                  </button>
                  <div className={styles.referenceAspectName}>
                    {reference.aspectName}
                  </div>
                  <div className={styles.referenceDescription}>
                    {reference.description}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div className={styles.textareaContainer}>
            <textarea
              className={`${styles.userTextArea} ${droppedReferences.length === 0 ? styles.noReferences : ''}`}
              placeholder="Drag and Drop reference concept or write anything"
              value={userInput}
              onChange={handleUserInputChange}
            />
            <button 
              className={styles.submitButton}
              onClick={handleSubmit}
              disabled={(!userInput.trim() && droppedReferences.length === 0) || submitting}
            >
              {submitting ? '...' : '→'}
            </button>
          </div>
        </div>
      </div>

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
    </div>
  );
}