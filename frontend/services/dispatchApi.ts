/**
 * Dispatch API Service
 * Handles technician management, scheduling, and dispatch operations
 */

import { api, ApiResponse } from './api';

// ============== Types ==============

export type TechStatus = 'available' | 'assigned' | 'enroute' | 'on_site' | 'complete' | 'off_duty';

export interface TechSkills {
  can_install: boolean;
  can_service: boolean;
  can_maintenance: boolean;
}

export interface TechSchedule {
  work_days: number[];
  start_time: string;
  end_time: string;
  lunch_start: string;
  lunch_duration: number;
}

export interface TechStats {
  jobs_completed: number;
  avg_rating: number | null;
  on_time_percentage: number;
  total_drive_time_minutes: number;
  total_job_time_minutes: number;
}

export interface TechLocation {
  type: string;
  coordinates: [number, number]; // [lng, lat]
  timestamp: string;
  accuracy: number | null;
}

export interface Technician {
  tech_id: string;
  business_id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  status: TechStatus;
  current_job_id: string | null;
  next_job_id: string | null;
  is_active: boolean;
  location: TechLocation | null;
  certifications: string[];
  skills: TechSkills;
  schedule: TechSchedule;
  stats: TechStats;
  color: string;
  created_at: string;
}

export interface TechnicianBrief {
  tech_id: string;
  first_name: string;
  last_name: string;
  status: TechStatus;
  current_job_id: string | null;
}

export interface TechnicianCreate {
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
  certifications?: string[];
  skills?: TechSkills;
  schedule?: TechSchedule;
  color?: string;
}

export interface TechnicianUpdate {
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  certifications?: string[];
  skills?: TechSkills;
  schedule?: TechSchedule;
  is_active?: boolean;
  color?: string;
}

// Schedule Types
export type ScheduleStatus = 'scheduled' | 'in_progress' | 'complete' | 'cancelled';

export interface ScheduleEntry {
  entry_id: string;
  business_id: string;
  tech_id: string;
  job_id: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  estimated_hours: number;
  status: ScheduleStatus;
  order: number;
  travel_time_minutes: number | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface DailySchedule {
  tech_id: string;
  tech_name: string;
  entries: ScheduleEntry[];
  available_slots: { start: string; end: string }[];
  total_hours: number;
}

export interface AssignJobRequest {
  job_id: string;
  tech_id: string;
  scheduled_date: string;
  start_time: string;
  estimated_hours: number;
  notes?: string;
}

// Dispatch Types
export interface DispatchJob {
  id: string;
  job_number: string;
  customer_name: string;
  address: string;
  location: { lat: number; lng: number } | null;
  job_type: string;
  estimated_hours: number;
  priority: string;
  status: string;
  schedule: any;
  created_at: string;
  equipment_total: number;
  grand_total: number;
}

export interface TechSuggestion {
  tech_id: string;
  tech_name: string;
  score: number;
  reasons: string[];
  eta_minutes: number | null;
  distance_miles: number | null;
  status: TechStatus;
  available_hours: number;
}

export interface RouteStop {
  order: number;
  entry_id: string;
  job_id: string;
  job_number: string;
  customer_name: string;
  address: string;
  location: { lat: number; lng: number } | null;
  arrival_time: string;
  departure_time: string;
  travel_from_previous: number;
  status: ScheduleStatus;
  job_type: string;
}

// ============== Technicians API ==============

export const techniciansApi = {
  // List technicians
  list: async (params?: {
    page?: number;
    per_page?: number;
    status?: TechStatus;
    active_only?: boolean;
    search?: string;
  }): Promise<ApiResponse<Technician[]>> => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.per_page) searchParams.set('per_page', params.per_page.toString());
    if (params?.status) searchParams.set('status', params.status);
    if (params?.active_only !== undefined) searchParams.set('active_only', params.active_only.toString());
    if (params?.search) searchParams.set('search', params.search);

    const query = searchParams.toString();
    return api.get(`/technicians${query ? `?${query}` : ''}`);
  },

  // Get active technicians (brief)
  getActive: async (): Promise<ApiResponse<TechnicianBrief[]>> => {
    return api.get('/technicians/active');
  },

  // Get single technician
  get: async (techId: string): Promise<ApiResponse<Technician>> => {
    return api.get(`/technicians/${techId}`);
  },

  // Create technician
  create: async (data: TechnicianCreate): Promise<ApiResponse<Technician>> => {
    return api.post('/technicians', data);
  },

  // Update technician
  update: async (techId: string, data: TechnicianUpdate): Promise<ApiResponse<Technician>> => {
    return api.put(`/technicians/${techId}`, data);
  },

  // Delete technician
  delete: async (techId: string): Promise<ApiResponse<{ message: string }>> => {
    return api.delete(`/technicians/${techId}`);
  },

  // Update status
  updateStatus: async (techId: string, status: TechStatus, jobId?: string): Promise<ApiResponse<Technician>> => {
    const params = new URLSearchParams({ new_status: status });
    if (jobId) params.set('job_id', jobId);
    return api.patch(`/technicians/${techId}/status?${params.toString()}`);
  },

  // Update location
  updateLocation: async (techId: string, lat: number, lng: number, accuracy?: number): Promise<ApiResponse<{ message: string }>> => {
    const params = new URLSearchParams({ lat: lat.toString(), lng: lng.toString() });
    if (accuracy) params.set('accuracy', accuracy.toString());
    return api.post(`/technicians/${techId}/location?${params.toString()}`);
  },

  // Get location history
  getLocationHistory: async (techId: string, hours?: number): Promise<ApiResponse<{
    tech_id: string;
    hours: number;
    points: { lat: number; lng: number; timestamp: string; accuracy: number | null }[];
    count: number;
  }>> => {
    const query = hours ? `?hours=${hours}` : '';
    return api.get(`/technicians/${techId}/location/history${query}`);
  },

  // Toggle active
  toggleActive: async (techId: string): Promise<ApiResponse<Technician>> => {
    return api.patch(`/technicians/${techId}/toggle-active`);
  },
};

