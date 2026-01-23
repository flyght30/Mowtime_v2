"""
WebSocket Connection Manager
Handles real-time connections for dispatch updates
"""

import json
import logging
from typing import Dict, Set, Optional, Any
from datetime import datetime
from fastapi import WebSocket
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class WSMessage(BaseModel):
    """WebSocket message format"""
    type: str  # tech_location, tech_status, job_assigned, job_status
    data: dict
    timestamp: datetime = None

    def __init__(self, **data):
        if 'timestamp' not in data or data['timestamp'] is None:
            data['timestamp'] = datetime.utcnow()
        super().__init__(**data)


class ConnectionManager:
    """
    Manages WebSocket connections for real-time dispatch updates.

    Supports:
    - Per-business connections (dispatch board viewers)
    - Per-technician connections (mobile app)
    - Broadcast to all connections in a business
    - Targeted messages to specific technicians
    """

    def __init__(self):
        # business_id -> set of WebSocket connections
        self.business_connections: Dict[str, Set[WebSocket]] = {}
        # tech_id -> WebSocket connection
        self.tech_connections: Dict[str, WebSocket] = {}
        # WebSocket -> (business_id, tech_id or None)
        self.connection_info: Dict[WebSocket, tuple] = {}

    async def connect_business(self, websocket: WebSocket, business_id: str) -> None:
        """Connect a dispatch board viewer"""
        await websocket.accept()

        if business_id not in self.business_connections:
            self.business_connections[business_id] = set()

        self.business_connections[business_id].add(websocket)
        self.connection_info[websocket] = (business_id, None)

        logger.info(f"Business {business_id} connected. Total: {len(self.business_connections[business_id])}")

    async def connect_tech(self, websocket: WebSocket, business_id: str, tech_id: str) -> None:
        """Connect a technician's mobile app"""
        await websocket.accept()

        # Also add to business connections for broadcasts
        if business_id not in self.business_connections:
            self.business_connections[business_id] = set()
        self.business_connections[business_id].add(websocket)

        # Track tech-specific connection
        self.tech_connections[tech_id] = websocket
        self.connection_info[websocket] = (business_id, tech_id)

        logger.info(f"Tech {tech_id} connected to business {business_id}")

    def disconnect(self, websocket: WebSocket) -> None:
        """Disconnect a WebSocket"""
        if websocket not in self.connection_info:
            return

        business_id, tech_id = self.connection_info[websocket]

        # Remove from business connections
        if business_id in self.business_connections:
            self.business_connections[business_id].discard(websocket)
            if not self.business_connections[business_id]:
                del self.business_connections[business_id]

        # Remove tech connection
        if tech_id and tech_id in self.tech_connections:
            del self.tech_connections[tech_id]

        del self.connection_info[websocket]
        logger.info(f"Disconnected: business={business_id}, tech={tech_id}")

    async def broadcast_to_business(self, business_id: str, message: WSMessage) -> None:
        """Send message to all connections in a business"""
        if business_id not in self.business_connections:
            return

        disconnected = set()
        message_json = message.model_dump_json()

        for websocket in self.business_connections[business_id]:
            try:
                await websocket.send_text(message_json)
            except Exception as e:
                logger.warning(f"Failed to send to websocket: {e}")
                disconnected.add(websocket)

        # Clean up disconnected
        for ws in disconnected:
            self.disconnect(ws)

    async def send_to_tech(self, tech_id: str, message: WSMessage) -> bool:
        """Send message to a specific technician"""
        if tech_id not in self.tech_connections:
            return False

        try:
            await self.tech_connections[tech_id].send_text(message.model_dump_json())
            return True
        except Exception as e:
            logger.warning(f"Failed to send to tech {tech_id}: {e}")
            self.disconnect(self.tech_connections[tech_id])
            return False

    async def broadcast_tech_location(
        self,
        business_id: str,
        tech_id: str,
        latitude: float,
        longitude: float,
        status: str
    ) -> None:
        """Broadcast technician location update"""
        message = WSMessage(
            type="tech_location",
            data={
                "tech_id": tech_id,
                "latitude": latitude,
                "longitude": longitude,
                "status": status
            }
        )
        await self.broadcast_to_business(business_id, message)

    async def broadcast_tech_status(
        self,
        business_id: str,
        tech_id: str,
        status: str,
        job_id: Optional[str] = None
    ) -> None:
        """Broadcast technician status change"""
        message = WSMessage(
            type="tech_status",
            data={
                "tech_id": tech_id,
                "status": status,
                "job_id": job_id
            }
        )
        await self.broadcast_to_business(business_id, message)

    async def broadcast_job_assigned(
        self,
        business_id: str,
        job_id: str,
        tech_id: str,
        scheduled_date: str,
        start_time: str,
        end_time: str
    ) -> None:
        """Broadcast job assignment"""
        message = WSMessage(
            type="job_assigned",
            data={
                "job_id": job_id,
                "tech_id": tech_id,
                "scheduled_date": scheduled_date,
                "start_time": start_time,
                "end_time": end_time
            }
        )
        await self.broadcast_to_business(business_id, message)

        # Also notify the assigned tech
        await self.send_to_tech(tech_id, message)

    async def broadcast_job_status(
        self,
        business_id: str,
        job_id: str,
        status: str,
        tech_id: Optional[str] = None
    ) -> None:
        """Broadcast job status change"""
        message = WSMessage(
            type="job_status",
            data={
                "job_id": job_id,
                "status": status,
                "tech_id": tech_id
            }
        )
        await self.broadcast_to_business(business_id, message)

    def get_business_connection_count(self, business_id: str) -> int:
        """Get number of connections for a business"""
        return len(self.business_connections.get(business_id, set()))

    def get_connected_techs(self, business_id: str) -> list:
        """Get list of connected tech IDs for a business"""
        connected = []
        for tech_id, ws in self.tech_connections.items():
            if ws in self.connection_info:
                bid, _ = self.connection_info[ws]
                if bid == business_id:
                    connected.append(tech_id)
        return connected


# Global instance
manager = ConnectionManager()


def get_websocket_manager() -> ConnectionManager:
    """Get the global WebSocket manager instance"""
    return manager
