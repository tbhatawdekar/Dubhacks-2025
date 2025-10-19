"""
backend/services/vision_pipeline.py

Full vision analysis pipeline for Smart Interview Coach.
Performs:
  1. TwelveLabs video analysis (shots/actions)
  2. Frame sampling using OpenCV
  3. Facial metrics via MediaPipe FaceMesh
  4. Posture & gesture metrics via BlazePose
  5. Aggregation of results into summary statistics

All metrics are returned as JSON for use by the frontend or Bedrock coach.
"""

import os, io, json, time, tempfile, urllib.request
from typing import List, Dict, Tuple, Iterable, Optional

import cv2
import numpy as np
import mediapipe as mp
from math import atan2, degrees

from twelvelabs import TwelveLabs

# ---------- TwelveLabs Setup ----------
TL = TwelveLabs(api_key=os.getenv("TL_API_KEY"))
_PEGASUS_ENGINE = "pegasus-1.2"  # choose a valid Analyze-capable engine

# ---------- TwelveLabs helper functions ----------
def tl_create_index_once(name="dubhacks-index") -> str:
    """Creates or reuses an existing TwelveLabs index."""
    try:
        for idx in TL.index.list():
            if idx.name == name:
                return idx.id
        idx = TL.index.create(name=name, engine_id=_PEGASUS_ENGINE)
        return idx.id
    except Exception as e:
        raise RuntimeError(f"TL index error: {e}")

def tl_add_video_from_presigned(index_id: str, presigned_url: str) -> str:
    """Add a video to the TwelveLabs index using a presigned S3 URL."""
    try:
        video = TL.video.add(index_id=index_id, video_url=presigned_url)
        return video.id
    except Exception as e:
        raise RuntimeError(f"TL add video failed: {e}")

def tl_wait_until_ready(video_id: str, timeout_sec=1200) -> None:
    """Poll TwelveLabs until the video is processed and ready."""
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
    """Trigger the 'Analyze' job on TwelveLabs and wait for completion."""
    job = TL.analyze.create(
        video_id=video_id,
        features=["shots", "actions", "objects", "captions", "ocr", "logos"]
    )
    while True:
        r = TL.analyze.get(job.id)
        if r.status == "ready":
            return r.result
        if r.status == "failed":
            raise RuntimeError("TwelveLabs Analyze failed")
        time.sleep(3)

# ---------- Segment selection & frame sampling ----------
def segments_from_analysis(analysis: Dict, min_len_s: float = 2.0) -> List[Tuple[float, float, str]]:
    """
    Extract shot/action segments from TwelveLabs analysis output.
    Returns list of tuples: (start_time, end_time, label)
    """
    segs: List[Tuple[float, float, str]] = []
    for s in analysis.get("shots", []):
        st, ed = float(s["start"]), float(s["end"])
        if ed - st >= min_len_s:
            segs.append((st, ed, "shot"))
    for a in analysis.get("actions", []):
        st, ed = float(a["start"]), float(a["end"])
        if ed - st >= min_len_s:
            label = a.get("label", "action")
            segs.append((st, ed, f"action:{label}"))
    segs.sort(key=lambda x: x[0])
    return segs[:20]

