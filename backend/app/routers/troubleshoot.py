"""
Troubleshooting Router
AI-powered HVAC troubleshooting assistance endpoints
"""

import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from app.database import get_database
from app.models.user import User
from app.middleware.auth import BusinessContext, get_business_context, get_current_user
from app.services.troubleshoot_service import get_troubleshoot_service
from app.schemas.common import SingleResponse, MessageResponse

router = APIRouter()
logger = logging.getLogger(__name__)


class BrandInfo(BaseModel):
    """Brand information"""
    id: str
    name: str


class SymptomSummary(BaseModel):
    """Symptom summary"""
    id: str
    symptom: str
    category: str


class ErrorCodeResponse(BaseModel):
    """Error code lookup response"""
    code: str
    meaning: str
    category: str
    severity: str
    description: str
    possible_causes: list
    solutions: list
    parts_needed: list
    brand: str


class SymptomResponse(BaseModel):
    """Symptom lookup response"""
    symptom: str
    category: str
    initial_checks: list
    common_causes: list
    diagnostic_steps: list


class TroubleshootRequest(BaseModel):
    """Request for troubleshooting assistance"""
    brand: Optional[str] = None
    error_code: Optional[str] = None
    symptom: Optional[str] = None
    equipment_type: Optional[str] = None
    description: Optional[str] = None
    context: Optional[str] = None
    job_id: Optional[str] = None


class TroubleshootResponse(BaseModel):
    """Response from troubleshooting"""
    success: bool
    error_info: Optional[ErrorCodeResponse] = None
    ai_guidance: Optional[str] = None
    follow_up_questions: list = []
    tokens_used: int = 0
    session_id: Optional[str] = None


class FollowUpRequest(BaseModel):
    """Request for follow-up question"""
    session_id: str
    question: str


@router.get(
    "/brands",
    summary="Get supported equipment brands"
)
async def get_supported_brands():
    """Get list of equipment brands with error code support"""
    service = get_troubleshoot_service()
    brands = service.get_supported_brands()
    return {"data": brands}


@router.get(
    "/symptoms",
    summary="Get common symptoms"
)
async def get_common_symptoms():
    """Get list of common HVAC symptoms"""
    service = get_troubleshoot_service()
    symptoms = service.get_common_symptoms()
    return {"data": symptoms}


@router.get(
    "/error-code/{brand}/{code}",
    response_model=SingleResponse[ErrorCodeResponse],
    summary="Look up error code"
)
async def lookup_error_code(
    brand: str,
    code: str
):
    """
    Look up an error code in the database.

    Args:
        brand: Equipment brand (e.g., carrier, trane, lennox)
        code: Error code to look up
    """
    service = get_troubleshoot_service()
    error_info = service.lookup_error_code(brand, code)

    if not error_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "ERROR_CODE_NOT_FOUND",
                "message": f"Error code {code} not found for brand {brand}"
            }
        )

    return SingleResponse(data=ErrorCodeResponse(
        code=error_info.code,
        meaning=error_info.meaning,
        category=error_info.category,
        severity=error_info.severity,
        description=error_info.description,
        possible_causes=error_info.possible_causes,
        solutions=error_info.solutions,
        parts_needed=error_info.parts_needed,
        brand=error_info.brand
    ))


@router.get(
    "/symptom/{symptom_id}",
    response_model=SingleResponse[SymptomResponse],
    summary="Look up symptom"
)
async def lookup_symptom(
    symptom_id: str
):
    """
    Look up a common symptom for troubleshooting guidance.

    Args:
        symptom_id: Symptom ID (e.g., no_cooling, no_heating, short_cycling)
    """
    service = get_troubleshoot_service()
    symptom_info = service.lookup_symptom(symptom_id)

    if not symptom_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "SYMPTOM_NOT_FOUND",
                "message": f"Symptom {symptom_id} not found"
            }
        )

    return SingleResponse(data=SymptomResponse(
        symptom=symptom_info.symptom,
        category=symptom_info.category,
        initial_checks=symptom_info.initial_checks,
        common_causes=symptom_info.common_causes,
        diagnostic_steps=symptom_info.diagnostic_steps
    ))


