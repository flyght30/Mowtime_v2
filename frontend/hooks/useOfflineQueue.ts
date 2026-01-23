/**
 * useOfflineQueue Hook
 * Manages offline queue for API requests when connectivity is poor
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as Network from 'expo-network';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';

// Queue item types
export interface QueuedRequest {
  id: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  data?: any;
  timestamp: number;
  retries: number;
  maxRetries: number;
}

// Queue state
interface QueueState {
  isOnline: boolean;
  queue: QueuedRequest[];
  processing: boolean;
  lastSync: number | null;
}

const STORAGE_KEY = '@offline_queue';
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

export function useOfflineQueue() {
  const [state, setState] = useState<QueueState>({
    isOnline: true,
    queue: [],
    processing: false,
    lastSync: null,
  });

  const processingRef = useRef(false);
  const networkSubscription = useRef<any>(null);

  // Load queue from storage on mount
  useEffect(() => {
    loadQueue();
    checkNetworkStatus();

    // Subscribe to network changes
    const interval = setInterval(checkNetworkStatus, 10000); // Check every 10s

    return () => {
      clearInterval(interval);
    };
  }, []);

  // Process queue when online
  useEffect(() => {
    if (state.isOnline && state.queue.length > 0 && !state.processing) {
      processQueue();
    }
  }, [state.isOnline, state.queue.length]);

  const loadQueue = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const queue = JSON.parse(stored) as QueuedRequest[];
        setState((prev) => ({ ...prev, queue }));
      }
    } catch (error) {
      console.error('Failed to load offline queue:', error);
    }
  };

  const saveQueue = async (queue: QueuedRequest[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch (error) {
      console.error('Failed to save offline queue:', error);
    }
  };

  const checkNetworkStatus = async () => {
    try {
      const networkState = await Network.getNetworkStateAsync();
      const isOnline = networkState.isConnected && networkState.isInternetReachable;
      setState((prev) => ({ ...prev, isOnline: !!isOnline }));
    } catch (error) {
      console.error('Failed to check network status:', error);
    }
  };

  const addToQueue = useCallback(
    async (
      endpoint: string,
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      data?: any
    ): Promise<string> => {
      const request: QueuedRequest = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        endpoint,
        method,
        data,
        timestamp: Date.now(),
        retries: 0,
        maxRetries: MAX_RETRIES,
      };

      setState((prev) => {
        const newQueue = [...prev.queue, request];
        saveQueue(newQueue);
        return { ...prev, queue: newQueue };
      });

      return request.id;
    },
    []
  );

  const removeFromQueue = useCallback((id: string) => {
    setState((prev) => {
      const newQueue = prev.queue.filter((r) => r.id !== id);
      saveQueue(newQueue);
      return { ...prev, queue: newQueue };
    });
  }, []);

  const clearQueue = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setState((prev) => ({ ...prev, queue: [] }));
  }, []);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setState((prev) => ({ ...prev, processing: true }));

    const { queue } = state;
    const failedRequests: QueuedRequest[] = [];

    for (const request of queue) {
      try {
        // Check if still online before each request
        const networkState = await Network.getNetworkStateAsync();
        if (!networkState.isConnected || !networkState.isInternetReachable) {
          failedRequests.push(request);
          continue;
        }

        // Execute the request
        let response;
        switch (request.method) {
          case 'GET':
            response = await api.get(request.endpoint);
            break;
          case 'POST':
            response = await api.post(request.endpoint, request.data);
            break;
          case 'PUT':
            response = await api.put(request.endpoint, request.data);
            break;
          case 'PATCH':
            response = await api.patch(request.endpoint, request.data);
            break;
          case 'DELETE':
            response = await api.delete(request.endpoint);
            break;
        }

        if (!response.success) {
          throw new Error(response.error?.message || 'Request failed');
        }

        console.log(`Offline queue: Processed ${request.method} ${request.endpoint}`);
      } catch (error) {
        console.error(`Offline queue: Failed ${request.method} ${request.endpoint}:`, error);

        // Retry if not exceeded max retries
        if (request.retries < request.maxRetries) {
          failedRequests.push({
            ...request,
            retries: request.retries + 1,
          });
        } else {
          console.warn(`Offline queue: Max retries exceeded for ${request.endpoint}`);
        }
      }
    }

    // Update queue with failed requests
    setState((prev) => ({
      ...prev,
      queue: failedRequests,
      processing: false,
      lastSync: Date.now(),
    }));
    saveQueue(failedRequests);
    processingRef.current = false;
  }, [state.queue]);

  // Helper to make requests with offline support
  const makeRequest = useCallback(
    async <T = any>(
      endpoint: string,
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      data?: any,
      options?: { offlineCapable?: boolean }
    ): Promise<{ success: boolean; data?: T; queued?: boolean; queueId?: string }> => {
      // Check network status
      const networkState = await Network.getNetworkStateAsync();
      const isOnline = networkState.isConnected && networkState.isInternetReachable;

      if (!isOnline && options?.offlineCapable !== false) {
        // Queue the request for later
        const queueId = await addToQueue(endpoint, method, data);
        return { success: true, queued: true, queueId };
      }

      try {
        let response;
        switch (method) {
          case 'GET':
            response = await api.get<T>(endpoint);
            break;
          case 'POST':
            response = await api.post<T>(endpoint, data);
            break;
          case 'PUT':
            response = await api.put<T>(endpoint, data);
            break;
          case 'PATCH':
            response = await api.patch<T>(endpoint, data);
            break;
          case 'DELETE':
            response = await api.delete<T>(endpoint);
            break;
          default:
            throw new Error(`Unknown method: ${method}`);
        }

        if (response.success) {
          return { success: true, data: response.data };
        } else {
          throw new Error(response.error?.message || 'Request failed');
        }
      } catch (error) {
        // If request fails and offline capable, queue it
        if (options?.offlineCapable !== false) {
          const queueId = await addToQueue(endpoint, method, data);
          return { success: true, queued: true, queueId };
        }
        throw error;
      }
    },
    [addToQueue]
  );

  return {
    isOnline: state.isOnline,
    queueLength: state.queue.length,
    processing: state.processing,
    lastSync: state.lastSync,
    queue: state.queue,
    addToQueue,
    removeFromQueue,
    clearQueue,
    processQueue,
    makeRequest,
    checkNetworkStatus,
  };
}

export default useOfflineQueue;
