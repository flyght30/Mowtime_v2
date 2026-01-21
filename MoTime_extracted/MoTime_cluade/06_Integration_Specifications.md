# ServicePro Platform - Integration Specifications

**Status:** Phase 1 Configuration  
**Version:** 1.0

---

## Table of Contents

1. [Weather API (OpenWeatherMap)](#weather-api)
2. [SMS/Voice (Twilio)](#smsvoice-twilio)
3. [Voice AI (ElevenLabs)](#voice-ai-elevenlabs)
4. [Push Notifications (Firebase)](#push-notifications-firebase)
5. [Phase 2+ Integrations](#phase-2-integrations)

---

## Weather API

### OpenWeatherMap

**Endpoint:** `https://api.openweathermap.org/data/3.0/onecall`

**API Key:** Create account at [openweathermap.org](https://openweathermap.org)

**Configuration:**

```python
WEATHER_API_KEY = "xxx_openweathermap_key_xxx"
WEATHER_API_PROVIDER = "openweathermap"
WEATHER_API_CALL_INTERVAL_HOURS = 6
WEATHER_FORECAST_DAYS = 7
```

**Request:**

```bash
GET https://api.openweathermap.org/data/3.0/onecall?
    lat=33.5185&
    lon=-86.8104&
    exclude=minutely,hourly&
    units=imperial&
    appid=YOUR_API_KEY
```

**Response (Daily Forecast):**

```json
{
  "daily": [
    {
      "dt": 1705785600,
      "temp": {
        "max": 72.5,
        "min": 45.2
      },
      "rain": 0.15,
      "clouds": 65,
      "wind_speed": 12.3,
      "wind_gust": 22.1
    }
  ]
}
```

**Field Mapping to ServicePro:**

```python
weather_data = {
    "date": datetime.fromtimestamp(response['daily'][0]['dt']),
    "condition": map_condition(response['daily'][0]['main']),  # "rainy", "partly_cloudy", etc.
    "rain_percent": response['daily'][0].get('rain', 0) * 100,  # Convert 0-1 to 0-100
    "temp_high_fahrenheit": response['daily'][0]['temp']['max'],
    "temp_low_fahrenheit": response['daily'][0]['temp']['min'],
    "wind_speed_mph": response['daily'][0]['wind_speed'],
    "humidity_percent": response['daily'][0].get('humidity', 0)
}
```

**Caching Strategy:**

```python
# Cache weather for 6 hours to minimize API calls
# Store in MongoDB weather_cache collection with TTL index
db.weather_cache.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 })

# Before making API call:
cached = db.weather_cache.findOne({
    business_id: "bus_abc123",
    latitude: 33.5185,
    longitude: -86.8104,
    check_date: today
})

if cached and cached.expires_at > now():
    return cached.weather_data

# If not cached, fetch from API
```

**Cost:**

- Free tier: 60 calls/minute, 1,000 calls/day
- Pro tier: Unlimited
- **Recommendation:** Start free, scale to pro if needed

**Alternative:** WeatherAPI.com (similar pricing, also free tier)

---

## SMS/Voice (Twilio)

### Setup

1. **Create Twilio Account:** https://www.twilio.com/
2. **Verify Phone Number:** +1-XXX-XXX-XXXX (business number)
3. **Get Credentials:**
   - Account SID
   - Auth Token
   - Phone Number (Twilio-assigned)

**Configuration:**

```python
TWILIO_ACCOUNT_SID = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
TWILIO_AUTH_TOKEN = "your_auth_token_here"
TWILIO_PHONE_NUMBER = "+1-205-555-0100"  # Your Twilio number
TWILIO_SMS_ENABLED = True
TWILIO_VOICE_ENABLED = False  # Phase 1: optional
```

### SMS Sending

**Endpoint:** `https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json`

**Request:**

```python
from twilio.rest import Client

client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

message = client.messages.create(
    body="Your appointment on Jan 20 at 9:00 AM is confirmed. Crew: Marcus",
    from_=TWILIO_PHONE_NUMBER,
    to="+1-205-555-5678"  # Customer phone
)
```

**Response:**

```json
{
  "sid": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "account_sid": "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "to": "+1-205-555-5678",
  "from": "+1-205-555-0100",
  "body": "Your appointment on Jan 20 at 9:00 AM is confirmed...",
  "status": "queued",
  "num_segments": 1,
  "num_media": 0,
  "date_created": "2025-01-17T14:30:00Z",
  "date_sent": null,
  "date_updated": "2025-01-17T14:30:00Z",
  "direction": "outbound-api",
  "error_code": null,
  "error_message": null,
  "price": "-0.0075",
  "price_unit": "USD",
  "messaging_service_sid": null,
  "sid": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**SMS Cost:**

- Outbound SMS US: ~$0.0075 per message
- Inbound SMS: ~$0.0075 per message
- **Budget:** 1000 SMS/month ≈ $15

### Inbound SMS (Webhook)

**Setup:** Configure webhook in Twilio console

```
Webhook URL: https://api.servicepro.app/webhooks/sms/inbound
Method: HTTP POST
```

**Webhook Payload:**

```json
{
  "MessageSid": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "AccountSid": "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "From": "+1-205-555-5678",
  "To": "+1-205-555-0100",
  "Body": "Can I book an appointment for Monday?",
  "NumMedia": 0,
  "MediaUrl0": null
}
```

**Handler:**

```python
@app.post("/webhooks/sms/inbound")
async def handle_inbound_sms(request: Request):
    data = await request.form()
    
    caller_phone = data.get("From")
    message_body = data.get("Body")
    
    # Find or create client
    client = db.clients.findOne({
        business_id: request.business_id,
        phone: caller_phone
    })
    
    if not client:
        # Create new client record
        client = create_client(phone=caller_phone)
    
    # Process message intent
    intent = detect_intent(message_body)  # "book", "reschedule", "info"
    
    # Route to handler
    if intent == "book":
        response = handle_sms_booking(client, message_body)
    else:
        response = f"Hi! I can help you book or reschedule. Reply 'BOOK' to schedule or 'RESCHEDULE' to change an appointment."
    
    # Send response
    send_sms(client.phone, response)
    
    # Log interaction
    log_sms_interaction(client_id=client.id, direction="inbound", body=message_body, response=response)
    
    return {"status": "ok"}
```

### Voice (Phase 1 Optional)

**Setup Inbound Call Webhook:**

```
Webhook URL: https://api.servicepro.app/webhooks/voice/inbound
Method: HTTP POST
```

**Webhook Payload:**

```json
{
  "CallSid": "CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "AccountSid": "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "From": "+1-205-555-5678",
  "To": "+1-205-555-0100",
  "CallStatus": "ringing",
  "ApiVersion": "2010-04-01",
  "Direction": "inbound",
  "ForwardedFrom": null,
  "CallerName": "John Smith"
}
```

**Handler Response (TwiML):**

```python
from twilio.twiml.voice_response import VoiceResponse

@app.post("/webhooks/voice/inbound")
async def handle_inbound_call(request: Request):
    data = await request.form()
    
    caller_phone = data.get("From")
    
    # If AI receptionist disabled, route to voicemail
    if not request.business.config.ai_receptionist_enabled:
        response = VoiceResponse()
        response.say("Thanks for calling. Leave a message and we'll get back to you.")
        response.record(max_length=20)
        return Response(str(response), media_type="application/xml")
    
    # Route to ElevenLabs AI
    session = start_voice_session(caller_phone)
    
    response = VoiceResponse()
    response.connect(CallerId=request.business.phone_number)  # Connect to AI
    
    return Response(str(response), media_type="application/xml")
```

---

## Voice AI (ElevenLabs)

### Setup

1. **Create Account:** https://elevenlabs.io/
2. **Get API Key:** Copy from account settings
3. **Select Voice:** Choose Breeze or River (see Voice AI spec)

**Configuration:**

```python
ELEVENLABS_API_KEY = "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
ELEVENLABS_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"  # Breeze voice ID
ELEVENLABS_MODEL_ID = "eleven_monolingual_v1"
```

### Text-to-Speech

**Endpoint:** `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`

**Request:**

```python
import requests

url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"

headers = {
    "xi-api-key": ELEVENLABS_API_KEY,
    "Content-Type": "application/json"
}

data = {
    "text": "Thanks for calling Southern Lawn Care! I'm your AI assistant. How can I help you today?",
    "model_id": "eleven_monolingual_v1",
    "voice_settings": {
        "stability": 0.7,
        "similarity_boost": 0.75
    }
}

response = requests.post(url, json=data, headers=headers)
audio_stream = response.content  # MP3 audio bytes
```

**Response:**

```
Content-Type: audio/mpeg
[Binary MP3 audio data]
```

### Speech-to-Text (Transcription)

**Via Twilio:** Transcribe voice calls automatically

```python
# After voice call completes, Twilio provides transcription
transcription = {
    "call_sid": "CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "transcription_text": "I'd like to book a lawn maintenance appointment",
    "transcription_status": "completed",
    "confidence": 0.92
}
```

**Alternative: Combine with AssemblyAI** (Phase 2)

```
POST https://api.assemblyai.com/v2/transcript
```

### Conversational AI Integration

**Via API (Future):**

```python
# Use ElevenLabs conversational endpoint when available
# For now, build conversation logic in FastAPI
```

**Cost:**

- Free tier: 10,000 characters/month
- Pro: Pay-as-you-go (~$0.30/1000 characters)
- **Estimate:** 50 calls/day × 500 chars avg = $7.50/month

---

## Push Notifications (Firebase)

### Setup

1. **Create Firebase Project:** https://console.firebase.google.com/
2. **Enable Cloud Messaging**
3. **Download Service Account Key** (JSON)
4. **Install Firebase Admin SDK**

**Configuration:**

```python
import firebase_admin
from firebase_admin import credentials

cred = credentials.Certificate("path/to/serviceAccountKey.json")
firebase_admin.initialize_app(cred)

FIREBASE_ENABLED = True
```

### Send Push Notification

**Endpoint:** Firebase Admin SDK

```python
from firebase_admin import messaging

def send_push_notification(user_id: str, title: str, body: str, data: dict = None):
    """Send push notification to mobile app user."""
    
    # Get device tokens for user
    devices = db.user_devices.find({"user_id": user_id})
    
    for device in devices:
        message = messaging.Message(
            notification=messaging.Notification(
                title=title,
                body=body
            ),
            data=data or {},
            token=device.fcm_token  # Firebase Cloud Messaging token
        )
        
        response = messaging.send(message)
        print(f"Successfully sent message: {response}")

# Usage
send_push_notification(
    user_id="usr_abc123",
    title="New Appointment",
    body="You have a job scheduled for Jan 20 at 9:00 AM",
    data={"appointment_id": "apt_abc123", "action": "open_appointment"}
)
```

### Obtain Device Token (Mobile App)

**React Native (Expo):**

```javascript
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

async function registerForPushNotificationsAsync() {
  let token;

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return;
    }
    
    token = (await Notifications.getExpoPushTokenAsync()).data;
    console.log(token);
  }

  // Send token to backend
  await fetch('https://api.servicepro.app/devices/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, device_id: Device.deviceYearClass })
  });
}
```

**Backend (Save Token):**

```python
@app.post("/devices/register")
async def register_device(request: Request, token: str, device_id: str):
    db.user_devices.insert_one({
        "user_id": request.user_id,
        "fcm_token": token,
        "device_id": device_id,
        "created_at": datetime.utcnow()
    })
    return {"status": "ok"}
```

**Cost:**

- Free tier: Unlimited push notifications
- No charge unless using Firebase Analytics

---

## Phase 2+ Integrations

### Payments

```
Stripe:
  - API Key: sk_live_xxx
  - Publishable Key: pk_live_xxx
  - Endpoint: https://api.stripe.com/v1/charges

Square:
  - Access Token: sq0atp_xxx
  - Location ID: L1234567890
  - Endpoint: https://connect.squareup.com/v2/payments
```

### Accounting

```
QuickBooks Online:
  - OAuth2 setup
  - Realm ID (company)
  - Endpoint: https://quickbooks.api.intuit.com/v2/company/{realmID}/

Xero:
  - OAuth2 setup
  - Tenant ID
  - Endpoint: https://api.xero.com/api/sets/1.0/
```

### CRM / Email

```
Mailchimp:
  - API Key: xxx-us1
  - List ID: xxxxxxxxxx
  
HubSpot:
  - Private App Token: pat-xxx
  - Hub ID: 123456789
```

---

## TODO

- [ ] Create OpenWeatherMap account and test API
- [ ] Create Twilio account and verify phone number
- [ ] Create ElevenLabs account and test voice
- [ ] Create Firebase project and download service account key
- [ ] Document all API keys in .env template
- [ ] Set up alerting for API rate limits
- [ ] Test failover when API is down
- [ ] Document backup providers (weather, SMS, voice)