@router.post(
    "/diagnose",
    response_model=SingleResponse[TroubleshootResponse],
    summary="Get AI troubleshooting guidance"
)
async def diagnose_problem(
    request: TroubleshootRequest,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Get AI-powered troubleshooting guidance for an HVAC problem.

    Provide any combination of:
    - brand + error_code: For error code lookup and guidance
    - symptom: Common symptom (e.g., "no cooling", "short cycling")
    - description: Free-form problem description
    - context: Additional context (recent work, weather, etc.)
    """
    # Validate that at least some input was provided
    if not any([request.error_code, request.symptom, request.description]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "NO_INPUT",
                "message": "Please provide error_code, symptom, or description"
            }
        )

    service = get_troubleshoot_service()

    result = await service.troubleshoot(
        brand=request.brand,
        error_code=request.error_code,
        symptom=request.symptom,
        equipment_type=request.equipment_type,
        description=request.description,
        context=request.context
    )

    if not result.success and not result.error_info:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "TROUBLESHOOT_FAILED",
                "message": result.error or "Failed to generate troubleshooting guidance"
            }
        )

    # Create session for follow-up questions
    from app.models.common import generate_id
    session_id = generate_id("tsess")

    # Store session in database for follow-ups
    session_data = {
        "session_id": session_id,
        "business_id": ctx.business_id,
        "user_id": current_user.user_id,
        "job_id": request.job_id,
        "original_request": request.model_dump(),
        "error_info": {
            "code": result.error_info.code,
            "meaning": result.error_info.meaning,
            "brand": result.error_info.brand
        } if result.error_info else None,
        "ai_guidance": result.ai_guidance,
        "tokens_used": result.tokens_used,
        "created_at": datetime.utcnow()
    }
    await db.troubleshoot_sessions.insert_one(session_data)

    # Build response
    error_response = None
    if result.error_info:
        error_response = ErrorCodeResponse(
            code=result.error_info.code,
            meaning=result.error_info.meaning,
            category=result.error_info.category,
            severity=result.error_info.severity,
            description=result.error_info.description,
            possible_causes=result.error_info.possible_causes,
            solutions=result.error_info.solutions,
            parts_needed=result.error_info.parts_needed,
            brand=result.error_info.brand
        )

    logger.info(f"Troubleshoot session {session_id} created for business {ctx.business_id}")

    return SingleResponse(data=TroubleshootResponse(
        success=True,
        error_info=error_response,
        ai_guidance=result.ai_guidance,
        follow_up_questions=result.follow_up_questions,
        tokens_used=result.tokens_used,
        session_id=session_id
    ))


@router.post(
    "/followup",
    response_model=SingleResponse[TroubleshootResponse],
    summary="Ask a follow-up question"
)
async def ask_followup(
    request: FollowUpRequest,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Ask a follow-up question about previous troubleshooting guidance.

    Requires the session_id from the original diagnose response.
    """
    # Get the original session
    session = await db.troubleshoot_sessions.find_one({
        "session_id": request.session_id,
        "business_id": ctx.business_id
    })

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "SESSION_NOT_FOUND",
                "message": "Troubleshooting session not found"
            }
        )

    service = get_troubleshoot_service()

    # Build problem summary from original request
    orig = session.get("original_request", {})
    problem_parts = []
    if orig.get("brand"):
        problem_parts.append(f"Brand: {orig['brand']}")
    if orig.get("error_code"):
        problem_parts.append(f"Error Code: {orig['error_code']}")
    if orig.get("symptom"):
        problem_parts.append(f"Symptom: {orig['symptom']}")
    if orig.get("description"):
        problem_parts.append(f"Description: {orig['description']}")

    original_problem = "\n".join(problem_parts) if problem_parts else "HVAC issue"
    original_guidance = session.get("ai_guidance", "")

    result = await service.ask_followup(
        original_problem=original_problem,
        original_guidance=original_guidance,
        followup_question=request.question
    )

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "FOLLOWUP_FAILED",
                "message": result.error or "Failed to process follow-up question"
            }
        )

    # Update session with follow-up
    await db.troubleshoot_sessions.update_one(
        {"session_id": request.session_id},
        {
            "$push": {
                "followups": {
                    "question": request.question,
                    "response": result.ai_guidance,
                    "tokens_used": result.tokens_used,
                    "asked_at": datetime.utcnow()
                }
            },
            "$inc": {"total_tokens": result.tokens_used},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )

    return SingleResponse(data=TroubleshootResponse(
        success=True,
        ai_guidance=result.ai_guidance,
        follow_up_questions=result.follow_up_questions,
        tokens_used=result.tokens_used,
        session_id=request.session_id
    ))


@router.get(
    "/sessions",
    summary="Get troubleshooting session history"
)
async def get_troubleshoot_sessions(
    job_id: Optional[str] = None,
    limit: int = 20,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get recent troubleshooting sessions for the business"""
    query = {"business_id": ctx.business_id}
    if job_id:
        query["job_id"] = job_id

    sessions = await db.troubleshoot_sessions.find(query).sort(
        "created_at", -1
    ).limit(limit).to_list(length=limit)

    return {
        "data": [
            {
                "session_id": s["session_id"],
                "job_id": s.get("job_id"),
                "error_code": s.get("original_request", {}).get("error_code"),
                "brand": s.get("original_request", {}).get("brand"),
                "symptom": s.get("original_request", {}).get("symptom"),
                "tokens_used": s.get("tokens_used", 0),
                "followup_count": len(s.get("followups", [])),
                "created_at": s["created_at"]
            }
            for s in sessions
        ]
    }


@router.get(
    "/sessions/{session_id}",
    summary="Get troubleshooting session details"
)
async def get_troubleshoot_session(
    session_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get full details of a troubleshooting session including all follow-ups"""
    session = await db.troubleshoot_sessions.find_one({
        "session_id": session_id,
        "business_id": ctx.business_id
    })

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "SESSION_NOT_FOUND",
                "message": "Troubleshooting session not found"
            }
        )

    return {
        "data": {
            "session_id": session["session_id"],
            "job_id": session.get("job_id"),
            "original_request": session.get("original_request"),
            "error_info": session.get("error_info"),
            "ai_guidance": session.get("ai_guidance"),
            "followups": session.get("followups", []),
            "total_tokens": session.get("total_tokens", session.get("tokens_used", 0)),
            "created_at": session["created_at"],
            "updated_at": session.get("updated_at")
        }
    }
