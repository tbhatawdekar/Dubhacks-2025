import React from "react";
import styles from "../styles/practice.module.css";

const Practice: React.FC = () => {
  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logo}>YourLogo</div>
        <h2 className={styles.title}>All Hands Meeting Rehearsal</h2>
        <span className={styles.date}>OCT 7, 2021 12:35PM</span>
      </header>

      {/* Main content */}
      <div className={styles.main}>
        {/* Left: Camera + Transcript */}
        <div className={styles.left}>
          {/* Camera placeholder */}
          <div className={styles.camera}></div>

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
        </div>

        {/* Right: Analytics */}
        <div className={styles.right}>
          <div className={styles.analyticsSection}>
            <h4>Analytics</h4>
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
};

export default Practice;
