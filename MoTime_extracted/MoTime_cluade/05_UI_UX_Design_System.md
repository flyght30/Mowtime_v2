# ServicePro Platform - UI/UX Design System

**Platform:** React Native (iOS + Android)  
**Design Philosophy:** Modern, minimal, field-ops focused  
**Status:** Phase 1 Design  

---

## Color Palette

### Primary Colors

```
Primary Blue: #2563EB
  Usage: CTA buttons, active states, links
  RGB: 37, 99, 235

Secondary Blue: #1E40AF
  Usage: Hover states, active navigation
  RGB: 30, 64, 175

Accent: #10B981
  Usage: Success messages, completed jobs
  RGB: 16, 185, 129

Warning: #F59E0B
  Usage: Weather alerts, caution states
  RGB: 245, 158, 11

Error: #EF4444
  Usage: Errors, cancellations, alerts
  RGB: 239, 68, 68
```

### Neutral Colors

```
Dark: #1F2937
  Usage: Text, backgrounds
  RGB: 31, 41, 55

Light: #F3F4F6
  Usage: Card backgrounds, dividers
  RGB: 243, 244, 246

Muted: #9CA3AF
  Usage: Disabled text, secondary text
  RGB: 156, 163, 175

White: #FFFFFF
  Usage: Primary backgrounds
  RGB: 255, 255, 255
```

### Dark Mode

```
Background: #111827
Text: #F9FAFB
Cards: #1F2937
Borders: #374151
```

---

## Typography

### Font Family

**Primary:** -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif  
**Monospace:** Menlo, Monaco, Courier New

### Text Sizes & Weights

```
Display (H1): 32px, Bold
  Usage: Page titles, major headings

Heading (H2): 24px, Bold
  Usage: Section headers

Subheading (H3): 18px, Semibold
  Usage: Card titles, prominent labels

Body Large: 16px, Regular
  Usage: Main content, descriptions

Body: 14px, Regular
  Usage: Standard text, labels

Small: 12px, Regular
  Usage: Captions, timestamps, help text

Tiny: 11px, Regular
  Usage: Form hints, micro-text
```

### Line Height

- Display: 1.2
- Heading: 1.25
- Body: 1.5
- Small: 1.4

---

## Spacing System

**8px Grid (Standard)**

```
xs: 4px (half-grid)
sm: 8px
md: 16px
lg: 24px
xl: 32px
xxl: 48px
```

### Common Spacing Patterns

```
Section padding: 24px
Card padding: 16px
Button padding: 12px 16px
Form gap: 16px between fields
List item padding: 12px 16px
```

---

## Components

### Buttons

#### Primary Button

```
State: Default
  Background: #2563EB
  Text: White
  Padding: 12px 20px
  Border Radius: 8px
  Font: 16px Semibold

State: Pressed
  Background: #1E40AF
  Opacity: 0.9

State: Disabled
  Background: #D1D5DB
  Text: #9CA3AF
  Opacity: 0.5
```

**Usage:** Primary action (Book, Save, Confirm)

#### Secondary Button

```
State: Default
  Background: #F3F4F6
  Text: #1F2937
  Border: 1px #E5E7EB
  Padding: 12px 20px
  Border Radius: 8px

State: Pressed
  Background: #E5E7EB
```

**Usage:** Secondary action (Cancel, Back, More Options)

#### Danger Button

```
State: Default
  Background: #EF4444
  Text: White
  Padding: 12px 20px
  Border Radius: 8px

State: Pressed
  Background: #DC2626
```

**Usage:** Destructive action (Delete, Cancel Appointment)

### Cards

```
Background: White (#FFFFFF) or Light (#F3F4F6)
Border: 1px #E5E7EB
Border Radius: 12px
Padding: 16px
Box Shadow: 0 1px 3px rgba(0, 0, 0, 0.1)
```

**Usage:** Containers for content (appointments, clients, etc.)

### Form Inputs

```
Background: White
Border: 1px #D1D5DB
Border Radius: 8px
Padding: 12px 16px
Font: 14px
Text Color: #1F2937

State: Focused
  Border: 2px #2563EB
  Box Shadow: 0 0 0 3px rgba(37, 99, 235, 0.1)

State: Error
  Border: 2px #EF4444
  Background: #FEE2E2
```

### Chips / Tags

```
Background: #E0E7FF
Text: #2563EB
Padding: 6px 12px
Border Radius: 999px (full)
Font: 12px Semibold
```

**Usage:** Service types, staff names, status labels

### Icons

```
Size: 24px (standard)
  16px (small)
  32px (large)
Weight: 2px stroke
Color: Inherit from text color
```

**Icon Library:** React Native Vector Icons or custom SVGs

---

## Layout System

### Mobile Navigation

#### Bottom Tab Navigation (Primary)

```
Fixed at bottom
Height: 64px (+ safe area)
Tabs: Dashboard, Calendar, Customers, Staff, Settings
Icons: 24px, Labels: 12px
Divider: Light gray line above

Active Tab:
  Icon Color: #2563EB
  Label Color: #2563EB
  
Inactive Tab:
  Icon Color: #9CA3AF
  Label Color: #9CA3AF
```

#### Top Header

```
Height: 56px (+ safe area)
Background: White
Border Bottom: 1px #E5E7EB
Title: Left-aligned, 18px Semibold
Actions: Right-aligned (search, menu, etc.)
```

### Screen Layouts

#### Full-Width Card Layout (Appointments, Clients)

```
[Header: Title + Action Button]
[List of Cards]
  Each Card:
    - Title
    - Subtitle (date, time, status)
    - Right-aligned status badge
    - Tap to detail
[Empty State if no items]
```

