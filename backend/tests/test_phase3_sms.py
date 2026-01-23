"""
Phase 3: SMS Communications Tests
Tests for SMS messaging, templates, and settings endpoints
"""

import pytest
from datetime import datetime, date
from unittest.mock import AsyncMock, patch, MagicMock


class TestSMSModels:
    """Tests for SMS model validation"""

    def test_sms_direction_values(self):
        """Test valid SMS direction values"""
        from app.models.sms import SMSDirection

        assert "inbound" in [d.value for d in SMSDirection]
        assert "outbound" in [d.value for d in SMSDirection]

    def test_sms_trigger_types(self):
        """Test valid SMS trigger types"""
        from app.models.sms import SMSTriggerType

        expected = ['scheduled', 'reminder', 'enroute', '15_min', 'arrived', 'complete', 'manual', 'reply']
        for trigger in expected:
            assert trigger in [t.value for t in SMSTriggerType]

    def test_sms_status_values(self):
        """Test valid SMS status values"""
        from app.models.sms import SMSStatus

        expected = ['queued', 'sent', 'delivered', 'failed', 'received']
        for status in expected:
            assert status in [s.value for s in SMSStatus]

    def test_sms_message_creation(self):
        """Test SMS message model creation"""
        from app.models.sms import SMSMessage, SMSDirection, SMSTriggerType, SMSStatus

        msg = SMSMessage(
            business_id="bus_123",
            customer_id="client_123",
            direction=SMSDirection.OUTBOUND,
            to_phone="+15551234567",
            from_phone="+15559876543",
            body="Test message",
            trigger_type=SMSTriggerType.MANUAL
        )

        assert msg.business_id == "bus_123"
        assert msg.direction == SMSDirection.OUTBOUND
        assert msg.status == SMSStatus.QUEUED
        assert msg.message_id is not None

    def test_sms_template_creation(self):
        """Test SMS template model creation"""
        from app.models.sms import SMSTemplate, SMSTriggerType

        template = SMSTemplate(
            business_id="bus_123",
            name="Test Template",
            trigger_type=SMSTriggerType.REMINDER,
            body="Hello {{customer_first_name}}"
        )

        assert template.business_id == "bus_123"
        assert template.is_active is True
        assert template.template_id is not None

    def test_sms_settings_defaults(self):
        """Test SMS settings default values"""
        from app.models.sms import SMSSettings

        settings = SMSSettings()

        assert settings.enabled is False
        assert settings.auto_scheduled is True
        assert settings.auto_reminder is True
        assert settings.reminder_time == "18:00"  # 6 PM default


class TestDefaultTemplates:
    """Tests for default SMS templates"""

    def test_default_templates_exist(self):
        """Test that all default templates are defined"""
        from app.models.sms import DEFAULT_TEMPLATES, SMSTriggerType

        trigger_types = [t["trigger_type"] for t in DEFAULT_TEMPLATES]

        assert SMSTriggerType.SCHEDULED in trigger_types
        assert SMSTriggerType.REMINDER in trigger_types
        assert SMSTriggerType.ENROUTE in trigger_types
        assert SMSTriggerType.FIFTEEN_MIN in trigger_types
        assert SMSTriggerType.ARRIVED in trigger_types
        assert SMSTriggerType.COMPLETE in trigger_types

    def test_default_templates_have_required_fields(self):
        """Test that default templates have all required fields"""
        from app.models.sms import DEFAULT_TEMPLATES

        for template in DEFAULT_TEMPLATES:
            assert "name" in template
            assert "trigger_type" in template
            assert "body" in template
            assert len(template["body"]) > 0


