"""
MongoDB Database Connection Management
Uses Motor for async MongoDB operations
"""

from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo.errors import ConnectionFailure
import logging

from app.config import get_settings

logger = logging.getLogger(__name__)


class Database:
    """MongoDB database connection manager"""

    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None

    @classmethod
    async def connect(cls) -> None:
        """Establish connection to MongoDB"""
        settings = get_settings()
        try:
            cls.client = AsyncIOMotorClient(
                settings.MONGO_URL,
                maxPoolSize=50,
                minPoolSize=10,
                serverSelectionTimeoutMS=5000
            )
            # Verify connection
            await cls.client.admin.command("ping")
            cls.db = cls.client[settings.DB_NAME]
            logger.info(f"Connected to MongoDB: {settings.DB_NAME}")

            # Create indexes on startup
            await cls._create_indexes()

        except ConnectionFailure as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            raise

    @classmethod
    async def disconnect(cls) -> None:
        """Close MongoDB connection"""
        if cls.client:
            cls.client.close()
            logger.info("Disconnected from MongoDB")

    @classmethod
    async def _create_indexes(cls) -> None:
        """Create database indexes for optimal query performance"""
        if cls.db is None:
            return

        # Users collection indexes
        await cls.db.users.create_index("email", unique=True)
        await cls.db.users.create_index("user_id", unique=True)
        await cls.db.users.create_index("business_id")

        # Businesses collection indexes
        await cls.db.businesses.create_index("business_id", unique=True)
        await cls.db.businesses.create_index("owner_id")

        # Clients collection indexes
        await cls.db.clients.create_index("client_id", unique=True)
        await cls.db.clients.create_index("business_id")
        await cls.db.clients.create_index("email")
        await cls.db.clients.create_index([("business_id", 1), ("deleted_at", 1)])

        # Appointments collection indexes
        await cls.db.appointments.create_index("appointment_id", unique=True)
        await cls.db.appointments.create_index("business_id")
        await cls.db.appointments.create_index("client_id")
        await cls.db.appointments.create_index("staff_ids")
        await cls.db.appointments.create_index("scheduled_date")
        await cls.db.appointments.create_index([
            ("business_id", 1),
            ("scheduled_date", 1),
            ("status", 1)
        ])

        # Services collection indexes
        await cls.db.services.create_index("service_id", unique=True)
        await cls.db.services.create_index("business_id")
        await cls.db.services.create_index([("business_id", 1), ("is_active", 1)])

        # Staff collection indexes
        await cls.db.staff.create_index("staff_id", unique=True)
        await cls.db.staff.create_index("user_id")
        await cls.db.staff.create_index("business_id")
        await cls.db.staff.create_index([("business_id", 1), ("is_active", 1)])

        # Equipment collection indexes
        await cls.db.equipment.create_index("equipment_id", unique=True)
        await cls.db.equipment.create_index("business_id")
        await cls.db.equipment.create_index([("business_id", 1), ("status", 1)])

        # Availability collection indexes
        await cls.db.availability.create_index("availability_id", unique=True)
        await cls.db.availability.create_index("staff_id")
        await cls.db.availability.create_index([("staff_id", 1), ("date", 1)])

        # Notifications collection indexes
        await cls.db.notifications.create_index("notification_id", unique=True)
        await cls.db.notifications.create_index("business_id")
        await cls.db.notifications.create_index([("status", 1), ("scheduled_at", 1)])

        # Weather cache collection indexes
        await cls.db.weather_cache.create_index("cache_key", unique=True)
        await cls.db.weather_cache.create_index("expires_at", expireAfterSeconds=0)

        # Audit log collection indexes
        await cls.db.audit_log.create_index("entity_type")
        await cls.db.audit_log.create_index("entity_id")
        await cls.db.audit_log.create_index("user_id")
        await cls.db.audit_log.create_index("created_at")

        logger.info("Database indexes created successfully")

    @classmethod
    def get_db(cls) -> AsyncIOMotorDatabase:
        """Get database instance"""
        if cls.db is None:
            raise RuntimeError("Database not connected. Call Database.connect() first.")
        return cls.db


def get_database() -> AsyncIOMotorDatabase:
    """Dependency injection for database access"""
    return Database.get_db()
