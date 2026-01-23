"""
Voice Notes API Router
Upload, transcribe, and summarize technician voice recordings
"""

import os
import uuid
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form, BackgroundTasks
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional

from app.database import get_database
from app.models.voice_note import (
    VoiceNote, VoiceNoteStatus, VoiceNoteCreate, VoiceNoteResponse, VoiceNoteUpdate
)
from app.models.user import User
from app.middleware.auth import BusinessContext, get_business_context, get_current_user
from app.services.transcription_service import get_transcription_service
from app.services.ai_service import get_ai_service
from app.schemas.common import (
    PaginatedResponse, SingleResponse, MessageResponse,
    create_pagination_meta
)
from app.config import get_settings

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)

# Storage directory for voice notes
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "voice_notes")
os.makedirs(UPLOAD_DIR, exist_ok=True)


async def process_voice_note(
    voice_note_id: str,
    business_id: str,
    db: AsyncIOMotorDatabase
):
    """Background task to transcribe and summarize a voice note"""
    try:
        # Get the voice note
        note = await db.voice_notes.find_one({
            "voice_note_id": voice_note_id,
            "business_id": business_id
        })
        if not note:
            logger.error(f"Voice note not found: {voice_note_id}")
            return

        # Update status to transcribing
        await db.voice_notes.update_one(
            {"voice_note_id": voice_note_id},
            {"$set": {"status": VoiceNoteStatus.TRANSCRIBING.value, "updated_at": datetime.utcnow()}}
        )

        # Transcribe
        transcription_service = get_transcription_service()
        audio_path = note["audio_url"]

        # Handle both local paths and URLs
        if audio_path.startswith("http"):
            result = await transcription_service.transcribe_url(audio_path)
        else:
            result = await transcription_service.transcribe_file(audio_path)

        if not result.success:
            await db.voice_notes.update_one(
                {"voice_note_id": voice_note_id},
                {"$set": {
                    "status": VoiceNoteStatus.FAILED.value,
                    "error_message": result.error,
                    "updated_at": datetime.utcnow()
                }}
            )
            return

        # Update with transcription
        await db.voice_notes.update_one(
            {"voice_note_id": voice_note_id},
            {"$set": {
                "transcription": result.text,
                "transcription_confidence": result.confidence,
                "transcribed_at": datetime.utcnow(),
                "status": VoiceNoteStatus.SUMMARIZING.value,
                "updated_at": datetime.utcnow()
            }}
        )

        # Summarize with Claude
        ai_service = get_ai_service()
        summary_result = await ai_service.summarize_voice_note(result.text)

        if not summary_result.success:
            await db.voice_notes.update_one(
                {"voice_note_id": voice_note_id},
                {"$set": {
                    "status": VoiceNoteStatus.FAILED.value,
                    "error_message": f"Summarization failed: {summary_result.error}",
                    "updated_at": datetime.utcnow()
                }}
            )
            return

        # Complete processing
        await db.voice_notes.update_one(
            {"voice_note_id": voice_note_id},
            {"$set": {
                "summary": summary_result.content,
                "summarized_at": datetime.utcnow(),
                "claude_tokens_used": summary_result.tokens_used,
                "status": VoiceNoteStatus.COMPLETE.value,
                "updated_at": datetime.utcnow()
            }}
        )

        logger.info(f"Voice note processed successfully: {voice_note_id}")

    except Exception as e:
        logger.error(f"Error processing voice note {voice_note_id}: {str(e)}")
        await db.voice_notes.update_one(
            {"voice_note_id": voice_note_id},
            {"$set": {
                "status": VoiceNoteStatus.FAILED.value,
                "error_message": str(e),
                "updated_at": datetime.utcnow()
            }}
        )