#### Detail Screen Layout

```
[Header with back button]
[Hero section (large image or key info)]
[Sections: Details, Notes, Actions]
[Button bar at bottom: Edit, Delete, etc.]
```

#### Form Layout

```
[Header: Title]
[Form Fields in column]
  - Label (14px)
  - Input (full width)
  - Helper text (12px muted)
  - Spacing: 16px between fields
[Submit button: full width, 48px height]
[Secondary action (Cancel): optional]
```

---

## States & Feedback

### Loading States

```
Skeleton Screen:
  - Placeholder cards with subtle animation
  - Same layout as real content

Progress Indicator:
  - Spinner (iOS style) or progress bar
  - Centered, message below: "Loading appointments..."
  
Duration: Keep < 2 seconds perceived
```

### Empty States

```
Icon: Large (48px) + muted color
Title: "No appointments yet"
Message: "Tap the + button to create your first appointment"
CTA Button: Create / Learn More
```

### Error States

```
Icon: Error circle (red)
Title: "Something went wrong"
Message: Specific error (not generic)
CTA: Retry / Go Back / Contact Support
```

### Success States

```
Toast Notification:
  - Bottom-right position
  - Background: #10B981 (green)
  - Icon + Message (white text)
  - Auto-dismiss after 3 seconds
  
Message: "Appointment booked!", "Rescheduled successfully", etc.
```

### Weather Alert

```
Banner (sticky, dismissible):
  - Background: #FEF3C7 (light yellow)
  - Icon: Weather cloud + warning
  - Text: "Severe weather forecast. We may reschedule your appointment."
  - Button: Dismiss
```

---

## Animations & Transitions

### Navigation Transitions

```
Push: Slide from right (iOS style)
Pop: Slide to right
Tab Switch: Fade (no slide)
Duration: 300ms
Curve: Ease out
```

### Button Feedback

```
On Press:
  - Scale: 0.95 (slight shrink)
  - Opacity: 0.8
  - Duration: 100ms
  - Curve: Ease out
```

### List Animations

```
Item Enter:
  - Fade in + slide up 8px
  - Staggered: 50ms between items
  - Duration: 300ms
```

### Pull-to-Refresh

```
Drag down > 64px to trigger
Spinner appears, rotates
On release: Load new data
Duration: 400ms
```

---

## Accessibility

### Touch Targets

```
Minimum: 44x44 points (iOS/Android standard)
Recommended: 48x48 points
Spacing: 8px minimum between tappable elements
```

### Color Contrast

```
Text on Background: 4.5:1 minimum (WCAG AA)
Icons: 3:1 minimum
Test: Use Contrast Checker tools
```

### Labels & Hints

```
Every input must have visible label
Form validation errors: Clear, descriptive message
Buttons: Descriptive text (not just "OK")
Example: "Book Appointment" not "Submit"
```

### Screen Reader Support

```
Alt text: All images and icons
Semantic HTML: Use proper heading hierarchy
Focus indicators: Clear, visible focus ring
Announcements: Alert users to dynamic content changes
```

---

## Responsive Breakpoints

```
Mobile: 320px - 767px
  - Single column layouts
  - Large touch targets
  - Bottom navigation

Tablet: 768px - 1023px
  - Two column for lists + detail
  - Side navigation becomes visible
  - More whitespace

Desktop: 1024px+
  - Three column layouts
  - Top navigation
  - Larger cards and spacing
```

---

## Dark Mode

### Inverted Colors

```
Light backgrounds → Dark (#111827)
Dark text → Light (#F9FAFB)
Light cards → Dark cards (#1F2937)
Borders → Lighter gray (#374151)

Accent colors (blue, green, red) remain same
```

### Implementation

```
Toggle in Settings:
  - System default (follows device setting)
  - Light / Dark / System

Toggle applies to entire app
Persistence: Save user preference
```

---

## Phase 1 Screens

### MVP Screen List

1. **Auth**
   - Login
   - Register
   - Forgot Password
   - Onboarding (business setup)

2. **Dashboard**
   - Today's jobs
   - Weather alert banner
   - Quick stats (jobs, revenue)
   - Week preview

3. **Calendar**
   - Month view
   - Week view
   - Day detail
   - Tap to create appointment

4. **Customers**
   - List view with search
   - Detail view (history, notes)
   - Add/Edit form

5. **Appointments**
   - List view (filter by status, staff, date)
   - Detail view
   - Create/Edit form
   - Reschedule flow

6. **Staff**
   - List view
   - Detail (schedule, assignments)
   - Availability editor

7. **Equipment**
   - List view
   - Maintenance tracker

8. **Settings**
   - Business profile
   - Weather thresholds
   - AI receptionist on/off
   - Notification preferences

---

## Component Library (Phase 2)

Storybook integration for component testing:

```
Components:
- Button (variants: primary, secondary, danger)
- Input (text, date, time, phone)
- Card
- Badge / Chip
- Modal / Dialog
- BottomSheet
- Toast
- Skeleton
- Avatar
- Switch / Checkbox
- SegmentedControl
```

---

## TODO

- [ ] Finalize colors with brand guidance
- [ ] Import custom icon set or confirm Vector Icons
- [ ] Design detailed wireframes for each MVP screen
- [ ] Create Figma/Sketch component library
- [ ] Test color contrast for accessibility
- [ ] Record animation demos (video)
- [ ] Set up Storybook for Phase 2
- [ ] Confirm tab order for keyboard navigation
- [ ] Test with screen readers (VoiceOver, TalkBack)
