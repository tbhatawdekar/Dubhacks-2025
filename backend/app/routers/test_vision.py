# backend/routers/test_vision.py
"""
Route: /api/test_vision
Runs the full vision pipeline on a presigned video URL and returns
summary metrics + raw debug info for frontend visualization.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import os

# from ...services.vision_pipeline import run_full_pipeline
from backend.services.vision_pipeline import run_full_pipeline


router = APIRouter(tags=["test_vision"])

# --- Request body model ---
class TestVisionRequest(BaseModel):
    presigned_url: str = Field(..., description="Presigned S3 URL to the video (or public HTTPS URL)")
    max_segments: Optional[int] = Field(default=None, ge=1, le=50, description="Maximum segments to analyze")
    fps: Optional[int] = Field(default=2, ge=1, le=10, description="Sampling FPS for frame analysis")

# --- Health check route ---
@router.get("/test_vision/ping")
def ping():
    return {"ok": True, "tl_key_loaded": bool(os.getenv("TL_API_KEY"))}

# --- Main vision route ---
@router.post("/test_vision")
def test_vision(req: TestVisionRequest):
    try:
        # Pass knobs through to the pipeline
        result = run_full_pipeline(
            presigned_url=req.presigned_url,
            max_segments=req.max_segments,
            fps=req.fps or 2
        )
        return {
            "ok": True,
            "summary": result.get("face_metrics", {}),
            "timeline_used": result.get("timeline", []),
            "twelvelabs_keys": list((result.get("twelvelabs", {}).get("raw", {}) or {}).keys()),
            "raw": result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"test_vision failed: {e}")
