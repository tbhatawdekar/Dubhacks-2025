from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List
from openai import OpenAI
import os, re

from ..config import OPENAI_API_KEY

router = APIRouter(tags=["summarize"])
client = OpenAI(api_key=OPENAI_API_KEY)

# can update later:
FILLERS = ["um", "uh", "like", "you know", "kinda", "sorta", "actually", "basically", "literally", "i mean", "so"]
HEDGES  = ["maybe", "perhaps", "sort of", "kind of", "i think", "i guess", "probably", "possibly"]

def count_occurrences(text: str, phrases: List[str]) -> int:
    t = text.lower()
    count = 0
    for p in phrases:
        pat = r"\b" + re.escape(p) + r"\b" if " " not in p else re.escape(p)
        count += len(re.findall(pat, t))
    return count

class SummarizeRequest(BaseModel):
    transcript: str = Field(..., min_length=5)

class SummarizeResponse(BaseModel):
    main_points: List[str]
    feedback: List[str]
    metrics: dict | None = None

SYSTEM_PROMPT = (
    "You are a concise interview coach. Read the transcript and return:\n"
    "1) 3–5 action-focused bullets of the main points (<=18 words each).\n"
    "2) 2–3 constructive, specific feedback bullets (no timestamps; coach-like tone).\n"
    "Return ONLY valid JSON with keys: main_points, feedback."
)

@router.post("/summarize", response_model=SummarizeResponse)
def summarize(req: SummarizeRequest):
    if not OPENAI_API_KEY:
        raise HTTPException(500, "Missing OPENAI_API_KEY")

    transcript = req.transcript.strip()
    if len(transcript) < 5:
        raise HTTPException(400, "Transcript too short.")

    filler_count = count_occurrences(transcript, FILLERS)
    hedge_count  = count_occurrences(transcript, HEDGES)

    # model returns JSON
    user_prompt = (
        "Transcript:\n\"\"\"\n" + transcript + "\n\"\"\"\n\n"
        "Respond in JSON exactly like:\n"
        "{\n"
        "  \"main_points\": [\"point 1\", \"point 2\", \"point 3\"],\n"
        "  \"feedback\": [\"tip 1\", \"tip 2\"]\n"
        "}\n"
    )

    try:
        comp = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.2,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ]
        )
        raw = comp.choices[0].message.content
    except Exception as e:
        raise HTTPException(502, f"LLM error: {e}")

    import json, re as _re
    json_text = _re.sub(r"^```json|```$", "", raw.strip()).strip()
    try:
        parsed = json.loads(json_text)
    except Exception:
        parsed = {"main_points": [json_text], "feedback": []}

    parsed["metrics"] = {"filler_count": filler_count, "hedge_count": hedge_count}
    return SummarizeResponse(**parsed)