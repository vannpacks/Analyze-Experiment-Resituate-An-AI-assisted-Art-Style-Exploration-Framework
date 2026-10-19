// utils/storageManager.js - Complete modified version with iteration_id support and new helper methods
const STORAGE_KEYS = {
  ANALYSIS_DATA: 'analysisData',
  IMAGE_DATA: 'imageData', 
  GENERATION_RESULT: 'generationResult',
  USER_INPUT: 'userInput',
  DROPPED_REFERENCES: 'droppedReferences',
  SELECTED_IMAGE_INDEX: 'selectedImageIndex',
  FEEDBACK_PAGE_DATA: 'feedbackPageData',
  GENERATION_FEEDBACK: 'generationFeedback',
  PROJECT_RESULTS: 'projectResults',
  PROJECT_ACTIVE_SET: 'projectActiveSet'
};

const IDB_NAME = 'StyleAppStorage';
const IDB_VERSION = 4; // Increment version to add iteration_id support
const IDB_STORE_NAME = 'appData';
const IDB_PROJECT_STORE = 'projectData';

const IMAGE_SET_STATUS = {
  TEMPORARY: 'temporary',
  GENERATING: 'generating',
  GENERATED: 'generated',
  FAILED: 'failed'
};

export class StorageManager {
  static async initIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(IDB_NAME, IDB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          db.createObjectStore(IDB_STORE_NAME);
        }
        
