// MongoDB Initialization Script
// Creates the application database and user

// Switch to the application database
db = db.getSiblingDB('servicepro_dev');

// Create collections with validation
db.createCollection('users');
db.createCollection('businesses');
db.createCollection('clients');
db.createCollection('services');
db.createCollection('staff');
db.createCollection('appointments');
db.createCollection('invoices');
db.createCollection('payments');
db.createCollection('notifications');
db.createCollection('calls');

// Create indexes for better query performance

// Users indexes
db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "business_id": 1 });
db.users.createIndex({ "user_id": 1 }, { unique: true });

// Businesses indexes
db.businesses.createIndex({ "business_id": 1 }, { unique: true });
db.businesses.createIndex({ "slug": 1 }, { unique: true });

// Clients indexes
db.clients.createIndex({ "client_id": 1 }, { unique: true });
db.clients.createIndex({ "business_id": 1 });
db.clients.createIndex({ "phone": 1, "business_id": 1 });
db.clients.createIndex({ "email": 1, "business_id": 1 });
db.clients.createIndex({ "status": 1, "business_id": 1 });

// Services indexes
db.services.createIndex({ "service_id": 1 }, { unique: true });
db.services.createIndex({ "business_id": 1 });
db.services.createIndex({ "is_active": 1, "business_id": 1 });
db.services.createIndex({ "category": 1, "business_id": 1 });

// Staff indexes
db.staff.createIndex({ "staff_id": 1 }, { unique: true });
db.staff.createIndex({ "business_id": 1 });
db.staff.createIndex({ "is_active": 1, "business_id": 1 });
db.staff.createIndex({ "role": 1, "business_id": 1 });

// Appointments indexes
db.appointments.createIndex({ "appointment_id": 1 }, { unique: true });
db.appointments.createIndex({ "business_id": 1 });
db.appointments.createIndex({ "client_id": 1 });
db.appointments.createIndex({ "scheduled_date": 1, "business_id": 1 });
db.appointments.createIndex({ "status": 1, "business_id": 1 });
db.appointments.createIndex({ "staff_ids": 1 });
db.appointments.createIndex({ "scheduled_date": 1, "scheduled_time": 1, "business_id": 1 });

// Invoices indexes
db.invoices.createIndex({ "invoice_id": 1 }, { unique: true });
db.invoices.createIndex({ "business_id": 1 });
db.invoices.createIndex({ "client_id": 1 });
db.invoices.createIndex({ "status": 1, "business_id": 1 });
db.invoices.createIndex({ "invoice_number": 1, "business_id": 1 }, { unique: true });

// Payments indexes
db.payments.createIndex({ "payment_id": 1 }, { unique: true });
db.payments.createIndex({ "business_id": 1 });
db.payments.createIndex({ "invoice_id": 1 });
db.payments.createIndex({ "client_id": 1 });

// Notifications indexes
db.notifications.createIndex({ "notification_id": 1 }, { unique: true });
db.notifications.createIndex({ "business_id": 1 });
db.notifications.createIndex({ "recipient_id": 1, "status": 1 });
db.notifications.createIndex({ "scheduled_for": 1, "status": 1 });

// Calls indexes
db.calls.createIndex({ "call_id": 1 }, { unique: true });
db.calls.createIndex({ "business_id": 1 });
db.calls.createIndex({ "caller_phone": 1 });
db.calls.createIndex({ "status": 1, "business_id": 1 });

print('MongoDB initialization complete - indexes created');