@router.post(
    "/upload",
    response_model=SingleResponse[VoiceNoteResponse],
    summary="Upload a voice note"
)
async def upload_voice_note(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    job_id: str = Form(...),
    appointment_id: Optional[str] = Form(None),
    duration_seconds: int = Form(0),
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Upload a voice note for a job.
    Automatically starts transcription and summarization in the background.
    """
    # Validate file type
    allowed_types = ["audio/m4a", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_FILE_TYPE",
                "message": f"Invalid file type: {file.content_type}. Allowed: m4a, mp3, wav"
            }
        )

    # Validate file size (max 25MB for Whisper)
    max_size = 25 * 1024 * 1024
    file_content = await file.read()
    if len(file_content) > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "FILE_TOO_LARGE",
                "message": "File size exceeds 25MB limit"
            }
        )

    # Generate unique filename
    file_ext = os.path.splitext(file.filename or "audio.m4a")[1] or ".m4a"
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    # Save file
    with open(file_path, "wb") as f:
        f.write(file_content)

    # Create voice note record
    voice_note = VoiceNote(
        business_id=ctx.business_id,
        job_id=job_id,
        tech_id=current_user.user_id,
        appointment_id=appointment_id,
        audio_url=file_path,
        audio_filename=unique_filename,
        duration_seconds=duration_seconds,
        file_size_bytes=len(file_content),
        mime_type=file.content_type or "audio/m4a",
        status=VoiceNoteStatus.UPLOADED
    )

    await db.voice_notes.insert_one(voice_note.model_dump())

    # Start background processing
    background_tasks.add_task(
        process_voice_note,
        voice_note.voice_note_id,
        ctx.business_id,
        db
    )

    return SingleResponse(data=VoiceNoteResponse(**voice_note.model_dump()))


@router.get(
    "",
    response_model=PaginatedResponse[VoiceNoteResponse],
    summary="List voice notes"
)
async def list_voice_notes(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    job_id: Optional[str] = None,
    tech_id: Optional[str] = None,
    status_filter: Optional[VoiceNoteStatus] = Query(None, alias="status"),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """List voice notes for the business"""
    query = ctx.filter_query({"deleted_at": None})

    if job_id:
        query["job_id"] = job_id
    if tech_id:
        query["tech_id"] = tech_id
    if status_filter:
        query["status"] = status_filter.value

    total = await db.voice_notes.count_documents(query)

    notes = await db.voice_notes.find(query).sort(
        "created_at", -1
    ).skip((page - 1) * per_page).limit(per_page).to_list(length=per_page)

    meta = create_pagination_meta(total, page, per_page)
    return PaginatedResponse(
        data=[VoiceNoteResponse(**n) for n in notes],
        meta=meta
    )


@router.get(
    "/{voice_note_id}",
    response_model=SingleResponse[VoiceNoteResponse],
    summary="Get voice note by ID"
)
async def get_voice_note(
    voice_note_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get a specific voice note"""
    note = await db.voice_notes.find_one(ctx.filter_query({
        "voice_note_id": voice_note_id,
        "deleted_at": None
    }))

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "VOICE_NOTE_NOT_FOUND", "message": "Voice note not found"}
        )

    return SingleResponse(data=VoiceNoteResponse(**note))


@router.post(
    "/{voice_note_id}/reprocess",
    response_model=MessageResponse,
    summary="Reprocess a failed voice note"
)
async def reprocess_voice_note(
    voice_note_id: str,
    background_tasks: BackgroundTasks,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Retry processing a failed voice note"""
    note = await db.voice_notes.find_one(ctx.filter_query({
        "voice_note_id": voice_note_id,
        "deleted_at": None
    }))

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "VOICE_NOTE_NOT_FOUND", "message": "Voice note not found"}
        )

    if note["status"] not in [VoiceNoteStatus.FAILED.value, VoiceNoteStatus.UPLOADED.value]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_STATUS", "message": "Voice note is already processed or processing"}
        )

    # Reset status and start processing
    await db.voice_notes.update_one(
        {"voice_note_id": voice_note_id},
        {"$set": {
            "status": VoiceNoteStatus.UPLOADED.value,
            "error_message": None,
            "updated_at": datetime.utcnow()
        }}
    )

    background_tasks.add_task(
        process_voice_note,
        voice_note_id,
        ctx.business_id,
        db
    )

    return MessageResponse(message="Voice note reprocessing started")


@router.put(
    "/{voice_note_id}/summary",
    response_model=SingleResponse[VoiceNoteResponse],
    summary="Update/edit voice note summary"
)
async def update_voice_note_summary(
    voice_note_id: str,
    update: VoiceNoteUpdate,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Edit the AI-generated summary"""
    note = await db.voice_notes.find_one(ctx.filter_query({
        "voice_note_id": voice_note_id,
        "deleted_at": None
    }))

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "VOICE_NOTE_NOT_FOUND", "message": "Voice note not found"}
        )

    update_data = {
        "updated_at": datetime.utcnow()
    }

    if update.summary_edited is not None:
        update_data["summary_edited"] = update.summary_edited

    await db.voice_notes.update_one(
        {"voice_note_id": voice_note_id},
        {"$set": update_data}
    )

    updated = await db.voice_notes.find_one({"voice_note_id": voice_note_id})
    return SingleResponse(data=VoiceNoteResponse(**updated))


