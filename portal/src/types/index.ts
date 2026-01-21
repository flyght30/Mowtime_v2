export interface DayHours {
  is_open: boolean;
  open_time: string;
  close_time: string;
}

export interface BusinessConfig {
  business_hours?: {
    monday?: DayHours;
    tuesday?: DayHours;
    wednesday?: DayHours;
    thursday?: DayHours;
    friday?: DayHours;
    saturday?: DayHours;
    sunday?: DayHours;
    [key: string]: DayHours | undefined;
  };
  primary_color?: string;
  logo_url?: string;
  advance_booking_days?: number;
  allow_same_day_booking?: boolean;
}

export interface Business {
  business_id: string;
  name: string;
  slug?: string;
  description?: string;
  vertical?: string;
  email: string;
  phone: string;
  website?: string;
  city: string;
  state: string;
  timezone?: string;
  config?: BusinessConfig;
}

export interface Service {
  service_id: string;
  name: string;
  description?: string;
  category: string;
  pricing_type: 'fixed' | 'hourly' | 'per_unit' | 'quote';
  base_price: number;
  unit_label?: string;
  duration_minutes: number;
  is_featured: boolean;
}

export interface TimeSlot {
  time: string;
  available: boolean;
  staff_ids?: string[];
}

export interface Appointment {
  appointment_id: string;
  business_id: string;
  client_id: string;
  scheduled_date: string;
  scheduled_time: string;
  end_time: string;
  services: ServiceLineItem[];
  total_price: number;
  status: 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'canceled';
  notes?: string;
  confirmation_number?: string;
  created_at: string;
}

export interface ServiceLineItem {
  service_id: string;
  service_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface Invoice {
  invoice_id: string;
  business_id: string;
  client_id: string;
  invoice_number: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'canceled';
  subtotal: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  line_items: ServiceLineItem[];
  due_date: string;
  issued_date: string;
  paid_date?: string;
}

export interface Client {
  client_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  addresses: Address[];
}

export interface Address {
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  zip_code: string;
  is_primary: boolean;
}

export interface BookingConfirmation {
  appointment_id: string;
  confirmation_number: string;
  business: {
    name: string;
    phone: string;
    email: string;
  };
  service: {
    name: string;
    duration_minutes: number;
  };
  scheduled_date: string;
  scheduled_time: string;
  total_price: number;
  client: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  };
  address: {
    address_line1: string;
    city: string;
    state: string;
    zip_code: string;
  };
  status?: string;
}

export interface BookingState {
  business: Business | null;
  selectedService: Service | null;
  selectedDate: string | null;
  selectedTime: string | null;
  clientInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address?: {
      address_line1: string;
      city: string;
      state: string;
      zip_code: string;
    };
  } | null;
  notes: string;
}
