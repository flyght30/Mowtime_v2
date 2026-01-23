/**
 * HVAC API Service
 * Handles all HVAC vertical API calls
 */

import { api, ApiResponse } from './api';

// ============== Types ==============

export interface LoadCalculationInput {
  square_footage: number;
  ceiling_height_ft?: number;
  floor_count?: number;
  window_count?: number;
  window_quality?: 'single' | 'standard' | 'double' | 'triple';
  insulation_quality?: 'poor' | 'average' | 'good' | 'excellent';
  sun_exposure?: 'low' | 'mixed' | 'high';
  climate_zone?: number;
  occupants?: number;
  manual_j_btuh?: number;
}

export interface LoadCalculationResult {
  calc_id: string;
  created_at: string;
  input_data: LoadCalculationInput;
  cooling_btuh: number;
  cooling_tons: number;
  recommended_ac_tons: number;
  heating_btuh: number;
  cfm_required: number;
  recommended_equipment: RecommendedEquipment[];
  notes: string[];
  factors: Record<string, number>;
}

export interface RecommendedEquipment {
  tier: 'good' | 'better' | 'best';
  ac: {
    equipment_id: string;
    name: string;
    seer: number;
    cost: number;
  };
  furnace: {
    equipment_id: string;
    name: string;
    afue: number;
    cost: number;
  };
  total_equipment_cost: number;
}

export interface Equipment {
  equipment_id: string;
  business_id: string;
  category: 'air_conditioner' | 'furnace' | 'heat_pump' | 'mini_split' | 'air_handler' | 'thermostat';
  type: string;
  tier: 'good' | 'better' | 'best';
  name: string;
  brand: string;
  model: string;
  capacity_tons?: number;
  capacity_btu?: number;
  seer?: number;
  afue?: number;
  hspf?: number;
  cost: number;
  labor_hours: number;
  warranty_years: number;
  is_active: boolean;
}