@router.post(
    "/{voice_note_id}/approve",
    response_model=SingleResponse[VoiceNoteResponse],
    summary="Approve voice note summary"
)
async def approve_voice_note(
    voice_note_id: str,
    edited_summary: Optional[str] = None,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Approve the summary (optionally with edits) and apply to job"""
    note = await db.voice_notes.find_one(ctx.filter_query({
        "voice_note_id": voice_note_id,
        "deleted_at": None
    }))

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "VOICE_NOTE_NOT_FOUND", "message": "Voice note not found"}
        )

    if note["status"] != VoiceNoteStatus.COMPLETE.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "NOT_READY", "message": "Voice note processing not complete"}
        )

    # Update voice note as approved
    update_data = {
        "summary_approved": True,
        "approved_at": datetime.utcnow(),
        "approved_by": current_user.user_id,
        "updated_at": datetime.utcnow()
    }

    if edited_summary:
        update_data["summary_edited"] = edited_summary

    await db.voice_notes.update_one(
        {"voice_note_id": voice_note_id},
        {"$set": update_data}
    )

    # Get the final summary
    final_summary = edited_summary or note.get("summary_edited") or note.get("summary")

    # Update the related job with completion notes
    if note.get("job_id") and final_summary:
        await db.hvac_quotes.update_one(
            {"quote_id": note["job_id"]},
            {"$set": {
                "completion_notes": final_summary,
                "updated_at": datetime.utcnow()
            }}
        )

        # Also update appointment if linked
        if note.get("appointment_id"):
            await db.appointments.update_one(
                {"appointment_id": note["appointment_id"]},
                {"$set": {
                    "completion_notes": final_summary,
                    "updated_at": datetime.utcnow()
                }}
            )

    updated = await db.voice_notes.find_one({"voice_note_id": voice_note_id})
    return SingleResponse(data=VoiceNoteResponse(**updated))


@router.delete(
    "/{voice_note_id}",
    response_model=MessageResponse,
    summary="Delete a voice note"
)
async def delete_voice_note(
    voice_note_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Soft delete a voice note"""
    note = await db.voice_notes.find_one(ctx.filter_query({
        "voice_note_id": voice_note_id,
        "deleted_at": None
    }))

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "VOICE_NOTE_NOT_FOUND", "message": "Voice note not found"}
        )

    await db.voice_notes.update_one(
        {"voice_note_id": voice_note_id},
        {"$set": {
            "deleted_at": datetime.utcnow(),
            "deleted_by": current_user.user_id
        }}
    )

    return MessageResponse(message="Voice note deleted")


@router.get(
    "/job/{job_id}",
    response_model=PaginatedResponse[VoiceNoteResponse],
    summary="Get voice notes for a job"
)
async def get_voice_notes_for_job(
    job_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get all voice notes associated with a job"""
    notes = await db.voice_notes.find(ctx.filter_query({
        "job_id": job_id,
        "deleted_at": None
    })).sort("created_at", -1).to_list(length=50)

    meta = create_pagination_meta(len(notes), 1, 50)
    return PaginatedResponse(
        data=[VoiceNoteResponse(**n) for n in notes],
        meta=meta
    )
