'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Leaf, ArrowLeft, ArrowRight, Check, MapPin, Phone, Mail } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPrice, formatDuration, formatTime, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Business, Service, TimeSlot } from '@/types';
import { format, addDays, parseISO, isBefore, startOfDay } from 'date-fns';

type Step = 'services' | 'datetime' | 'info' | 'confirm';

interface GuestInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
}

export default function BookingPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [step, setStep] = useState<Step>('services');
  const [business, setBusiness] = useState<Business | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Booking state
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [guestInfo, setGuestInfo] = useState<GuestInfo>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
  });
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Generate next 14 days
  const availableDates = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(new Date(), i + 1);
    return format(date, 'yyyy-MM-dd');
  });

  useEffect(() => {
    loadBusiness();
  }, [slug]);

  useEffect(() => {
    if (selectedService && selectedDate && business) {
      loadTimeSlots();
    }
  }, [selectedService, selectedDate]);

  const loadBusiness = async () => {
    setLoading(true);
    try {
      const response = await api.getBusinessBySlug(slug);
      if (response.success && response.data?.data) {
        setBusiness(response.data.data);
        // Load services
        const servicesResponse = await api.getBusinessServices(response.data.data.business_id);
        if (servicesResponse.success && servicesResponse.data?.data) {
          setServices(servicesResponse.data.data.filter((s: Service) => s.base_price > 0));
        }
      } else {
        setError('Business not found');
      }
    } catch (err) {
      setError('Failed to load business');
    } finally {
      setLoading(false);
    }
  };

  const loadTimeSlots = async () => {
    if (!business || !selectedService || !selectedDate) return;

    setLoadingSlots(true);
    try {
      const response = await api.getAvailableSlots(
        business.business_id,
        selectedDate,
        selectedService.service_id
      );
      if (response.success && response.data?.data?.slots) {
        setTimeSlots(response.data.data.slots);
      }
    } catch (err) {
      console.error('Failed to load time slots:', err);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleServiceSelect = (service: Service) => {
    setSelectedService(service);
    setSelectedDate(null);
    setSelectedTime(null);
  };

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setSelectedTime(null);
  };

  const handleSubmit = async () => {
    if (!business || !selectedService || !selectedDate || !selectedTime) return;

    setSubmitting(true);
    try {
      const response = await api.createBooking({
        business_id: business.business_id,
        service_id: selectedService.service_id,
        scheduled_date: selectedDate,
        scheduled_time: selectedTime,
        guest: {
          first_name: guestInfo.firstName,
          last_name: guestInfo.lastName,
          email: guestInfo.email,
          phone: guestInfo.phone.replace(/\D/g, ''),
        },
        address: {
          address_line1: guestInfo.address,
          city: guestInfo.city,
          state: guestInfo.state,
          zip_code: guestInfo.zipCode,
        },
        notes: notes || undefined,
      });

      if (response.success && response.data?.data) {
        router.push(`/book/${slug}/confirmation/${response.data.data.appointment_id}`);
      } else {
        alert(response.error?.message || 'Failed to create booking');
      }
    } catch (err) {
      alert('Failed to create booking');
    } finally {
      setSubmitting(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 'services':
        return selectedService !== null;
      case 'datetime':
        return selectedDate !== null && selectedTime !== null;
      case 'info':
        return (
          guestInfo.firstName.trim() &&
          guestInfo.lastName.trim() &&
          guestInfo.email.trim() &&
          guestInfo.phone.trim() &&
          guestInfo.address.trim() &&
          guestInfo.city.trim() &&
          guestInfo.state.trim() &&
          guestInfo.zipCode.trim()
        );
      default:
        return true;
    }
  };

  const goBack = () => {
    const steps: Step[] = ['services', 'datetime', 'info', 'confirm'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1]);
    }
  };

  const goNext = () => {
    const steps: Step[] = ['services', 'datetime', 'info', 'confirm'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1]);
    }
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500" />
      </div>
    );
  }

  if (error || !business) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Business Not Found</h1>
        <p className="text-gray-600 mb-8">The business you're looking for doesn't exist.</p>
        <Button onClick={() => router.push('/')}>Go Home</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Leaf className="h-8 w-8 text-primary-500" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">{business.name}</h1>
                <p className="text-sm text-gray-500">
                  {business.city}, {business.state}
                </p>
              </div>
            </div>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-between mt-6">
            {(['services', 'datetime', 'info', 'confirm'] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
                    step === s
                      ? 'bg-primary-500 text-white'
                      : ['services', 'datetime', 'info', 'confirm'].indexOf(step) > i
                      ? 'bg-primary-100 text-primary-600'
                      : 'bg-gray-200 text-gray-500'
                  )}
                >
                  {['services', 'datetime', 'info', 'confirm'].indexOf(step) > i ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    i + 1
                  )}
                </div>
                {i < 3 && (
                  <div
                    className={cn(
                      'w-16 sm:w-24 h-1 mx-2',
                      ['services', 'datetime', 'info', 'confirm'].indexOf(step) > i
                        ? 'bg-primary-500'
                        : 'bg-gray-200'
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Step: Services */}
        {step === 'services' && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Select a Service</h2>
            <p className="text-gray-600 mb-6">Choose the service you'd like to book</p>

            <div className="grid gap-4">
              {services.map((service) => (
                <Card
                  key={service.service_id}
                  className={cn(
                    'cursor-pointer transition-all',
                    selectedService?.service_id === service.service_id
                      ? 'ring-2 ring-primary-500 bg-primary-50'
                      : 'hover:shadow-md'
                  )}
                  onClick={() => handleServiceSelect(service)}
                >
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{service.name}</h3>
                        {service.is_featured && (
                          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                            Popular
                          </span>
                        )}
                      </div>
                      {service.description && (
                        <p className="text-sm text-gray-600 mt-1">{service.description}</p>
                      )}
                      <p className="text-sm text-gray-500 mt-2">
                        {formatDuration(service.duration_minutes)}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-xl font-bold text-primary-600">
                        {formatPrice(service.base_price)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Step: Date & Time */}
        {step === 'datetime' && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Select Date & Time</h2>
            <p className="text-gray-600 mb-6">
              Choose when you'd like your {selectedService?.name}
            </p>

            {/* Date Selection */}
            <div className="mb-8">
              <h3 className="font-semibold text-gray-900 mb-3">Select a Date</h3>
              <div className="flex overflow-x-auto gap-2 pb-2">
                {availableDates.map((date) => {
                  const dateObj = parseISO(date);
                  const dayName = format(dateObj, 'EEE');
                  const dayNum = format(dateObj, 'd');
                  const month = format(dateObj, 'MMM');

                  // Check if business is open on this day
                  const dayOfWeek = format(dateObj, 'EEEE').toLowerCase();
                  const dayHours = business.config?.business_hours?.[dayOfWeek];
                  const isOpen = dayHours?.is_open !== false;

                  return (
                    <button
                      key={date}
                      disabled={!isOpen}
                      onClick={() => handleDateSelect(date)}
                      className={cn(
                        'flex-shrink-0 w-20 py-3 rounded-xl text-center transition-all',
                        selectedDate === date
                          ? 'bg-primary-500 text-white'
                          : isOpen
                          ? 'bg-white border-2 border-gray-200 hover:border-primary-500'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      )}
                    >
                      <p className="text-xs font-medium">{dayName}</p>
                      <p className="text-2xl font-bold">{dayNum}</p>
                      <p className="text-xs">{month}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time Selection */}
            {selectedDate && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Select a Time</h3>
                {loadingSlots ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
                  </div>
                ) : timeSlots.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                    {timeSlots.map((slot) => (
                      <button
                        key={slot.time}
                        disabled={!slot.available}
                        onClick={() => setSelectedTime(slot.time)}
                        className={cn(
                          'py-3 px-4 rounded-lg text-center transition-all font-medium',
                          selectedTime === slot.time
                            ? 'bg-primary-500 text-white'
                            : slot.available
                            ? 'bg-white border-2 border-gray-200 hover:border-primary-500'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed line-through'
                        )}
                      >
                        {formatTime(slot.time)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <Card className="p-8 text-center">
                    <p className="text-gray-600">
                      No available time slots for this date. Please try another date.
                    </p>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step: Contact Info */}
        {step === 'info' && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Your Information</h2>
            <p className="text-gray-600 mb-6">
              Please provide your contact and service address
            </p>

            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="First Name"
                    placeholder="John"
                    value={guestInfo.firstName}
                    onChange={(e) =>
                      setGuestInfo({ ...guestInfo, firstName: e.target.value })
                    }
                  />
                  <Input
                    label="Last Name"
                    placeholder="Doe"
                    value={guestInfo.lastName}
                    onChange={(e) =>
                      setGuestInfo({ ...guestInfo, lastName: e.target.value })
                    }
                  />
                </div>

                <Input
                  label="Email"
                  type="email"
                  placeholder="john@example.com"
                  value={guestInfo.email}
                  onChange={(e) =>
                    setGuestInfo({ ...guestInfo, email: e.target.value })
                  }
                />

                <Input
                  label="Phone"
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={guestInfo.phone}
                  onChange={(e) =>
                    setGuestInfo({ ...guestInfo, phone: formatPhone(e.target.value) })
                  }
                />

                <div className="border-t pt-4 mt-4">
                  <h3 className="font-semibold text-gray-900 mb-4">Service Address</h3>

                  <Input
                    label="Street Address"
                    placeholder="123 Main St"
                    value={guestInfo.address}
                    onChange={(e) =>
                      setGuestInfo({ ...guestInfo, address: e.target.value })
                    }
                  />

                  <div className="grid grid-cols-6 gap-4 mt-4">
                    <div className="col-span-3">
                      <Input
                        label="City"
                        placeholder="Austin"
                        value={guestInfo.city}
                        onChange={(e) =>
                          setGuestInfo({ ...guestInfo, city: e.target.value })
                        }
                      />
                    </div>
                    <div className="col-span-1">
                      <Input
                        label="State"
                        placeholder="TX"
                        maxLength={2}
                        value={guestInfo.state}
                        onChange={(e) =>
                          setGuestInfo({
                            ...guestInfo,
                            state: e.target.value.toUpperCase(),
                          })
                        }
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        label="ZIP"
                        placeholder="78701"
                        maxLength={5}
                        value={guestInfo.zipCode}
                        onChange={(e) =>
                          setGuestInfo({ ...guestInfo, zipCode: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4 mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Special Instructions (Optional)
                  </label>
                  <textarea
                    placeholder="Gate code, parking instructions, or other notes..."
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step: Confirmation */}
        {step === 'confirm' && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Review & Confirm</h2>
            <p className="text-gray-600 mb-6">Please review your booking details</p>

            <Card className="mb-6">
              <CardContent className="p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Service Details</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Service</span>
                    <span className="font-medium">{selectedService?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Date</span>
                    <span className="font-medium">
                      {selectedDate && format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Time</span>
                    <span className="font-medium">
                      {selectedTime && formatTime(selectedTime)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Duration</span>
                    <span className="font-medium">
                      {selectedService && formatDuration(selectedService.duration_minutes)}
                    </span>
                  </div>
                  <div className="border-t pt-3 mt-3 flex justify-between">
                    <span className="font-semibold text-gray-900">Total</span>
                    <span className="text-xl font-bold text-primary-600">
                      {selectedService && formatPrice(selectedService.base_price)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardContent className="p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Contact Information</h3>
                <div className="space-y-2">
                  <p className="font-medium">
                    {guestInfo.firstName} {guestInfo.lastName}
                  </p>
                  <p className="text-gray-600 flex items-center gap-2">
                    <Mail className="h-4 w-4" /> {guestInfo.email}
                  </p>
                  <p className="text-gray-600 flex items-center gap-2">
                    <Phone className="h-4 w-4" /> {guestInfo.phone}
                  </p>
                  <p className="text-gray-600 flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {guestInfo.address}, {guestInfo.city}, {guestInfo.state}{' '}
                    {guestInfo.zipCode}
                  </p>
                </div>
                {notes && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm text-gray-500">Notes: {notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <p className="text-sm text-gray-500 text-center mb-4">
              By confirming, you agree to our terms of service. You will receive a confirmation
              email with calendar invite.
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-6 border-t">
          <Button
            variant="outline"
            onClick={goBack}
            disabled={step === 'services'}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          {step === 'confirm' ? (
            <Button
              onClick={handleSubmit}
              loading={submitting}
              disabled={!canProceed()}
            >
              Confirm Booking
            </Button>
          ) : (
            <Button
              onClick={goNext}
              disabled={!canProceed()}
            >
              Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
