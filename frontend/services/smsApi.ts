/**
 * SMS API Service
 * Handles SMS messaging, templates, and settings
 */

import api from './api';

// Types
export type SMSDirection = 'inbound' | 'outbound';
export type SMSStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'received';
export type SMSTriggerType =
  | 'scheduled'
  | 'reminder'
  | 'enroute'
  | '15_min'
  | 'arrived'
  | 'complete'
  | 'manual'
  | 'reply';

export interface SMSMessage {
  message_id: string;
  business_id: string;
  customer_id: string;
  job_id?: string;
  tech_id?: string;
  direction: SMSDirection;
  to_phone: string;
  from_phone: string;
  body: string;
  trigger_type: SMSTriggerType;
  status: SMSStatus;
  twilio_sid?: string;
  sent_at?: string;
  delivered_at?: string;
  error_message?: string;
  created_at: string;
}

export interface SMSConversation {
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  messages?: SMSMessage[];
}

export interface SMSTemplate {
  template_id: string;
  business_id: string;
  name: string;
  trigger_type: SMSTriggerType;
  body: string;
  is_active: boolean;
  is_default: boolean;
  variables: string[];
  created_at: string;
  updated_at: string;
}

export interface SMSSettings {
  enabled: boolean;
  twilio_phone?: string;
  auto_scheduled: boolean;
  auto_reminder: boolean;
  auto_enroute: boolean;
  auto_15_min: boolean;
  auto_arrived: boolean;
  auto_complete: boolean;
  reminder_hours: number;
  opt_out_message: string;
}

export interface SMSStats {
  total_sent: number;
  total_received: number;
  delivered: number;
  failed: number;
  delivery_rate: number;
  today_sent: number;
  this_month_sent: number;
}

export interface SendSMSRequest {
  customer_id: string;
  message: string;
  job_id?: string;
}

export interface SendSMSResponse {
  success: boolean;
  message_id?: string;
  error?: string;
}

export interface TemplatePreview {
  original: string;
  rendered: string;
  variables_used: string[];
}

// API Functions

export const smsApi = {
  // Messages
  listMessages: async (params?: {
    customer_id?: string;
    job_id?: string;
    direction?: SMSDirection;
    start_date?: string;
    end_date?: string;
    limit?: number;
    skip?: number;
  }): Promise<SMSMessage[]> => {
    const queryParams = new URLSearchParams();
    if (params?.customer_id) queryParams.append('customer_id', params.customer_id);
    if (params?.job_id) queryParams.append('job_id', params.job_id);
    if (params?.direction) queryParams.append('direction', params.direction);
    if (params?.start_date) queryParams.append('start_date', params.start_date);
    if (params?.end_date) queryParams.append('end_date', params.end_date);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.skip) queryParams.append('skip', params.skip.toString());

    const query = queryParams.toString();
    const { data } = await api.get(`/sms${query ? `?${query}` : ''}`);
    return data;
  },

  listConversations: async (limit = 20): Promise<SMSConversation[]> => {
    const { data } = await api.get(`/sms/conversations?limit=${limit}`);
    return data;
  },

  getConversation: async (customerId: string, limit = 100): Promise<SMSConversation> => {
    const { data } = await api.get(`/sms/conversation/${customerId}?limit=${limit}`);
    return data;
  },

  sendSMS: async (request: SendSMSRequest): Promise<SendSMSResponse> => {
    const { data } = await api.post('/sms/send', request);
    return data;
  },

  getStats: async (): Promise<SMSStats> => {
    const { data } = await api.get('/sms/stats');
    return data;
  },

  // Templates
  listTemplates: async (triggerType?: SMSTriggerType): Promise<SMSTemplate[]> => {
    const query = triggerType ? `?trigger_type=${triggerType}` : '';
    const { data } = await api.get(`/sms/templates${query}`);
    return data;
  },

  getTemplate: async (templateId: string): Promise<SMSTemplate> => {
    const { data } = await api.get(`/sms/templates/${templateId}`);
    return data;
  },

  createTemplate: async (template: {
    name: string;
    trigger_type: SMSTriggerType;
    body: string;
  }): Promise<SMSTemplate> => {
    const { data } = await api.post('/sms/templates', template);
    return data;
  },

  updateTemplate: async (
    templateId: string,
    updates: {
      name?: string;
      body?: string;
      is_active?: boolean;
    }
  ): Promise<SMSTemplate> => {
    const { data } = await api.put(`/sms/templates/${templateId}`, updates);
    return data;
  },

  deleteTemplate: async (templateId: string): Promise<void> => {
    await api.delete(`/sms/templates/${templateId}`);
  },

  previewTemplate: async (body: string, sampleData?: Record<string, string>): Promise<TemplatePreview> => {
    const { data } = await api.post('/sms/templates/preview', { body, sample_data: sampleData });
    return data;
  },

  seedTemplates: async (): Promise<{ templates_created: number }> => {
    const { data } = await api.post('/sms/templates/seed');
    return data;
  },

  // Settings
  getSettings: async (): Promise<SMSSettings> => {
    const { data } = await api.get('/sms/settings');
    return data;
  },

  updateSettings: async (settings: Partial<SMSSettings>): Promise<SMSSettings> => {
    const { data } = await api.put('/sms/settings', settings);
    return data;
  },

  // Trigger SMS (for testing/manual triggers)
  triggerSMS: async (
    triggerType: SMSTriggerType,
    params: {
      customer_id: string;
      job_id?: string;
      tech_id?: string;
      eta_minutes?: number;
    }
  ): Promise<{ status: string; message_id?: string }> => {
    const queryParams = new URLSearchParams();
    queryParams.append('customer_id', params.customer_id);
    if (params.job_id) queryParams.append('job_id', params.job_id);
    if (params.tech_id) queryParams.append('tech_id', params.tech_id);
    if (params.eta_minutes) queryParams.append('eta_minutes', params.eta_minutes.toString());

    const { data } = await api.post(`/sms/trigger/${triggerType}?${queryParams.toString()}`);
    return data;
  },
};

// Helper functions
export const TRIGGER_TYPE_LABELS: Record<SMSTriggerType, string> = {
  scheduled: 'Job Scheduled',
  reminder: 'Appointment Reminder',
  enroute: 'Technician En Route',
  '15_min': '15 Min ETA',
  arrived: 'Tech Arrived',
  complete: 'Job Complete',
  manual: 'Manual',
  reply: 'Customer Reply',
};

export const STATUS_COLORS: Record<SMSStatus, string> = {
  queued: '#FFB020',
  sent: '#2196F3',
  delivered: '#4CAF50',
  failed: '#F44336',
  received: '#9C27B0',
};

export const formatPhoneNumber = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
};

export default smsApi;
