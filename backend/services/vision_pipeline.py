# backend/services/vision_pipeline.py
import os, io, json, time, tempfile, urllib.request
from typing import List, Dict, Tuple, Iterable, Optional

import cv2
import numpy as np
import mediapipe as mp

from twelvelabs import TwelveLabs

TL = TwelveLabs(api_key=os.getenv("TL_API_KEY"))
_PEGASUS_ENGINE = "pegasus-1.2"  # Analyze-capable engine

# ---------- TwelveLabs helpers ----------
def tl_create_index_once(name="dubhacks-index") -> str:
    for idx in TL.index.list():
        if idx.name == name:
            return idx.id
    idx = TL.index.create(name=name, engine_id=_PEGASUS_ENGINE)
    return idx.id

def tl_add_video_from_presigned(index_id: str, presigned_url: str) -> str:
    video = TL.video.add(index_id=index_id, video_url=presigned_url)
    return video.id

def tl_wait_until_ready(video_id: str, timeout_sec=1200) -> None:
    start = time.time()
    while time.time() - start < timeout_sec:
        v = TL.video.get(video_id)
        if v.status == "ready":
            return
        if v.status == "failed":
            raise RuntimeError("TwelveLabs video indexing failed")
        time.sleep(4)
    raise TimeoutError("TwelveLabs indexing took too long")

def tl_analyze(video_id: str) -> Dict:
    job = TL.analyze.create(
        video_id=video_id,
        features=["shots","actions","objects","captions","ocr","logos"]
    )
    while True:
        r = TL.analyze.get(job.id)
        if r.status == "ready":
            return r.result
        if r.status == "failed":
            raise RuntimeError("TwelveLabs Analyze failed")
        time.sleep(3)

# ---------- Segment selection & frame sampling ----------
def segments_from_analysis(analysis: Dict, min_len_s: float = 2.0) -> List[Tuple[float,float,str]]:
    segs: List[Tuple[float,float,str]] = []
    for s in analysis.get("shots", []):
        st, ed = float(s["start"]), float(s["end"])
        if ed - st >= min_len_s:
            segs.append((st, ed, "shot"))
    for a in analysis.get("actions", []):
        st, ed = float(a["start"]), float(a["end"])
        lab = a.get("label","action")
        if ed - st >= min_len_s:
            segs.append((st, ed, f"action:{lab}"))
    segs.sort(key=lambda x: x[0])
    return segs[:20]

def iter_frames_in_segments(video_path: str, segments: List[Tuple[float,float,str]], fps: int = 2) -> Iterable[Tuple[float, np.ndarray, str]]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError("Could not open video")
    native_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(1, int(round(native_fps / fps)))

    for (st, ed, lab) in segments:
        cap.set(cv2.CAP_PROP_POS_MSEC, st * 1000.0)
        while True:
            pos_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
            if pos_ms/1000.0 > ed:
                break
            ok = cap.grab()
            if not ok:
                break
            frame_idx = int(cap.get(cv2.CAP_PROP_POS_FRAMES))
            if frame_idx % step == 0:
                _, f = cap.retrieve()
                if f is not None:
                    yield (pos_ms/1000.0, f, lab)
    cap.release()

# ---------- Face/expression metrics (MediaPipe) ----------
mp_face = mp.solutions.face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.6)
mp_mesh = mp.solutions.face_mesh.FaceMesh(static_image_mode=True, refine_landmarks=True)

LIP_CORNERS = (61, 291)
LEFT_EYE = (159, 145, 33, 133)
RIGHT_EYE = (386, 374, 263, 362)
NOSE_TIP = 1
EYE_OUTER = (33, 263)
MOUTH_CORNERS = (61, 291)

def eye_aspect_ratio(pts) -> float:
    v = np.linalg.norm(pts[0] - pts[1])
    h = np.linalg.norm(pts[2] - pts[3]) + 1e-6
    return float(v/h)

def head_pose_ypr(lm, w, h) -> Optional[Tuple[float,float,float]]:
    idx = [NOSE_TIP, EYE_OUTER[0], EYE_OUTER[1], MOUTH_CORNERS[0], MOUTH_CORNERS[1]]
    try:
        pts2d = np.array([[lm[i].x*w, lm[i].y*h] for i in idx], dtype=np.float32)
    except Exception:
        return None
    pts3d = np.array([
        [0.0, 0.0, 0.0],
        [-30, -30, -30],
        [ 30, -30, -30],
        [-20,  30, -20],
        [ 20,  30, -20],
    ], dtype=np.float32)
    cam = np.array([[w,0,w/2],[0,w,h/2],[0,0,1]], dtype=np.float32)
    ok, rvec, _ = cv2.solvePnP(pts3d, pts2d, cam, None, flags=cv2.SOLVEPNP_ITERATIVE)
    if not ok:
        return None
    rot, _ = cv2.Rodrigues(rvec)
    yaw = np.degrees(np.arctan2(rot[1,0], rot[0,0]))
    pitch = np.degrees(np.arcsin(-rot[2,0]))
    roll = np.degrees(np.arctan2(rot[2,1], rot[2,2]))
    return float(yaw), float(pitch), float(roll)

