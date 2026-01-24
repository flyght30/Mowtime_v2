"""
Integrations Router
For managing third-party service integrations (HCP, QuickBooks, etc.)
"""

import os
import logging
import secrets
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import RedirectResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.models.user import User
from app.models.integration import (
    Integration, IntegrationProvider, IntegrationSettings,
    IntegrationResponse, IntegrationSummary, OAuthInitResponse,
    SyncTriggerResponse, CustomerMatchResult, JobPushResult,
    InvoiceCreateResult, IntegrationUpdate
)
from app.middleware.auth import BusinessContext, get_business_context, get_current_user
from app.schemas.common import SingleResponse, ListResponse, MessageResponse
from app.services.integrations.housecall import HousecallProService
from app.services.integrations.quickbooks import QuickBooksService

router = APIRouter()
logger = logging.getLogger(__name__)

# Store OAuth states temporarily (in production, use Redis)
_oauth_states: dict = {}

# Base URL for callbacks
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")


def get_integration_service(
    provider: IntegrationProvider,
    db: AsyncIOMotorDatabase,
    business_id: str
):
    """Get the appropriate integration service for a provider"""
    if provider == IntegrationProvider.HOUSECALL_PRO:
        return HousecallProService(db, business_id)
    elif provider == IntegrationProvider.QUICKBOOKS:
        return QuickBooksService(db, business_id)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "UNSUPPORTED_PROVIDER", "message": f"Provider {provider} not supported"}
        )


def integration_to_response(integration: dict) -> IntegrationResponse:
    """Convert integration to API response"""
    return IntegrationResponse(
        integration_id=integration["integration_id"],
        business_id=integration["business_id"],
        provider=integration["provider"],
        is_active=integration.get("is_active", False),
        connected_at=integration.get("connected_at"),
        settings=IntegrationSettings(**integration.get("settings", {})),
        sync_status=integration.get("sync_status", {}),
        remote_account_name=integration.get("remote_account_name"),
        remote_account_email=integration.get("remote_account_email"),
        created_at=integration["created_at"],
        updated_at=integration["updated_at"]
    )


