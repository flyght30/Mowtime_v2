'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Leaf,
  ArrowLeft,
  FileText,
  CreditCard,
  CheckCircle,
  AlertCircle,
  Building2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatPrice, formatDate, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface Invoice {
  invoice_id: string;
  invoice_number: string;
  status: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  due_date: string;
  issued_date: string;
  paid_date?: string;
  line_items: Array<{
    service_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
  business: {
    name: string;
    email: string;
    phone: string;
    address: string;
  };
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if logged in
    const token = api.getToken();
    if (!token) {
      router.push('/login');
      return;
    }
    loadInvoice();
  }, [invoiceId]);

  const loadInvoice = async () => {
    try {
      const response = await api.getInvoiceDetails(invoiceId);
      if (response.success && response.data?.data) {
        setInvoice(response.data.data);
      }
    } catch (err) {
      console.error('Failed to load invoice:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async () => {
    if (!invoice) return;
    setPaying(true);
    setError(null);

    try {
      // Create payment intent
      const intentRes = await api.createPaymentIntent(invoice.invoice_id);
      if (!intentRes.success || !intentRes.data?.data) {
        setError(intentRes.error?.message || 'Failed to initiate payment');
        setPaying(false);
        return;
      }

      const { client_secret, payment_intent_id } = intentRes.data.data;

      // In production, use Stripe Elements to collect card details
      // For demo, show a message that Stripe integration requires setup
      setError('Stripe payment requires frontend integration with @stripe/stripe-js. Please configure STRIPE_SECRET_KEY and add Stripe Elements to complete payments.');
      setPaying(false);

    } catch (err) {
      setError('Payment failed. Please try again.');
      setPaying(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-700';
      case 'sent':
        return 'bg-blue-100 text-blue-700';
      case 'overdue':
        return 'bg-red-100 text-red-700';
      case 'draft':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Invoice Not Found</h1>
        <Link href="/dashboard">
          <Button>Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-2">
            <Leaf className="h-8 w-8 text-primary-500" />
            <span className="text-xl font-bold text-gray-900">ServicePro</span>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Back Link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        {/* Payment Success */}
        {paymentSuccess && (
          <Card className="mb-6 border-green-200 bg-green-50">
            <CardContent className="p-4 flex items-center gap-4">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <h3 className="font-semibold text-green-800">Payment Successful!</h3>
                <p className="text-green-600">Thank you for your payment.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {error && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="p-4 flex items-center gap-4">
              <AlertCircle className="h-6 w-6 text-red-500 flex-shrink-0" />
              <p className="text-red-700">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Invoice Header */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-6 w-6 text-gray-400" />
                  <h1 className="text-2xl font-bold text-gray-900">
                    Invoice #{invoice.invoice_number}
                  </h1>
                </div>
                <span className={cn(
                  'px-3 py-1 text-sm font-medium rounded-full capitalize',
                  getStatusColor(invoice.status)
                )}>
                  {invoice.status}
                </span>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Issued</p>
                <p className="font-medium">{formatDate(invoice.issued_date)}</p>
                {invoice.due_date && (
                  <>
                    <p className="text-sm text-gray-500 mt-2">Due</p>
                    <p className={cn(
                      'font-medium',
                      invoice.status === 'overdue' && 'text-red-600'
                    )}>
                      {formatDate(invoice.due_date)}
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Business Info */}
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <Building2 className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">{invoice.business.name}</p>
                <p className="text-sm text-gray-600">{invoice.business.address}</p>
                <p className="text-sm text-gray-600">{invoice.business.email}</p>
                <p className="text-sm text-gray-600">{invoice.business.phone}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Services</h2>
            <div className="space-y-3">
              {invoice.line_items.map((item, i) => (
                <div key={i} className="flex justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium text-gray-900">{item.service_name}</p>
                    <p className="text-sm text-gray-500">
                      {item.quantity} x {formatPrice(item.unit_price)}
                    </p>
                  </div>
                  <p className="font-medium text-gray-900">
                    {formatPrice(item.total_price)}
                  </p>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="mt-6 pt-4 border-t space-y-2">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>{formatPrice(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Tax ({(invoice.tax_rate * 100).toFixed(1)}%)</span>
                <span>{formatPrice(invoice.tax_amount)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t">
                <span>Total</span>
                <span>{formatPrice(invoice.total)}</span>
              </div>
              {invoice.amount_paid > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Paid</span>
                  <span>-{formatPrice(invoice.amount_paid)}</span>
                </div>
              )}
              {invoice.amount_due > 0 && (
                <div className="flex justify-between text-xl font-bold text-primary-600 pt-2">
                  <span>Amount Due</span>
                  <span>{formatPrice(invoice.amount_due)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Payment Section */}
        {invoice.status !== 'paid' && invoice.amount_due > 0 && (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900">Pay Now</h2>
                  <p className="text-sm text-gray-600">
                    Secure payment powered by Stripe
                  </p>
                </div>
                <Button
                  onClick={handlePay}
                  loading={paying}
                  disabled={paying || paymentSuccess}
                  size="lg"
                >
                  <CreditCard className="h-5 w-5 mr-2" />
                  Pay {formatPrice(invoice.amount_due)}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Paid Status */}
        {invoice.status === 'paid' && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-6 flex items-center gap-4">
              <CheckCircle className="h-10 w-10 text-green-500" />
              <div>
                <h2 className="font-semibold text-green-800 text-lg">Paid in Full</h2>
                <p className="text-green-600">
                  Payment received on {invoice.paid_date ? formatDate(invoice.paid_date) : 'N/A'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
