"use client";

import React, { useState, useRef } from "react";
import styles from "../styles/practice.module.css";
import { transcribeAudio, summarizeTranscript } from "../utils/audioAPI";

type AnalysisResponse = {
  main_points: string[];
  feedback: string[];
  metrics?: Record<string, unknown> | null;
};

const Practice: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isRecordingComplete, setIsRecordingComplete] = useState(false);
  const [chunks, setChunks] = useState<Blob[]>([]);
  const [transcript, setTranscript] = useState("this is the og transcript");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    setIsRecording(true);
    setIsRecordingComplete(false);
    setIsPaused(false);
    setChunks([]);
    chunksRef.current = [];
    setTranscript("");
    setAnalysis(null);
    setAnalysisLoading(false);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    streamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play();
    }

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
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setIsRecording(false);
    setIsPaused(false);
    setChunks([]);
    chunksRef.current = [];
    setTranscript("");
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
      await stopped; // ensure final dataavailable has fired
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());

    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    setLoading(true);

    try {
      const data = await transcribeAudio(blob);
      setTranscript(data.transcript);
      setLoading(false);

      // Kick off summarize
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

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        {!isRecording && !isRecordingComplete && (
          <div>
            <button className={styles.recordButton} onClick={startRecording}>Start Recording</button>
          </div>
        )}

        {isRecording && !isRecordingComplete && (
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