def iter_frames_in_segments(video_path: str, segments: List[Tuple[float, float, str]], fps: int = 2) -> Iterable[Tuple[float, np.ndarray, str]]:
    """
    Iterates over frames sampled within each segment using OpenCV.
    Yields (timestamp_sec, frame, segment_label).
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError("Could not open video")

    native_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(1, int(round(native_fps / fps)))  # step between sampled frames

    for (st, ed, lab) in segments:
        cap.set(cv2.CAP_PROP_POS_MSEC, st * 1000.0)
        while True:
            pos_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
            if pos_ms / 1000.0 > ed:
                break
            ok = cap.grab()
            if not ok:
                break
            frame_idx = int(cap.get(cv2.CAP_PROP_POS_FRAMES))
            if frame_idx % step == 0:
                _, frame = cap.retrieve()
                if frame is not None:
                    yield (pos_ms / 1000.0, frame, lab)
    cap.release()

# ---------- MediaPipe Setup ----------
# Face detection + mesh for facial metrics
mp_face = mp.solutions.face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.6)
mp_mesh = mp.solutions.face_mesh.FaceMesh(static_image_mode=True, refine_landmarks=True)

# BlazePose for body posture/gesture
mp_pose = mp.solutions.pose.Pose(
    static_image_mode=True,
    model_complexity=1,
    enable_segmentation=False,
    min_detection_confidence=0.6
)

# Facial landmark indices
LIP_CORNERS = (61, 291)
LEFT_EYE = (159, 145, 33, 133)
RIGHT_EYE = (386, 374, 263, 362)
NOSE_TIP = 1
EYE_OUTER = (33, 263)
MOUTH_CORNERS = (61, 291)

# Pose landmark indices
LMS = {"L_SH": 11, "R_SH": 12, "L_HP": 23, "R_HP": 24, "L_WR": 15, "R_WR": 16}

# ---------- Facial helper functions ----------
def eye_aspect_ratio(pts) -> float:
    """Compute Eye Aspect Ratio (EAR) from 4 keypoints of one eye."""
    v = np.linalg.norm(pts[0] - pts[1])  # vertical distance
    h = np.linalg.norm(pts[2] - pts[3]) + 1e-6  # horizontal distance
    return float(v / h)

def head_pose_ypr(lm, w, h) -> Optional[Tuple[float, float, float]]:
    """Estimate head yaw, pitch, roll from a small set of facial landmarks."""
    idx = [NOSE_TIP, EYE_OUTER[0], EYE_OUTER[1], MOUTH_CORNERS[0], MOUTH_CORNERS[1]]
    try:
        pts2d = np.array([[lm[i].x * w, lm[i].y * h] for i in idx], dtype=np.float32)
    except Exception:
        return None
    pts3d = np.array([
        [0.0, 0.0, 0.0],
        [-30, -30, -30],
        [30, -30, -30],
        [-20, 30, -20],
        [20, 30, -20],
    ], dtype=np.float32)
    cam = np.array([[w, 0, w / 2], [0, w, h / 2], [0, 0, 1]], dtype=np.float32)
    ok, rvec, _ = cv2.solvePnP(pts3d, pts2d, cam, None, flags=cv2.SOLVEPNP_ITERATIVE)
    if not ok:
        return None
    rot, _ = cv2.Rodrigues(rvec)
    yaw = np.degrees(np.arctan2(rot[1, 0], rot[0, 0]))
    pitch = np.degrees(np.arcsin(-rot[2, 0]))
    roll = np.degrees(np.arctan2(rot[2, 1], rot[2, 2]))
    return float(yaw), float(pitch), float(roll)

# ---------- Pose helper functions ----------
def _pt(pl, idx, w, h):
    """Convert normalized pose landmark to pixel coordinates."""
    p = pl[idx]
    return np.array([p.x * w, p.y * h], dtype=np.float32)

def _mid(a, b): return (a + b) / 2.0

def angle_to_vertical(vec_xy):
    """Return angle in degrees between a vector and vertical axis (0° = upright)."""
    vx, vy = float(vec_xy[0]), float(vec_xy[1])
    return abs(degrees(atan2(vx, -vy)))

def norm_dist(a, b, ref): 
    """Distance between points a and b normalized by a reference length."""
    return float(np.linalg.norm(a - b) / (ref + 1e-6))

# ---------- Frame analysis ----------
def analyze_frame(frame_bgr) -> Optional[Dict]:
    """
    Compute facial + body metrics from a single frame.
    Returns a dictionary of metrics or None if no face detected.
    """
    h, w = frame_bgr.shape[:2]
    y = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2YUV)[:, :, 0]
    luma = float(y.mean())

    # --- Face detection ---
    det = mp_face.process(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)).detections
    if not det:
        return None
    bb = det[0].location_data.relative_bounding_box
    area_ratio = float((bb.width * w) * (bb.height * h) / (w * h))

    # --- Face mesh for detailed features ---
    mesh = mp_mesh.process(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
    if not mesh.multi_face_landmarks:
        return None
    lm = mesh.multi_face_landmarks[0].landmark

    # Eye blink metric
    L = np.array([[lm[i].x * w, lm[i].y * h] for i in LEFT_EYE], dtype=np.float32)
    R = np.array([[lm[i].x * w, lm[i].y * h] for i in RIGHT_EYE], dtype=np.float32)
    ear = (eye_aspect_ratio(L) + eye_aspect_ratio(R)) / 2.0

    # Smile metric (mouth width / face width)
    pL = np.array([lm[LIP_CORNERS[0]].x * w, lm[LIP_CORNERS[0]].y * h])
    pR = np.array([lm[LIP_CORNERS[1]].x * w, lm[LIP_CORNERS[1]].y * h])
    mouth_w = np.linalg.norm(pL - pR)
    face_w = bb.width * w + 1e-6
    smile_idx = float(mouth_w / face_w)

    # Head pose
    ypr = head_pose_ypr(lm, w, h)
    if not ypr:
        return None
    yaw, pitch, roll = ypr

    # --- BlazePose body posture metrics ---
    pose_res = mp_pose.process(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
    torso_lean_deg = shoulder_level_diff = None
    hands_visible = hands_near_face = arms_crossed = False

    if pose_res.pose_landmarks:
        pl = pose_res.pose_landmarks.landmark
        L_sh = _pt(pl, LMS["L_SH"], w, h); R_sh = _pt(pl, LMS["R_SH"], w, h)
        L_hp = _pt(pl, LMS["L_HP"], w, h); R_hp = _pt(pl, LMS["R_HP"], w, h)
        L_wr = _pt(pl, LMS["L_WR"], w, h); R_wr = _pt(pl, LMS["R_WR"], w, h)
        mid_sh = _mid(L_sh, R_sh); mid_hp = _mid(L_hp, R_hp)
        shoulder_w = float(np.linalg.norm(L_sh - R_sh))

        # Posture lean: angle between torso vector and vertical axis
        torso_lean_deg = angle_to_vertical(mid_sh - mid_hp)

        # Shoulder height asymmetry
        shoulder_level_diff = float(abs(L_sh[1] - R_sh[1]) / (shoulder_w + 1e-6))

        # Hand visibility (within frame)
        in_frame = lambda p: 0 <= p[0] <= w and 0 <= p[1] <= h
        hands_visible = bool(in_frame(L_wr) or in_frame(R_wr))

        # Hands near face (distance to face center < 0.6 * face width)
        fx = bb.xmin * w; fy = bb.ymin * h; fw = bb.width * w; fh = bb.height * h
        fcenter = np.array([fx + fw / 2.0, fy + fh / 2.0], dtype=np.float32)
        hands_near_face = (norm_dist(L_wr, fcenter, fw) < 0.6) or (norm_dist(R_wr, fcenter, fw) < 0.6)

        # Arms crossed (both wrists across body midline and below shoulders)
        mid_x = mid_sh[0]
        below_L = L_wr[1] > min(L_sh[1], R_sh[1]); below_R = R_wr[1] > min(L_sh[1], R_sh[1])
        arms_crossed = (L_wr[0] > mid_x and below_L) and (R_wr[0] < mid_x and below_R)

    # Return all metrics
    return {
        "ear": float(ear),
        "smile_idx": smile_idx,
        "yaw": yaw, "pitch": pitch, "roll": roll,
        "bbox_area": area_ratio,
        "luma": luma,
        # Posture metrics
        "torso_lean_deg": float(torso_lean_deg) if torso_lean_deg is not None else None,
        "shoulder_level_diff": float(shoulder_level_diff) if shoulder_level_diff is not None else None,
        "hands_visible": bool(hands_visible),
        "hands_near_face": bool(hands_near_face),
        "arms_crossed": bool(arms_crossed),
    }

# ---------- Aggregation ----------
def aggregate(samples: List[Dict]) -> Dict:
    """Summarize metrics over all sampled frames."""
    if not samples:
        return {"frames": 0}

    arr = lambda k: np.array([s[k] for s in samples if (k in s and s[k] is not None)], dtype=np.float32)
    ear = arr("ear"); yaw = arr("yaw"); pitch = arr("pitch")

    # Basic facial aggregates
    eye_contact = float(np.mean((np.abs(yaw) <= 10) & (np.abs(pitch) <= 10))) if (yaw.size and pitch.size) else 0.0
    blinks = int((ear < 0.18).sum()) if ear.size else 0

    # BlazePose aggregates
    torso = arr("torso_lean_deg")
    shdiff = arr("shoulder_level_diff")
    hands_vis = np.array([1.0 if s.get("hands_visible") else 0.0 for s in samples], dtype=np.float32)
    hands_near = np.array([1.0 if s.get("hands_near_face") else 0.0 for s in samples], dtype=np.float32)
    arms_x = np.array([1.0 if s.get("arms_crossed") else 0.0 for s in samples], dtype=np.float32)

    return {
        "frames": len(samples),
        "ear_median": float(np.median(ear)) if ear.size else 0.0,
        "blink_count": blinks,
        "smile_median": float(np.median(arr("smile_idx"))) if arr("smile_idx").size else 0.0,
        "eye_contact_pct": eye_contact,
        "head_movement_std": float(np.std(np.stack([yaw, pitch], axis=1))) if (yaw.size and pitch.size) else 0.0,
        "framing_avg": float(np.mean(arr("bbox_area"))) if arr("bbox_area").size else 0.0,
        "lighting_mean": float(np.mean(arr("luma"))) if arr("luma").size else 0.0,
        # Posture summaries
        "torso_lean_median_deg": float(np.median(torso)) if torso.size else 0.0,
        "shoulder_level_diff_mean": float(np.mean(shdiff)) if shdiff.size else 0.0,
        "hands_visible_pct": float(np.mean(hands_vis)) if hands_vis.size else 0.0,
        "hands_near_face_pct": float(np.mean(hands_near)) if hands_near.size else 0.0,
        "arms_crossed_pct": float(np.mean(arms_x)) if arms_x.size else 0.0,
    }

# ---------- Orchestrator ----------
def download_to_tmp(presigned_url: str) -> str:
    """Download video from presigned S3 URL to a local temporary file."""
    fd, path = tempfile.mkstemp(suffix=".mp4"); os.close(fd)
    with urllib.request.urlopen(presigned_url) as r, open(path, "wb") as f:
        f.write(r.read())
    return path

def run_full_pipeline(presigned_url: str, *, max_segments: Optional[int] = None, fps: int = 2) -> Dict:
    """
    Full orchestrator:
      1. Send video to TwelveLabs
      2. Wait for analysis (shots/actions)
      3. Sample frames
      4. Compute face + posture metrics
      5. Return aggregated stats
    """
    index_id = tl_create_index_once()
    video_id = tl_add_video_from_presigned(index_id, presigned_url)
    tl_wait_until_ready(video_id)
    analysis = tl_analyze(video_id)

    segs = segments_from_analysis(analysis)
    if max_segments:
        segs = segs[:max_segments]

    # Download video locally for frame sampling
    local_path = download_to_tmp(presigned_url)

    samples = []
    timeline = []

    # ---- Main frame sampling loop ----
    for (st, ed, lab) in segs:
        # Iterate over frames at the specified fps within this segment
        for t, frame, _ in iter_frames_in_segments(local_path, [(st, ed, lab)], fps=fps):
            m = analyze_frame(frame)  # Run face + pose analysis
            if m:
                m["t"] = float(t)      # Keep timestamp for debugging
                m["label"] = lab       # Keep segment label
                samples.append(m)

        # Record which segments we actually analyzed (even if no frames had detections)
        timeline.append({
            "t_start": st,
            "t_end": ed,
            "label": lab
        })

    # ---- Clean up the temporary video file ----
    try:
        os.remove(local_path)
    except Exception:
        pass

    # ---- Return structured output ----
    return {
        "twelvelabs": {
            # keep only relevant keys from the full TL analysis
            "raw": {k: v for k, v in analysis.items() if k in ["shots", "actions", "captions", "ocr", "logos"]},
            "segments_used": segs
        },
        "face_metrics": aggregate(samples),
        "timeline": timeline,
        "samples_count": len(samples)
    }