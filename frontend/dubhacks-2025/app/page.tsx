import Link from "next/link";
import styles from "./styles/page.module.css";
import { Sparkles } from "lucide-react";

export default function Home() {
  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <div>
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 14px",
            borderRadius: 999,
            background: "rgba(59,130,246,0.10)",
            color: "#1e40af",
            fontWeight: 600,
            fontSize: 14,
            fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
          }}>
            <Sparkles />
            AI-Powered Interview Coaching
          </span>
        </div>

        <h1
      className={styles.title}
        style={{ fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
        >
        Ace Your Next Interview with AI Feedback
      </h1>
        <p className={styles.subtitle}style={{ fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
        >Get ready for an amazing interview experience!</p>

        <div className={styles.buttonRow}>
          <Link href="/practice" className={styles.primaryButton}
          style={{ fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>Start Practicing</Link>
          <Link href="/about" className={styles.secondaryButton}
          style={{ fontFamily: "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>Learn More</Link>
        </div>
      </section>
    </main>
  );
}
