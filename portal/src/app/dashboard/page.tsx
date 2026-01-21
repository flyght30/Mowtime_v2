'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Leaf,
  Calendar,
  FileText,
  User,
  LogOut,
  Clock,
  MapPin,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatPrice, formatDate, formatTime, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ClientInfo {
  client_id: string;
  email: string;
  first_name: string;
  last_name: string;
  business_id: string;
}

interface Appointment {
  appointment_id: string;
  confirmation_number: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  service_name: string;
  total_price: number;
  business_name: string;
}

interface Invoice {
  invoice_id: string;
  invoice_number: string;
  status: string;
  total: number;
  amount_due: number;
  due_date: string;
  issued_date: string;
}

type Tab = 'upcoming' | 'history' | 'invoices' | 'profile';

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('upcoming');
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([]);
  const [pastAppointments, setPastAppointments] = useState<Appointment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    // Check if logged in
    const token = api.getToken();
    const storedInfo = localStorage.getItem('client_info');

    if (!token || !storedInfo) {
      router.push('/login');
      return;
    }

    setClientInfo(JSON.parse(storedInfo));
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load all data in parallel
      const [upcomingRes, pastRes, invoicesRes, profileRes] = await Promise.all([
        api.getClientAppointments('upcoming'),
        api.getClientAppointments('past'),
        api.getClientInvoices(),
        api.getClientProfile()
      ]);

      if (upcomingRes.success && upcomingRes.data?.data) {
        setUpcomingAppointments(upcomingRes.data.data);
      }
      if (pastRes.success && pastRes.data?.data) {
        setPastAppointments(pastRes.data.data);
      }
      if (invoicesRes.success && invoicesRes.data?.data) {
        setInvoices(invoicesRes.data.data);
      }
      if (profileRes.success && profileRes.data?.data) {
        setProfile(profileRes.data.data);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    api.setToken(null);
    localStorage.removeItem('client_refresh_token');
    localStorage.removeItem('client_info');
    router.push('/');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
      case 'confirmed':
        return 'bg-blue-100 text-blue-700';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-700';
      case 'completed':
        return 'bg-green-100 text-green-700';
      case 'canceled':
        return 'bg-red-100 text-red-700';
      case 'paid':
        return 'bg-green-100 text-green-700';
      case 'sent':
        return 'bg-blue-100 text-blue-700';
      case 'overdue':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const unpaidInvoices = invoices.filter(i => i.status === 'sent' || i.status === 'overdue');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-2">
            <Leaf className="h-8 w-8 text-primary-500" />
            <span className="text-xl font-bold text-gray-900">ServicePro</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-gray-600 hidden sm:block">
              Welcome, {clientInfo?.first_name}
            </span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-primary-600">
                {upcomingAppointments.length}
              </p>
              <p className="text-sm text-gray-500">Upcoming</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-green-600">
                {profile?.completed_appointments || 0}
              </p>
              <p className="text-sm text-gray-500">Completed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-gray-600">
                {formatPrice(profile?.lifetime_value || 0)}
              </p>
              <p className="text-sm text-gray-500">Total Spent</p>
            </CardContent>
          </Card>
          <Card className={unpaidInvoices.length > 0 ? 'border-red-200' : ''}>
            <CardContent className="p-4 text-center">
              <p className={cn(
                'text-3xl font-bold',
                unpaidInvoices.length > 0 ? 'text-red-600' : 'text-gray-600'
              )}>
                {unpaidInvoices.length}
              </p>
              <p className="text-sm text-gray-500">Unpaid Invoices</p>
            </CardContent>
          </Card>
        </div>

        {/* Alert for unpaid invoices */}
        {unpaidInvoices.length > 0 && (
          <Card className="mb-8 border-red-200 bg-red-50">
            <CardContent className="p-4 flex items-center gap-4">
              <AlertCircle className="h-6 w-6 text-red-500 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-red-800">
                  You have {unpaidInvoices.length} unpaid invoice(s)
                </p>
                <p className="text-sm text-red-600">
                  Total due: {formatPrice(unpaidInvoices.reduce((sum, i) => sum + i.amount_due, 0))}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => setActiveTab('invoices')}
              >
                View Invoices
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          {[
            { id: 'upcoming', label: 'Upcoming', icon: Calendar },
            { id: 'history', label: 'History', icon: Clock },
            { id: 'invoices', label: 'Invoices', icon: FileText },
            { id: 'profile', label: 'Profile', icon: User },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as Tab)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 font-medium transition-colors',
                activeTab === id
                  ? 'text-primary-600 border-b-2 border-primary-500'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'upcoming' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900">
                Upcoming Appointments
              </h2>
              <Link href={`/book/${clientInfo?.business_id ? '' : 'greenscape-pro'}`}>
                <Button size="sm">Book New</Button>
              </Link>
            </div>
            {upcomingAppointments.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-600 mb-4">No upcoming appointments</p>
                  <Link href="/">
                    <Button>Book a Service</Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              upcomingAppointments.map((apt) => (
                <Card key={apt.appointment_id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900">{apt.service_name}</h3>
                          <span className={cn(
                            'px-2 py-0.5 text-xs font-medium rounded-full capitalize',
                            getStatusColor(apt.status)
                          )}>
                            {apt.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {formatDate(apt.scheduled_date)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {formatTime(apt.scheduled_time)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          Confirmation: {apt.confirmation_number}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-primary-600">
                          {formatPrice(apt.total_price)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Past Appointments
            </h2>
            {pastAppointments.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Clock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-600">No past appointments</p>
                </CardContent>
              </Card>
            ) : (
              pastAppointments.map((apt) => (
                <Card key={apt.appointment_id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-gray-900">{apt.service_name}</h3>
                          <span className={cn(
                            'px-2 py-0.5 text-xs font-medium rounded-full capitalize',
                            getStatusColor(apt.status)
                          )}>
                            {apt.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500">
                          {formatDate(apt.scheduled_date)} at {formatTime(apt.scheduled_time)}
                        </p>
                      </div>
                      <p className="font-medium text-gray-600">
                        {formatPrice(apt.total_price)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {activeTab === 'invoices' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Invoices
            </h2>
            {invoices.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-600">No invoices yet</p>
                </CardContent>
              </Card>
            ) : (
              invoices.map((inv) => (
                <Card
                  key={inv.invoice_id}
                  className={cn(
                    'hover:shadow-md transition-shadow cursor-pointer',
                    inv.status === 'overdue' && 'border-red-200'
                  )}
                  onClick={() => router.push(`/dashboard/invoices/${inv.invoice_id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-gray-900">
                            Invoice #{inv.invoice_number}
                          </h3>
                          <span className={cn(
                            'px-2 py-0.5 text-xs font-medium rounded-full capitalize',
                            getStatusColor(inv.status)
                          )}>
                            {inv.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500">
                          Issued: {formatDate(inv.issued_date)}
                          {inv.due_date && ` | Due: ${formatDate(inv.due_date)}`}
                        </p>
                      </div>
                      <div className="text-right flex items-center gap-4">
                        <div>
                          <p className="font-bold text-gray-900">
                            {formatPrice(inv.total)}
                          </p>
                          {inv.amount_due > 0 && (
                            <p className="text-sm text-red-600">
                              Due: {formatPrice(inv.amount_due)}
                            </p>
                          )}
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {activeTab === 'profile' && profile && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Profile
            </h2>
            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-gray-500">Name</label>
                    <p className="font-medium text-gray-900">
                      {profile.first_name} {profile.last_name}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Email</label>
                    <p className="font-medium text-gray-900">{profile.email}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Phone</label>
                    <p className="font-medium text-gray-900">{profile.phone || 'Not set'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {profile.addresses && profile.addresses.length > 0 && (
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Service Addresses</h3>
                  <div className="space-y-4">
                    {profile.addresses.map((addr: any, i: number) => (
                      <div key={i} className="flex items-start gap-3">
                        <MapPin className="h-5 w-5 text-gray-400 mt-0.5" />
                        <div>
                          <p className="font-medium text-gray-900">{addr.address_line1}</p>
                          <p className="text-gray-600">
                            {addr.city}, {addr.state} {addr.zip_code}
                          </p>
                          {addr.is_primary && (
                            <span className="text-xs text-primary-600">Primary</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