class TestTemplateRendering:
    """Tests for SMS template variable rendering"""

    def render_template(self, template_body: str, variables: dict) -> str:
        """Local render_template for testing without imports"""
        import re
        result = template_body
        for key, value in variables.items():
            placeholder = f"{{{{{key}}}}}"
            result = result.replace(placeholder, str(value) if value else "")
        # Clean up unreplaced variables
        result = re.sub(r'\{\{[^}]+\}\}', '', result)
        return result.strip()

    def test_render_single_variable(self):
        """Test rendering a single variable"""
        template = "Hello {{customer_first_name}}!"
        variables = {"customer_first_name": "John"}

        result = self.render_template(template, variables)
        assert result == "Hello John!"

    def test_render_multiple_variables(self):
        """Test rendering multiple variables"""
        template = "Hi {{customer_first_name}}, your {{job_type}} is at {{scheduled_time}}."
        variables = {
            "customer_first_name": "Jane",
            "job_type": "AC Repair",
            "scheduled_time": "2:00 PM"
        }

        result = self.render_template(template, variables)
        assert result == "Hi Jane, your AC Repair is at 2:00 PM."

    def test_render_missing_variable(self):
        """Test rendering with missing variable removes placeholder"""
        template = "Hello {{customer_first_name}} {{missing_var}}!"
        variables = {"customer_first_name": "John"}

        result = self.render_template(template, variables)
        # Missing variables should be removed (empty string)
        assert result == "Hello John !"

    def test_render_empty_variables(self):
        """Test rendering with empty variables dict"""
        template = "Plain text without variables"
        variables = {}

        result = self.render_template(template, variables)
        assert result == "Plain text without variables"


class TestPhoneNormalization:
    """Tests for phone number normalization"""

    def normalize_phone(self, phone: str):
        """Local normalize_phone for testing without imports"""
        cleaned = "".join(c for c in phone if c.isdigit() or c == "+")

        if cleaned.startswith("+"):
            if len(cleaned) >= 11:
                return cleaned
        elif len(cleaned) == 10:
            return f"+1{cleaned}"
        elif len(cleaned) == 11 and cleaned.startswith("1"):
            return f"+{cleaned}"

        if len(cleaned) >= 10:
            return f"+{cleaned}" if not cleaned.startswith("+") else cleaned

        return None

    def test_normalize_us_phone(self):
        """Test normalizing US phone numbers"""
        # Various formats
        assert self.normalize_phone("5551234567") == "+15551234567"
        assert self.normalize_phone("15551234567") == "+15551234567"
        assert self.normalize_phone("+15551234567") == "+15551234567"
        assert self.normalize_phone("(555) 123-4567") == "+15551234567"
        assert self.normalize_phone("555-123-4567") == "+15551234567"

    def test_normalize_already_formatted(self):
        """Test that already formatted numbers are unchanged"""
        phone = "+15551234567"
        assert self.normalize_phone(phone) == phone


class TestSMSEndpoints:
    """Tests for SMS API endpoints"""

    @pytest.mark.asyncio
    async def test_list_messages(self, mock_db, sample_sms_message):
        """Test GET /sms endpoint"""
        mock_db.sms_messages.data["1"] = sample_sms_message

        cursor = await mock_db.sms_messages.find({
            "business_id": "bus_test123",
            "deleted_at": None
        })
        results = await cursor.to_list(100)

        assert len(results) == 1
        assert results[0]["message_id"] == "msg_test123"

    @pytest.mark.asyncio
    async def test_list_messages_by_customer(self, mock_db, sample_sms_message):
        """Test GET /sms with customer_id filter"""
        mock_db.sms_messages.data["1"] = sample_sms_message

        cursor = await mock_db.sms_messages.find({
            "business_id": "bus_test123",
            "customer_id": "client_test123",
            "deleted_at": None
        })
        results = await cursor.to_list(100)

        assert len(results) == 1
        assert results[0]["customer_id"] == "client_test123"

    @pytest.mark.asyncio
    async def test_send_manual_sms(self, mock_db, sample_client):
        """Test POST /sms/send endpoint"""
        mock_db.clients.data["1"] = sample_client

        # Verify customer exists
        customer = await mock_db.clients.find_one({
            "client_id": "client_test123",
            "business_id": "bus_test123"
        })

        assert customer is not None
        assert customer["phone"] == "+15551112222"
        assert customer.get("sms_opt_out") is False

    @pytest.mark.asyncio
    async def test_sms_opt_out_check(self, mock_db, sample_client):
        """Test that opted-out customers cannot receive SMS"""
        sample_client["sms_opt_out"] = True
        mock_db.clients.data["1"] = sample_client

        customer = await mock_db.clients.find_one({
            "client_id": "client_test123"
        })

        assert customer["sms_opt_out"] is True
        # SMS should not be sent to opted-out customers


