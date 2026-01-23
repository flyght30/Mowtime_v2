/**
 * Tech Context
 * Manages technician-specific state including current job, status, and location
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { techApi, TechProfile, TechJob, TechStatus, TechRoute } from '../services/techApi';
import { useAuth } from './AuthContext';

// Types
interface TechState {
  profile: TechProfile | null;
  todaysJobs: TechJob[];
  currentJob: TechJob | null;
  route: TechRoute | null;
  isLoading: boolean;
  isLocationEnabled: boolean;
  lastLocation: {
    latitude: number;
    longitude: number;
  } | null;
  error: string | null;
}

interface TechContextType extends TechState {
  // Profile actions
  refreshProfile: () => Promise<void>;
  updateStatus: (status: TechStatus, jobId?: string) => Promise<void>;

  // Job actions
  refreshJobs: () => Promise<void>;
  startJob: (jobId: string) => Promise<void>;
  arriveAtJob: (jobId: string) => Promise<void>;
  completeJob: (jobId: string, completion: any) => Promise<void>;
  setCurrentJob: (job: TechJob | null) => void;

  // Route
  refreshRoute: () => Promise<void>;

  // Location
  startLocationTracking: () => Promise<boolean>;
  stopLocationTracking: () => void;

  // Clock
  clockIn: () => Promise<void>;
  clockOut: () => Promise<void>;
}

// Default state
const defaultState: TechState = {
  profile: null,
  todaysJobs: [],
  currentJob: null,
  route: null,
  isLoading: true,
  isLocationEnabled: false,
  lastLocation: null,
  error: null,
};

// Create context
const TechContext = createContext<TechContextType | undefined>(undefined);

// Location update interval (30 seconds)
const LOCATION_UPDATE_INTERVAL = 30000;

// Provider component
export function TechProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [state, setState] = useState<TechState>(defaultState);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const locationInterval = useRef<NodeJS.Timeout | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  // Initialize tech data when authenticated
  useEffect(() => {
    if (isAuthenticated && user?.role === 'staff') {
      initializeTechData();
    } else {
      setState(defaultState);
    }
  }, [isAuthenticated, user]);

  // Handle app state changes for location tracking
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [state.isLocationEnabled]);

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      // App came to foreground - refresh data
      if (isAuthenticated && user?.role === 'staff') {
        refreshProfile();
        refreshJobs();
      }
    }
    appState.current = nextAppState;
  };

  const initializeTechData = async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      // Fetch profile and today's jobs in parallel
      const [profile, jobs] = await Promise.all([
        techApi.getMyProfile(),
        techApi.getTodaysJobs(),
      ]);

      // Find current job if tech is on a job
      let currentJob: TechJob | null = null;
      if (profile.current_job_id) {
        currentJob = jobs.find(j => j.job_id === profile.current_job_id) || null;
        if (!currentJob) {
          try {
            currentJob = await techApi.getJob(profile.current_job_id);
          } catch {
            // Job not found
          }
        }
      }

      setState(prev => ({
        ...prev,
        profile,
        todaysJobs: jobs,
        currentJob,
        isLoading: false,
      }));

      // Start location tracking if tech is active
      if (profile.status !== 'off_duty') {
        startLocationTracking();
      }
    } catch (error) {
      console.error('Failed to initialize tech data:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to load data',
      }));
    }
  };

  const refreshProfile = useCallback(async () => {
    try {
      const profile = await techApi.getMyProfile();
      setState(prev => ({ ...prev, profile }));
    } catch (error) {
      console.error('Failed to refresh profile:', error);
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    try {
      const jobs = await techApi.getTodaysJobs();
      setState(prev => ({ ...prev, todaysJobs: jobs }));
    } catch (error) {
      console.error('Failed to refresh jobs:', error);
    }
  }, []);

  const refreshRoute = useCallback(async () => {
    try {
      const route = await techApi.getMyRoute();
      setState(prev => ({ ...prev, route }));
    } catch (error) {
      console.error('Failed to refresh route:', error);
    }
  }, []);

  const updateStatus = useCallback(async (status: TechStatus, jobId?: string) => {
    try {
      const profile = await techApi.updateStatus(status, jobId);
      setState(prev => ({ ...prev, profile }));

      // Start/stop location tracking based on status
      if (status === 'off_duty') {
        stopLocationTracking();
      } else if (!state.isLocationEnabled) {
        startLocationTracking();
      }
    } catch (error) {
      console.error('Failed to update status:', error);
      throw error;
    }
  }, [state.isLocationEnabled]);

  const startJob = useCallback(async (jobId: string) => {
    try {
      const job = await techApi.startJob(jobId);
      setState(prev => ({
        ...prev,
        currentJob: job,
        todaysJobs: prev.todaysJobs.map(j =>
          j.job_id === jobId ? { ...j, status: 'in_progress', started_at: new Date().toISOString() } : j
        ),
        profile: prev.profile ? { ...prev.profile, status: 'enroute', current_job_id: jobId } : null,
      }));
    } catch (error) {
      console.error('Failed to start job:', error);
      throw error;
    }
  }, []);

  const arriveAtJob = useCallback(async (jobId: string) => {
    try {
      const job = await techApi.arriveAtJob(jobId);
      setState(prev => ({
        ...prev,
        currentJob: job,
        profile: prev.profile ? { ...prev.profile, status: 'on_site' } : null,
      }));
    } catch (error) {
      console.error('Failed to arrive at job:', error);
      throw error;
    }
  }, []);

  const completeJob = useCallback(async (jobId: string, completion: any) => {
    try {
      const job = await techApi.completeJob(jobId, completion);
      setState(prev => ({
        ...prev,
        currentJob: null,
        todaysJobs: prev.todaysJobs.map(j =>
          j.job_id === jobId ? { ...j, status: 'completed', completed_at: new Date().toISOString() } : j
        ),
        profile: prev.profile ? { ...prev.profile, status: 'available', current_job_id: undefined } : null,
      }));
    } catch (error) {
      console.error('Failed to complete job:', error);
      throw error;
    }
  }, []);

  const setCurrentJob = useCallback((job: TechJob | null) => {
    setState(prev => ({ ...prev, currentJob: job }));
  }, []);

  const startLocationTracking = useCallback(async (): Promise<boolean> => {
    try {
      // Request permissions
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        console.warn('Foreground location permission not granted');
        return false;
      }

      // Request background permission for Android
      if (Platform.OS === 'android') {
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== 'granted') {
          console.warn('Background location permission not granted');
          // Continue with foreground-only tracking
        }
      }

      // Get initial location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setState(prev => ({
        ...prev,
        lastLocation: coords,
        isLocationEnabled: true,
      }));

      // Send initial location update
      await sendLocationUpdate(
        location.coords.latitude,
        location.coords.longitude,
        location.coords.heading || undefined,
        location.coords.speed || undefined,
        location.coords.accuracy || undefined
      );

      // Set up periodic location updates
      if (locationInterval.current) {
        clearInterval(locationInterval.current);
      }

      locationInterval.current = setInterval(async () => {
        try {
          const currentLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });

          setState(prev => ({
            ...prev,
            lastLocation: {
              latitude: currentLocation.coords.latitude,
              longitude: currentLocation.coords.longitude,
            },
          }));

          await sendLocationUpdate(
            currentLocation.coords.latitude,
            currentLocation.coords.longitude,
            currentLocation.coords.heading || undefined,
            currentLocation.coords.speed || undefined,
            currentLocation.coords.accuracy || undefined
          );
        } catch (error) {
          console.error('Failed to update location:', error);
        }
      }, LOCATION_UPDATE_INTERVAL);

      return true;
    } catch (error) {
      console.error('Failed to start location tracking:', error);
      return false;
    }
  }, []);

  const stopLocationTracking = useCallback(() => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
    if (locationInterval.current) {
      clearInterval(locationInterval.current);
      locationInterval.current = null;
    }
    setState(prev => ({ ...prev, isLocationEnabled: false }));
  }, []);

  const sendLocationUpdate = async (
    latitude: number,
    longitude: number,
    heading?: number,
    speed?: number,
    accuracy?: number
  ) => {
    try {
      await techApi.updateLocation({
        latitude,
        longitude,
        heading,
        speed,
        accuracy,
      });
    } catch (error) {
      console.error('Failed to send location update:', error);
    }
  };

  const clockIn = useCallback(async () => {
    try {
      await techApi.clockIn();
      await updateStatus('available');
    } catch (error) {
      console.error('Failed to clock in:', error);
      throw error;
    }
  }, [updateStatus]);

  const clockOut = useCallback(async () => {
    try {
      await techApi.clockOut();
      await updateStatus('off_duty');
    } catch (error) {
      console.error('Failed to clock out:', error);
      throw error;
    }
  }, [updateStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopLocationTracking();
    };
  }, [stopLocationTracking]);

  return (
    <TechContext.Provider
      value={{
        ...state,
        refreshProfile,
        updateStatus,
        refreshJobs,
        startJob,
        arriveAtJob,
        completeJob,
        setCurrentJob,
        refreshRoute,
        startLocationTracking,
        stopLocationTracking,
        clockIn,
        clockOut,
      }}
    >
      {children}
    </TechContext.Provider>
  );
}

// Hook to use tech context
export function useTech(): TechContextType {
  const context = useContext(TechContext);
  if (context === undefined) {
    throw new Error('useTech must be used within a TechProvider');
  }
  return context;
}

export default TechContext;
