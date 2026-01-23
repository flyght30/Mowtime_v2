"""
AI Analysis Router
Property and equipment photo analysis using Claude Vision
"""

import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from app.database import get_database
from app.models.user import User
from app.middleware.auth import BusinessContext, get_business_context, get_current_user
from app.services.vision_service import get_vision_service, PropertyAnalysis, EquipmentAnalysis
from app.schemas.common import SingleResponse, MessageResponse

router = APIRouter()
logger = logging.getLogger(__name__)

# Allowed image types
ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB


class PropertyAnalysisResponse(BaseModel):
    """Response for property photo analysis"""
    success: bool
    sqft_estimate: Optional[int] = None
    sqft_confidence: float = 0.0
    sun_exposure: str = "partial"
    sun_confidence: float = 0.0
    window_percentage: int = 10
    window_confidence: float = 0.0
    roof_type: str = "unknown"
    home_age: str = "unknown"
    visible_equipment: Optional[str] = None
    notes: str = ""
    suggested_inputs: dict = {}
    tokens_used: int = 0


class EquipmentAnalysisResponse(BaseModel):
    """Response for equipment photo analysis"""
    success: bool
    brand: Optional[str] = None
    model: Optional[str] = None
    equipment_type: str = "unknown"
    estimated_age: Optional[str] = None
    tonnage: Optional[str] = None
    condition: str = "unknown"
    visible_issues: list = []
    common_issues: list = []
    replacement_recommended: bool = False
    replacement_reason: Optional[str] = None
    tokens_used: int = 0


class AnalysisHistoryResponse(BaseModel):
    """Response for analysis history record"""
    analysis_id: str
    business_id: str
    analysis_type: str
    job_id: Optional[str] = None
    client_id: Optional[str] = None
    result: dict
    created_at: datetime
    created_by: str


