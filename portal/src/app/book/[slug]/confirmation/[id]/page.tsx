'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle,
  Calendar,
  Clock,
  MapPin,
  Mail,
  Phone,
  CalendarPlus,
  Home,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  formatPrice,
  formatDate,
  formatTime,
  formatDuration,
  generateCalendarLink,
} from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface BookingConfirmation {
  appointment_id: string;
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
  confirmation_number: string;
}

export default function ConfirmationPage() {
  const params = useParams();
  const bookingId = params.id as string;
  const slug = params.slug as string;

  const [booking, setBooking] = useState<BookingConfirmation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBooking();
  }, [bookingId]);

  const loadBooking = async () => {
    try {
      const response = await api.getBookingConfirmation(bookingId);
      if (response.success && response.data?.data) {
        setBooking(response.data.data);
      }
    } catch (err) {
      console.error('Failed to load booking:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCalendar = () => {
    if (!booking) return;

    const calendarUrl = generateCalendarLink(
      `${booking.service.name} - ${booking.business.name}`,
      `Your ${booking.service.name} appointment with ${booking.business.name}.\n\nConfirmation #: ${booking.confirmation_number}`,
      `${booking.address.address_line1}, ${booking.address.city}, ${booking.address.state} ${booking.address.zip_code}`,
      booking.scheduled_date,
      booking.scheduled_time,
      booking.service.duration_minutes
    );

    window.open(calendarUrl, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Booking Not Found</h1>
        <p className="text-gray-600 mb-8">
          The booking confirmation you're looking for doesn't exist.
        </p>
        <Link href="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-2xl mx-auto px-4 py-12">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4">
            <CheckCircle className="h-12 w-12 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Booking Confirmed!</h1>
          <p className="text-gray-600">
            Confirmation #{booking.confirmation_number}
          </p>
          <p className="text-gray-500 text-sm mt-2">
            A confirmation email has been sent to {booking.client.email}
          </p>
        </div>

        {/* Appointment Details */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="font-semibold text-gray-900 mb-4 text-lg">
              Appointment Details
            </h2>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Calendar className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Date</p>
                  <p className="font-medium text-gray-900">
                    {formatDate(booking.scheduled_date)}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Clock className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Time</p>
                  <p className="font-medium text-gray-900">
                    {formatTime(booking.scheduled_time)} ({formatDuration(booking.service.duration_minutes)})
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <MapPin className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Service Location</p>
                  <p className="font-medium text-gray-900">
                    {booking.address.address_line1}
                  </p>
                  <p className="text-gray-600">
                    {booking.address.city}, {booking.address.state}{' '}
                    {booking.address.zip_code}
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t mt-6 pt-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium text-gray-900">{booking.service.name}</p>
                  <p className="text-sm text-gray-500">
                    {booking.business.name}
                  </p>
                </div>
                <p className="text-2xl font-bold text-primary-600">
                  {formatPrice(booking.total_price)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <Button
            onClick={handleAddToCalendar}
            className="flex-1"
            variant="outline"
          >
            <CalendarPlus className="h-5 w-5 mr-2" />
            Add to Calendar
          </Button>
          <Link href={`/book/${slug}`} className="flex-1">
            <Button variant="secondary" fullWidth>
              Book Another Service
            </Button>
          </Link>
        </div>

        {/* Business Contact */}
        <Card>
          <CardContent className="p-6">
            <h2 className="font-semibold text-gray-900 mb-4">
              Need to make changes?
            </h2>
            <p className="text-gray-600 mb-4">
              Contact {booking.business.name} directly:
            </p>
            <div className="space-y-2">
              <a
                href={`tel:${booking.business.phone}`}
                className="flex items-center gap-2 text-primary-600 hover:text-primary-700"
              >
                <Phone className="h-4 w-4" />
                {booking.business.phone}
              </a>
              <a
                href={`mailto:${booking.business.email}`}
                className="flex items-center gap-2 text-primary-600 hover:text-primary-700"
              >
                <Mail className="h-4 w-4" />
                {booking.business.email}
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Footer Link */}
        <div className="text-center mt-8">
          <Link
            href="/"
            className="text-gray-500 hover:text-gray-700 inline-flex items-center gap-2"
          >
            <Home className="h-4 w-4" />
            Return to Home
          </Link>
        </div>
      </main>
    </div>
  );
}
