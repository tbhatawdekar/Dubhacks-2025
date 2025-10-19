from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import ALLOWED_ORIGINS
from .routers.transcribe import router as transcribe_router
from .routers.summarize import router as summarize_router
from .routers.analyze_video import router as analyze_router
from .routers.test_vision import router as test_vision_router
from dotenv import load_dotenv
import os

# load env once at startup
load_dotenv()
print("Twelve Labs Key Loaded:", bool(os.getenv("TL_API_KEY"))) # sanity check

app = FastAPI(
    title="Smart Interview Coach",
    description="A FastAPI application",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS or ["*"],  # In production, specify your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(transcribe_router, prefix="/api")
app.include_router(summarize_router, prefix="/api")
app.include_router(analyze_router,   prefix="/api")
app.include_router(test_vision_router, prefix="/api")


@app.get("/health")
def health():
    return {"ok": True}