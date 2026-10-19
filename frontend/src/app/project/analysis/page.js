'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { StorageManager } from '../../../utils/storageManager';
import { apiFetchJson, apiFetchStream } from '../../../utils/api';
import SettingsButton from '../../../components/SettingsButton';
import { DEFAULT_PROJECT_ID } from '../../../utils/projectConfig';
import AnalysisContent from './components/AnalysisContent';
import ResultsPanel from './components/ResultsPanel';
import FeedbackPanel from './components/FeedbackPanel';
import styles from './analysis.module.css';

function AnalysisPageContent() {
  // Core data states
  const [analysisData, setAnalysisData] = useState(null);
  const [referenceWork, setReferenceWork] = useState(null);
  const [uploadedArtwork, setUploadedArtwork] = useState(null);
  const [projectIds, setProjectIds] = useState({
    reference_image_id: null,
    user_image_id: null,
    iteration_id: null,
    project_id: null,
    uploadTimestamp: null
  });
  
  // UI states
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [gettingFeedback, setGettingFeedback] = useState(false);
  
  const [replacingImage, setReplacingImage] = useState(false);
  const [replacingReferenceImage, setReplacingReferenceImage] = useState(false);
  const [replacementNotification, setReplacementNotification] = useState(null);

  const [optimisticReplace, setOptimisticReplace] = useState({
    referenceSrc: null,
    targetSrc: null,
  });
  const [replacing, setReplacing] = useState({
    reference: false,
    target: false,
  });
  
  // User interaction states
  const [userInput, setUserInput] = useState('');
  const [droppedReferences, setDroppedReferences] = useState([]);
  const [expandedSection, setExpandedSection] = useState(null);
  const [toggleEnabled, setToggleEnabled] = useState(false);
  
  // Results states
  const [generationResult, setGenerationResult] = useState(null);
  const [showResultsPanel, setShowResultsPanel] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(null);
  const [previewImageIndex, setPreviewImageIndex] = useState(null);
  
  // Feedback states
  const [generationFeedback, setGenerationFeedback] = useState([]);
  const [currentFeedbackIndex, setCurrentFeedbackIndex] = useState(0);
  const [expandedAgent, setExpandedAgent] = useState(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('id') || DEFAULT_PROJECT_ID;
  // const externalLinkUrl = process.env.NEXT_PUBLIC_DAILY_QUESTIONNAIRE_LINK;

const handleReplaceImage = async (targetType, imageData, replaceType = null) => {
  try {
    // Set appropriate loading states based on target type
    setReplacingImage(true);
    if (targetType === 'reference') {
      setReplacingReferenceImage(true);
    }

    // Prepare request payload based on target type
    let requestBody = {
      project_id: projectId,
      iteration_id: projectIds.iteration_id,
      replace_type: replaceType
    };

    // Check if imageData contains base64 (user upload) or generated_image_id (from results)
    const isBase64Upload = imageData.base64 !== undefined;

    if (targetType === 'reference') {
      // If base64 upload, send as object with data property; otherwise send generated_image_id
      requestBody.reference_image = isBase64Upload 
        ? { data: imageData.base64, name: imageData.name || 'uploaded_reference.png' }
        : imageData.generated_image_id;
      if (!isBase64Upload) {
        requestBody.reference_image_iteration_id = imageData.iteration_id ?? projectIds.iteration_id;
      }

      requestBody.user_image = null;
    } else {
      requestBody.reference_image = null;
      // If base64 upload, send as object with data property; otherwise send generated_image_id
      requestBody.user_image = isBase64Upload
        ? { data: imageData.base64, name: imageData.name || 'uploaded_target.png' }
        : imageData.generated_image_id;
      if (!isBase64Upload) {
        requestBody.user_image_iteration_id = imageData.iteration_id ?? projectIds.iteration_id;
      }
    }
    const result = await apiFetchJson('/style/replace', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });
    // For base64 uploads, create a blob URL; for generated images, use the provided URL
    const imageUrl = isBase64Upload
      ? (typeof imageData.base64 === 'string' && imageData.base64.startsWith('data:')
          ? imageData.base64
          : `data:image/png;base64,${imageData.base64}`)
      : (imageData.images || imageData.url);
    
    // For base64 uploads, we already have the base64; for generated images, fetch it
    let imageBase64;
    if (isBase64Upload) {
      imageBase64 = imageData.base64;
    } else {
      try {
        const imageResponse = await fetch(imageUrl);
        const imageBlob = await imageResponse.blob();
        imageBase64 = await StorageManager.convertToBase64(imageBlob);
      } catch (error) {
        console.error('Failed to fetch/convert image:', error);
        throw new Error('Failed to prepare image data');
      }
    }

    const newSetId = StorageManager.generateImageSetId();
    let newReferenceWork, newUploadedArtwork;
    
    if (targetType === 'reference') {
      // Replacing reference - new reference, keep old uploaded artwork
      newReferenceWork = {
        url: imageUrl,
        name: `Reference_${result.reference_image_id}.png`,
        generated_image_id: imageData.generated_image_id,
        base64: imageBase64,  // Has base64
        setId: newSetId,
        status: 'temporary',
        iteration_id: result.iteration_id
      };
      
      // Keep existing uploaded artwork but ensure it has base64
      if (!uploadedArtwork?.base64) {
        console.warn('Uploaded artwork missing base64, attempting to fetch...');
        try {
          if (uploadedArtwork?.url) {
            const artResponse = await fetch(uploadedArtwork.url);
            const artBlob = await artResponse.blob();
            const artBase64 = await StorageManager.convertToBase64(artBlob);
            
            newUploadedArtwork = {
              ...uploadedArtwork,
              base64: artBase64,
              setId: newSetId,
              status: 'temporary',
              iteration_id: result.iteration_id
            };
          } else {
            throw new Error('Uploaded artwork has no URL or base64');
          }
        } catch (error) {
          console.error('Failed to ensure uploaded artwork base64:', error);
          alert('Please re-upload your artwork before replacing reference.');
          return;
        }
      } else {
        newUploadedArtwork = {
          ...uploadedArtwork,
          setId: newSetId,
          status: 'temporary',
          iteration_id: result.iteration_id
        };
      }
      
    } else {
      // Replacing uploaded artwork - new uploaded, keep old reference
      newUploadedArtwork = {
        url: imageUrl,
        name: `User_${result.user_image_id}.png`,
        generated_image_id: imageData.generated_image_id,
        base64: imageBase64,  // Has base64
        setId: newSetId,
        status: 'generated',
        iteration_id: result.iteration_id
      };
      
      // Keep existing reference but ensure it has base64
      if (!referenceWork?.base64) {
        console.warn('Reference work missing base64, attempting to fetch...');
        try {
          if (referenceWork?.url) {
            const refResponse = await fetch(referenceWork.url);
            const refBlob = await refResponse.blob();
            const refBase64 = await StorageManager.convertToBase64(refBlob);
            
            newReferenceWork = {
              ...referenceWork,
              base64: refBase64,
              setId: newSetId,
              status: 'generated',
              iteration_id: result.iteration_id
            };
          } else {
            throw new Error('Reference work has no URL or base64');
          }
        } catch (error) {
          console.error('Failed to ensure reference work base64:', error);
          alert('Please re-upload reference before replacing artwork.');
          return;
        }
      } else {
        newReferenceWork = {
          ...referenceWork,
          setId: newSetId,
          status: 'generated',
          iteration_id: result.iteration_id
        };
      }
    }
    const { success } = await StorageManager.saveProjectImageSet(
      projectId,
      {
        name: newReferenceWork.name,
        base64: newReferenceWork.base64, 
        file: null
      },
      {
        name: newUploadedArtwork.name,
        base64: newUploadedArtwork.base64,
        file: null
      },
      newSetId,
      'temporary',
      result.iteration_id  // NEW iteration_id from backend
    );

    if (!success) {
      throw new Error('Failed to save new image set to IndexedDB');
    }
    // Update image set status in storage
    await StorageManager.updateImageSetStatus(projectId, newSetId, 'temporary', {
      reference_image_id: result.reference_image_id,
      user_image_id: result.user_image_id,
      iteration_id: result.iteration_id
    });

    // Update project IDs in React state
    const updatedProjectIds = {
      ...projectIds,
      reference_image_id: result.reference_image_id,
      user_image_id: result.user_image_id,
      iteration_id: result.iteration_id  // NEW iteration_id
    };
    setProjectIds(updatedProjectIds);

    let newAnalysisData = analysisData;
    if (targetType === 'reference' && result.technical_analysis && result.conceptual_analysis) {
      newAnalysisData = {
        technical_analysis: result.technical_analysis,
        conceptual_analysis: result.conceptual_analysis
      };
      setAnalysisData(newAnalysisData);
      // Clear dropped references since they're based on the old reference analysis
      setDroppedReferences([]);
      setExpandedSection(null);
    }

    setReferenceWork(newReferenceWork);
    setUploadedArtwork(newUploadedArtwork);
    
    // Use empty droppedReferences if reference was replaced
    const updatedDroppedReferences = (targetType === 'reference' && result.technical_analysis && result.conceptual_analysis) ? [] : droppedReferences;
    
    await StorageManager.saveAnalysisPageState({
      analysisData: newAnalysisData,
      projectIds: updatedProjectIds,
      referenceWork: newReferenceWork,
      uploadedArtwork: newUploadedArtwork,
      generationResult,
      userInput,
      droppedReferences: updatedDroppedReferences,
      selectedImageIndex,
      showResultsPanel,
      generatingImages,
      generationFeedback,
      toggleEnabled,
      skipGenerationSave: true
    });

    // Show success notification
    const targetName = targetType === 'reference' ? 'Reference image' : 'User image';
    setReplacementNotification({
      message: `${targetName} replaced successfully! New iteration created.`,
      type: 'success'
    });
    
    setTimeout(() => {
      setReplacementNotification(null);
    }, 3000);
    
  } catch (error) {
    console.error('Error replacing image:', error);
    setReplacementNotification({
      message: `Failed to replace image: ${error.message}`,
      type: 'error'
    });
    
    setTimeout(() => {
      setReplacementNotification(null);
    }, 5000);
  } finally {
    setReplacingImage(false);
    setReplacingReferenceImage(false);
    setOptimisticReplace({ referenceSrc: null, targetSrc: null });
    setReplacing({ reference: false, target: false });
  }
};

const handleReplaceImageOptimistic = async (targetType, imageData, replaceTypeOverride = null) => {
  // Store previous state for rollback on error
  const prevOptimistic = { ...optimisticReplace };
  
  try {
    const newImageSrc = imageData.images || imageData.url;
    
    setOptimisticReplace(prev => ({
      ...prev,
      ...(targetType === 'reference' 
        ? { referenceSrc: newImageSrc } 
        : { targetSrc: newImageSrc }
      ),
    }));
    
    setReplacing(prev => ({ 
      ...prev, 
      [targetType]: true 
    }));

    const replaceType = replaceTypeOverride || (
      targetType === 'reference'
        ? 'replace_reference_genResult'
        : 'replace_user_image_genResult'
    );

    await handleReplaceImage(targetType, imageData, replaceType);
  } catch (error) {
    setOptimisticReplace(prevOptimistic);
    throw error;
  } finally {
    setReplacing(prev => ({ 
      ...prev, 
      [targetType]: false 
    }));
    
    setOptimisticReplace(prev => ({
      ...prev,
      ...(targetType === 'reference' 
        ? { referenceSrc: null } 
        : { targetSrc: null }
      ),
    }));
  }
};

  // Save current state
  const saveCurrentState = async (immediate = false, skipGenerationSave = true) => {
    const stateToSave = {
      analysisData,
      projectIds: { ...projectIds, project_id: projectId }, // Now includes iteration_id
      referenceWork,
      uploadedArtwork,
      generationResult: skipGenerationSave ? null : generationResult,
      userInput,
      droppedReferences,
      selectedImageIndex,
      showResultsPanel,
      generatingImages,
      generationFeedback,
      toggleEnabled,
      skipGenerationSave: skipGenerationSave
    };

    const saveFunction = async () => {
      try {
        await StorageManager.saveAnalysisPageState(stateToSave);
      } catch (error) {
        console.error('Failed to save state:', error);
      }
    };

    if (immediate) {
      await saveFunction();
    } else {
      setTimeout(saveFunction, 500);
    }
  };

  const handleUploadReplace = async (targetType, file) => {
    if (!file) return;
    
    try {
      const allowedTypes = new Set(['image/png', 'image/jpeg']);
      if (!allowedTypes.has(file.type)) {
        alert('Only PNG/JPG images are allowed');
        return;
      }
      
      // Validate file size (e.g., max 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        alert('File size must be less than 10MB');
        return;
      }
      
      // Convert file to base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64String = reader.result.split(',')[1];
          resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const previewUrl = URL.createObjectURL(file);
      
      // Set optimistic UI state BEFORE calling replace
      if (targetType === 'reference') {
        setOptimisticReplace(prev => ({ ...prev, referenceSrc: previewUrl }));
        setReplacing(prev => ({ ...prev, reference: true }));
      } else {
        setOptimisticReplace(prev => ({ ...prev, targetSrc: previewUrl }));
        setReplacing(prev => ({ ...prev, target: true }));
      }
      
      // Prepare image data with base64
      const imageData = {
        base64: base64,
        name: file.name,
        url: previewUrl,
        sourceType: 'user_upload'
      };
      
      // Call the same replacement function
      const replaceType = targetType === 'reference'
        ? 'replace_reference_reUpload'
        : 'replace_user_image_reUpload';

      await handleReplaceImage(targetType, imageData, replaceType);
      
      // Clean up preview URL after replacement
      setTimeout(() => {
        URL.revokeObjectURL(previewUrl);
      }, 1000);
      
    } catch (error) {
      console.error('Error uploading replacement image:', error);
      alert(`Failed to upload image: ${error.message}`);
      
      // Reset optimistic states on error
      if (targetType === 'reference') {
        setOptimisticReplace(prev => ({ ...prev, referenceSrc: null }));
        setReplacing(prev => ({ ...prev, reference: false }));
      } else {
        setOptimisticReplace(prev => ({ ...prev, targetSrc: null }));
        setReplacing(prev => ({ ...prev, target: false }));
      }
    }
  };

  const handleReAnalyzeReference = async () => {
    if (!projectId || !projectIds?.iteration_id || !projectIds?.user_image_id) {
      alert('Please wait for project initialization before re-analyzing.');
      return;
    }

    if (!referenceWork) {
      alert('Reference image is not available');
      return;
    }

    try {
      let imageData = {
        generated_image_id: referenceWork.generated_image_id,
        url: referenceWork.url,
        name: referenceWork.name || 'reference_image.png'
      };

      if (!imageData.generated_image_id) {
        let referenceBase64 = referenceWork.base64;

        if (!referenceBase64 && referenceWork.url) {
          const refResponse = await fetch(referenceWork.url);
          const refBlob = await refResponse.blob();
          referenceBase64 = await StorageManager.convertToBase64(refBlob);
        }

        if (!referenceBase64) {
          alert('Reference image data missing. Please re-upload reference image.');
          return;
        }

        imageData = {
          base64: referenceBase64,
          name: referenceWork.name || 'reference_image.png'
        };
      }

      await handleReplaceImage('reference', imageData, 'reAnalyze_reference');
    } catch (error) {
      console.error('Error re-analyzing reference image:', error);
      alert(`Failed to re-analyze reference image: ${error.message}`);
    }
  };

  const resolveGenerationIds = async (projectId) => {
    const activeSetId = await StorageManager.getActiveImageSetId(projectId);
    if (!activeSetId) {
      throw new Error("No active image set ID found");
    }

    const setKey = `imageset_${projectId}_${activeSetId}`;
    const imageSet = await StorageManager.loadFromIndexedDB(setKey, true);
    if (!imageSet) {
      throw new Error(`Active image set missing: ${setKey}`);
    }

    const iteration_id = imageSet.iteration_id;
    const user_image_id = imageSet.backend_user_image_id;
    const reference_image_id = imageSet.backend_reference_image_id;

    if (iteration_id == null || user_image_id == null || reference_image_id == null) {
      throw new Error(
        `Missing IDs in ImageSet: iteration_id=${iteration_id}, user_image_id=${user_image_id}, reference_image_id=${reference_image_id}`
      );
    }
    return { iteration_id, user_image_id, reference_image_id };
  };

  const rehydrateFromBackend = async (projectId) => {
    const payload = await apiFetchJson(`/project/${projectId}/showall`, { cache: 'no-store' });
    const iterations = Array.isArray(payload?.iterations) ? payload.iterations : [];
    const sortedIterations = [...iterations].sort((a, b) => b.iteration_id - a.iteration_id);
    const iteration = sortedIterations.find(
      (candidate) => candidate.latest_assets?.user_image && candidate.latest_assets?.reference_image
    );
    const generationIteration = sortedIterations.find(
      (candidate) => candidate.groups?.some((candidateGroup) => candidateGroup.generated_images?.length > 0)
    );
    const group = generationIteration?.groups?.find(
      (candidateGroup) => candidateGroup.generated_images?.length > 0
    );
    const latestAssets = iteration?.latest_assets;
    if (!iteration || !latestAssets?.user_image || !latestAssets?.reference_image) {
      return false;
    }

    const toApiFileUrl = (url) => (url?.startsWith('/') ? `/api${url}` : url);
    const toDataUrl = async (url) => {
      const response = await fetch(toApiFileUrl(url));
      if (!response.ok) throw new Error(`Unable to restore image (${response.status})`);
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    };

    const userImage = latestAssets.user_image;
    const referenceImage = latestAssets.reference_image;
    const [userBase64, referenceBase64] = await Promise.all([
      toDataUrl(userImage.url),
      toDataUrl(referenceImage.url),
    ]);
    const setResult = await StorageManager.saveProjectImageSet(
      projectId,
      { name: `user-${userImage.image_id}.png`, base64: userBase64 },
      { name: `reference-${referenceImage.image_id}.png`, base64: referenceBase64 },
      null,
      'generated',
      iteration.iteration_id
    );
    if (!setResult.success) {
      throw new Error('Unable to restore the project image set.');
    }
    await StorageManager.updateImageSetStatus(
      projectId,
      setResult.setId,
      'generated',
      {
        iteration_id: iteration.iteration_id,
        user_image_id: userImage.image_id,
        reference_image_id: referenceImage.image_id,
      }
    );

    const rawStyleAnalysis = latestAssets.style_analysis || group?.style_analysis;
    const styleAnalysis = rawStyleAnalysis
      ? {
          technical_analysis: rawStyleAnalysis.technical_analysis || rawStyleAnalysis.technical_aspect || {},
          conceptual_analysis: rawStyleAnalysis.conceptual_analysis || rawStyleAnalysis.conceptual_aspect || {},
        }
      : null;
    const projectIds = {
      project_id: projectId,
      iteration_id: iteration.iteration_id,
      user_image_id: userImage.image_id,
      reference_image_id: referenceImage.image_id,
      uploadTimestamp: new Date().toISOString(),
    };
    const referenceWork = {
      url: toApiFileUrl(referenceImage.url),
      name: `reference-${referenceImage.image_id}.png`,
      base64: referenceBase64,
      setId: setResult.setId,
      status: 'generated',
      iteration_id: iteration.iteration_id,
    };
    const uploadedArtwork = {
      url: toApiFileUrl(userImage.url),
      name: `user-${userImage.image_id}.png`,
      base64: userBase64,
      setId: setResult.setId,
      status: 'generated',
      iteration_id: iteration.iteration_id,
    };
    const generationItems = (group?.generated_images || []).map((image) => ({
      images: toApiFileUrl(image.url),
      generated_image_id: image.generated_image_id,
      user_image_id: userImage.image_id,
      reference_image_id: referenceImage.image_id,
      iteration_id: generationIteration?.iteration_id || iteration.iteration_id,
      description: image.style_description || '',
    }));
    const generationResult = {
      items: generationItems,
      timestamp: new Date().toISOString(),
      image_set_id: setResult.setId,
      iteration_id: iteration.iteration_id,
      userInput: '',
      droppedReferences: [],
    };
    const feedback = generationItems.flatMap((item, index) => {
      const source = group?.generated_images?.[index]?.feedback;
      return source
        ? [{
            id: `rehydrated-${iteration.iteration_id}-${item.generated_image_id}`,
            selectedImage: item.images,
            description: item.description,
            generated_image_id: item.generated_image_id,
            user_image_id: userImage.image_id,
            iteration_id: iteration.iteration_id,
            image_set_id: setResult.setId,
            feedbackData: source,
            timestamp: new Date().toISOString(),
            projectId,
            generationPrompt: '',
          }]
        : [];
    });

    setAnalysisData(styleAnalysis);
    setProjectIds(projectIds);
    setReferenceWork(referenceWork);
    setUploadedArtwork(uploadedArtwork);
    setGenerationResult(generationResult);
    setShowResultsPanel(generationItems.length > 0);
    setGenerationFeedback(feedback);
    await StorageManager.saveAnalysisPageState({
      analysisData: styleAnalysis,
      projectIds,
      referenceWork,
      uploadedArtwork,
      generationResult: null,
      userInput: '',
      droppedReferences: [],
      selectedImageIndex: null,
      showResultsPanel: generationItems.length > 0,
      generatingImages: false,
      generationFeedback: feedback,
      toggleEnabled: false,
      skipGenerationSave: true,
    });
    await StorageManager.saveProjectGenerationResult(
      projectId,
      generationResult,
      setResult.setId,
      iteration.iteration_id
    );
    if (feedback.length > 0) {
      await StorageManager.saveGenerationFeedback(feedback, projectId);
    }
    return true;
  };

  useEffect(() => {
    if (!projectId) return;
    
    const loadData = async () => {
      try {
        const initialProjectIds = {
          reference_image_id: null,
          user_image_id: null,
          iteration_id: null,
          project_id: projectId,
          uploadTimestamp: new Date().toISOString()
        };
        setProjectIds(initialProjectIds);
        if (window.__appData) {
          const { analysis, iterationId, referenceWork: refWork, uploadedArtwork: artwork, prompt } = window.__appData;
          if (refWork?.file && artwork?.file) {
            const refUrl = URL.createObjectURL(refWork.file);
            const artworkUrl = URL.createObjectURL(artwork.file);
            
            const newAnalysisData = analysis ? {
              technical_analysis: analysis.technical_analysis,
              conceptual_analysis: analysis.conceptual_analysis
            } : null;
            
            setAnalysisData(newAnalysisData);
            setUserInput(prompt || '');
            setToggleEnabled(false);
            
            const newProjectIds = {
              reference_image_id: analysis?.reference_image_id || null,
              user_image_id: analysis?.user_image_id || null,
              iteration_id: iterationId || null,
              project_id: projectId,
              uploadTimestamp: new Date().toISOString()
            };
            
            setProjectIds(newProjectIds);
            
            // Load the existing ImageSet created by upload page
            let setId = sessionStorage.getItem(`last_set_${projectId}`);
            
            if (!setId) {
              // Fallback: If not in sessionStorage, get from active set
              setId = await StorageManager.getActiveImageSetId(projectId);
            }
            
            const newReferenceWork = {
              url: refUrl,
              name: refWork.file.name,
              file: refWork.file,
              base64: refWork.base64,
              setId: setId, // Use the existing setId
              status: 'generated',
              iteration_id: iterationId
            };
            
            const newUploadedArtwork = {
              url: artworkUrl,
              name: artwork.file.name,
              file: artwork.file,
              base64: artwork.base64,
              setId: setId, // Use the existing setId
              status: 'generated',
              iteration_id: iterationId
            };
            
            setReferenceWork(newReferenceWork);
            setUploadedArtwork(newUploadedArtwork);            
            // Save full state (but not creating new ImageSet)
            await StorageManager.saveAnalysisPageState({
              analysisData: newAnalysisData,
              projectIds: newProjectIds,
              referenceWork: newReferenceWork,
              uploadedArtwork: newUploadedArtwork,
              generationResult: null,
              userInput: prompt || '',
              droppedReferences: [],
              selectedImageIndex: null,
              showResultsPanel: false,
              generatingImages: false,
              generationFeedback: [],
              toggleEnabled: false,
              skipGenerationSave: true
            });

            delete window.__appData;
            setLoading(false);
            return;
          }
        }

        let setId = sessionStorage.getItem(`last_set_${projectId}`);
        if (!setId) {
          setId = await StorageManager.getActiveImageSetId(projectId);
        }
        
        // Load the existing ImageSet (don't create a new one!)
        if (setId) {
          const imageSet = await StorageManager.loadImageSet(projectId, setId);
          
          if (imageSet) {
            // Hydrate UI from the loaded ImageSet
            if (imageSet.referenceWork?.base64) {
              // Create blob URL from base64
              try {
                const response = await fetch(imageSet.referenceWork.base64);
                const blob = await response.blob();
                const objectUrl = URL.createObjectURL(blob);
                
                setReferenceWork({
                  url: objectUrl,
                  name: imageSet.referenceWork.name,
                  base64: imageSet.referenceWork.base64,
                  setId: setId,
                  status: imageSet.status,
                  iteration_id: imageSet.iteration_id
                });
              } catch (error) {
                console.error('[loadData] Error creating reference URL:', error);
                // Fallback: use base64 directly
                setReferenceWork({
                  url: imageSet.referenceWork.base64,
                  name: imageSet.referenceWork.name,
                  base64: imageSet.referenceWork.base64,
                  setId: setId,
                  status: imageSet.status,
                  iteration_id: imageSet.iteration_id
                });
              }
            } else {
              console.warn('[loadData] No referenceWork base64 found in ImageSet');
            }
            
            if (imageSet.uploadedArtwork?.base64) {
              // Create blob URL from base64
              try {
                const response = await fetch(imageSet.uploadedArtwork.base64);
                const blob = await response.blob();
                const objectUrl = URL.createObjectURL(blob);
                
                setUploadedArtwork({
                  url: objectUrl,
                  name: imageSet.uploadedArtwork.name,
                  base64: imageSet.uploadedArtwork.base64,
                  setId: setId,
                  status: imageSet.status,
                  iteration_id: imageSet.iteration_id
                });
              } catch (error) {
                console.error('[loadData] Error creating artwork URL:', error);
                // Fallback: use base64 directly
                setUploadedArtwork({
                  url: imageSet.uploadedArtwork.base64,
                  name: imageSet.uploadedArtwork.name,
                  base64: imageSet.uploadedArtwork.base64,
                  setId: setId,
                  status: imageSet.status,
                  iteration_id: imageSet.iteration_id
                });
              }
            } else {
              console.warn('[loadData] No uploadedArtwork base64 found in ImageSet');
            }
            
            setProjectIds(prev => ({
              ...prev,
              project_id: projectId,
              iteration_id: imageSet.iteration_id || null,
              user_image_id: imageSet.backend_user_image_id || null,
              reference_image_id: imageSet.backend_reference_image_id || null,
            }));
            // The ImageSet already exists, we just loaded it
            
          } else {
            console.warn('[loadData] ImageSet not found for setId:', setId);
          }
        } else {
          console.warn('[loadData] No active ImageSet found for project');
        }

        const savedState = await StorageManager.loadAnalysisPageState(projectId);
        if (savedState) {          
          // Load basic analysis state
          if (savedState.analysisData) {
            setAnalysisData(savedState.analysisData);
          }
          
          if (savedState.projectIds) {
            setProjectIds(prev => ({
              ...prev,
              ...savedState.projectIds,
              project_id: projectId, // Ensure project_id is correct
              // Prefer the iteration_id from the loaded ImageSet if available
              iteration_id: prev.iteration_id || savedState.projectIds.iteration_id,
            }));
          }
          
          if (savedState.userInput) {
            setUserInput(savedState.userInput);
          }
          
          if (savedState.droppedReferences) {
            setDroppedReferences(savedState.droppedReferences);
          }
          
          if (savedState.toggleEnabled !== undefined) {
            setToggleEnabled(savedState.toggleEnabled);
          }

          // Load generation results
          const generationResults = await StorageManager.loadProjectGenerationHistory(projectId);
          if (generationResults && generationResults.length > 0) {
            setGenerationResult(generationResults[0]);
            setShowResultsPanel(true);
          }

          // Load feedback history
          const feedbackHistory = await StorageManager.loadGenerationFeedback(projectId);
          if (feedbackHistory && feedbackHistory.length > 0) {
            setGenerationFeedback(feedbackHistory);
          }
        }

        if (!setId && !savedState) {
          try {
            await rehydrateFromBackend(projectId);
          } catch (error) {
            console.error('[loadData] Backend rehydrate failed:', error);
          }
        }

        setLoading(false);
      } catch (error) {
        console.error('[loadData] Error loading data:', error);
        setLoading(false);
      }
    };

    loadData();
  }, [projectId]);
  const handleBack = () => {
    router.push(`/project/?id=${encodeURIComponent(projectId)}`);
  };

  const ensureImagesHaveBase64 = async () => {
    let refBase64 = referenceWork?.base64;
    let uploadedBase64 = uploadedArtwork?.base64;
    let updated = false;
    if (!refBase64) {
      if (referenceWork?.file) {
        try {
          refBase64 = await StorageManager.convertToBase64(referenceWork.file);
          setReferenceWork(prev => ({ ...prev, base64: refBase64 }));
          updated = true;
        } catch (error) {
          console.error('Failed to convert referenceWork file:', error);
          return { success: false, message: 'Failed to prepare reference image' };
        }
      } else if (referenceWork?.url && referenceWork.url.startsWith('blob:')) {
        try {
          const response = await fetch(referenceWork.url);
          const blob = await response.blob();
          refBase64 = await StorageManager.convertToBase64(blob);
          setReferenceWork(prev => ({ ...prev, base64: refBase64 }));
          updated = true;
        } catch (error) {
          console.error('Failed to fetch reference blob:', error);
          return { success: false, message: 'Failed to prepare reference image' };
        }
      } else {
        console.error('Reference image has no base64, File, or blob URL');
        return { success: false, message: 'Reference image data missing. Please re-upload.' };
      }
    }

    // Check and convert uploaded artwork if needed
    if (!uploadedBase64) {
      if (uploadedArtwork?.file) {
        try {
          uploadedBase64 = await StorageManager.convertToBase64(uploadedArtwork.file);
          setUploadedArtwork(prev => ({ ...prev, base64: uploadedBase64 }));
          updated = true;
        } catch (error) {
          console.error('Failed to convert uploadedArtwork file:', error);
          return { success: false, message: 'Failed to prepare uploaded artwork' };
        }
      } else if (uploadedArtwork?.url && uploadedArtwork.url.startsWith('blob:')) {
        try {
          const response = await fetch(uploadedArtwork.url);
          const blob = await response.blob();
          uploadedBase64 = await StorageManager.convertToBase64(blob);
          setUploadedArtwork(prev => ({ ...prev, base64: uploadedBase64 }));
          updated = true;
        } catch (error) {
          console.error('Failed to fetch uploaded blob:', error);
          return { success: false, message: 'Failed to prepare uploaded artwork' };
        }
      } else {
        console.error('Uploaded artwork has no base64, File, or blob URL');
        return { success: false, message: 'Uploaded artwork data missing. Please re-upload.' };
      }
    }

    if (updated) {
      await new Promise(resolve => setTimeout(resolve, 100));
    } else {
      console.log('Both images already have base64');
    }

    return {
      success: true,
      refBase64,
      uploadedBase64
    };
  };

  // Handle submit - ORIGINAL WORKING CODE PRESERVED
  const handleSubmit = async () => {
    if ((!userInput.trim() && droppedReferences.length === 0) || submitting) {
      return;
    }

    let processingStage = 'preparing generation';
    setSubmitting(true);
    setGeneratingImages(true);
    setShowResultsPanel(true);
    setSelectedImageIndex(null);
    setGenerationResult({ items: [] });
    setPreviewImageIndex(null);
    
    try {
      const base64Result = await ensureImagesHaveBase64();
      if (!base64Result.success) {
        alert(base64Result.message);
        setSubmitting(false);
        setGeneratingImages(false);
        setShowResultsPanel(false);
        return;
      }
      
      const { refBase64, uploadedBase64 } = base64Result;
      
      // Verify we have base64
      if (!refBase64 || !uploadedBase64) {
        alert('Failed to prepare images. Please re-upload them.');
        setSubmitting(false);
        setGeneratingImages(false);
        setShowResultsPanel(false);
        return;
      }
      
      // Build references array with proper structure
      const references = droppedReferences.map(ref => {
        if (ref.type === 'technical') {
          return {
            aspectName: ref.aspectName,
            description: ref.description,
            relatedTechnicalAspects: [ref.category] 
          };
        } else {
          return {
            aspectName: ref.aspectName,
            description: ref.description,
            relatedTechnicalAspects: ref.relatedAspects || []
          };
        }
      });

      const { iteration_id, user_image_id, reference_image_id } = await resolveGenerationIds(projectId);      
      // Note: Backend expects "userPrompt" not "base_user_prompt"
      const requestBody = {
        data: {
          project_id: projectId,
          iteration_id,
          user_image_id,
          reference_image_id,
          userPrompt: userInput,
          references: references,
          keep_structure: toggleEnabled
        }
      };
      const currentSetId = uploadedArtwork?.setId || referenceWork?.setId;
      
      if (!currentSetId) {
        console.error('No image set ID found');
        alert('Image set not found. Please re-upload images.');
        setSubmitting(false);
        setGeneratingImages(false);
        setShowResultsPanel(false);
        return;
      }
      
      const ensureResult = await StorageManager.ensureImageSetHasBase64(
        projectId,
        currentSetId,
        refBase64,
        uploadedBase64  
      );
      
      if (!ensureResult.success) {
        console.error('Failed to ensure base64 in IndexedDB:', ensureResult.reason);
        alert('Failed to save image data. Please try again.');
        setSubmitting(false);
        setGeneratingImages(false);
        setShowResultsPanel(false);
        return;
      }
      
      processingStage = 'starting image generation';
      const response = await apiFetchStream('/style/generation', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      // Handle SSE stream response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const generatedItems = [];
      const generationErrors = [];
      let buffer = '';
      let streamComplete = false;
      let completedEvent = null;

      const processSseEvent = (line) => {
        if (!line.startsWith('data: ')) {
          return;
        }

        try {
          const event = JSON.parse(line.slice(6));
          console.log('Received SSE event:', event);

          if (event.type === 'completed') {
            completedEvent = event;
            console.log('Generation completed:', event.message, 'Total items:', event.total_generated);
            streamComplete = true;
            if (event.error) {
              generationErrors.push(event.error);
            }
            return;
          }

          if (event.type === 'image_result') {
            if (event.status === 'success') {
              const item = {
                description: event.description,
                images: event.images,
                user_image_id: event.user_image_id,
                reference_image_id: projectIds.reference_image_id,
                generated_image_id: event.generated_image_id,
                iteration_id: event.iteration_id
              };

              console.log('Adding item to generatedItems:', item);
              generatedItems.push(item);
              console.log('Updating UI with', generatedItems.length, 'items');
              setGenerationResult({ items: [...generatedItems] });
            } else {
              generationErrors.push(
                event.error || `Image ${event.generated_image_id ?? 'unknown'} failed to generate.`
              );
            }
          }
        } catch (e) {
          console.error('Error parsing SSE event:', e, 'Line:', line);
        }
      };

      while (!streamComplete) {
        processingStage = 'receiving generated images';
        const { value, done } = await reader.read();
        if (done) {
          console.log('Stream reading completed (reader done)');
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          processSseEvent(line);
          if (streamComplete) break;
        }
      }

      if (buffer.trim()) {
        processSseEvent(buffer.trim());
      }

      if (generatedItems.length === 0) {
        throw new Error(
          generationErrors.length > 0
            ? generationErrors.join(' ')
            : completedEvent
              ? `Image generation completed without producing any images (backend reported ${completedEvent.total_generated ?? 0} results).`
              : 'Image generation stream ended before completion.'
        );
      }
      // NEW: Validate iteration_id in response
      if (generatedItems.length > 0) {
        if (generatedItems[0].iteration_id !== projectIds.iteration_id) {
          console.warn('Iteration ID mismatch! Expected:', projectIds.iteration_id, 'Got:', generatedItems[0].iteration_id);
        }
      }

      // Create final generation data structure
      const generationData = {
        items: generatedItems,
        timestamp: new Date().toISOString(),
        prompt: userInput,
        droppedReferences: droppedReferences,
        image_set_id: uploadedArtwork?.setId || referenceWork?.setId,
        iteration_id: projectIds.iteration_id // NEW: Include iteration_id
      };
      // Set as current generation result
      setGenerationResult(generationData);

      // Save to project-specific generation history
      processingStage = 'saving generation history';
      await StorageManager.saveProjectGenerationResult(
        projectId, 
        generationData,
        uploadedArtwork?.setId || referenceWork?.setId,
        projectIds.iteration_id
      );

      // Update image set status to 'generated'
      if (uploadedArtwork?.setId) {
        processingStage = 'updating image set status';
        await StorageManager.updateImageSetStatus(
          projectId,
          uploadedArtwork.setId,
          'generated'
        );
      }

      // Save full state (including generation result)
      processingStage = 'saving analysis state';
      await saveCurrentState(true, false); // false = include generation result
    } catch (error) {
      console.error(`Error in handleSubmit during ${processingStage}:`, error);
      alert(`Failed during ${processingStage}: ${error.message}`);
      
      // Reset states on error
      setGenerationResult(null);
      setShowResultsPanel(false);
    } finally {
      setSubmitting(false);
      setGeneratingImages(false);
    }
  };

  const handleGetFeedback = async (context = null) => {
    const selectedIndex = context?.selectedImageIndex ?? selectedImageIndex;

    if (selectedIndex === null || selectedIndex === undefined) {
      alert('Please select an image first');
      return;
    }

    const workingGeneration = context?.currentGeneration ?? generationResult;
    if (!workingGeneration) {
      return;
    }

    const items = Array.isArray(workingGeneration) ? workingGeneration : workingGeneration.items;
    if (!Array.isArray(items) || !items[selectedIndex]) {
      alert('Selected image is not ready yet. Please try again in a moment.');
      return;
    }

    const selectedItem = items[selectedIndex];
    const workingGenerationData = context?.currentGenerationData ?? null;

    setGettingFeedback(true);
    
    try {
      const combineDescription = (description) => {
        if (!description) return 'No description available';
        
        if (typeof description === 'object' && description.focus && description.target_effect && description.description) {
          const focusText = description.focus && description.focus.length > 0 
            ? `focus on ${description.focus.join(', ')}` 
            : '';
          const targetText = description.target_effect 
            ? `target effect ${description.target_effect}` 
            : '';
          const descText = description.description || '';
                    
          let result = '## Short summary of style tweaking intention';
          if (focusText) {
            result += `\n### Focus: ${focusText}`;
          }
          if (targetText) {
            result += `\n### Target Effect: ${targetText}`;
          }
          if (descText) {
            result += `\n### Description: ${descText}`;
          }
          
          return result || 'No description available';
        }
        
        return typeof description === 'string' ? description : 'No description available';
      };

      const combinedDescription = combineDescription(selectedItem.description);
      const loadingFeedbackItem = {
        id: Date.now(),
        selectedImage: selectedItem.images,
        description: selectedItem.description || 'No description available',
        generated_image_id: selectedItem.generated_image_id,
        user_image_id: selectedItem.user_image_id,
        iteration_id: selectedItem.iteration_id ?? projectIds.iteration_id,
        image_set_id: workingGenerationData?.image_set_id || uploadedArtwork?.setId || referenceWork?.setId,
        feedbackData: null,
        timestamp: new Date().toISOString(),
        projectId: projectId,
        generationPrompt: userInput || 'Unknown prompt',
        isLoading: true
      };

      const updatedFeedbackWithLoading = [...generationFeedback, loadingFeedbackItem];
      setGenerationFeedback(updatedFeedbackWithLoading);
      setCurrentFeedbackIndex(updatedFeedbackWithLoading.length - 1);
      setSelectedImageIndex(null);
      
      await StorageManager.saveGenerationFeedback(updatedFeedbackWithLoading, projectId);
      const feedbackRequestBody = {
        generated_image_id: selectedItem.generated_image_id,
        user_image_id: selectedItem.user_image_id,
        project_id: projectId,
        iteration_id: selectedItem.iteration_id ?? projectIds.iteration_id,
        description: combinedDescription,
        timestamp: new Date().toISOString(),
      };
      
      const feedbackData = await apiFetchJson('/style/agent-feedback', {
        method: 'POST',
        body: JSON.stringify(feedbackRequestBody),
      });
      const completedFeedbackItem = {
        ...loadingFeedbackItem,
        feedbackData: feedbackData,
        isLoading: false
      };
      
      const finalFeedback = updatedFeedbackWithLoading.map(item => 
        item.id === loadingFeedbackItem.id ? completedFeedbackItem : item
      );
      
      setGenerationFeedback(finalFeedback);
      await StorageManager.saveGenerationFeedback(finalFeedback, projectId);
      
    } catch (error) {
      console.error('Error getting feedback:', error);
      
      const filteredFeedback = generationFeedback.filter(item => !item.isLoading);
      setGenerationFeedback(filteredFeedback);
      setCurrentFeedbackIndex(Math.max(0, filteredFeedback.length - 1));
      
      await StorageManager.saveGenerationFeedback(filteredFeedback, projectId);
      
      alert(`Error getting feedback: ${error.message}`);
    } finally {
      setGettingFeedback(false);
    }
  };

  const handleAnalysisComment = async ({ comment_type, content }) => {
    try {
      if (!projectIds?.iteration_id) {
        console.warn('Skipped analysis comment: missing iteration_id');
        return;
      }

      const payload = {
        project_id: projectId,
        iteration_id: projectIds?.iteration_id,
        image_id: projectIds?.reference_image_id,
        source: 'Decompose',
        comment_type,
        content,
      };

      await apiFetchJson('/style/comment', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error('Error submitting analysis comment:', error);
    }
  };

  const handleResultComment = async ({ comment_type, image_id, content }) => {
    try {
      if (!projectIds?.iteration_id) {
        console.warn('Skipped result comment: missing iteration_id');
        return;
      }

      const payload = {
        project_id: projectId,
        iteration_id: projectIds?.iteration_id,
        image_id,
        source: 'Demonstrate',
        comment_type,
        content,
      };

      await apiFetchJson('/style/comment', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error('Error submitting result comment:', error);
    }
  };

  const handleFeedbackComment = async ({ comment_type, image_id, content }) => {
    try {
      if (!projectIds?.iteration_id) {
        console.warn('Skipped feedback comment: missing iteration_id');
        return;
      }

      const payload = {
        project_id: projectId,
        iteration_id: projectIds?.iteration_id,
        image_id,
        source: 'Simulate',
        comment_type,
        content,
      };

      await apiFetchJson('/style/comment', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error('Error submitting feedback comment:', error);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Loading analysis...</p>
      </div>
    );
  }
  if (!analysisData) {
    return (
      <div className={styles.errorContainer}>
        <p>No analysis data found. Please upload your artwork first.</p>
        <button onClick={() => router.push(`/project/?id=${encodeURIComponent(projectId)}`)} className={styles.backButton}>
          Back to Upload
        </button>
      </div>
    );
  }

  return (
    <div className={styles.analysisContainer}>
      {/* NEW: Replacement Notification */}
      {replacementNotification && (
        <div className={`${styles.notification} ${styles[replacementNotification.type]}`}>
          {replacementNotification.message}
        </div>
      )}

      {/* Header */}
      <div className={styles.analysisHeader}>
        <div className={styles.logo} onClick={handleBack}>
          <span className={styles.logoIcon}>✦</span>
          <span className={styles.logoText}>Style-AER</span>
        </div>
        <div className={styles.projectInfo}>
          <SettingsButton />
          {/* {externalLinkUrl && (
            <a
              href={externalLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.externalLinkButton}
            >
              Daily Questionnaire ↗
            </a>
          )} */}
          {/* <span className={styles.projectId}>Project: {projectId}</span> */}
        </div>
      </div>

      {/* Main Analysis Content */}
      <AnalysisContent
        analysisData={analysisData}
        referenceWork={referenceWork}
        uploadedArtwork={uploadedArtwork}
        userInput={userInput}
        setUserInput={setUserInput}
        droppedReferences={droppedReferences}
        setDroppedReferences={setDroppedReferences}
        expandedSection={expandedSection}
        setExpandedSection={setExpandedSection}
        submitting={submitting || replacingImage}
        onSubmit={handleSubmit}
        saveCurrentState={saveCurrentState}
        toggleEnabled={toggleEnabled}
        setToggleEnabled={setToggleEnabled}
        replacingReferenceImage={replacingReferenceImage}
        optimisticReferenceSrc={optimisticReplace.referenceSrc}
        optimisticTargetSrc={optimisticReplace.targetSrc}
        isReplacingReference={replacing.reference}
        isReplacingTarget={replacing.target}
        onUploadReplace={handleUploadReplace}
        onReAnalyze={handleReAnalyzeReference}
        canReAnalyze={Boolean(projectId && projectIds?.iteration_id && projectIds?.user_image_id && referenceWork)}
        onAnalysisComment={handleAnalysisComment}
      />

      {/* Results Panel - Shows immediately when data exists */}
      {showResultsPanel && (
        <ResultsPanel
          generationResult={generationResult}
          generatingImages={generatingImages}
          replacingImage={replacingImage}
          selectedImageIndex={selectedImageIndex}
          setSelectedImageIndex={setSelectedImageIndex}
          previewImageIndex={previewImageIndex}
          setPreviewImageIndex={setPreviewImageIndex}
          gettingFeedback={gettingFeedback}
          onGetFeedback={handleGetFeedback}
          saveCurrentState={saveCurrentState}
          uploadedArtwork={uploadedArtwork}
          referenceWork={referenceWork}
          projectId={projectId}
          onReplaceImage={handleReplaceImageOptimistic}
          onResultComment={handleResultComment}
        />
      )}

      {/* Feedback Panel - Shows immediately when data exists */}
      {generationFeedback.length > 0 && (
        <FeedbackPanel
          generationFeedback={generationFeedback}
          replacingImage={replacingImage}
          currentFeedbackIndex={currentFeedbackIndex}
          setCurrentFeedbackIndex={setCurrentFeedbackIndex}
          expandedAgent={expandedAgent}
          setExpandedAgent={setExpandedAgent}
          projectId={projectId}
          onReplaceImage={handleReplaceImageOptimistic}
          onFeedbackComment={handleFeedbackComment}
        />
      )}
    </div>
  );
}

export default function AnalysisPage() {
  return (
    <Suspense fallback={<div>Loading analysis...</div>}>
      <AnalysisPageContent />
    </Suspense>
  );
}