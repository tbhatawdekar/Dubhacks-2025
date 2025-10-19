from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import ALLOWED_ORIGINS
from .routers.transcribe import router as transcribe_router
from .routers.summarize import router as summarize_router
from .routers.database import router as database_router

app = FastAPI(
    title="Smart Interview Coach",
    description="A FastAPI application  ",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(transcribe_router, prefix="/api")
app.include_router(summarize_router, prefix="/api")
app.include_router(database_router, prefix="/api")

@app.get("/health")
def health():
    return {"ok": True}