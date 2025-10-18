"use client";

import React, { useState } from "react";
import styles from "../styles/practice.module.css";
import { transcribeAudio } from "../utils/audioAPI";

const Practice: React.FC = () => {
  const [isRecording, setIsRecording] = useState(true);
  const [chunks, setChunks] = useState<Blob[]>([]);
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);

  const startRecording = () => {
    setIsRecording(true);
    setChunks([]);
    setTranscript("");
  };

  const stopRecording = async () => {
    setIsRecording(false);
    const blob = new Blob(chunks, { type: "audio/webm;codecs=opus" });
    setLoading(true);

    try {
      const data = await transcribeAudio(blob);
      setTranscript(data.transcript);
    } catch (err) {
      console.error(err);
      alert("Service busy; please retry.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        {isRecording ? (
          <div className={styles.camera}>
            <p style={{ color: "white", textAlign: "center", paddingTop: "180px" }}>
              Recording...
            </p>
          </div>
        ) : (
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
        )}

        {!isRecording && (
          <div className={styles.analyticsSection}>
            <div className={styles.analyticsItems}>
              <h3>Analytics</h3>
              <div className={styles.analyticsItem}><strong>Filler Words:</strong> Down by 15%</div>
              <div className={styles.analyticsItem}><strong>Eye Contact:</strong> Up by 5% (45% of the time)</div>
              <div className={styles.analyticsItem}><strong>Gestures:</strong> Repeated hand movements detected</div>
              <div className={styles.analyticsItem}><strong>Uptalk:</strong> Up by 10%</div>
              <div className={styles.analyticsItem}><strong>Speech Takeaways:</strong> Large fear of public speaking</div>
            </div>
          </div>
        )}
      </div>

      <div className={styles.recordButton}>
        {!isRecording ? (
          <button onClick={startRecording}>Start Recording</button>
        ) : (
          <button onClick={stopRecording}>Stop Recording</button>
        )}
      </div>
    </div>
  );
};

export default Practice;