@router.get(
    "",
    response_model=ListResponse[IntegrationSummary],
    summary="List integrations"
)
async def list_integrations(
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """List all integrations for the business"""
    integrations = await db.integrations.find({
        "business_id": ctx.business_id
    }).to_list(length=20)

    # Include available providers that aren't connected
    connected_providers = {i["provider"] for i in integrations}
    available_providers = [
        IntegrationProvider.HOUSECALL_PRO,
        IntegrationProvider.QUICKBOOKS,
        IntegrationProvider.GOOGLE_CALENDAR
    ]

    summaries = []

    for integration in integrations:
        summaries.append(IntegrationSummary(
            integration_id=integration["integration_id"],
            provider=integration["provider"],
            is_active=integration.get("is_active", False),
            connected_at=integration.get("connected_at"),
            remote_account_name=integration.get("remote_account_name"),
            sync_status=integration.get("sync_status", {})
        ))

    return ListResponse(
        data=summaries,
        meta={"available_providers": [p.value for p in available_providers if p.value not in connected_providers]}
    )


@router.get(
    "/{provider}",
    response_model=SingleResponse[IntegrationResponse],
    summary="Get integration details"
)
async def get_integration(
    provider: IntegrationProvider,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get details of a specific integration"""
    integration = await db.integrations.find_one({
        "business_id": ctx.business_id,
        "provider": provider.value
    })

    if not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INTEGRATION_NOT_FOUND", "message": "Integration not found"}
        )

    return SingleResponse(data=integration_to_response(integration))


@router.post(
    "/{provider}/connect",
    response_model=SingleResponse[OAuthInitResponse],
    summary="Initiate OAuth connection"
)
async def connect_integration(
    provider: IntegrationProvider,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Initiate OAuth flow for an integration"""
    service = get_integration_service(provider, db, ctx.business_id)

    # Generate state for CSRF protection
    state = secrets.token_urlsafe(32)
    _oauth_states[state] = {
        "business_id": ctx.business_id,
        "provider": provider.value,
        "created_at": datetime.utcnow()
    }

    redirect_uri = f"{API_BASE_URL}/api/v1/integrations/{provider.value}/callback"
    auth_url = service.get_oauth_url(redirect_uri, state)

    await service.close()

    return SingleResponse(data=OAuthInitResponse(
        auth_url=auth_url,
        state=state
    ))


@router.get(
    "/{provider}/callback",
    summary="OAuth callback handler"
)
async def oauth_callback(
    provider: IntegrationProvider,
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    realmId: Optional[str] = None,  # QuickBooks specific
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Handle OAuth callback from provider"""
    if error:
        return RedirectResponse(
            url=f"{FRONTEND_URL}/settings/integrations?error={error}"
        )

    if not state or state not in _oauth_states:
        return RedirectResponse(
            url=f"{FRONTEND_URL}/settings/integrations?error=invalid_state"
        )

    state_data = _oauth_states.pop(state)
    business_id = state_data["business_id"]

    if not code:
        return RedirectResponse(
            url=f"{FRONTEND_URL}/settings/integrations?error=no_code"
        )

    service = get_integration_service(provider, db, business_id)
    redirect_uri = f"{API_BASE_URL}/api/v1/integrations/{provider.value}/callback"

    try:
        if provider == IntegrationProvider.QUICKBOOKS:
            success, error_msg = await service.handle_oauth_callback(code, redirect_uri, realmId)
        else:
            success, error_msg = await service.handle_oauth_callback(code, redirect_uri)

        if success:
            logger.info(f"Integration {provider} connected for business {business_id}")
            return RedirectResponse(
                url=f"{FRONTEND_URL}/settings/integrations?connected={provider.value}"
            )
        else:
            return RedirectResponse(
                url=f"{FRONTEND_URL}/settings/integrations?error={error_msg or 'connection_failed'}"
            )

    finally:
        await service.close()


@router.delete(
    "/{provider}",
    response_model=MessageResponse,
    summary="Disconnect integration"
)
async def disconnect_integration(
    provider: IntegrationProvider,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Disconnect an integration"""
    service = get_integration_service(provider, db, ctx.business_id)

    try:
        success = await service.disconnect()

        if success:
            logger.info(f"Integration {provider} disconnected for business {ctx.business_id}")
            return MessageResponse(message="Integration disconnected successfully")
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "INTEGRATION_NOT_FOUND", "message": "Integration not found"}
            )

    finally:
        await service.close()


@router.put(
    "/{provider}/settings",
    response_model=SingleResponse[IntegrationResponse],
    summary="Update integration settings"
)
async def update_integration_settings(
    provider: IntegrationProvider,
    request: IntegrationUpdate,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update integration settings"""
    integration = await db.integrations.find_one({
        "business_id": ctx.business_id,
        "provider": provider.value
    })

    if not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INTEGRATION_NOT_FOUND", "message": "Integration not found"}
        )

    update_data = {"updated_at": datetime.utcnow()}

    if request.settings:
        update_data["settings"] = request.settings.model_dump()

    if request.is_active is not None:
        update_data["is_active"] = request.is_active

    await db.integrations.update_one(
        {"integration_id": integration["integration_id"]},
        {"$set": update_data}
    )

    updated = await db.integrations.find_one({"integration_id": integration["integration_id"]})
    return SingleResponse(data=integration_to_response(updated))


@router.post(
    "/{provider}/sync",
    response_model=SingleResponse[SyncTriggerResponse],
    summary="Trigger manual sync"
)
async def trigger_sync(
    provider: IntegrationProvider,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Trigger a manual sync with the integration"""
    service = get_integration_service(provider, db, ctx.business_id)

    try:
        integration = await service.get_integration()

        if not integration or not integration.get("is_active"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "NOT_CONNECTED", "message": "Integration not connected or inactive"}
            )

        # Start sync (in background in production)
        results = await service.sync_customers()

        return SingleResponse(data=SyncTriggerResponse(
            sync_started=True,
            message=f"Synced {results.get('pushed', 0)} pushed, {results.get('pulled', 0)} pulled"
        ))

    finally:
        await service.close()


@router.get(
    "/{provider}/sync-status",
    response_model=SingleResponse[dict],
    summary="Get sync status"
)
async def get_sync_status(
    provider: IntegrationProvider,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get current sync status for an integration"""
    integration = await db.integrations.find_one({
        "business_id": ctx.business_id,
        "provider": provider.value
    })

    if not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INTEGRATION_NOT_FOUND", "message": "Integration not found"}
        )

    return SingleResponse(data=integration.get("sync_status", {}))


# Housecall Pro specific endpoints

@router.post(
    "/housecall-pro/push-job",
    response_model=SingleResponse[JobPushResult],
    summary="Push job to Housecall Pro"
)
async def push_job_to_hcp(
    job_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Push a job to Housecall Pro"""
    service = HousecallProService(db, ctx.business_id)

    try:
        success, remote_id, url_or_error = await service.push_job(job_id)

        return SingleResponse(data=JobPushResult(
            success=success,
            remote_job_id=remote_id if success else None,
            remote_url=url_or_error if success else None,
            error=url_or_error if not success else None
        ))

    finally:
        await service.close()


@router.post(
    "/housecall-pro/pull-jobs",
    response_model=SingleResponse[dict],
    summary="Pull jobs from Housecall Pro"
)
async def pull_jobs_from_hcp(
    since: Optional[datetime] = None,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Pull jobs from Housecall Pro (for migration)"""
    service = HousecallProService(db, ctx.business_id)

    try:
        count = await service.pull_jobs(since)
        return SingleResponse(data={"jobs_imported": count})

    finally:
        await service.close()


@router.get(
    "/housecall-pro/match-customers",
    response_model=SingleResponse[CustomerMatchResult],
    summary="Match customers with Housecall Pro"
)
async def match_hcp_customers(
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Find matching customers between local and Housecall Pro"""
    service = HousecallProService(db, ctx.business_id)

    try:
        result = await service.match_customers()
        return SingleResponse(data=CustomerMatchResult(**result))

    finally:
        await service.close()


# QuickBooks specific endpoints

@router.post(
    "/quickbooks/create-invoice",
    response_model=SingleResponse[InvoiceCreateResult],
    summary="Create invoice in QuickBooks"
)
async def create_qb_invoice(
    job_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Create an invoice in QuickBooks from a job"""
    service = QuickBooksService(db, ctx.business_id)

    try:
        success, invoice_number, error = await service.create_invoice(job_id)

        return SingleResponse(data=InvoiceCreateResult(
            success=success,
            qb_invoice_id=invoice_number if success else None,
            invoice_number=invoice_number if success else None,
            error=error
        ))

    finally:
        await service.close()


@router.post(
    "/quickbooks/sync-customers",
    response_model=SingleResponse[dict],
    summary="Sync customers to QuickBooks"
)
async def sync_qb_customers(
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Sync customers to QuickBooks"""
    service = QuickBooksService(db, ctx.business_id)

    try:
        results = await service.sync_customers()
        return SingleResponse(data={
            "synced": results.get("pushed", 0),
            "errors": results.get("errors", 0)
        })

    finally:
        await service.close()


@router.get(
    "/quickbooks/accounts",
    response_model=SingleResponse[dict],
    summary="Get QuickBooks accounts"
)
async def get_qb_accounts(
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get chart of accounts from QuickBooks for mapping"""
    service = QuickBooksService(db, ctx.business_id)

    try:
        income_accounts = await service.get_income_accounts()
        expense_accounts = await service.get_expense_accounts()

        return SingleResponse(data={
            "income_accounts": [
                {"id": a.get("Id"), "name": a.get("Name"), "type": a.get("AccountType")}
                for a in income_accounts
            ],
            "expense_accounts": [
                {"id": a.get("Id"), "name": a.get("Name"), "type": a.get("AccountType")}
                for a in expense_accounts
            ]
        })

    finally:
        await service.close()


@router.get(
    "/quickbooks/summary",
    response_model=SingleResponse[dict],
    summary="Get QuickBooks sync summary"
)
async def get_qb_summary(
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get summary of items synced to QuickBooks"""
    service = QuickBooksService(db, ctx.business_id)

    try:
        summary = await service.get_sync_summary()
        return SingleResponse(data=summary)

    finally:
        await service.close()


@router.post(
    "/quickbooks/sync-items",
    response_model=SingleResponse[dict],
    summary="Sync service items to QuickBooks"
)
async def sync_qb_items(
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Sync service items to QuickBooks"""
    service = QuickBooksService(db, ctx.business_id)

    try:
        results = await service.sync_items()
        return SingleResponse(data={
            "pushed": results.get("pushed", 0),
            "pulled": results.get("pulled", 0),
            "errors": results.get("errors", 0)
        })

    finally:
        await service.close()


@router.get(
    "/quickbooks/items",
    response_model=SingleResponse[dict],
    summary="Get items from QuickBooks"
)
async def get_qb_items(
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get service items from QuickBooks for mapping"""
    service = QuickBooksService(db, ctx.business_id)

    try:
        items = await service.get_remote_items()
        return SingleResponse(data={
            "items": [
                {
                    "id": item.get("Id"),
                    "name": item.get("Name"),
                    "type": item.get("Type"),
                    "price": item.get("UnitPrice"),
                    "active": item.get("Active", True)
                }
                for item in items
            ]
        })

    finally:
        await service.close()