def analyze_frame(frame_bgr) -> Optional[Dict]:
    h, w = frame_bgr.shape[:2]
    y = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2YUV)[:,:,0]
    luma = float(y.mean())
    det = mp_face.process(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)).detections
    if not det:
        return None
    bb = det[0].location_data.relative_bounding_box
    area_ratio = float((bb.width * w) * (bb.height * h) / (w*h))
    mesh = mp_mesh.process(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
    if not mesh.multi_face_landmarks:
        return None
    lm = mesh.multi_face_landmarks[0].landmark

    L = np.array([[lm[i].x*w, lm[i].y*h] for i in LEFT_EYE], dtype=np.float32)
    R = np.array([[lm[i].x*w, lm[i].y*h] for i in RIGHT_EYE], dtype=np.float32)
    ear = (eye_aspect_ratio(L) + eye_aspect_ratio(R)) / 2.0

    pL = np.array([lm[LIP_CORNERS[0]].x * w, lm[LIP_CORNERS[0]].y * h])
    pR = np.array([lm[LIP_CORNERS[1]].x * w, lm[LIP_CORNERS[1]].y * h])
    mouth_w = np.linalg.norm(pL - pR)
    face_w = bb.width * w + 1e-6
    smile_idx = float(mouth_w / face_w)

    ypr = head_pose_ypr(lm, w, h)
    if not ypr:
        return None
    yaw, pitch, roll = ypr

    return {
        "ear": float(ear),
        "smile_idx": smile_idx,
        "yaw": yaw, "pitch": pitch, "roll": roll,
        "bbox_area": area_ratio,
        "luma": luma
    }

def aggregate(samples: List[Dict]) -> Dict:
    if not samples:
        return {"frames": 0}
    arr = lambda k: np.array([s[k] for s in samples if k in s], dtype=np.float32)
    ear = arr("ear")
    yaw, pitch = arr("yaw"), arr("pitch")
    eye_contact = float(np.mean((np.abs(yaw) <= 10) & (np.abs(pitch) <= 10))) if yaw.size else 0.0
    blinks = int((ear < 0.18).sum()) if ear.size else 0
    return {
        "frames": len(samples),
        "ear_median": float(np.median(ear)) if ear.size else 0.0,
        "blink_count": blinks,
        "smile_median": float(np.median(arr("smile_idx"))) if arr("smile_idx").size else 0.0,
        "eye_contact_pct": eye_contact,
        "head_movement_std": float(np.std(np.stack([yaw, pitch], axis=1))) if yaw.size else 0.0,
        "framing_avg": float(np.mean(arr("bbox_area"))) if arr("bbox_area").size else 0.0,
        "lighting_mean": float(np.mean(arr("luma"))) if arr("luma").size else 0.0
    }

# ---------- Orchestrator ----------
def download_to_tmp(presigned_url: str) -> str:
    fd, path = tempfile.mkstemp(suffix=".mp4"); os.close(fd)
    with urllib.request.urlopen(presigned_url) as r, open(path, "wb") as f:
        f.write(r.read())
    return path

def run_full_pipeline(presigned_url: str) -> Dict:
    index_id = tl_create_index_once()
    video_id = tl_add_video_from_presigned(index_id, presigned_url)
    tl_wait_until_ready(video_id)
    analysis = tl_analyze(video_id)

    segs = segments_from_analysis(analysis)
    local_path = download_to_tmp(presigned_url)

    samples = []
    timeline = []
    for (st, ed, lab) in segs:
        for t, frame, _ in iter_frames_in_segments(local_path, [(st, ed, lab)], fps=2):
            m = analyze_frame(frame)
            if m:
                m["t"] = float(t)
                m["label"] = lab
                samples.append(m)
        timeline.append({"t_start": st, "t_end": ed, "label": lab})

    try: os.remove(local_path)
    except Exception: pass

    return {
        "twelvelabs": {
            "raw": {k:v for k,v in analysis.items() if k in ["shots","actions","captions","ocr","logos"]},
            "segments_used": segs
        },
        "face_metrics": aggregate(samples),
        "timeline": timeline,
        "samples_count": len(samples)
    }
