"""
WebSocket Router
Real-time dispatch updates via WebSocket connections
"""

import json
import logging
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.services.websocket_manager import get_websocket_manager, ConnectionManager, WSMessage
from app.models.common import utc_now

router = APIRouter()
logger = logging.getLogger(__name__)


async def verify_token(token: str, db: AsyncIOMotorDatabase) -> Optional[dict]:
    """Verify JWT token and return user info"""
    # Simple token verification - in production use proper JWT validation
    from app.utils.security import decode_access_token
    try:
        payload = decode_access_token(token)
        if payload:
            user = await db.users.find_one({"user_id": payload.get("sub")})
            if user:
                return {
                    "user_id": user["user_id"],
                    "business_id": user.get("business_id"),
                    "role": user.get("role")
                }
    except Exception as e:
        logger.warning(f"Token verification failed: {e}")
    return None


@router.websocket("/dispatch/{business_id}")
async def dispatch_websocket(
    websocket: WebSocket,
    business_id: str,
    token: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    WebSocket endpoint for dispatch board real-time updates.

    Connect with: ws://host/ws/dispatch/{business_id}?token={jwt_token}

    Receives messages:
    - tech_location: Technician GPS updates
    - tech_status: Technician status changes
    - job_assigned: New job assignments
    - job_status: Job status changes

    Message format:
    {
        "type": "tech_location",
        "data": {"tech_id": "...", "latitude": 0.0, "longitude": 0.0, "status": "..."},
        "timestamp": "2025-01-23T12:00:00Z"
    }
    """
    # Verify authentication
    user_info = await verify_token(token, db)
    if not user_info or user_info.get("business_id") != business_id:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    manager = get_websocket_manager()
    await manager.connect_business(websocket, business_id)

    try:
        # Send initial connection confirmation
        await websocket.send_json({
            "type": "connected",
            "data": {
                "business_id": business_id,
                "connected_techs": manager.get_connected_techs(business_id)
            }
        })

        # Keep connection alive and handle incoming messages
        while True:
            data = await websocket.receive_text()
            # Dispatch board typically only receives, but can send pings
            try:
                message = json.loads(data)
                if message.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info(f"Dispatch board disconnected: {business_id}")


@router.websocket("/tech/{tech_id}")
async def tech_websocket(
    websocket: WebSocket,
    tech_id: str,
    token: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    WebSocket endpoint for technician mobile app.

    Connect with: ws://host/ws/tech/{tech_id}?token={jwt_token}

    Can send:
    - location: GPS location update
    - status: Status change

    Receives:
    - job_assigned: New job assignment
    - job_status: Job status changes
    - ping: Keep-alive
    """
    # Verify authentication
    user_info = await verify_token(token, db)
    if not user_info:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    # Get technician info
    tech = await db.technicians.find_one({
        "tech_id": tech_id,
        "user_id": user_info["user_id"],
        "deleted_at": None
    })

    if not tech:
        await websocket.close(code=4004, reason="Technician not found")
        return

    business_id = tech["business_id"]
    manager = get_websocket_manager()
    await manager.connect_tech(websocket, business_id, tech_id)

    try:
        # Send initial connection confirmation
        await websocket.send_json({
            "type": "connected",
            "data": {
                "tech_id": tech_id,
                "business_id": business_id
            }
        })

        # Handle incoming messages from tech app
        while True:
            data = await websocket.receive_text()

            try:
                message = json.loads(data)
                msg_type = message.get("type")

                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})

                elif msg_type == "location":
                    # Tech sending location update
                    loc_data = message.get("data", {})
                    latitude = loc_data.get("latitude")
                    longitude = loc_data.get("longitude")

                    if latitude is not None and longitude is not None:
                        # Update tech location in database
                        await db.technicians.update_one(
                            {"tech_id": tech_id},
                            {
                                "$set": {
                                    "location": {
                                        "type": "Point",
                                        "coordinates": [longitude, latitude]
                                    },
                                    "location_updated_at": utc_now()
                                }
                            }
                        )

                        # Store in location history
                        await db.tech_location_history.insert_one({
                            "tech_id": tech_id,
                            "business_id": business_id,
                            "latitude": latitude,
                            "longitude": longitude,
                            "timestamp": utc_now()
                        })

                        # Broadcast to dispatch board
                        await manager.broadcast_tech_location(
                            business_id, tech_id, latitude, longitude, tech.get("status", "available")
                        )

                elif msg_type == "status":
                    # Tech sending status update
                    new_status = message.get("data", {}).get("status")
                    job_id = message.get("data", {}).get("job_id")

                    if new_status:
                        # Update tech status in database
                        await db.technicians.update_one(
                            {"tech_id": tech_id},
                            {"$set": {"status": new_status, "updated_at": utc_now()}}
                        )

                        # Broadcast to dispatch board
                        await manager.broadcast_tech_status(
                            business_id, tech_id, new_status, job_id
                        )

            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON from tech {tech_id}")

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info(f"Tech disconnected: {tech_id}")


@router.get("/status")
async def websocket_status(
    business_id: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get WebSocket connection status for a business"""
    manager = get_websocket_manager()

    return {
        "business_id": business_id,
        "dispatch_connections": manager.get_business_connection_count(business_id),
        "connected_techs": manager.get_connected_techs(business_id)
    }