        if (!db.objectStoreNames.contains(IDB_PROJECT_STORE)) {
          db.createObjectStore(IDB_PROJECT_STORE);
        }
      };
    });
  }

  static async saveToIndexedDB(key, data, useProjectStore = false) {
    try {
      const db = await this.initIndexedDB();
      const storeName = useProjectStore ? IDB_PROJECT_STORE : IDB_STORE_NAME;
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      return new Promise((resolve, reject) => {
        const request = store.put(data, key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(true);
      });
    } catch (error) {
      console.error(`Failed to save ${key} to IndexedDB:`, error);
      return false;
    }
  }

  static async loadFromIndexedDB(key, useProjectStore = false) {
    try {
      const db = await this.initIndexedDB();
      const storeName = useProjectStore ? IDB_PROJECT_STORE : IDB_STORE_NAME;
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      
      return new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || null);
      });
    } catch (error) {
      console.error(`Failed to load ${key} from IndexedDB:`, error);
      return null;
    }
  }

  static async deleteFromIndexedDB(key, useProjectStore = false) {
    try {
      const db = await this.initIndexedDB();
      const storeName = useProjectStore ? IDB_PROJECT_STORE : IDB_STORE_NAME;
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      return new Promise((resolve, reject) => {
        const request = store.delete(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(true);
      });
    } catch (error) {
      console.error(`Failed to delete ${key} from IndexedDB:`, error);
      return false;
    }
  }

  // Generate unique image set ID
  static generateImageSetId() {
    return `set_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Save project image set with iteration_id (images associated with a project)
  static async saveProjectImageSet(projectId, referenceWork, uploadedArtwork, setId = null, status = IMAGE_SET_STATUS.TEMPORARY, iterationId = null) {
    if (!projectId) {
      return { success: false, setId: null };
    }
    const imageSetId = setId || this.generateImageSetId();

    console.log('[saveProjectImageSet] project=', projectId, 'setId=', imageSetId,
  'hasRefB64=', !!referenceWork?.base64, 'hasUserB64=', !!uploadedArtwork?.base64);
    
    const imageSetData = {
      setId: imageSetId,
      project_id: projectId,
      iteration_id: iterationId, // NEW: Store iteration_id
      timestamp: new Date().toISOString(),
      status: status,
      referenceWork: referenceWork ? {
        name: referenceWork.name,
        base64: referenceWork.base64,
        size: referenceWork.file?.size || null,
        type: referenceWork.file?.type || null
      } : null,
      uploadedArtwork: uploadedArtwork ? {
        name: uploadedArtwork.name,
        base64: uploadedArtwork.base64,
        size: uploadedArtwork.file?.size || null,
        type: uploadedArtwork.file?.type || null
      } : null,
      backend_reference_image_id: null,
      backend_user_image_id: null
    };

    const setKey = `imageset_${projectId}_${imageSetId}`;
    const saved = await this.saveToIndexedDB(setKey, imageSetData, true);
    
    if (saved) {
      await this.setActiveImageSet(projectId, imageSetId);
      
      try {
        await this.cleanupTemporaryImageSets(projectId, 2);
      } catch (cleanupError) {
        console.warn('Cleanup error:', cleanupError);
      }
      
      return { success: true, setId: imageSetId };
    }
    
    return { success: false, setId: null };
  }

  // Set active image set for a project
  static async setActiveImageSet(projectId, setId) {
    if (!projectId || !setId) return false;
    
    const activeSetKey = `activeset_${projectId}`;
    const activeSetData = {
      project_id: projectId,
      active_set_id: setId,
      timestamp: new Date().toISOString()
    };
    
    const saved = await this.saveToIndexedDB(activeSetKey, activeSetData, true);
    
    if (saved) {
      try {
        sessionStorage.setItem(`${STORAGE_KEYS.PROJECT_ACTIVE_SET}_${projectId}`, setId);
      } catch (e) {
        // Ignore sessionStorage errors
      }
    }
    
    return saved;
  }

  // Get active image set ID for a project
  static async getActiveImageSetId(projectId) {
    if (!projectId) return null;
    
    try {
      const cached = sessionStorage.getItem(`${STORAGE_KEYS.PROJECT_ACTIVE_SET}_${projectId}`);
      if (cached) {
        return cached;
      }
    } catch (e) {
      // Ignore sessionStorage errors
    }
    
    const activeSetKey = `activeset_${projectId}`;
    const activeSetData = await this.loadFromIndexedDB(activeSetKey, true);
    
    if (activeSetData?.active_set_id) {
      try {
        sessionStorage.setItem(`${STORAGE_KEYS.PROJECT_ACTIVE_SET}_${projectId}`, activeSetData.active_set_id);
      } catch (e) {
        // Ignore sessionStorage errors
      }
      return activeSetData.active_set_id;
    }
    
    return null;
  }

  // Load active image set for a project
  static async loadActiveImageSet(projectId) {
    const activeSetId = await this.getActiveImageSetId(projectId);
    if (!activeSetId) {
      return null;
    }
    
    const setKey = `imageset_${projectId}_${activeSetId}`;
    return await this.loadFromIndexedDB(setKey, true);
  }

  // Load specific image set by projectId and setId
  static async loadImageSet(projectId, setId) {
    if (!projectId || !setId) {
      console.warn('[loadImageSet] Missing projectId or setId');
      return null;
    }
    
    const setKey = `imageset_${projectId}_${setId}`;
    const imageSet = await this.loadFromIndexedDB(setKey, true);
    
    if (imageSet) {
      console.log('[loadImageSet] Loaded setId:', setId);
      console.log('[loadImageSet] Has reference base64:', !!imageSet.referenceWork?.base64);
      console.log('[loadImageSet] Has artwork base64:', !!imageSet.uploadedArtwork?.base64);
      console.log('[loadImageSet] Status:', imageSet.status);
      console.log('[loadImageSet] Iteration ID:', imageSet.iteration_id);
    } else {
      console.warn('[loadImageSet] ImageSet not found for key:', setKey);
    }
    
    return imageSet;
  }

  /**
   * Ensure image set has base64 data before committing to history
   * This prevents "image not available" issues in history preview
   */
  static async ensureImageSetHasBase64(projectId, setId, referenceBase64 = null, uploadedBase64 = null) {
    if (!projectId || !setId) {
      console.warn('ensureImageSetHasBase64: Missing projectId or setId');
      return { success: false, reason: 'missing_params' };
    }

    const setKey = `imageset_${projectId}_${setId}`;
    
    try {
      // Load the image set from IndexedDB
      const imageSetData = await this.loadFromIndexedDB(setKey, true);
      
      if (!imageSetData) {
        console.warn('ensureImageSetHasBase64: Image set not found:', setKey);
        return { success: false, reason: 'set_not_found' };
      }

      let needsUpdate = false;

      // Check and patch referenceWork.base64
      if (!imageSetData.referenceWork?.base64 && referenceBase64) {
        console.log('Patching missing referenceWork.base64');
        if (!imageSetData.referenceWork) {
          imageSetData.referenceWork = {};
        }
        imageSetData.referenceWork.base64 = referenceBase64;
        needsUpdate = true;
      }

      // Check and patch uploadedArtwork.base64
      if (!imageSetData.uploadedArtwork?.base64 && uploadedBase64) {
        console.log('Patching missing uploadedArtwork.base64');
        if (!imageSetData.uploadedArtwork) {
          imageSetData.uploadedArtwork = {};
        }
        imageSetData.uploadedArtwork.base64 = uploadedBase64;
        needsUpdate = true;
      }

      // Save back if we made changes
      if (needsUpdate) {
        console.log('Saving patched image set to IndexedDB');
        const saved = await this.saveToIndexedDB(setKey, imageSetData, true);
        
        if (!saved) {
          console.error('Failed to save patched image set');
          return { success: false, reason: 'save_failed' };
        }
        
        console.log('Successfully ensured image set has base64 data');
        return { success: true, updated: true };
      }

      // No update needed - already has base64
      console.log('Image set already has base64 data, no update needed');
      return { success: true, updated: false };
      
    } catch (error) {
      console.error('Error in ensureImageSetHasBase64:', error);
      return { success: false, reason: 'error', error };
    }
  }
  // Update image set status with backend IDs and iteration_id
  static async updateImageSetStatus(projectId, setId, newStatus, backendIds = {}) {
    if (!projectId || !setId) return false;
    
    const setKey = `imageset_${projectId}_${setId}`;
    const imageSetData = await this.loadFromIndexedDB(setKey, true);
    
    if (imageSetData) {
      imageSetData.status = newStatus;
      imageSetData.statusUpdated = new Date().toISOString();
      
      // NEW: Store iteration_id if provided
      if (backendIds.iteration_id !== undefined) {
        imageSetData.iteration_id = backendIds.iteration_id;
      }
      
      if (backendIds.reference_image_id) {
        imageSetData.backend_reference_image_id = backendIds.reference_image_id;
      }
      if (backendIds.user_image_id) {
        imageSetData.backend_user_image_id = backendIds.user_image_id;
      }
      
      const saved = await this.saveToIndexedDB(setKey, imageSetData, true);
      
      if (saved && newStatus === IMAGE_SET_STATUS.GENERATED) {
        try {
          await this.cleanupTemporaryImageSets(projectId, 2);
        } catch (cleanupError) {
          console.warn('Cleanup error:', cleanupError);
        }
      }
      
      return saved;
    }
    
    return false;
  }

  // Get iteration_id from active image set
  static async getIterationId(projectId) {
    if (!projectId) return null;
    
    const activeImageSet = await this.loadActiveImageSet(projectId);
    return activeImageSet?.iteration_id || null;
  }

  // Cleanup temporary image sets (keep only the most recent N sets)
  static async cleanupTemporaryImageSets(projectId, keepCount = 2) {
    if (!projectId) return;

    try {
      const db = await this.initIndexedDB();
      const transaction = db.transaction([IDB_PROJECT_STORE], 'readonly');
      const store = transaction.objectStore(IDB_PROJECT_STORE);
      
      const allKeys = await new Promise((resolve, reject) => {
        const request = store.getAllKeys();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

      const imageSetKeys = allKeys.filter(key => 
        typeof key === 'string' && 
        key.startsWith(`imageset_${projectId}_`)
      );

      if (imageSetKeys.length <= keepCount) {
        return;
      }

      const imageSets = await Promise.all(
        imageSetKeys.map(key => this.loadFromIndexedDB(key, true))
      );

      const temporarySets = imageSets
        .map((set, index) => ({ set, key: imageSetKeys[index] }))
        .filter(({ set }) => set?.status === IMAGE_SET_STATUS.TEMPORARY)
        .sort((a, b) => new Date(b.set.timestamp) - new Date(a.set.timestamp));

      if (temporarySets.length > keepCount) {
        const setsToDelete = temporarySets.slice(keepCount);
        
        for (const { key } of setsToDelete) {
          await this.deleteFromIndexedDB(key, true);
          console.log(`Cleaned up temporary image set: ${key}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up temporary image sets:', error);
    }
  }

  // Create object URLs from active image set
  static async createObjectURLsFromActiveImageSet(projectId) {
    const imageSet = await this.loadActiveImageSet(projectId);
    if (!imageSet) return {};

    const result = {};

    if (imageSet.referenceWork?.base64) {
      try {
        const response = await fetch(imageSet.referenceWork.base64);
        const blob = await response.blob();
        result.referenceWork = {
          url: URL.createObjectURL(blob),
          name: imageSet.referenceWork.name,
          base64: imageSet.referenceWork.base64,
          setId: imageSet.setId,
          status: imageSet.status,
          iteration_id: imageSet.iteration_id // NEW: Include iteration_id
        };
      } catch (error) {
        console.error('Error creating reference work URL:', error);
      }
    }

    if (imageSet.uploadedArtwork?.base64) {
      try {
        const response = await fetch(imageSet.uploadedArtwork.base64);
        const blob = await response.blob();
        result.uploadedArtwork = {
          url: URL.createObjectURL(blob),
          name: imageSet.uploadedArtwork.name,
          base64: imageSet.uploadedArtwork.base64,
          setId: imageSet.setId,
          status: imageSet.status,
          iteration_id: imageSet.iteration_id // NEW: Include iteration_id
        };
      } catch (error) {
        console.error('Error creating uploaded artwork URL:', error);
      }
    }

    return result;
  }

  // Save analysis page state with iteration_id
  static async saveAnalysisPageState(state) {
    const projectId = state.projectIds?.project_id;
    if (!projectId) {
      console.warn('No projectId found in state');
      return false;
    }

    const stateKey = `analysis_${projectId}`;
    
    // Prepare state for storage (exclude large data and file objects)
    const storableState = {
      ...state,
      projectIds: {
        ...state.projectIds,
        iteration_id: state.projectIds?.iteration_id // NEW: Ensure iteration_id is included
      },
      referenceWork: state.referenceWork ? {
        name: state.referenceWork.name,
        setId: state.referenceWork.setId,
        status: state.referenceWork.status,
        iteration_id: state.referenceWork.iteration_id // NEW
      } : null,
      uploadedArtwork: state.uploadedArtwork ? {
        name: state.uploadedArtwork.name,
        setId: state.uploadedArtwork.setId,
        status: state.uploadedArtwork.status,
        iteration_id: state.uploadedArtwork.iteration_id // NEW
      } : null
    };

    return await this.saveToIndexedDB(stateKey, storableState, true);
  }

  // Load analysis page state
  static async loadAnalysisPageState(projectId) {
    if (!projectId) return null;
    
    const stateKey = `analysis_${projectId}`;
    return await this.loadFromIndexedDB(stateKey, true);
  }

  // Save project generation result with iteration_id
  static async saveProjectGenerationResult(projectId, generationData, imageSetId = null, iterationId = null) {
    if (!projectId) return { success: false, resultId: null };

    const resultId = `result_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const resultKey = `generation_${projectId}_${resultId}`;
    
    const resultData = {
      resultId,
      project_id: projectId,
      iteration_id: iterationId, // NEW: Store iteration_id
      image_set_id: imageSetId,
      timestamp: new Date().toISOString(),
      items: generationData.items || [],
      userInput: generationData.userInput || '',
      droppedReferences: generationData.droppedReferences || []
    };

    const saved = await this.saveToIndexedDB(resultKey, resultData, true);
    
    if (saved) {
      console.log(`Saved generation result: ${resultKey} with iteration_id: ${iterationId}`);
      return { success: true, resultId };
    }
    
    return { success: false, resultId: null };
  }

  // Load project generation history
  static async loadProjectGenerationHistory(projectId) {
    if (!projectId) return [];

    try {
      const db = await this.initIndexedDB();
      const transaction = db.transaction([IDB_PROJECT_STORE], 'readonly');
      const store = transaction.objectStore(IDB_PROJECT_STORE);
      
      const allKeys = await new Promise((resolve, reject) => {
        const request = store.getAllKeys();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

      const generationKeys = allKeys.filter(key => 
        typeof key === 'string' && 
        key.startsWith(`generation_${projectId}_`)
      );

      const generations = await Promise.all(
        generationKeys.map(key => this.loadFromIndexedDB(key, true))
      );

      return generations
        .filter(gen => gen !== null)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
    } catch (error) {
      console.error('Error loading generation history:', error);
      return [];
    }
  }

  // Keep only the newest N generation results and feedback items for a project
  static async pruneProjectHistory(projectId, keepGenerationCount = 15, keepFeedbackCount = 15) {
    if (!projectId) {
      return { generationDeleted: 0, feedbackTrimmed: 0 };
    }

    let generationDeleted = 0;
    let feedbackTrimmed = 0;

    try {
      const db = await this.initIndexedDB();
      const transaction = db.transaction([IDB_PROJECT_STORE], 'readonly');
      const store = transaction.objectStore(IDB_PROJECT_STORE);

      const allKeys = await new Promise((resolve, reject) => {
        const request = store.getAllKeys();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

      const generationKeys = allKeys.filter(key =>
        typeof key === 'string' &&
        key.startsWith(`generation_${projectId}_`)
      );

      if (generationKeys.length > keepGenerationCount) {
        const generationEntries = await Promise.all(
          generationKeys.map(async key => {
            const data = await this.loadFromIndexedDB(key, true);
            return { key, data };
          })
        );

        const sortedNewestFirst = generationEntries
          .filter(entry => entry.data)
          .sort((a, b) => new Date(b.data.timestamp || 0) - new Date(a.data.timestamp || 0));

        const keysToDelete = sortedNewestFirst
          .slice(keepGenerationCount)
          .map(entry => entry.key);

        for (const key of keysToDelete) {
          const deleted = await this.deleteFromIndexedDB(key, true);
          if (deleted) {
            generationDeleted += 1;
          }
        }
      }

      const feedbackKey = `feedback_${projectId}`;
      const feedbackData = await this.loadFromIndexedDB(feedbackKey, true);

      if (feedbackData?.feedback_items && Array.isArray(feedbackData.feedback_items)) {
        const totalFeedback = feedbackData.feedback_items.length;
        if (totalFeedback > keepFeedbackCount) {
          const trimmedItems = feedbackData.feedback_items.slice(-keepFeedbackCount);
          feedbackTrimmed = totalFeedback - trimmedItems.length;

          await this.saveToIndexedDB(feedbackKey, {
            ...feedbackData,
            feedback_items: trimmedItems,
            timestamp: new Date().toISOString(),
            count: trimmedItems.length
          }, true);
        }
      }

      return { generationDeleted, feedbackTrimmed };
    } catch (error) {
      console.error('Error pruning project history:', error);
      return { generationDeleted, feedbackTrimmed };
    }
  }

  // Save generation feedback with iteration_id
  static async saveGenerationFeedback(feedbackArray, projectId = null) {
    if (!feedbackArray || !Array.isArray(feedbackArray)) {
      return false;
    }

    // Ensure each feedback item has iteration_id if available
    const feedbackWithIterationId = feedbackArray.map(item => ({
      ...item,
      iteration_id: item.iteration_id || null // NEW
    }));

    if (projectId) {
      const feedbackKey = `feedback_${projectId}`;
      return await this.saveToIndexedDB(feedbackKey, {
        project_id: projectId,
        feedback_items: feedbackWithIterationId,
        timestamp: new Date().toISOString(),
        count: feedbackWithIterationId.length
      }, true);
    }

    return await this.saveToIndexedDB(STORAGE_KEYS.GENERATION_FEEDBACK, feedbackWithIterationId);
  }

  // Load generation feedback
  static async loadGenerationFeedback(projectId = null) {
    try {
      if (projectId) {
        const feedbackKey = `feedback_${projectId}`;
        const feedbackData = await this.loadFromIndexedDB(feedbackKey, true);
        return feedbackData?.feedback_items || [];
      }

      const data = await this.loadFromIndexedDB(STORAGE_KEYS.GENERATION_FEEDBACK);
      return data || [];
    } catch (error) {
      console.error('Error loading generation feedback:', error);
      return [];
    }
  }

  // Clear generation feedback
  static async clearGenerationFeedback(projectId = null) {
    try {
      if (projectId) {
        const feedbackKey = `feedback_${projectId}`;
        return await this.deleteFromIndexedDB(feedbackKey, true);
      }

      return await this.deleteFromIndexedDB(STORAGE_KEYS.GENERATION_FEEDBACK);
    } catch (error) {
      console.error('Error clearing generation feedback:', error);
      return false;
    }
  }

  // Add generation feedback item with iteration_id
  static async addGenerationFeedbackItem(feedbackItem, projectId = null) {
    try {
      const existingFeedback = await this.loadGenerationFeedback(projectId);
      
      // Ensure iteration_id is included
      const itemWithIterationId = {
        ...feedbackItem,
        iteration_id: feedbackItem.iteration_id || null // NEW
      };
      
      const updatedFeedback = [...existingFeedback, itemWithIterationId];
      const saved = await this.saveGenerationFeedback(updatedFeedback, projectId);
      
      if (saved) {
        return updatedFeedback;
      }
      
      return existingFeedback;
    } catch (error) {
      console.error('Error adding generation feedback item:', error);
      return await this.loadGenerationFeedback(projectId);
    }
  }

  // Update specific generation feedback item
  static async updateGenerationFeedbackItem(feedbackId, updatedItem, projectId = null) {
    try {
      const existingFeedback = await this.loadGenerationFeedback(projectId);
      const updatedFeedback = existingFeedback.map(item => 
        item.id === feedbackId ? { ...item, ...updatedItem } : item
      );
      
      const saved = await this.saveGenerationFeedback(updatedFeedback, projectId);
      
      if (saved) {
        return updatedFeedback;
      }
      
      return existingFeedback;
    } catch (error) {
      console.error('Error updating generation feedback item:', error);
      return await this.loadGenerationFeedback(projectId);
    }
  }

  // Rest of the methods from original implementation...
  
  static saveToStorage(key, data) {
    try {
      sessionStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (error) {
      this.saveToIndexedDB(key, data).then(success => {
        if (success) {
          try {
            sessionStorage.setItem(`${key}_location`, 'indexedDB');
          } catch (e) {
            // Ignore error
          }
        }
      });
      return 'indexedDB';
    }
  }

  static async loadFromStorage(key) {
    try {
      const location = sessionStorage.getItem(`${key}_location`);
      if (location === 'indexedDB') {
        return await this.loadFromIndexedDB(key);
      }

      const data = sessionStorage.getItem(key);
      if (data) {
        return JSON.parse(data);
      }

      return await this.loadFromIndexedDB(key);
      
    } catch (error) {
      return null;
    }
  }

  static async saveWithFallback(key, data) {
    const result = this.saveToStorage(key, data);
    
    if (result === 'indexedDB') {
      await this.saveToIndexedDB(key, data);
      return true;
    }
    
    return result;
  }

  // Clear only session storage, keep IndexedDB data (results, feedback, project data)
  static async clearSessionStorageOnly() {
    Object.values(STORAGE_KEYS).forEach(key => {
      sessionStorage.removeItem(key);
      sessionStorage.removeItem(`${key}_location`);
    });
    
    Object.keys(sessionStorage).forEach(key => {
      if (key.includes('projectImages_') || 
          key.includes('projectResults_') || 
          key.includes('projectActiveSet_')) {
        sessionStorage.removeItem(key);
      }
    });
    
    if (window.__appData) delete window.__appData;
    if (window.__feedbackData) delete window.__feedbackData;
    
    console.log('Session storage cleared, IndexedDB data (results, feedback, project data) preserved');
  }

  // Clear all storage
  static async clearAllStorage() {
    Object.values(STORAGE_KEYS).forEach(key => {
      sessionStorage.removeItem(key);
      sessionStorage.removeItem(`${key}_location`);
    });
    
    Object.keys(sessionStorage).forEach(key => {
      if (key.includes('projectImages_') || key.includes('projectResults_') || key.includes('projectActiveSet_')) {
        sessionStorage.removeItem(key);
      }
    });
    
    try {
      const db = await this.initIndexedDB();
      
      const mainTransaction = db.transaction([IDB_STORE_NAME], 'readwrite');
      const mainStore = mainTransaction.objectStore(IDB_STORE_NAME);
      await new Promise((resolve, reject) => {
        const request = mainStore.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
      
      const projectTransaction = db.transaction([IDB_PROJECT_STORE], 'readwrite');
      const projectStore = projectTransaction.objectStore(IDB_PROJECT_STORE);
      await new Promise((resolve, reject) => {
        const request = projectStore.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
      
    } catch (error) {
      console.error('Error clearing IndexedDB:', error);
    }
    
    if (window.__appData) delete window.__appData;
    if (window.__feedbackData) delete window.__feedbackData;
  }

  // Utility methods
  static convertToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  }

  static async createObjectURLFromStorage(imageData) {
    if (!imageData) return null;
    
    if (imageData.base64) {
      try {
        const response = await fetch(imageData.base64);
        const blob = await response.blob();
        return {
          url: URL.createObjectURL(blob),
          name: imageData.name
        };
      } catch (error) {
        console.warn('Failed to create object URL from base64:', error);
        return null;
      }
    }
    
    return null;
  }
}