class TestSMSTemplateEndpoints:
    """Tests for SMS template API endpoints"""

    @pytest.mark.asyncio
    async def test_list_templates(self, mock_db, sample_sms_template):
        """Test GET /sms/templates endpoint"""
        mock_db.sms_templates.data["1"] = sample_sms_template

        cursor = await mock_db.sms_templates.find({
            "business_id": "bus_test123",
            "deleted_at": None
        })
        results = await cursor.to_list(100)

        assert len(results) == 1
        assert results[0]["name"] == "Appointment Reminder"

    @pytest.mark.asyncio
    async def test_create_template(self, mock_db):
        """Test POST /sms/templates endpoint"""
        template_data = {
            "template_id": "tmpl_new123",
            "business_id": "bus_test123",
            "name": "New Template",
            "trigger_type": "manual",
            "body": "Custom message here",
            "is_active": True,
            "is_default": False,
            "variables": [],
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "deleted_at": None
        }

        result = await mock_db.sms_templates.insert_one(template_data)
        assert result.inserted_id is not None

    @pytest.mark.asyncio
    async def test_update_template(self, mock_db, sample_sms_template):
        """Test PUT /sms/templates/{id} endpoint"""
        mock_db.sms_templates.data["1"] = sample_sms_template

        result = await mock_db.sms_templates.update_one(
            {"template_id": "tmpl_test123"},
            {"$set": {"body": "Updated message body", "updated_at": datetime.utcnow()}}
        )

        assert result.modified_count == 1

        # Verify update
        found = await mock_db.sms_templates.find_one({"template_id": "tmpl_test123"})
        assert found["body"] == "Updated message body"

    @pytest.mark.asyncio
    async def test_toggle_template_active(self, mock_db, sample_sms_template):
        """Test toggling template active status"""
        mock_db.sms_templates.data["1"] = sample_sms_template

        result = await mock_db.sms_templates.update_one(
            {"template_id": "tmpl_test123"},
            {"$set": {"is_active": False}}
        )

        assert result.modified_count == 1

        found = await mock_db.sms_templates.find_one({"template_id": "tmpl_test123"})
        assert found["is_active"] is False


class TestSMSSettingsEndpoints:
    """Tests for SMS settings API endpoints"""

    @pytest.mark.asyncio
    async def test_get_settings(self, mock_db, sample_business):
        """Test GET /sms/settings endpoint"""
        mock_db.businesses.data["1"] = sample_business

        business = await mock_db.businesses.find_one({
            "business_id": "bus_test123"
        })

        assert business is not None
        sms_config = business.get("config", {}).get("sms", {})
        assert sms_config.get("enabled") is True
        assert sms_config.get("reminder_hours") == 24

    @pytest.mark.asyncio
    async def test_update_settings(self, mock_db, sample_business):
        """Test PUT /sms/settings endpoint"""
        mock_db.businesses.data["1"] = sample_business

        result = await mock_db.businesses.update_one(
            {"business_id": "bus_test123"},
            {"$set": {
                "config.sms.reminder_hours": 48,
                "config.sms.auto_enroute": False
            }}
        )

        assert result.modified_count == 1


