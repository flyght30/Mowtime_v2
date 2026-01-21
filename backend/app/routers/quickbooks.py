"""
QuickBooks Integration Router
OAuth flow and sync endpoints for QuickBooks Online
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import RedirectResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional, List
from pydantic import BaseModel
import secrets
import os

from app.database import get_database
from app.middleware.auth import get_current_user
from app.models.user import User
from app.services.quickbooks import QuickBooksService

router = APIRouter()


# ============== Request/Response Models ==============

class SyncInvoicesRequest(BaseModel):
    invoice_ids: Optional[List[str]] = None
    since_date: Optional[str] = None


class SyncResponse(BaseModel):
    success: bool
    message: str
    stats: dict


# ============== OAuth Flow ==============

@router.get(
    "/auth",
    summary="Initiate QuickBooks OAuth flow"
)
async def initiate_quickbooks_auth(
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Redirect user to QuickBooks OAuth authorization page.
    Returns the authorization URL to redirect to.
    """
    qb_service = QuickBooksService(db)

    # Generate state token for CSRF protection
    state = secrets.token_urlsafe(32)

    # Store state in database for verification
    await db.oauth_states.insert_one({
        "state": state,
        "business_id": current_user.business_id,
        "user_id": current_user.user_id,
        "created_at": __import__("datetime").datetime.utcnow(),
    })

    auth_url = qb_service.get_auth_url(current_user.business_id, state)

    return {
        "success": True,
        "data": {
            "auth_url": auth_url,
            "message": "Redirect user to auth_url to authorize QuickBooks"
        }
    }


@router.get(
    "/callback",
    summary="Handle QuickBooks OAuth callback"
)
async def quickbooks_callback(
    code: str = Query(..., description="Authorization code from QuickBooks"),
    state: str = Query(..., description="State parameter for CSRF validation"),
    realmId: str = Query(..., description="QuickBooks company/realm ID"),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Handle OAuth callback from QuickBooks.
    Exchanges code for tokens and stores connection.
    """
    # Parse state to get business_id
    try:
        business_id, stored_state = state.rsplit(":", 1)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid state parameter"
        )

    # Verify state token
    state_record = await db.oauth_states.find_one_and_delete({
        "state": stored_state,
        "business_id": business_id
    })

    if not state_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired state token"
        )

    qb_service = QuickBooksService(db)

    try:
        # Exchange code for tokens
        tokens = await qb_service.exchange_code_for_tokens(code)

        # Store connection
        await qb_service.store_connection(business_id, realmId, tokens)

        # Redirect to frontend settings page with success
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:8081")
        return RedirectResponse(
            url=f"{frontend_url}/settings?quickbooks=connected",
            status_code=302
        )

    except Exception as e:
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:8081")
        return RedirectResponse(
            url=f"{frontend_url}/settings?quickbooks=error&message={str(e)}",
            status_code=302
        )


@router.post(
    "/disconnect",
    summary="Disconnect QuickBooks integration"
)
async def disconnect_quickbooks(
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Remove QuickBooks integration for the business"""
    qb_service = QuickBooksService(db)

    success = await qb_service.remove_connection(current_user.business_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="QuickBooks connection not found"
        )

    return {
        "success": True,
        "data": {
            "message": "QuickBooks disconnected successfully"
        }
    }


# ============== Connection Status ==============

@router.get(
    "/status",
    summary="Get QuickBooks connection status"
)
async def get_quickbooks_status(
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get current QuickBooks connection status and sync info"""
    qb_service = QuickBooksService(db)
    status = await qb_service.get_sync_status(current_user.business_id)

    return {
        "success": True,
        "data": status
    }


# ============== Sync Endpoints ==============

@router.post(
    "/sync/clients",
    summary="Import customers from QuickBooks"
)
async def sync_clients_from_quickbooks(
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Import QuickBooks customers as ServicePro clients.
    Matches existing clients by email or name.
    """
    qb_service = QuickBooksService(db)

    # Check connection
    connection = await qb_service.get_connection(current_user.business_id)
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="QuickBooks not connected. Please connect first."
        )

    try:
        stats = await qb_service.sync_clients_from_qb(current_user.business_id)

        return {
            "success": True,
            "data": {
                "message": "Client sync completed",
                "imported": stats["imported"],
                "updated": stats["updated"],
                "skipped": stats["skipped"],
            }
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Sync failed: {str(e)}"
        )


@router.post(
    "/sync/invoices",
    summary="Push invoices to QuickBooks"
)
async def sync_invoices_to_quickbooks(
    request: SyncInvoicesRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Push ServicePro invoices to QuickBooks.
    Creates customers in QB if they don't exist.
    """
    qb_service = QuickBooksService(db)

    # Check connection
    connection = await qb_service.get_connection(current_user.business_id)
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="QuickBooks not connected. Please connect first."
        )

    try:
        results = await qb_service.sync_invoices_to_qb(
            current_user.business_id,
            invoice_ids=request.invoice_ids,
            since_date=request.since_date
        )

        return {
            "success": True,
            "data": {
                "message": "Invoice sync completed",
                "synced": results["synced"],
                "failed": results["failed"],
                "errors": results["errors"][:5] if results["errors"] else [],  # Limit errors returned
            }
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Sync failed: {str(e)}"
        )


@router.get(
    "/sync/status",
    summary="Get sync status and timestamps"
)
async def get_sync_status(
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get last sync timestamps and counts"""
    qb_service = QuickBooksService(db)
    sync_status = await qb_service.get_sync_status(current_user.business_id)

    if not sync_status.get("connected"):
        return {
            "success": True,
            "data": {
                "connected": False,
                "message": "QuickBooks not connected"
            }
        }

    return {
        "success": True,
        "data": {
            "connected": True,
            "last_sync_clients": sync_status.get("last_sync_clients"),
            "last_sync_invoices": sync_status.get("last_sync_invoices"),
            "total_clients_synced": sync_status.get("sync_stats", {}).get("clients_imported", 0),
            "total_invoices_synced": sync_status.get("sync_stats", {}).get("invoices_pushed", 0),
        }
    }
