/**
 * Tech Mobile App API Service
 * Handles all technician-specific API calls
 */

import api from './api';

// Types
export type TechStatus = 'available' | 'assigned' | 'enroute' | 'on_site' | 'complete' | 'off_duty';

export interface TechLocation {
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
  timestamp: string;
}

export interface TechProfile {
  tech_id: string;
  business_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone: string;
  avatar_url?: string;
  status: TechStatus;
  location?: TechLocation;
  current_job_id?: string;
  next_job_id?: string;
  skills: string[];
  is_active: boolean;
  created_at: string;
}

export interface JobClient {
  client_id: string;
  name: string;
  phone?: string;
  email?: string;
}

export interface JobAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  latitude?: number;
  longitude?: number;
}

export interface TechJob {
  job_id: string;
  schedule_entry_id?: string;
  business_id: string;
  client: JobClient;
  address: JobAddress;
  service_type: string;
  service_name?: string;
  description?: string;
  notes?: string;
  scheduled_date: string;
  scheduled_time: string;
  end_time?: string;
  estimated_duration?: number; // minutes
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  route_order?: number;
  equipment_needed?: string[];
  special_instructions?: string;
  // Completion data
  started_at?: string;
  completed_at?: string;
  completion_notes?: string;
  photos?: string[];
  signature_url?: string;
  // Pricing
  estimated_price?: number;
  final_price?: number;
}

export interface JobCompletion {
  notes?: string;
  photos?: string[]; // base64 encoded images
  signature?: string; // base64 encoded signature image
  final_price?: number;
  materials_used?: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  labor_hours?: number;
}

export interface RouteStop {
  job_id: string;
  client_name: string;
  address: string;
  scheduled_time: string;
  service_type: string;
  status: string;
  latitude?: number;
  longitude?: number;
  route_order: number;
  estimated_duration?: number;
}

export interface TechRoute {
  tech_id: string;
  date: string;
  stops: RouteStop[];
  total_distance_miles?: number;
  total_duration_minutes?: number;
  optimized: boolean;
}

// API Functions
export const techApi = {
  // Profile
  getMyProfile: async (): Promise<TechProfile> => {
    const { data } = await api.get('/technicians/me');
    return data;
  },

  updateMyProfile: async (updates: Partial<TechProfile>): Promise<TechProfile> => {
    const { data } = await api.put('/technicians/me', updates);
    return data;
  },

  // Status & Location
  updateStatus: async (status: TechStatus, jobId?: string): Promise<TechProfile> => {
    const params = new URLSearchParams({ new_status: status });
    if (jobId) params.append('job_id', jobId);
    const { data } = await api.patch(`/technicians/me/status?${params.toString()}`);
    return data;
  },

  updateLocation: async (location: {
    latitude: number;
    longitude: number;
    heading?: number;
    speed?: number;
    accuracy?: number;
  }): Promise<{ status: string }> => {
    const { data } = await api.post('/technicians/me/location', location);
    return data;
  },

  // Jobs
  getTodaysJobs: async (): Promise<TechJob[]> => {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await api.get(`/technicians/me/jobs?date=${today}`);
    return data;
  },

  getJobsForDate: async (date: string): Promise<TechJob[]> => {
    const { data } = await api.get(`/technicians/me/jobs?date=${date}`);
    return data;
  },

  getJobsForWeek: async (startDate: string): Promise<TechJob[]> => {
    const { data } = await api.get(`/technicians/me/jobs?start_date=${startDate}&days=7`);
    return data;
  },

  getJob: async (jobId: string): Promise<TechJob> => {
    const { data } = await api.get(`/technicians/me/jobs/${jobId}`);
    return data;
  },

  // Job Actions
  startJob: async (jobId: string): Promise<TechJob> => {
    // Update status to enroute
    await api.patch(`/technicians/me/status?new_status=enroute&job_id=${jobId}`);
    const { data } = await api.post(`/technicians/me/jobs/${jobId}/start`);
    return data;
  },

  arriveAtJob: async (jobId: string): Promise<TechJob> => {
    // Update status to on_site
    await api.patch(`/technicians/me/status?new_status=on_site&job_id=${jobId}`);
    const { data } = await api.post(`/technicians/me/jobs/${jobId}/arrive`);
    return data;
  },

  completeJob: async (jobId: string, completion: JobCompletion): Promise<TechJob> => {
    const { data } = await api.post(`/technicians/me/jobs/${jobId}/complete`, completion);
    // Update status to available or complete
    await api.patch('/technicians/me/status?new_status=available');
    return data;
  },

  // Upload photo (returns URL)
  uploadPhoto: async (jobId: string, photoBase64: string): Promise<{ url: string }> => {
    const { data } = await api.post(`/technicians/me/jobs/${jobId}/photos`, { photo: photoBase64 });
    return data;
  },

  // Route
  getMyRoute: async (date?: string): Promise<TechRoute> => {
    const dateParam = date || new Date().toISOString().split('T')[0];
    const { data } = await api.get(`/technicians/me/route?date=${dateParam}`);
    return data;
  },

  // Navigation
  getDirections: async (
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number
  ): Promise<{
    distance_miles: number;
    duration_minutes: number;
    polyline?: string;
  }> => {
    const { data } = await api.get(
      `/navigation/directions?from_lat=${fromLat}&from_lng=${fromLng}&to_lat=${toLat}&to_lng=${toLng}`
    );
    return data;
  },

  // Notifications
  registerPushToken: async (token: string, platform: 'ios' | 'android'): Promise<void> => {
    await api.post('/technicians/me/push-token', { token, platform });
  },

  // Clock in/out
  clockIn: async (): Promise<{ clocked_in_at: string }> => {
    const { data } = await api.post('/technicians/me/clock-in');
    return data;
  },

  clockOut: async (): Promise<{ clocked_out_at: string }> => {
    const { data } = await api.post('/technicians/me/clock-out');
    return data;
  },

  getTimesheet: async (startDate: string, endDate: string): Promise<Array<{
    date: string;
    clock_in?: string;
    clock_out?: string;
    hours_worked: number;
  }>> => {
    const { data } = await api.get(`/technicians/me/timesheet?start=${startDate}&end=${endDate}`);
    return data;
  },
};

// Status display helpers
export const STATUS_LABELS: Record<TechStatus, string> = {
  available: 'Available',
  assigned: 'Assigned',
  enroute: 'En Route',
  on_site: 'On Site',
  complete: 'Complete',
  off_duty: 'Off Duty',
};

export const STATUS_COLORS: Record<TechStatus, string> = {
  available: '#10B981', // green
  assigned: '#8B5CF6',  // purple
  enroute: '#3B82F6',   // blue
  on_site: '#F59E0B',   // amber
  complete: '#10B981',  // green
  off_duty: '#6B7280',  // gray
};

export const JOB_STATUS_COLORS: Record<string, string> = {
  scheduled: '#3B82F6',   // blue
  in_progress: '#F59E0B', // amber
  completed: '#10B981',   // green
  cancelled: '#EF4444',   // red
};

export const PRIORITY_COLORS: Record<string, string> = {
  low: '#6B7280',
  normal: '#3B82F6',
  high: '#F59E0B',
  urgent: '#EF4444',
};

// Format helpers
export const formatTime = (timeString: string): string => {
  const [hours, minutes] = timeString.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
};

export const formatAddress = (address: JobAddress): string => {
  return `${address.street}, ${address.city}, ${address.state} ${address.zip}`;
};

export const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
};

export default techApi;