export interface QuoteLineItem {
  item_type: 'equipment' | 'labor' | 'material' | 'permit' | 'other';
  description: string;
  equipment_id?: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface Quote {
  quote_id: string;
  business_id: string;
  client_id: string;
  load_calc_id?: string;
  tier: 'good' | 'better' | 'best';
  job_type: string;
  description?: string;
  line_items: QuoteLineItem[];
  equipment_total: number;
  labor_total: number;
  materials_total: number;
  subtotal: number;
  tax_rate: number;
  tax: number;
  total: number;
  cost_total: number;
  margin_percent: number;
  profit: number;
  status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired';
  created_at: string;
  expires_at: string;
  notes?: string;
}

export interface QuoteCreate {
  client_id: string;
  load_calc_id?: string;
  tier: 'good' | 'better' | 'best';
  job_type: string;
  description?: string;
  line_items?: QuoteLineItem[];
  notes?: string;
  valid_days?: number;
}

export interface MaintenanceContract {
  contract_id: string;
  business_id: string;
  client_id: string;
  plan_name: string;
  plan_type: string;
  price: number;
  equipment_covered: string[];
  start_date: string;
  end_date: string;
  visits_per_year: number;
  visits_completed: number;
  includes_parts: boolean;
  includes_refrigerant: boolean;
  priority_service: boolean;
  discount_percent: number;
  status: 'active' | 'expired' | 'cancelled';
  next_service_date?: string;
  last_service_date?: string;
  service_history: any[];
  notes?: string;
}

export interface InventoryItem {
  item_id: string;
  business_id: string;
  sku: string;
  name: string;
  description?: string;
  category: string;
  unit: string;
  cost: number;
  sell_price?: number;
  quantity_on_hand: number;
  reorder_point: number;
  reorder_quantity: number;
  location?: string;
  supplier?: string;
  supplier_part_number?: string;
  is_active: boolean;
}

export interface ClimateZoneInfo {
  zone: number;
  name: string;
  heating_degree_days: string;
  design_temp_summer_f: number;
  design_temp_winter_f: number;
  description: string;
}

// ============== API Functions ==============

export const hvacApi = {
  // Load Calculator
  calculateLoad: async (data: LoadCalculationInput): Promise<ApiResponse<LoadCalculationResult>> => {
    return api.post('/hvac/calculate-load', data);
  },

  getLoadCalculations: async (clientId?: string): Promise<ApiResponse<{ calculations: LoadCalculationResult[] }>> => {
    const params = clientId ? `?client_id=${clientId}` : '';
    return api.get(`/hvac/load-calculations${params}`);
  },

  getLoadCalculation: async (calcId: string): Promise<ApiResponse<{ calculation: LoadCalculationResult }>> => {
    return api.get(`/hvac/load-calculations/${calcId}`);
  },

  // Climate Zone
  getClimateZoneByZip: async (zipCode: string): Promise<ApiResponse<{
    zip_code: string;
    climate_zone: number;
    zone_info: ClimateZoneInfo;
    design_temperatures: { climate_zone: number; design_temp_summer_f: number; design_temp_winter_f: number };
  }>> => {
    return api.get(`/hvac/climate-zone/zip/${zipCode}`);
  },

  getClimateZones: async (): Promise<ApiResponse<{ zones: Record<string, ClimateZoneInfo> }>> => {
    return api.get('/hvac/climate-zones');
  },

  // Equipment
  getEquipment: async (filters?: {
    category?: string;
    tier?: string;
    min_tons?: number;
    max_tons?: number;
  }): Promise<ApiResponse<{ equipment: Equipment[]; grouped: Record<string, Equipment[]>; total: number }>> => {
    const params = new URLSearchParams();
    if (filters?.category) params.append('category', filters.category);
    if (filters?.tier) params.append('tier', filters.tier);
    if (filters?.min_tons) params.append('min_tons', filters.min_tons.toString());
    if (filters?.max_tons) params.append('max_tons', filters.max_tons.toString());
    const queryString = params.toString();
    return api.get(`/hvac/equipment${queryString ? `?${queryString}` : ''}`);
  },

  getEquipmentItem: async (equipmentId: string): Promise<ApiResponse<{ equipment: Equipment }>> => {
    return api.get(`/hvac/equipment/${equipmentId}`);
  },

  createEquipment: async (data: Partial<Equipment>): Promise<ApiResponse<{ equipment: Equipment }>> => {
    return api.post('/hvac/equipment', data);
  },

  updateEquipment: async (equipmentId: string, data: Partial<Equipment>): Promise<ApiResponse> => {
    return api.put(`/hvac/equipment/${equipmentId}`, data);
  },

  deleteEquipment: async (equipmentId: string, hardDelete = false): Promise<ApiResponse> => {
    return api.delete(`/hvac/equipment/${equipmentId}?hard_delete=${hardDelete}`);
  },

  // Quotes
  getQuotes: async (filters?: { status?: string; client_id?: string }): Promise<ApiResponse<{ quotes: Quote[] }>> => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.client_id) params.append('client_id', filters.client_id);
    const queryString = params.toString();
    return api.get(`/hvac/quotes${queryString ? `?${queryString}` : ''}`);
  },

  getQuote: async (quoteId: string): Promise<ApiResponse<{ quote: Quote }>> => {
    return api.get(`/hvac/quotes/${quoteId}`);
  },

  createQuote: async (
    data: QuoteCreate,
    options?: { labor_rate?: number; margin_percent?: number; tax_rate?: number }
  ): Promise<ApiResponse<Quote>> => {
    const params = new URLSearchParams();
    if (options?.labor_rate) params.append('labor_rate', options.labor_rate.toString());
    if (options?.margin_percent) params.append('margin_percent', options.margin_percent.toString());
    if (options?.tax_rate) params.append('tax_rate', options.tax_rate.toString());
    const queryString = params.toString();
    return api.post(`/hvac/quotes${queryString ? `?${queryString}` : ''}`, data);
  },

  updateQuoteStatus: async (quoteId: string, status: Quote['status']): Promise<ApiResponse> => {
    return api.patch(`/hvac/quotes/${quoteId}/status?new_status=${status}`);
  },

  updateQuote: async (quoteId: string, data: {
    line_items?: QuoteLineItem[];
    equipment_total?: number;
    labor_total?: number;
    materials_total?: number;
    subtotal?: number;
    tax?: number;
    total?: number;
    cost_total?: number;
    profit?: number;
    notes?: string;
  }): Promise<ApiResponse> => {
    return api.put(`/hvac/quotes/${quoteId}`, data);
  },

  getQuotePdf: async (quoteId: string): Promise<ApiResponse<{
    quote_id: string;
    format: 'pdf' | 'html';
    content: string;
    filename: string;
  }>> => {
    return api.get(`/hvac/quotes/${quoteId}/pdf`);
  },

  sendQuote: async (quoteId: string, method: 'email' | 'sms', message?: string): Promise<ApiResponse> => {
    const params = new URLSearchParams({ send_method: method });
    if (message) params.append('message', message);
    return api.post(`/hvac/quotes/${quoteId}/send?${params.toString()}`);
  },

  deleteQuote: async (quoteId: string): Promise<ApiResponse> => {
    return api.delete(`/hvac/quotes/${quoteId}`);
  },

  // Maintenance Contracts
  getMaintenanceContracts: async (status?: string): Promise<ApiResponse<{ contracts: MaintenanceContract[] }>> => {
    const params = status ? `?status=${status}` : '';
    return api.get(`/hvac/maintenance${params}`);
  },

  getMaintenanceContract: async (contractId: string): Promise<ApiResponse<{ contract: MaintenanceContract }>> => {
    return api.get(`/hvac/maintenance/${contractId}`);
  },

  getMaintenanceDue: async (daysAhead = 30): Promise<ApiResponse<{
    days_ahead: number;
    due_count: number;
    contracts: MaintenanceContract[];
  }>> => {
    return api.get(`/hvac/maintenance/due?days_ahead=${daysAhead}`);
  },

  createMaintenanceContract: async (data: Partial<MaintenanceContract>): Promise<ApiResponse<{ contract: MaintenanceContract }>> => {
    return api.post('/hvac/maintenance', data);
  },

  updateMaintenanceContract: async (contractId: string, data: Partial<MaintenanceContract>): Promise<ApiResponse> => {
    return api.put(`/hvac/maintenance/${contractId}`, data);
  },

  recordMaintenanceService: async (contractId: string, data: {
    service_date: string;
    technician_id: string;
    services_performed: string[];
    notes?: string;
  }): Promise<ApiResponse> => {
    const params = new URLSearchParams({
      service_date: data.service_date,
      technician_id: data.technician_id,
    });
    data.services_performed.forEach(s => params.append('services_performed', s));
    if (data.notes) params.append('notes', data.notes);
    return api.post(`/hvac/maintenance/${contractId}/record-service?${params.toString()}`);
  },

  cancelMaintenanceContract: async (contractId: string, reason?: string): Promise<ApiResponse> => {
    const params = reason ? `?reason=${encodeURIComponent(reason)}` : '';
    return api.delete(`/hvac/maintenance/${contractId}${params}`);
  },

  // Inventory
  getInventory: async (filters?: {
    category?: string;
    low_stock?: boolean;
    search?: string;
  }): Promise<ApiResponse<{ items: InventoryItem[]; count: number; total_value: number }>> => {
    const params = new URLSearchParams();
    if (filters?.category) params.append('category', filters.category);
    if (filters?.low_stock) params.append('low_stock', 'true');
    if (filters?.search) params.append('search', filters.search);
    const queryString = params.toString();
    return api.get(`/hvac/inventory${queryString ? `?${queryString}` : ''}`);
  },

  getInventoryItem: async (itemId: string): Promise<ApiResponse<{ item: InventoryItem }>> => {
    return api.get(`/hvac/inventory/${itemId}`);
  },

  createInventoryItem: async (data: Partial<InventoryItem>): Promise<ApiResponse<{ item: InventoryItem }>> => {
    return api.post('/hvac/inventory', data);
  },

  updateInventoryItem: async (itemId: string, data: Partial<InventoryItem>): Promise<ApiResponse> => {
    return api.put(`/hvac/inventory/${itemId}`, data);
  },

  adjustInventory: async (itemId: string, data: {
    adjustment_type: 'receive' | 'use' | 'return' | 'adjust' | 'transfer';
    quantity: number;
    job_id?: string;
    notes?: string;
  }): Promise<ApiResponse<{
    previous_quantity: number;
    new_quantity: number;
    needs_reorder: boolean;
  }>> => {
    return api.post(`/hvac/inventory/${itemId}/adjust`, data);
  },

  getReorderReport: async (): Promise<ApiResponse<{
    items_to_reorder: number;
    by_supplier: Record<string, any[]>;
    total_reorder_value: number;
  }>> => {
    return api.get('/hvac/inventory/reorder-report');
  },

  // Refrigerant Tracking
  logRefrigerant: async (data: {
    service_date: string;
    client_id: string;
    job_id?: string;
    equipment_id?: string;
    refrigerant_type: string;
    action: 'add' | 'recover' | 'reclaim' | 'dispose';
    quantity_lbs: number;
    technician_id: string;
    technician_epa_cert?: string;
    leak_detected?: boolean;
    leak_repaired?: boolean;
    notes?: string;
  }): Promise<ApiResponse> => {
    return api.post('/hvac/refrigerant/log', data);
  },

  getRefrigerantLogs: async (filters?: {
    client_id?: string;
    refrigerant_type?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<ApiResponse<{ logs: any[]; count: number }>> => {
    const params = new URLSearchParams();
    if (filters?.client_id) params.append('client_id', filters.client_id);
    if (filters?.refrigerant_type) params.append('refrigerant_type', filters.refrigerant_type);
    if (filters?.start_date) params.append('start_date', filters.start_date);
    if (filters?.end_date) params.append('end_date', filters.end_date);
    const queryString = params.toString();
    return api.get(`/hvac/refrigerant/log${queryString ? `?${queryString}` : ''}`);
  },

  getRefrigerantReport: async (year?: number): Promise<ApiResponse<{ report: any }>> => {
    const params = year ? `?year=${year}` : '';
    return api.get(`/hvac/refrigerant/report${params}`);
  },
};

export default hvacApi;
