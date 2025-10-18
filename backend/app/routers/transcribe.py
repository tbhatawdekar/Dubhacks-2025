from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from openai import OpenAI
from ..config import OPENAI_API_KEY

router = APIRouter(tags=["transcribe"])

client = OpenAI(api_key=OPENAI_API_KEY)

ALLOWED_TYPES = {
    "audio/webm", "audio/wav", "audio/m4a", "audio/x-m4a",
    "audio/mp3", "audio/mpeg", "audio/mpga",
    "audio/mp4", "video/mp4", "audio/aac", "audio/x-wav"
}

@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...), model: str | None = None):
    if not OPENAI_API_KEY:
        raise HTTPException(500, "Missing OPENAI_API_KEY. Check your .env or environment.")

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, f"Unsupported content type: {file.content_type}")

    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "File too large (>25MB). Please compress or shorten the audio.")

    use_model = "gpt-4o-mini-transcribe"  # upgrade to gpt-4o-transcribe if needed

    try:
        resp = client.audio.transcriptions.create(
            model=use_model,
            file=(file.filename or "audio", data, file.content_type or "application/octet-stream"),
            response_format="text",   # plain transcript string
        )
        transcript = str(resp).strip()
    except Exception as e:
        raise HTTPException(502, f"Transcription error: {e}")

    return JSONResponse({"model": use_model, "transcript": transcript})