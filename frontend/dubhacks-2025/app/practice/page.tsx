"use client";

import React, { useState, useRef, useEffect } from "react";
import InterviewQuestions from "../components/questions";
import styles from "../styles/practice.module.css";
import { transcribeAudio, summarizeTranscript } from "../utils/audioAPI";

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

  const [faceStatus, setFaceStatus] = useState<{ emotion: string; leftOpen: number; rightOpen: number }>({
    emotion: "—",
    leftOpen: 0,
    rightOpen: 0,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null); // 🔽 NEW: overlay canvas
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
    console.log({question})

    // camera stream (audio + video)
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 640, height: 480 } });
    streamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }

    await ensureFaceLandmarker();
    startFaceLoop();

    // audio-only MediaRecorder 
    const audioStream = new MediaStream(stream.getAudioTracks());
    mediaRecorderRef.current = new MediaRecorder(audioStream, { mimeType: "audio/webm;codecs=opus" });

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
    // stop current recording and reset
    mediaRecorderRef.current?.stop();
    stopFaceLoop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setIsRecording(false);
    setIsPaused(false);
    setChunks([]);
    chunksRef.current = [];
    setTranscript("");
    setFaceStatus({ emotion: "—", leftOpen: 0, rightOpen: 0 });
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
      await stopped; // ensure final dataavailable fired
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
      outputFacialTransformationMatrixes: false, // 2D focus
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

      // update simple status from blendshapes + eyelids
      if (res?.faceBlendshapes?.[0]) {
        const b = toBlendshapeMap(res.faceBlendshapes[0].categories);
        const emo = simpleEmotion(b);
        const { leftOpen, rightOpen } = eyeOpenFromLandmarks(res);
        setFaceStatus({
          emotion: emo.label,
          leftOpen: round2(leftOpen),
          rightOpen: round2(rightOpen),
        });
      } else {
        setFaceStatus({ emotion: "—", leftOpen: 0, rightOpen: 0 });
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }

  function stopFaceLoop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    // optional: faceLandmarkerRef.current?.close(); // not needed
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }

  // cleanup on unmount (safety)
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
            <button className={styles.recordButton} onClick={startRecording}>Start Recording</button>
          </div>
        )}

        {isRecording && !isRecordingComplete && (
          <div>
            <p>Question: {question}</p>
            <div className={styles.camera} style={{ position: "relative" }}>
              <video
                ref={videoRef}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                muted
              />
              {/* Overlay buttons */}
              <div style={{
                position: "absolute",
                bottom: "20px",
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                gap: "10px"
              }}>
                <button className={styles.recordButton}  onClick={pauseRecording}>{isPaused ? "Resume" : "Pause"}</button>
                <button className={styles.recordButton} onClick={stopRecording}>Stop</button>
                <button className={styles.recordButton} onClick={rerecord}>Rerecord</button>
              </div>
              {!isPaused && (
                <p style={{
                  position: "absolute",
                  top: "20px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  color: "white",
                  fontWeight: "bold"
                }}>
                  Recording...
                </p>
              )}
              <canvas
                ref={canvasRef}
                width={640}
                height={480}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
              />
              <div style={{
                position: "absolute", bottom: 12, left: 12,
                background: "rgba(0,0,0,0.55)", color: "white",
                padding: "6px 10px", borderRadius: 8, fontSize: 12
              }}>
                {faceStatus.emotion.toUpperCase()} — 👁 {faceStatus.leftOpen.toFixed(2)} / {faceStatus.rightOpen.toFixed(2)}
              </div>

              <div style={{
                position: "absolute",
                bottom: "20px",
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                gap: "10px"
              }}>
                <button className={styles.recordButton}  onClick={pauseRecording}>{isPaused ? "Resume" : "Pause"}</button>
                <button className={styles.recordButton} onClick={stopRecording}>Stop</button>
                <button className={styles.recordButton} onClick={rerecord}>Rerecord</button>
              </div>
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
              <button className={styles.recordButton} onClick={startRecording}>Start Recording</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Practice;

function drawOverlay(canvas: HTMLCanvasElement, video: HTMLVideoElement, res?: FaceLandmarkerResult) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!res?.faceLandmarks?.[0]) return;

  const pts = res.faceLandmarks[0];
  // draw a few stable facial points (eye corners + mouth corners)
  const idx = [33, 133, 362, 263, 61, 291]; // L/R eye corners, mouth corners
  ctx.fillStyle = "#00e"; // small blue dots
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

function simpleEmotion(b: Record<string, number>) {
  const smile = avg(b["mouthSmileLeft"], b["mouthSmileRight"]);
  const jaw = num(b["jawOpen"]);
  const browUp = Math.max(num(b["browInnerUp"]), num(b["browOuterUpLeft"]), num(b["browOuterUpRight"]));
  if (smile > 0.6 && jaw < 0.4) return { label: "happy" };
  if (jaw > 0.6 && browUp > 0.5) return { label: "surprised" };
  return { label: "neutral" };
}

// eyelid vertical distance normalized by eye width → [0..1] proxy for openness
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
