const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('client_token', token);
      } else {
        localStorage.removeItem('client_token');
      }
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      return localStorage.getItem('client_token');
    }
    return null;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    data?: any,
    options?: { isPublic?: boolean }
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const token = this.getToken();
    if (token && !options?.isPublic) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
      });

      const json = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: {
            message: json.detail || 'An error occurred',
            code: response.status.toString(),
          },
        };
      }

      return {
        success: true,
        data: json,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Network error',
        },
      };
    }
  }

  // Public endpoints (no auth required)
  async getBusinessBySlug(slug: string) {
    return this.request('GET', `/portal/business/${slug}`, undefined, { isPublic: true });
  }

  async getBusinessServices(businessId: string) {
    return this.request('GET', `/portal/business/${businessId}/services`, undefined, { isPublic: true });
  }

  async getAvailableSlots(businessId: string, date: string, serviceId: string) {
    return this.request(
      'GET',
      `/portal/availability?business_id=${businessId}&date=${date}&service_id=${serviceId}`,
      undefined,
      { isPublic: true }
    );
  }

  // Client auth
  async clientLogin(email: string, password: string, businessId: string) {
    return this.request('POST', '/portal/auth/login', { email, password, business_id: businessId });
  }

  async clientRegister(data: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    phone: string;
    business_id: string;
  }) {
    return this.request('POST', '/portal/auth/register', data);
  }

  async getClientProfile() {
    return this.request('GET', '/portal/me');
  }

  // Booking
  async createBooking(data: {
    business_id: string;
    service_id: string;
    scheduled_date: string;
    scheduled_time: string;
    guest: {
      first_name: string;
      last_name: string;
      email: string;
      phone: string;
    };
    address: {
      address_line1: string;
      address_line2?: string;
      city: string;
      state: string;
      zip_code: string;
    };
    notes?: string;
  }) {
    const { business_id, ...bookingData } = data;
    return this.request('POST', `/portal/bookings?business_id=${business_id}`, bookingData, { isPublic: true });
  }

  async getBookingConfirmation(bookingId: string) {
    return this.request('GET', `/portal/bookings/${bookingId}`, undefined, { isPublic: true });
  }

  // Client dashboard
  async getClientAppointments(status?: string) {
    const query = status ? `?status=${status}` : '';
    return this.request('GET', `/portal/appointments${query}`);
  }

  async getClientInvoices(status?: string) {
    const query = status ? `?status=${status}` : '';
    return this.request('GET', `/portal/invoices${query}`);
  }

  async getInvoiceDetails(invoiceId: string) {
    return this.request('GET', `/portal/invoices/${invoiceId}`);
  }

  // Payments
  async createPaymentIntent(invoiceId: string) {
    return this.request('POST', `/portal/payments/create-intent`, { invoice_id: invoiceId });
  }

  async confirmPayment(paymentIntentId: string) {
    return this.request('POST', `/portal/payments/confirm`, { payment_intent_id: paymentIntentId });
  }
}

export const api = new ApiClient(API_URL);
export type { ApiResponse };