// ============== Schedule API ==============

export const scheduleApi = {
  // Get daily schedule
  getDaily: async (date: string, techId?: string): Promise<ApiResponse<{
    date: string;
    technicians: DailySchedule[];
  }>> => {
    const params = new URLSearchParams({ date });
    if (techId) params.set('tech_id', techId);
    return api.get(`/schedule?${params.toString()}`);
  },

  // Get weekly schedule
  getWeekly: async (startDate: string, techId?: string): Promise<ApiResponse<any[]>> => {
    const params = new URLSearchParams({ start_date: startDate });
    if (techId) params.set('tech_id', techId);
    return api.get(`/schedule/week?${params.toString()}`);
  },

  // Assign job to technician
  assign: async (data: AssignJobRequest): Promise<ApiResponse<{
    schedule_entry: ScheduleEntry;
    conflicts: any[];
  }>> => {
    return api.post('/schedule/assign', data);
  },

  // Get entry
  getEntry: async (entryId: string): Promise<ApiResponse<ScheduleEntry>> => {
    return api.get(`/schedule/${entryId}`);
  },

  // Update entry
  updateEntry: async (entryId: string, data: {
    scheduled_date?: string;
    start_time?: string;
    estimated_hours?: number;
    order?: number;
    notes?: string;
  }): Promise<ApiResponse<ScheduleEntry>> => {
    return api.put(`/schedule/${entryId}`, data);
  },

  // Delete entry (unassign)
  deleteEntry: async (entryId: string): Promise<ApiResponse<{ message: string }>> => {
    return api.delete(`/schedule/${entryId}`);
  },

  // Update entry status
  updateEntryStatus: async (entryId: string, status: ScheduleStatus): Promise<ApiResponse<ScheduleEntry>> => {
    return api.patch(`/schedule/${entryId}/status?new_status=${status}`);
  },

  // Optimize route
  optimize: async (techId: string, date: string): Promise<ApiResponse<{
    tech_id: string;
    date: string;
    original_order: string[];
    optimized_order: string[];
    stops: RouteStop[];
    time_saved_minutes: number;
    total_drive_time_minutes: number;
  }>> => {
    return api.post('/schedule/optimize', { tech_id: techId, date });
  },
};

// ============== Dispatch API ==============

export const dispatchApi = {
  // Get job queue
  getQueue: async (): Promise<ApiResponse<{
    unassigned: DispatchJob[];
    assigned_today: DispatchJob[];
    total_unassigned: number;
  }>> => {
    return api.get('/dispatch/queue');
  },

  // Get map data
  getMapData: async (date?: string): Promise<ApiResponse<{
    date: string;
    technicians: {
      id: string;
      name: string;
      status: TechStatus;
      location: { lat: number; lng: number } | null;
      current_job_id: string | null;
      color: string;
    }[];
    jobs: {
      id: string;
      job_number: string;
      customer_name: string;
      address: string;
      location: { lat: number; lng: number } | null;
      status: string;
      tech_id: string | null;
      scheduled_time: string | null;
      job_type: string;
    }[];
  }>> => {
    const query = date ? `?date=${date}` : '';
    return api.get(`/dispatch/map-data${query}`);
  },

  // Get tech suggestions for job
  suggestTech: async (jobId: string, targetDate?: string): Promise<ApiResponse<{
    job_id: string;
    target_date: string;
    suggestions: TechSuggestion[];
  }>> => {
    const params = new URLSearchParams();
    params.set('job_id', jobId);
    if (targetDate) params.set('target_date', targetDate);
    return api.post(`/dispatch/suggest-tech?${params.toString()}`);
  },

  // Get tech's route
  getRoute: async (techId: string, date: string): Promise<ApiResponse<{
    tech_id: string;
    tech_name: string;
    date: string;
    stops: RouteStop[];
    total_drive_time: number;
    total_job_time: number;
    stop_count: number;
  }>> => {
    return api.get(`/dispatch/route?tech_id=${techId}&date=${date}`);
  },

  // Get stats
  getStats: async (date?: string): Promise<ApiResponse<{
    date: string;
    technicians: {
      total_active: number;
      available: number;
      enroute: number;
      on_site: number;
      off_duty: number;
    };
    jobs: {
      unassigned: number;
      scheduled: number;
      in_progress: number;
      completed: number;
      total_today: number;
    };
  }>> => {
    const query = date ? `?date=${date}` : '';
    return api.get(`/dispatch/stats${query}`);
  },
};

export default {
  technicians: techniciansApi,
  schedule: scheduleApi,
  dispatch: dispatchApi,
};
