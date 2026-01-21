# ServicePro Platform - Authentication & Security Matrix

**Status:** Phase 1 Design  
**Version:** 1.0  
**Compliance:** GDPR, CCPA, SOC 2 (Phase 2)

---

## Table of Contents

1. [Authentication](#authentication)
2. [Authorization (Roles & Permissions)](#authorization-roles--permissions)
3. [Data Security](#data-security)
4. [Compliance](#compliance)

---

## Authentication

### JWT (JSON Web Tokens)

**Token Structure:**

```
Header:
  {
    "alg": "HS256",
    "typ": "JWT"
  }

Payload:
  {
    "user_id": "usr_abc123",
    "business_id": "bus_abc123",
    "email": "owner@servicepro.app",
    "role": "owner",
    "iat": 1705513200,  # Issued at
    "exp": 1705516800,  # Expires in 1 hour
    "refresh_exp": 1708105200  # Refresh expires in 30 days
  }

Signature:
  HMACSHA256(base64UrlEncode(header) + "." + base64UrlEncode(payload), secret)
```

### Token Expiry

```
Access Token: 1 hour
Refresh Token: 30 days
Session Timeout: 24 hours of inactivity (Phase 2)
```

### Token Generation

```python
import jwt
from datetime import datetime, timedelta

SECRET_KEY = "your-secret-key-min-32-characters"

def generate_tokens(user_id: str, business_id: str, email: str, role: str):
    """Generate access and refresh tokens."""
    
    now = datetime.utcnow()
    
    # Access token (1 hour)
    access_payload = {
        "user_id": user_id,
        "business_id": business_id,
        "email": email,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=1)).timestamp())
    }
    
    access_token = jwt.encode(access_payload, SECRET_KEY, algorithm="HS256")
    
    # Refresh token (30 days)
    refresh_payload = {
        "user_id": user_id,
        "business_id": business_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=30)).timestamp())
    }
    
    refresh_token = jwt.encode(refresh_payload, SECRET_KEY, algorithm="HS256")
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": 3600,  # seconds
        "token_type": "Bearer"
    }

def verify_token(token: str):
    """Verify and decode JWT."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise ValueError("Token has expired")
    except jwt.InvalidTokenError:
        raise ValueError("Invalid token")
```

### Password Hashing

```python
import bcrypt

def hash_password(password: str) -> str:
    """Hash password with bcrypt."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode(), salt).decode()

def verify_password(password: str, hashed: str) -> bool:
    """Verify password against hash."""
    return bcrypt.checkpw(password.encode(), hashed.encode())

# Minimum requirements
PASSWORD_POLICY = {
    "min_length": 8,
    "require_uppercase": True,
    "require_lowercase": True,
    "require_number": True,
    "require_special": False
}
```

---

## Authorization (Roles & Permissions)

### Role Definitions

#### Owner
- **Scope:** Full business control
- **Permissions:** Create/read/update/delete everything
- **Staffing:** Can create and manage all staff
- **Clients:** Can view all clients and history
- **Settings:** Can modify business config, billing, integrations
- **Data:** Can export/delete data (GDPR)

#### Manager
- **Scope:** Operational management (team lead)
- **Permissions:** CRUD appointments, staff assignments, view reports
- **Staffing:** Cannot create staff (owner only), can assign jobs
- **Clients:** Can view client details and history
- **Settings:** Cannot modify business config, read-only on integrations
- **Limitations:** Cannot delete staff or clients

#### Staff Member
- **Scope:** Personal assignments only
- **Permissions:** View assigned appointments, mark complete
- **Staffing:** Cannot view other staff (privacy)
- **Clients:** Can view client details for assigned appointments
- **Settings:** Can update personal availability, change password
- **Limitations:** Cannot create appointments, cannot view reports

#### Customer
- **Scope:** Self-service portal (Phase 2)
- **Permissions:** View own appointments, reschedule, cancel
- **Limitations:** Cannot create new appointments via portal, cannot view other customers

### Permission Matrix

| Action | Owner | Manager | Staff | Customer |
|--------|-------|---------|-------|----------|
| **Appointments** | ✅ | ✅ | View Own | View Own |
| Create Appointment | ✅ | ✅ | ❌ | ❌ |
| Update Appointment | ✅ | ✅ | ✅* | ❌ |
| Cancel Appointment | ✅ | ✅ | ❌ | ✅** |
| Complete Appointment | ✅ | ✅ | ✅ | ❌ |
| **Clients** | ✅ | ✅ | View Own | View Self |
| View All Clients | ✅ | ✅ | ❌ | ❌ |
| Create Client | ✅ | ✅ | ❌ | ❌ |
| Edit Client | ✅ | ✅ | ❌ | ✅*** |
| Delete Client | ✅ | ❌ | ❌ | ❌ |
| **Staff** | ✅ | View | View Own | ❌ |
| Create Staff | ✅ | ❌ | ❌ | ❌ |
| Edit Staff | ✅ | View | Self Only | ❌ |
| Delete Staff | ✅ | ❌ | ❌ | ❌ |
| **Business Settings** | ✅ | ❌ | ❌ | ❌ |
| **Reports** | ✅ | ✅ | View Own | ❌ |
| **Billing** | ✅ | ❌ | ❌ | ❌ |

**Notes:**
- `✅*` Staff can mark completion and log notes only
- `✅**` Customers can cancel up to 24 hours before
- `✅***` Customers can update name/phone only

### Implementation (FastAPI)

```python
from fastapi import Depends, HTTPException
from typing import Optional

async def get_current_user(request: Request) -> dict:
    """Extract and verify user from JWT token."""
    
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    
    token = auth_header.split(" ")[1]
    
    try:
        payload = verify_token(token)
        return payload
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid token")

def require_role(*allowed_roles: str):
    """Decorator to check user role."""
    
    async def check_role(current_user: dict = Depends(get_current_user)):
        if current_user.get("role") not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    
    return check_role

# Usage
@app.delete("/staff/{staff_id}")
async def delete_staff(
    staff_id: str,
    current_user: dict = Depends(require_role("owner"))
):
    """Only owners can delete staff."""
    # ... implementation
    pass

@app.patch("/appointments/{apt_id}/complete")
async def complete_appointment(
    apt_id: str,
    current_user: dict = Depends(require_role("owner", "manager", "staff"))
):
    """Owners, managers, and staff can complete appointments."""
    # ... implementation
    pass
```

---

## Data Security

### Encryption

#### At Rest

```
Database: MongoDB encryption at rest (AWS/Atlas default)
Files: S3 server-side encryption (Phase 2)
Backups: Encrypted copies, 30-day retention
```

#### In Transit

```
HTTPS: Required for all API calls
TLS 1.3: Minimum protocol version
Certificate: Let's Encrypt (auto-renew)
HSTS: Enabled (Strict-Transport-Security header)
```

#### Sensitive Fields

```python
# Fields requiring additional encryption
SENSITIVE_FIELDS = {
    "password_hash": "Never log or expose",
    "refresh_token": "Encrypted in database",
    "payment_method": "Tokenized via Stripe/Square",
    "ssn": "Not stored; customer provides at payment time",
    "address": "Encrypted at rest (Phase 2)"
}

# Example: Encrypt payment token
from cryptography.fernet import Fernet

cipher = Fernet(ENCRYPTION_KEY)
encrypted_token = cipher.encrypt(payment_token.encode())
```

### API Security

#### Rate Limiting

```python
from slowapi import Limiter

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/auth/login")
@limiter.limit("5/minute")
async def login(credentials: LoginRequest):
    """Max 5 login attempts per minute per IP."""
    pass

@app.get("/appointments")
@limiter.limit("100/minute")
async def list_appointments():
    """Standard rate limit: 100 requests/minute."""
    pass
```

#### CORS Configuration

```python
from fastapi.middleware.cors import CORSMiddleware

# Mobile app (React Native via Expo)
ALLOWED_ORIGINS = [
    "https://exp.host",  # Expo development
    "https://servicepro.app",  # Web app
    "capacitor://localhost",  # iOS (Capacitor)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
)
```

#### SQL Injection / Injection Attacks

```python
# ❌ BAD: String concatenation
query = f"SELECT * FROM appointments WHERE id = '{apt_id}'"

# ✅ GOOD: Parameterized queries (MongoDB)
appointment = db.appointments.find_one({"appointment_id": apt_id})

# ✅ GOOD: SQLAlchemy (if using SQL)
appointment = session.query(Appointment).filter_by(appointment_id=apt_id).first()
```

#### Input Validation

```python
from pydantic import BaseModel, EmailStr, validator

class CreateClientRequest(BaseModel):
    first_name: str  # Required
    last_name: str  # Required
    email: EmailStr  # Must be valid email
    phone: str  # Required
    address: str  # Required
    
    @validator("first_name", "last_name")
    def name_not_empty(cls, v):
        if not v or len(v.strip()) < 2:
            raise ValueError("Name must be at least 2 characters")
        return v.strip()
    
    @validator("phone")
    def phone_valid(cls, v):
        # Only allow +1-XXX-XXX-XXXX format
        import re
        if not re.match(r"^\+1-\d{3}-\d{3}-\d{4}$", v):
            raise ValueError("Invalid phone format")
        return v
```

#### CSRF Protection

```python
# Include CSRF token in forms (Phase 2)
# For API: Use SameSite cookies and HTTPS

response.set_cookie(
    key="servicepro_csrf",
    value=csrf_token,
    httponly=True,  # Prevent JavaScript access
    secure=True,    # HTTPS only
    samesite="Strict"  # Prevent CSRF
)
```

### Secrets Management

```python
# Use environment variables, never hardcode
import os
from dotenv import load_dotenv

load_dotenv(".env.local")

SECRET_KEY = os.getenv("SECRET_KEY")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
DATABASE_URL = os.getenv("DATABASE_URL")

# .env.local (git-ignored)
# SECRET_KEY=your-32-character-secret-key-here
# TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# TWILIO_AUTH_TOKEN=your_auth_token_here
```

---

## Compliance

### GDPR (European Users)

**Requirements:**
- Right to access: Users can export their data
- Right to delete: Users can request deletion (soft delete)
- Data minimization: Only collect necessary data
- Consent: Users must opt-in for marketing

**Implementation:**

```python
@app.post("/users/export-data")
async def export_user_data(current_user: dict = Depends(get_current_user)):
    """GDPR: User can export all their data."""
    
    user_data = {
        "user": db.users.find_one({"user_id": current_user.user_id}),
        "appointments": list(db.appointments.find({"business_id": current_user.business_id})),
        "clients": list(db.clients.find({"business_id": current_user.business_id})),
        "staff": list(db.staff.find({"business_id": current_user.business_id}))
    }
    
    # Return as JSON file
    return FileResponse("user_data.json", media_type="application/json")

@app.post("/users/delete-account")
async def delete_account(current_user: dict = Depends(get_current_user)):
    """GDPR: User can request account deletion (30-day grace period)."""
    
    db.users.update_one(
        {"user_id": current_user.user_id},
        {
            "$set": {
                "deleted_at": datetime.utcnow(),
                "scheduled_deletion_at": datetime.utcnow() + timedelta(days=30)
            }
        }
    )
    
    # Email confirmation to user
    send_email(
        to=current_user.email,
        subject="Your account has been scheduled for deletion",
        body="Your account will be permanently deleted in 30 days. Reply to cancel."
    )
    
    return {"message": "Account scheduled for deletion. You have 30 days to cancel."}
```

### CCPA (California Users)

Similar to GDPR; same data export/deletion mechanisms apply.

### SOC 2 (Phase 2)

- Audit logging of all sensitive operations
- Encryption at rest and in transit
- Access controls and RBAC
- Incident response plan
- Regular security audits

---

## Audit Logging

All sensitive operations logged:

```python
def log_audit_event(
    user_id: str,
    action: str,
    resource_type: str,
    resource_id: str,
    changes: dict = None,
    status: str = "success",
    error_message: str = None
):
    """Log security-relevant event."""
    
    db.audit_logs.insert_one({
        "user_id": user_id,
        "action": action,  # "create", "update", "delete", "login", etc.
        "resource_type": resource_type,  # "appointment", "staff", "user", etc.
        "resource_id": resource_id,
        "changes": changes,
        "status": status,
        "error_message": error_message,
        "ip_address": request.client.host,
        "user_agent": request.headers.get("user-agent"),
        "timestamp": datetime.utcnow()
    })

# Usage
log_audit_event(
    user_id="usr_abc123",
    action="login",
    resource_type="user",
    resource_id="usr_abc123",
    status="success"
)
```

---

## TODO

- [ ] Generate SECRET_KEY (use: `python -c "import secrets; print(secrets.token_hex(32))"`)
- [ ] Set up 2FA (Two-Factor Authentication) - Phase 2
- [ ] Configure API key rotation policy
- [ ] Set up email verification for new accounts
- [ ] Implement password reset flow with token expiry
- [ ] Set up audit logging infrastructure
- [ ] Create GDPR/CCPA privacy policy
- [ ] Schedule annual security audit
- [ ] Set up incident response plan
