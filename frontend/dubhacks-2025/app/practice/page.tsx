import React from "react";
import styles from "../styles/practice.module.css";

const Practice: React.FC = () => {
  const isRecording = false; // Simulated recording state

  if (!isRecording) {
    return (
      <div className={styles.page}>
        {/* Main content */}
        <div className={styles.main}>
          {/* Transcript */}
          <div className={styles.transcript}>
            <h3>Transcript</h3>
            <div className={styles.transcriptText}>
              <p>
                <strong>00:01 Introduction</strong>
                </p>
              <p>
                Hi <span className={styles.blueText}>um</span> everyone. I am
                really excited to talk to you about our product launch. Yoodli
                helps you practice and improve your presentation skills without
                the pressure of an audience,{" "}
                <span className={styles.darkBlueText}>you know what I mean?</span>{" "}
                You can get <span className={styles.blueText}>like</span> AI
                powered feedback on your speech at www.yoodli.ai.
              </p>
            </div>
          </div>

          {/* Right: Analytics */}
          <div className={styles.analyticsSection}>
            <div className={styles.analyticsItems}>
              <h3>Analytics</h3>
              <div className={styles.analyticsItem}>
                <strong>Filler Words:</strong> Down by 15%
              </div>
              <div className={styles.analyticsItem}>
                <strong>Eye Contact:</strong> Up by 5% (45% of the time)
              </div>
              <div className={styles.analyticsItem}>
                <strong>Gestures:</strong> Repeated hand movements detected
              </div>
              <div className={styles.analyticsItem}>
                <strong>Uptalk:</strong> Up by 10%
              </div>
              <div className={styles.analyticsItem}>
                <strong>Speech Takeaways:</strong> Large fear of public speaking
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  } else return (
    <div className={styles.page}>

      {/* Main content */}
      <div className={styles.main}>
        {/* Camera placeholder */}
        <div className={styles.camera}></div>
      </div>
    </div>
  );
};

export default Practice;
