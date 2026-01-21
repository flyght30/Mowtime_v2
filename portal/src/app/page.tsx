import Link from 'next/link';
import { Leaf, Calendar, CreditCard, Clock } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Leaf className="h-8 w-8 text-primary-500" />
            <span className="text-xl font-bold text-gray-900">ServicePro</span>
          </div>
          <Link
            href="/login"
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            Client Login
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            Book Your Lawn Care Service
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Professional lawn care and landscaping services at your fingertips.
            Book online in minutes.
          </p>

          {/* Demo Business Links */}
          <div className="mt-12">
            <h2 className="text-lg font-semibold text-gray-700 mb-6">
              Demo Businesses
            </h2>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/book/greenscape-pro"
                className="inline-flex items-center justify-center px-8 py-4 bg-primary-500 text-white rounded-xl font-semibold hover:bg-primary-600 transition-colors shadow-lg shadow-primary-500/30"
              >
                GreenScape Pro (Austin, TX)
              </Link>
              <Link
                href="/book/sunshine-lawn-care"
                className="inline-flex items-center justify-center px-8 py-4 bg-white text-primary-600 border-2 border-primary-500 rounded-xl font-semibold hover:bg-primary-50 transition-colors"
              >
                Sunshine Lawn Care (Orlando, FL)
              </Link>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="mt-24 grid md:grid-cols-3 gap-8">
          <div className="text-center p-6">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="h-8 w-8 text-primary-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Easy Online Booking
            </h3>
            <p className="text-gray-600">
              Choose your service, pick a time that works for you, and book in minutes.
            </p>
          </div>

          <div className="text-center p-6">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="h-8 w-8 text-primary-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Real-Time Availability
            </h3>
            <p className="text-gray-600">
              See available time slots instantly based on staff schedules and weather.
            </p>
          </div>

          <div className="text-center p-6">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CreditCard className="h-8 w-8 text-primary-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Secure Payments
            </h3>
            <p className="text-gray-600">
              Pay invoices online securely with credit card via Stripe.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8 mt-24">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-gray-400">
            Powered by ServicePro - The complete service business platform
          </p>
        </div>
      </footer>
    </div>
  );
}
