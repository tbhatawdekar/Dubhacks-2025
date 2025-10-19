# backend/routers/analyze_video.py
"""
Route: /api/analyze_video
Runs the same pipeline as /test_vision but returns the raw analysis
without summary formatting — useful for downstream processing.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from backend.services.vision_pipeline import run_full_pipeline

router = APIRouter(tags=["analyze_video"])

class AnalyzeRequest(BaseModel):
    presigned_url: str
    max_segments: Optional[int] = Field(default=None, ge=1, le=50)
    fps: Optional[int] = Field(default=2, ge=1, le=10)

@router.post("/analyze_video")
def analyze_video(req: AnalyzeRequest):
    try:
        return run_full_pipeline(
            presigned_url=req.presigned_url,
            max_segments=req.max_segments,
            fps=req.fps or 2
        )
    except Exception as e:
        raise HTTPException(500, f"analyze_video failed: {e}")