@router.post(
    "/analyze-property",
    response_model=SingleResponse[PropertyAnalysisResponse],
    summary="Analyze property photo for HVAC sizing"
)
async def analyze_property_photo(
    file: UploadFile = File(...),
    job_id: Optional[str] = Form(None),
    client_id: Optional[str] = Form(None),
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Analyze an exterior property photo using Claude Vision.

    Returns estimated square footage, sun exposure, window percentage,
    and other factors useful for HVAC load calculations.
    """
    # Validate file type
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_FILE_TYPE",
                "message": f"Invalid file type: {file.content_type}. Allowed: jpeg, png, webp, gif"
            }
        )

    # Read and validate file size
    image_data = await file.read()
    if len(image_data) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "FILE_TOO_LARGE",
                "message": "Image size exceeds 10MB limit"
            }
        )

    # Get vision service
    vision_service = get_vision_service()

    if not vision_service.is_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "VISION_NOT_CONFIGURED",
                "message": "Vision analysis service is not configured"
            }
        )

    # Analyze the image
    result = await vision_service.analyze_property(image_data, file.content_type)

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "ANALYSIS_FAILED",
                "message": result.error or "Failed to analyze property photo"
            }
        )

    # Extract analysis data
    analysis: PropertyAnalysis = result.data.get("analysis")
    suggested = result.data.get("suggested_inputs", {})

    # Save analysis to history
    from app.models.common import generate_id
    analysis_record = {
        "analysis_id": generate_id("ana"),
        "business_id": ctx.business_id,
        "analysis_type": "property",
        "job_id": job_id,
        "client_id": client_id,
        "result": {
            "sqft_estimate": analysis.sqft_estimate,
            "sqft_confidence": analysis.sqft_confidence,
            "sun_exposure": analysis.sun_exposure,
            "sun_confidence": analysis.sun_confidence,
            "window_percentage": analysis.window_percentage,
            "window_confidence": analysis.window_confidence,
            "roof_type": analysis.roof_type,
            "home_age": analysis.home_age,
            "visible_equipment": analysis.visible_equipment,
            "notes": analysis.notes
        },
        "tokens_used": result.tokens_used,
        "created_at": datetime.utcnow(),
        "created_by": current_user.user_id
    }
    await db.ai_analyses.insert_one(analysis_record)

    logger.info(f"Property analysis complete for business {ctx.business_id}, tokens: {result.tokens_used}")

    return SingleResponse(data=PropertyAnalysisResponse(
        success=True,
        sqft_estimate=analysis.sqft_estimate,
        sqft_confidence=analysis.sqft_confidence,
        sun_exposure=analysis.sun_exposure,
        sun_confidence=analysis.sun_confidence,
        window_percentage=analysis.window_percentage,
        window_confidence=analysis.window_confidence,
        roof_type=analysis.roof_type,
        home_age=analysis.home_age,
        visible_equipment=analysis.visible_equipment,
        notes=analysis.notes,
        suggested_inputs=suggested,
        tokens_used=result.tokens_used
    ))


@router.post(
    "/analyze-equipment",
    response_model=SingleResponse[EquipmentAnalysisResponse],
    summary="Analyze HVAC equipment photo"
)
async def analyze_equipment_photo(
    file: UploadFile = File(...),
    job_id: Optional[str] = Form(None),
    client_id: Optional[str] = Form(None),
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Analyze an HVAC equipment photo using Claude Vision.

    Identifies brand, model, estimated age, condition, and any visible issues.
    Also provides common issues for the equipment type and age.
    """
    # Validate file type
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_FILE_TYPE",
                "message": f"Invalid file type: {file.content_type}. Allowed: jpeg, png, webp, gif"
            }
        )

    # Read and validate file size
    image_data = await file.read()
    if len(image_data) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "FILE_TOO_LARGE",
                "message": "Image size exceeds 10MB limit"
            }
        )

    # Get vision service
    vision_service = get_vision_service()

    if not vision_service.is_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "VISION_NOT_CONFIGURED",
                "message": "Vision analysis service is not configured"
            }
        )

    # Analyze the image
    result = await vision_service.analyze_equipment(image_data, file.content_type)

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "ANALYSIS_FAILED",
                "message": result.error or "Failed to analyze equipment photo"
            }
        )

    # Extract analysis data
    equipment: EquipmentAnalysis = result.data.get("equipment")

    # Save analysis to history
    from app.models.common import generate_id
    analysis_record = {
        "analysis_id": generate_id("ana"),
        "business_id": ctx.business_id,
        "analysis_type": "equipment",
        "job_id": job_id,
        "client_id": client_id,
        "result": {
            "brand": equipment.brand,
            "model": equipment.model,
            "equipment_type": equipment.equipment_type,
            "estimated_age": equipment.estimated_age,
            "tonnage": equipment.tonnage,
            "condition": equipment.condition,
            "visible_issues": equipment.visible_issues,
            "common_issues": equipment.common_issues,
            "replacement_recommended": equipment.replacement_recommended,
            "replacement_reason": equipment.replacement_reason
        },
        "tokens_used": result.tokens_used,
        "created_at": datetime.utcnow(),
        "created_by": current_user.user_id
    }
    await db.ai_analyses.insert_one(analysis_record)

    logger.info(f"Equipment analysis complete for business {ctx.business_id}, tokens: {result.tokens_used}")

    return SingleResponse(data=EquipmentAnalysisResponse(
        success=True,
        brand=equipment.brand,
        model=equipment.model,
        equipment_type=equipment.equipment_type,
        estimated_age=equipment.estimated_age,
        tonnage=equipment.tonnage,
        condition=equipment.condition,
        visible_issues=equipment.visible_issues,
        common_issues=equipment.common_issues,
        replacement_recommended=equipment.replacement_recommended,
        replacement_reason=equipment.replacement_reason,
        tokens_used=result.tokens_used
    ))


@router.get(
    "/history",
    summary="Get analysis history"
)
async def get_analysis_history(
    analysis_type: Optional[str] = None,
    job_id: Optional[str] = None,
    client_id: Optional[str] = None,
    limit: int = 20,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get history of AI analyses for the business"""
    query = {"business_id": ctx.business_id}

    if analysis_type:
        query["analysis_type"] = analysis_type
    if job_id:
        query["job_id"] = job_id
    if client_id:
        query["client_id"] = client_id

    analyses = await db.ai_analyses.find(query).sort(
        "created_at", -1
    ).limit(limit).to_list(length=limit)

    return {
        "data": [
            AnalysisHistoryResponse(
                analysis_id=a["analysis_id"],
                business_id=a["business_id"],
                analysis_type=a["analysis_type"],
                job_id=a.get("job_id"),
                client_id=a.get("client_id"),
                result=a["result"],
                created_at=a["created_at"],
                created_by=a["created_by"]
            )
            for a in analyses
        ]
    }


@router.get(
    "/status",
    response_model=MessageResponse,
    summary="Check vision service status"
)
async def check_vision_status():
    """Check if the vision analysis service is configured and available"""
    vision_service = get_vision_service()

    if vision_service.is_configured:
        return MessageResponse(message="Vision service is configured and ready")
    else:
        return MessageResponse(message="Vision service is not configured - ANTHROPIC_API_KEY missing")