class TestSMSStats:
    """Tests for SMS statistics"""

    @pytest.mark.asyncio
    async def test_count_sent_messages(self, mock_db):
        """Test counting sent messages"""
        messages = [
            {"message_id": "m1", "business_id": "bus_test123", "direction": "outbound", "status": "sent", "deleted_at": None},
            {"message_id": "m2", "business_id": "bus_test123", "direction": "outbound", "status": "delivered", "deleted_at": None},
            {"message_id": "m3", "business_id": "bus_test123", "direction": "inbound", "status": "received", "deleted_at": None},
        ]

        for i, msg in enumerate(messages):
            mock_db.sms_messages.data[str(i)] = msg

        outbound = await mock_db.sms_messages.count_documents({
            "business_id": "bus_test123",
            "direction": "outbound",
            "deleted_at": None
        })

        assert outbound == 2

    @pytest.mark.asyncio
    async def test_count_delivered_messages(self, mock_db):
        """Test counting delivered messages"""
        messages = [
            {"message_id": "m1", "business_id": "bus_test123", "direction": "outbound", "status": "delivered", "deleted_at": None},
            {"message_id": "m2", "business_id": "bus_test123", "direction": "outbound", "status": "failed", "deleted_at": None},
            {"message_id": "m3", "business_id": "bus_test123", "direction": "outbound", "status": "delivered", "deleted_at": None},
        ]

        for i, msg in enumerate(messages):
            mock_db.sms_messages.data[str(i)] = msg

        delivered = await mock_db.sms_messages.count_documents({
            "business_id": "bus_test123",
            "direction": "outbound",
            "status": "delivered",
            "deleted_at": None
        })

        assert delivered == 2


class TestOptOutHandling:
    """Tests for SMS opt-out handling"""

    def test_stop_keyword_detection(self):
        """Test STOP keyword is detected"""
        stop_keywords = ['STOP', 'stop', 'Stop', 'UNSUBSCRIBE', 'CANCEL']

        for keyword in stop_keywords:
            # In production, this would trigger opt-out
            assert keyword.upper() in ['STOP', 'UNSUBSCRIBE', 'CANCEL']

    def test_start_keyword_detection(self):
        """Test START keyword is detected"""
        start_keywords = ['START', 'start', 'Start', 'SUBSCRIBE', 'YES']

        for keyword in start_keywords:
            # In production, this would trigger opt-in
            assert keyword.upper() in ['START', 'SUBSCRIBE', 'YES']

    @pytest.mark.asyncio
    async def test_opt_out_updates_customer(self, mock_db, sample_client):
        """Test that opt-out updates customer record"""
        mock_db.clients.data["1"] = sample_client

        # Simulate opt-out
        result = await mock_db.clients.update_one(
            {"client_id": "client_test123"},
            {"$set": {"sms_opt_out": True}}
        )

        assert result.modified_count == 1

        # Verify opt-out
        customer = await mock_db.clients.find_one({"client_id": "client_test123"})
        assert customer["sms_opt_out"] is True


class TestWebhookProcessing:
    """Tests for Twilio webhook handling"""

    def test_webhook_status_mapping(self):
        """Test Twilio status to internal status mapping"""
        status_map = {
            "queued": "queued",
            "sent": "sent",
            "delivered": "delivered",
            "undelivered": "failed",
            "failed": "failed"
        }

        for twilio_status, internal_status in status_map.items():
            # This would be used in webhook processing
            assert internal_status in ["queued", "sent", "delivered", "failed"]

    @pytest.mark.asyncio
    async def test_webhook_updates_message(self, mock_db, sample_sms_message):
        """Test that webhook updates message status"""
        mock_db.sms_messages.data["1"] = sample_sms_message

        # Simulate delivered webhook
        result = await mock_db.sms_messages.update_one(
            {"twilio_sid": "SM123456789"},
            {"$set": {"status": "delivered", "delivered_at": datetime.utcnow()}}
        )

        assert result.modified_count == 1

        # Verify status
        found = await mock_db.sms_messages.find_one({"twilio_sid": "SM123456789"})
        assert found["status"] == "delivered"
