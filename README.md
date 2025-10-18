# DubHacks 2025 🚀

This is our hackathon project for DubHacks 2025.  
## Team
- Trisha Bhatawdekar
- Neha Dubhashi
- Misha Nivota

## Tech Stack
- [e.g. React, Node.js, Python, etc.]

## Core system

- The user sits (via webcam + mic) and conducts a mock interview — either a pre‑set question bank (e.g., “Tell me about a time you…”, “Why do you want this role?”) or an open prompt.

- Using audio ML you analyze: tone of voice, filler words (“um”, “uh”), pacing, volume variation, clarity of speech, confidence cues, maybe signs of nervousness (pauses, hesitation).

- Using visual ML you analyze: face (eye contact, head nodding/shaking, micro‑expressions, smiling), body posture (leaning in/out), gesture frequency, facial orientation (looking at camera vs away), blink rate maybe.

- Combine these into descriptive feedback: e.g., “You used filler words 12 times in 90 seconds”, “You maintained eye contact ~70% of the time”, “Your voice volume dipped significantly in the last answer”, “Your posture is leaning back which may signal disengagement” etc.

- Then provide actionable suggestions: “Try to reduce filler words by pausing instead of “um” when thinking”, “Lean in slightly and keep shoulders square to camera”, “Increase vocal variety: you sounded quite flat through the middle”.

- Optionally, score the interview according to multiple axes: Confidence, Clarity, Conciseness, Engagement, Body Language. Provide benchmark/ranking vs peers.

- Provide history/dashboard: track user progress over multiple sessions, show improvements (e.g., filler words per minute dropped from 10 to 6, average eye contact from 50% to 75%, etc.).

- Offer variant modes: e.g., behavioral interview, technical interview (where you ask coding questions and they respond), role‑play with a virtual interviewer (simulate tough scenario).

- Optionally integrate language or accent support (help non‑native speakers improve clarity), or industry/domain specific (sales interviews vs engineering vs leadership).

- UI/UX design: simple webcam + mic record, playback with annotated timeline (show when filler word occurred, when gaze drifted, when posture changed). Provide transcripts of responses, highlight key phrases (maybe “impact‑oriented phrasing”, “STAR technique” compliance).


## Why it’s good / what problem it solves

- Many people are nervous about interviews and don’t have affordable or high‑quality coaching. A semi‑automated coach lowers barrier.

- Visual + audio feedback is hard to self‑get; recording yourself is okay but you may not catch your own body language or voice patterns.

- Helps quantify improvement and motivate practice (gamification, progress tracking).

- Could be used by students, job‑seekers, people switching careers, non‑native speakers.

- At hackathon scale you can build a prototype (web app + ML models) that has “wow” factor: see yourself on camera, get instant feedback, show improvements.

- Ties into current trends: video conferencing, remote hiring, AI/ML tools for personal development.

- Technical considerations / MVP scope for hackathon

- Choose one or two strong features to build: e.g., audio filler‑word detection + basic visual gaze/posture detection.

- Use existing pretrained models for face keypoints, head orientation, gesture recognition (OpenCV, MediaPipe, etc.). For audio, maybe use speech‑to‑text + count filler words, plus basic voice features (pitch, volume).


### For mock questions you can have a fixed set to keep it simple.
  - Build a front‑end web interface (React) or simple Node + WebRTC for webcam/mic capture.
  - Real‑time vs post‑recording: post‑recording is simpler for hackathon.
  - Use a dashboard with charts, scores, transcripts.
  - Make sure to cover privacy/consent (video + audio).
  - Prepare a crisp demo: show before/after improvement metric or a “bad vs good” session.
  - Optional: allow upload of previous session and compare side‑by‑side.