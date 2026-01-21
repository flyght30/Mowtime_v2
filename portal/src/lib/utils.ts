import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO, addMinutes } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  return format(parseISO(dateStr), 'EEEE, MMMM d, yyyy');
}

export function formatShortDate(dateStr: string): string {
  return format(parseISO(dateStr), 'MMM d, yyyy');
}

export function formatTime(time: string): string {
  const [hour, minute] = time.split(':');
  const h = parseInt(hour);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${minute} ${ampm}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours} hour${hours > 1 ? 's' : ''}`;
}

export function calculateEndTime(startTime: string, durationMinutes: number): string {
  const [hour, minute] = startTime.split(':').map(Number);
  const startDate = new Date();
  startDate.setHours(hour, minute, 0, 0);
  const endDate = addMinutes(startDate, durationMinutes);
  return format(endDate, 'HH:mm');
}

export function generateCalendarLink(
  title: string,
  description: string,
  location: string,
  startDate: string,
  startTime: string,
  durationMinutes: number
): string {
  const [year, month, day] = startDate.split('-');
  const [hour, minute] = startTime.split(':');

  const start = new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour),
    parseInt(minute)
  );
  const end = addMinutes(start, durationMinutes);

  const formatForGoogle = (date: Date) =>
    date.toISOString().replace(/-|:|\.\d{3}/g, '');

  const googleUrl = new URL('https://calendar.google.com/calendar/render');
  googleUrl.searchParams.set('action', 'TEMPLATE');
  googleUrl.searchParams.set('text', title);
  googleUrl.searchParams.set('details', description);
  googleUrl.searchParams.set('location', location);
  googleUrl.searchParams.set('dates', `${formatForGoogle(start)}/${formatForGoogle(end)}`);

  return googleUrl.toString();
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'scheduled':
      return 'bg-blue-100 text-blue-800';
    case 'confirmed':
      return 'bg-green-100 text-green-800';
    case 'in_progress':
      return 'bg-yellow-100 text-yellow-800';
    case 'completed':
      return 'bg-gray-100 text-gray-800';
    case 'canceled':
      return 'bg-red-100 text-red-800';
    case 'paid':
      return 'bg-green-100 text-green-800';
    case 'sent':
      return 'bg-blue-100 text-blue-800';
    case 'overdue':
      return 'bg-red-100 text-red-800';
    case 'draft':
      return 'bg-gray-100 text-gray-600';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}
