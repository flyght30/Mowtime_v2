# ServicePro Platform - Voice AI Receptionist Specification

**Component:** ElevenLabs Conversational AI + Twilio Voice  
**Status:** Phase 1 Optional (Toggle On/Off)  
**Voice Model:** Breeze or River (warm, professional)  
**Integration:** Twilio webhook → FastAPI → ElevenLabs

---

## Table of Contents

1. [Overview](#overview)
2. [Call Flow Architecture](#call-flow-architecture)
3. [Conversation Scripts](#conversation-scripts)
4. [Intent Detection](#intent-detection)
5. [Error Handling & Escalation](#error-handling--escalation)
6. [Tuning & Performance](#tuning--performance)

---

## Overview

### Purpose

The AI Receptionist automates inbound booking, rescheduling, and inquiry handling via voice calls. It operates 24/7 and integrates with the scheduling engine to:

- Book new appointments
- Reschedule existing appointments
- Answer service questions
- Collect customer information
- Escalate to human when needed

### Scope (Phase 1)

✅ **Implemented:**
- Inbound call answering
- Intent detection (book, reschedule, cancel, inquiry)
- Appointment booking flow
- Reschedule confirmation
- Call logging & transcription

❌ **Phase 2+:**
- Outbound reminder calls
- Payment collection
- Two-way text integration (SMS conversation context)
- Call recording & playback

---

## Call Flow Architecture

### High-Level Flow

```
Inbound Call (Twilio)
    ↓
[Webhook: POST /voice/start-session]
    ↓
Fetch Business Config (hours, services, staff)
    ↓
AI Greeting
    ↓
[Speech-to-Text: Transcribe caller input]
    ↓
Intent Detection (book, reschedule, cancel, info)
    ↓
Route to Intent Handler
    ├─→ Book Appointment Flow
    ├─→ Reschedule Flow
    ├─→ Cancel Flow
    ├─→ Service Info Flow
    └─→ Transfer to Human
    ↓
[Text-to-Speech: ElevenLabs response]
    ↓
End Call → Log Session
```

### Session State Machine

```
INITIATED
    ↓
AWAITING_INTENT
    ├─→ INTENT_DETECTED
    │   ├─→ BOOKING_IN_PROGRESS
    │   │   └─→ APPOINTMENT_CONFIRMED / BOOKING_FAILED
    │   ├─→ RESCHEDULE_IN_PROGRESS
    │   │   └─→ RESCHEDULE_CONFIRMED / RESCHEDULE_FAILED
    │   ├─→ CANCELLATION_IN_PROGRESS
    │   │   └─→ CANCELLATION_CONFIRMED / CANCELLATION_FAILED
    │   └─→ INFO_PROVIDED
    └─→ ESCALATED_TO_HUMAN
        └─→ CALL_ENDED
```

---

## Conversation Scripts

### 1. Greeting & Initial Prompt

**Goal:** Establish call context, set expectations

```
AI: "Thanks for calling Southern Lawn Care! 
     I'm your AI assistant. I can help you book an appointment, 
     reschedule, or answer questions about our services. 
     What can I help you with today?"

[Listen for: "I want to...", "Can I...", "Do you...", etc.]
```

**Variations by Business Config:**

- If `ai_receptionist_enabled = false`: "Please hold for a representative"
- If `business_hours` outside: "We're currently closed, but you can book via text or our app"

---

### 2. Booking Flow

**Triggered by:** Intent = "book_appointment"

```
[State: BOOKING_IN_PROGRESS]

AI: "Great! I'd be happy to help you book an appointment. 
     First, are you a new customer or have we worked with you before?"

Customer: "I'm new" / "You did my lawn last month"

[Intent Detection: Existing vs New Customer]

─────────────────────────────────────────────────────────────

IF NEW CUSTOMER:
    AI: "Perfect! Can I get your name?"
    Customer: "John Smith"
    
    AI: "Thanks, John. What's your phone number?"
    Customer: "+1-205-555-5678"
    
    AI: "And your address?"
    Customer: "456 Oak Avenue, Birmingham"
    
    [Query: Validate address is serviceable (Phase 2: zip code check)]

IF EXISTING CUSTOMER:
    AI: "Can I get the phone number or address on your account?"
    Customer: "+1-205-555-5678"
    
    [Query: customers.find({ phone: "+1-205-555-5678", business_id })]
    
    IF FOUND:
        AI: "Great! I found your account, John. Same address at 456 Oak?"
        Customer: "Yes" / "No, I moved"
        
        [If moved, update address]
    
    IF NOT FOUND:
        AI: "I don't see an account. Let me get your address..."
        [Treat as new customer]

─────────────────────────────────────────────────────────────

AI: "What service are you interested in?
     We offer: Full Lawn Maintenance, Edging Only, and Trimming.
     Which sounds best?"

Customer: "Full lawn maintenance"

[Intent Detection: Extract service name from response]
[Query: services.find({ name: "Full Lawn Maintenance" })]

IF NOT RECOGNIZED:
    AI: "I didn't catch that. Let me read the options again:
         Full Lawn Maintenance is our most popular, 60 minutes for $85.
         Edging Only, 20 minutes for $25.
         Or Trimming, 30 minutes for $35.
         Which one?"

─────────────────────────────────────────────────────────────

AI: "When would you like to schedule? 
     Available dates are: Monday the 20th, Tuesday the 21st, 
     or Wednesday the 22nd.
     What works for you?"

Customer: "Tuesday, the 21st"

[Query: availability/business?date_from=2025-01-21&date_to=2025-01-21]

AI: "Perfect! Tuesday the 21st. 
     We have morning slots at 8:00 AM, 9:00 AM, 10:00 AM,
     or afternoon at 2:00 PM and 3:00 PM.
     What time suits you?"

Customer: "9 AM"

─────────────────────────────────────────────────────────────

[Query: POST /appointments
  {
    client_id: "cli_xyz789",
    service_id: "svc_001",
    scheduled_date: "2025-01-21",
    scheduled_start_time: "09:00",
    estimated_duration_minutes: 60
  }
]

IF APPOINTMENT_CREATED:
    AI: "Excellent! Your appointment is confirmed for
         Tuesday, January 21st at 9:00 AM.
         
         Marcus Johnson will be leading your crew.
         You'll receive a text confirmation shortly at the number you provided.
         
         Do you have any questions?"
    
    Customer: "No" / "Yes, ..." / [silence]
    
    IF QUESTIONS:
        [Route to Info Flow]
    
    IF NO / SILENCE:
        AI: "Great! We look forward to seeing you Tuesday.
             Thanks for calling Southern Lawn Care!"
        
        [End call → Log session with status: appointment_booked]

IF APPOINTMENT_CREATION_FAILED:
    AI: "I apologize, but I wasn't able to book that time.
         It might be that Marcus is fully booked or there's a conflict.
         
         Let me try the next available time: 10:00 AM same day.
         Does that work?"
    
    Customer: "Yes" / "No" / "Can I talk to someone?"
    
    IF NO:
        [Escalate to human or suggest text booking]
    
    IF CAN_I_TALK_TO_SOMEONE:
        [Escalate to human]
```

---

### 3. Reschedule Flow

**Triggered by:** Intent = "reschedule_appointment"

```
[State: RESCHEDULE_IN_PROGRESS]

AI: "I can help you reschedule! 
     Can I have your phone number to look up your account?"

Customer: "+1-205-555-5678"

[Query: appointments.find({ 
    client_id matched to phone, 
    status: "scheduled", 
    business_id 
})]

IF NO APPOINTMENTS FOUND:
    AI: "I don't see any upcoming appointments under that number.
         Are you sure you booked with us? Or would you like to book a new appointment?"
    
    Customer: "Actually, let me book..." / "Wrong number..." / etc.
    [Route accordingly]

IF APPOINTMENTS FOUND:
    AI: "I found your appointment for Tuesday, January 21st at 9:00 AM
         for Full Lawn Maintenance.
         
         Is that the one you want to reschedule?"
    
    Customer: "Yes" / "No, I have another"
    
    [If multiple, list them]

IF CONFIRMED:
    AI: "What's the reason you need to reschedule?
         Is it due to weather, your schedule, or something else?"
    
    Customer: "Weather" / "I'll be out of town" / etc.
    
    [Capture reason in audit log]
    
    AI: "I understand. Let me find you some available times.
         [Check weather forecast if customer said weather]
         
         How about Monday the 20th at 2:00 PM?
         Or Wednesday the 22nd at 8:00 AM?"
    
    Customer: "Monday at 2 PM"
    
    [Query: POST /appointments/{apt_id}/reschedule
      {
        new_scheduled_date: "2025-01-20",
        new_scheduled_start_time: "14:00",
        reason: "customer_request"
      }
    ]
    
    IF RESCHEDULE_SUCCESS:
        AI: "Perfect! Your appointment is now scheduled for
             Monday, January 20th at 2:00 PM instead.
             
             You'll get a text confirmation. See you then!"
        
        [End call → Log session with status: reschedule_confirmed]
    
    IF RESCHEDULE_FAILED:
        AI: "I apologize, but that time is no longer available.
             Let me suggest another: Tuesday the 21st at 10:00 AM?"
        
        [Retry with alternative slot]
```

---

### 4. Service Info Flow

**Triggered by:** Intent = "service_info_request"

```
[State: INFO_PROVIDED]

AI: "What would you like to know?
     I can tell you about our services, pricing, availability, or hours."

Customer: "How much does full lawn maintenance cost?"

[Query: services.find({ name: "Full Lawn Maintenance" })]

AI: "Full Lawn Maintenance costs $85 and takes about an hour.
     It includes mowing, edging, and blowing.
     
     Would you like to book one?"

Customer: "Yes" / "No, just checking" / etc.

IF YES:
    [Route to Booking Flow]

IF NO:
    AI: "No problem! Feel free to call back anytime or visit our website.
         Thanks for calling!"
    
    [End call → Log session with status: info_provided]
```

---

### 5. Cancellation Flow

**Triggered by:** Intent = "cancel_appointment"

```
[State: CANCELLATION_IN_PROGRESS]

AI: "I can help you cancel an appointment.
     Can I have your phone number?"

Customer: "+1-205-555-5678"

[Query: appointments.find({ client_id matched to phone, status: "scheduled" })]

IF NO APPOINTMENTS:
    AI: "I don't see any appointments to cancel. 
         Did you already cancel it, or is it under a different number?"

IF FOUND:
    AI: "I see your appointment for Tuesday, January 21st at 9:00 AM.
         Are you sure you want to cancel this?"
    
    Customer: "Yes" / "Actually, I want to reschedule instead"
    
    IF RESCHEDULE:
        [Route to Reschedule Flow]
    
    IF CANCEL:
        AI: "May I ask why you're canceling?"
        Customer: "I'm no longer interested" / "Too expensive" / etc.
        
        [Log cancellation reason]
        
        AI: "I understand. Your appointment has been canceled.
             If you change your mind, feel free to rebook anytime.
             
             Thanks for considering Southern Lawn Care!"
        
        [Query: POST /appointments/{apt_id}/cancel { reason: "customer_requested" }]
        
        [End call → Log session with status: cancellation_confirmed]
```

---

## Intent Detection

### Intent Classifier Prompts

Use ElevenLabs conversational AI with specific system prompts:

```
System Prompt for ElevenLabs:

"You are a helpful AI receptionist for Southern Lawn Care, 
a lawn maintenance company. Your job is to assist customers 
with booking, rescheduling, and questions about services.

Detect the customer's intent from their message:
- BOOK: "I want to schedule", "Can I book", "I need mowing"
- RESCHEDULE: "Can I move my appointment", "I need to reschedule"
- CANCEL: "Cancel my appointment", "I don't want it anymore"
- INFO: "How much does this cost", "What services do you offer"
- HUMAN: "Can I talk to someone", "Speak to a manager"

Always be polite, professional, and helpful. 
If the customer asks something outside your scope, 
offer to transfer them to a human agent.

Current time: {CURRENT_DATETIME}
Business hours: {BUSINESS_HOURS}
Available services: {SERVICE_LIST}
"
```

### Intent Confidence Thresholds

| Intent | Confidence Required | Action |
|--------|-------------------|--------|
| BOOK | > 0.85 | Proceed with booking flow |
| RESCHEDULE | > 0.80 | Proceed with reschedule flow |
| CANCEL | > 0.90 | Require confirmation ("Are you sure?") |
| INFO | > 0.70 | Answer question |
| HUMAN | > 0.60 | Escalate immediately |

**Below threshold:** Ask clarifying question

```
AI: "I'm not entirely sure what you meant. 
     Are you looking to book an appointment, reschedule an existing one, 
     or do you have a question about our services?"
```

---

## Error Handling & Escalation

### Speech Recognition Errors

**When transcription confidence < 60%:**

```
AI: "I'm sorry, I didn't quite catch that. 
     Can you repeat that for me?"

[Retry transcription]

[If fails 3x in a row → Escalate]
```

### Escalation Triggers

**Automatically transfer to human agent when:**

1. Customer explicitly requests ("Talk to a manager")
2. Intent confidence < 50% after 3 retries
3. Booking fails (no available slots, system error)
4. Customer expresses frustration ("This is ridiculous", etc.)
5. Payment-related request (Phase 2)
6. Complex multi-service request

```
AI: "I understand. Let me connect you with someone who can help.
     One moment please...
     
     [Transfer to queue or voicemail if no agents]
     
     Thanks for your patience!"
```

### System Error Handling

| Error | Scenario | Response |
|-------|----------|----------|
| API Timeout | Appointments endpoint down | "I'm having trouble accessing the schedule. Can I take your number and have someone call you back?" |
| Weather API Down | OpenWeatherMap unreachable | Skip weather check, proceed with booking |
| Invalid Phone | Customer gives fake number | "Can you double-check that number? I couldn't find it in our system" |
| Double Booking | Time already booked | "That time is fully booked. How about 10:00 AM instead?" |
| No Availability | No slots in 48 hours | "We're fully booked for the next two days. Can I put you on a waitlist?" (Phase 2) |

---

## Tuning & Performance

### Voice Model Selection

**ElevenLabs Recommended:**

- **Breeze:** Warm, friendly, slightly younger tone (recommended)
- **River:** Calm, professional, neutral

**Settings:**
- Stability: 0.7 (clear speech, not robotic)
- Similarity Boost: 0.75 (consistent voice)
- Speaker Boost: Off

### Response Time Targets

- **Speech-to-Text:** < 3 seconds
- **Intent Detection:** < 1 second
- **Database Query (availability):** < 500ms
- **Text-to-Speech:** < 2 seconds
- **Total Loop Time:** < 7 seconds

**If exceeds 7s, inform customer:** "Just checking our availability, one moment..."

### Call Recording & Compliance

- **Recording:** Store call recordings for 30 days (audit trail)
- **Transcription:** Log full transcript in voice_sessions
- **Compliance:** Disclose recording upfront: "This call may be recorded"

### Analytics

Track in voice_sessions collection:

```javascript
{
  voice_session_id: "vcs_xyz789",
  business_id: "bus_abc123",
  duration_seconds: 510,
  outcome: "appointment_booked", // or reschedule_confirmed, escalated, etc.
  intents_detected: ["book_appointment"],
  transcript: "...",
  ai_performance_rating: 0.89,
  customer_satisfaction: null // TODO: Phase 2 - post-call survey
}
```

---

## Phase 2 Enhancements

- [ ] Customer satisfaction survey (post-call)
- [ ] Outbound reminder calls ("Your appointment is tomorrow at 9am")
- [ ] Payment collection via voice
- [ ] Multi-language support (Spanish, etc.)
- [ ] Callback system (customer texts, AI calls back with info)
- [ ] Advanced NLU for complex requests

---

## TODO

- [ ] Select final ElevenLabs voice model with team
- [ ] Define Twilio queue settings (hold music, estimated wait)
- [ ] Test speech recognition accuracy with regional accents
- [ ] Set up analytics dashboard for voice metrics
- [ ] Define escalation phone number / SMS
- [ ] Create compliance disclosure text
- [ ] Test edge cases (partial phone numbers, alternate spellings of names)
- [ ] Localize scripts for future verticals (construction, HVAC, etc.)
