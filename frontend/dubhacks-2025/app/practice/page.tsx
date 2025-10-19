"use client";

import React, { useState, useRef, useEffect } from "react";
import InterviewQuestions from "../components/questions";
import styles from "../styles/practice.module.css";
import { transcribeAudio, summarizeTranscript } from "../utils/backendAPI";

import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

type AnalysisResponse = {
  main_points: string[];
  feedback: string[];
  metrics?: Record<string, unknown> | null;
};

// HUD state
type FaceStatus = {
  emotion: string;
  confidence: number; // 0..1
  top3: Array<{ label: string; score: number }>;
  leftOpen: number;
  rightOpen: number;
};

const Practice: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [question, setQuestion] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  const [isRecordingComplete, setIsRecordingComplete] = useState(false);
  const [chunks, setChunks] = useState<Blob[]>([]);
  const [transcript, setTranscript] = useState("this is the og transcript");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const [faceStatus, setFaceStatus] = useState<FaceStatus>({
    emotion: "—",
    confidence: 0,
    top3: [],
    leftOpen: 0,
    rightOpen: 0,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);

  const startRecording = async () => {
    setIsRecording(true);
    setIsRecordingComplete(false);
    setIsPaused(false);
    setChunks([]);
    chunksRef.current = [];
    setTranscript("");
    setAnalysis(null);
    setAnalysisLoading(false);

    // camera stream (audio + video)
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { width: 640, height: 480 },
    });
    streamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }

    await ensureFaceLandmarker();
    startFaceLoop();

    // audio-only MediaRecorder
    const audioStream = new MediaStream(stream.getAudioTracks());
    mediaRecorderRef.current = new MediaRecorder(audioStream, {
      mimeType: "audio/webm;codecs=opus",
    });

    mediaRecorderRef.current.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
        setChunks((prev) => [...prev, event.data]);
      }
    };

    mediaRecorderRef.current.start();
  };

  const pauseRecording = () => {
    if (!mediaRecorderRef.current) return;
    if (isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  };

  const rerecord = () => {
    mediaRecorderRef.current?.stop();
    stopFaceLoop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setIsRecording(false);
    setIsPaused(false);
    setChunks([]);
    chunksRef.current = [];
    setTranscript("");
    setFaceStatus({ emotion: "—", confidence: 0, top3: [], leftOpen: 0, rightOpen: 0 });
  };

  const stopRecording = async () => {
    setIsRecording(false);
    setIsRecordingComplete(true);

    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      const stopped = new Promise<void>((resolve) => {
        mr.addEventListener("stop", () => resolve(), { once: true });
      });
      mr.stop();
      await stopped;
    }

    stopFaceLoop();
    streamRef.current?.getTracks().forEach((track) => track.stop());

    // transcription flow
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    setLoading(true);

    try {
      const data = await transcribeAudio(blob);
      setTranscript(data.transcript);
      setLoading(false);

      // summarize
      setAnalysis(null);
      setAnalysisLoading(true);
      try {
        const summary = await summarizeTranscript(data.transcript);
        setAnalysis(summary);
      } catch (e) {
        console.error(e);
      } finally {
        setAnalysisLoading(false);
      }
    } catch (err) {
      console.error(err);
      alert("Service busy; please retry.");
      setLoading(false);
    }
  };

  async function ensureFaceLandmarker() {
    if (faceLandmarkerRef.current) return;
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
    );
    faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
    });
  }

  function startFaceLoop() {
    if (!videoRef.current || !canvasRef.current) return;
    const loop = () => {
      const fl = faceLandmarkerRef.current;
      const v = videoRef.current;
      const c = canvasRef.current;
      if (!fl || !v || !c) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const ts = performance.now();
      const res = fl.detectForVideo(v, ts);
      drawOverlay(c, v, res);

      // emotion + eyelids
      if (res?.faceBlendshapes?.[0]) {
        const b = toBlendshapeMap(res.faceBlendshapes[0].categories);
        const scores = emotionScores(b);
        const { leftOpen, rightOpen } = eyeOpenFromLandmarks(res);

        const sorted = Object.entries(scores)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([label, score]) => ({ label, score }));

        setFaceStatus({
          emotion: sorted[0]?.label ?? "neutral",
          confidence: sorted[0]?.score ?? 0,
          top3: sorted,
          leftOpen: round2(leftOpen),
          rightOpen: round2(rightOpen),
        });
      } else {
        setFaceStatus({ emotion: "—", confidence: 0, top3: [], leftOpen: 0, rightOpen: 0 });
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }

  function stopFaceLoop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }

  // cleanup
  useEffect(() => {
    return () => {
      stopFaceLoop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        {!isRecording && !isRecordingComplete && (
          <div className={styles.questionsStart}>
            <h2>Randomly select or choose an interview question</h2>
            <InterviewQuestions question={question} setQuestion={setQuestion} />
            <button className={styles.recordButton} onClick={startRecording}>
              Start Recording
            </button>
          </div>
        )}

        {isRecording && !isRecordingComplete && (
          <div>

            {/* FULL-BLEED CAMERA */}
            <div className={styles.cameraFullBleed}>
              <video ref={videoRef} className={styles.videoEl} muted />
              <canvas
                ref={canvasRef}
                width={640}
                height={480}
                className={styles.overlayCanvas}
              />

              {/* Question overlay (smaller, disappears as you scroll) */}
              {question && (
                <h2 className={styles.questionOverlay} title={question}>
                  {question}
                </h2>
              )}

              {/* Emotion HUD (bottom-left) */}
              <div className={styles.hudBox}>
                <div style={{ fontWeight: 700 }}>
                  {faceStatus.emotion.toUpperCase()} • {(faceStatus.confidence * 100).toFixed(0)}%
                </div>
                <div>👁 {faceStatus.leftOpen.toFixed(2)} / {faceStatus.rightOpen.toFixed(2)}</div>
                {faceStatus.top3?.length > 1 && (
                  <div style={{ marginTop: 6 }}>
                    {faceStatus.top3.map((t, i) => (
                      <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <div style={{ width: 70, textTransform: "capitalize" }}>{t.label}</div>
                        <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.2)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${t.score * 100}%`, height: "100%", background: "white" }} />
                        </div>
                        <div style={{ width: 36, textAlign: "right" }}>{Math.round(t.score * 100)}%</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Controls — NOW bottom-left, aligned to HUD */}
              <div className={styles.controlsBarLeft}>
                <button className={styles.recordButton} onClick={pauseRecording}>
                  {isPaused ? "Resume" : "Pause"}
                </button>
                <button className={styles.recordButton} onClick={stopRecording}>
                  Stop
                </button>
                <button className={styles.recordButton} onClick={rerecord}>
                  Rerecord
                </button>
              </div>

              {!isPaused && <p className={styles.recordingPill}>Recording...</p>}
            </div>

          </div>
        )}

        {isRecordingComplete && (
          <>
            <div className={styles.transcript}>
              <h3>Transcript</h3>
              {loading ? (
                <p>Loading transcript...</p>
              ) : (
                <div className={styles.transcriptText}>
                  {transcript ? <p>{transcript}</p> : <p><strong>00:01 Introduction</strong></p>}
                </div>
              )}
            </div>

            <div className={styles.analyticsSection}>
              <div className={styles.analyticsItems}>
                <h3>Analytics</h3>
                {analysisLoading ? (
                  <div className={styles.analyticsItem}>Analyzing...</div>
                ) : analysis ? (
                  <>
                    <div className={styles.analyticsItem}><strong>Main Points</strong></div>
                    <ul>
                      {analysis.main_points?.map((p, i) => (
                        <li key={`mp-${i}`}>{p}</li>
                      ))}
                    </ul>
                    <div className={styles.analyticsItem}><strong>Feedback</strong></div>
                    <ul>
                      {analysis.feedback?.map((f, i) => (
                        <li key={`fb-${i}`}>{f}</li>
                      ))}
                    </ul>
                    {analysis.metrics && (
                      <div className={styles.analyticsItem}>
                        <strong>Metrics</strong>
                        <ul>
                          {Object.entries(analysis.metrics).map(([k, v]) => (
                            <li key={k}>{k}: {String(v)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <div className={styles.analyticsItem}>No analysis yet.</div>
                )}
              </div>
            </div>

            <div>
              <button className={styles.recordButton} onClick={startRecording}>
                Start Recording
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Practice;

/* =================== helpers =================== */

function drawOverlay(canvas: HTMLCanvasElement, _video: HTMLVideoElement, res?: FaceLandmarkerResult) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!res?.faceLandmarks?.[0]) return;

  const pts = res.faceLandmarks[0];
  const idx = [33, 133, 362, 263, 61, 291]; // eye corners + mouth corners
  ctx.fillStyle = "#00e";
  for (const i of idx) {
    const x = pts[i].x * canvas.width;
    const y = pts[i].y * canvas.height;
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function toBlendshapeMap(cats: { categoryName: string; score: number }[]) {
  const m: Record<string, number> = {};
  for (const c of cats) m[c.categoryName] = c.score;
  return m;
}

// Multi-emotion scorer (heuristic)
function emotionScores(b: Record<string, number>) {
  const smile = avg(b["mouthSmileLeft"], b["mouthSmileRight"]);
  const frown = avg(b["mouthFrownLeft"], b["mouthFrownRight"]);
  const press = avg(b["mouthPressLeft"], b["mouthPressRight"]);
  const stretch = avg(b["mouthStretchLeft"], b["mouthStretchRight"]);
  const upperLipRaise = avg(b["mouthUpperUpLeft"], b["mouthUpperUpRight"]);
  const cheekPuff = num(b["cheekPuff"]);
  const jawOpen = num(b["jawOpen"]);
  const eyeWide = avg(b["eyeWideLeft"], b["eyeWideRight"]);
  const browUp = Math.max(num(b["browInnerUp"]), num(b["browOuterUpLeft"]), num(b["browOuterUpRight"]));
  const browDown = avg(num(b["browDownLeft"]), num(b["browDownRight"]));
  const noseSneer = avg(num(b["noseSneerLeft"]), num(b["noseSneerRight"]));
  const lipSuck = avg(num(b["mouthRollUpper"]), num(b["mouthRollLower"]));

  const posValence = clamp(0.8 * smile + 0.2 * cheekPuff, 0, 1);
  const negValence = clamp(0.6 * frown + 0.4 * press, 0, 1);
  const arousal = clamp(0.5 * jawOpen + 0.5 * eyeWide + 0.4 * browUp, 0, 1);
  const valenceMag = Math.abs(posValence - negValence);

  return {
    happy: clamp(0.9 * smile + 0.2 * browUp - 0.2 * frown, 0, 1),
    surprised: clamp(0.6 * jawOpen + 0.5 * browUp + 0.4 * eyeWide, 0, 1),
    sad: clamp(0.7 * frown + 0.4 * lipSuck + 0.3 * browDown - 0.2 * smile, 0, 1),
    angry: clamp(0.6 * browDown + 0.4 * press + 0.3 * noseSneer + 0.2 * stretch, 0, 1),
    disgust: clamp(0.7 * noseSneer + 0.5 * upperLipRaise + 0.2 * browDown, 0, 1),
    fear: clamp(0.5 * eyeWide + 0.4 * browUp + 0.3 * jawOpen + 0.2 * lipSuck, 0, 1),
    confused: clamp(0.6 * browUp + 0.4 * stretch + 0.3 * press - 0.2 * smile, 0, 1),
    neutral: clamp(1 - clamp(0.6 * arousal + 0.6 * valenceMag, 0, 1), 0, 1),
  } as Record<string, number>;
}

// eyelid vertical distance normalized by eye width → [0..1]
function eyeOpenFromLandmarks(res?: FaceLandmarkerResult) {
  const pts = res?.faceLandmarks?.[0];
  if (!pts) return { leftOpen: 0, rightOpen: 0 };
  const L = { top: 159, bot: 145, left: 33, right: 133 };
  const R = { top: 386, bot: 374, left: 362, right: 263 };
  const leftOpen = openness(pts, L.top, L.bot, L.left, L.right);
  const rightOpen = openness(pts, R.top, R.bot, R.left, R.right);
  return { leftOpen, rightOpen };
}

function openness(pts: any[], top: number, bot: number, left: number, right: number) {
  const dy = dist2D(pts[top], pts[bot]);
  const w = dist2D(pts[left], pts[right]) + 1e-6;
  return clamp((dy / w) * 2.0, 0, 1);
}

function dist2D(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

const num = (v?: number) => (typeof v === "number" ? v : 0);
const avg = (a?: number, b?: number) => (num(a) + num(b)) / 2;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round2 = (n: number) => Math.round(n * 100) / 100;
