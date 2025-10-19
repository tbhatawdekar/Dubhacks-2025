"use client";

import React, { useEffect } from "react";
import { Shuffle } from "lucide-react";
import { getInterviewQuestions } from "../utils/backendAPI";

import styles from "../styles/questions.module.css"; 

const QUESTIONS: string[] = await getInterviewQuestions();

const InterviewQuestions: React.FC<{ question: string; setQuestion: (q: string) => void }> = ({ question, setQuestion }) => {
  useEffect(() => {
    if (!question) {
      setQuestion(QUESTIONS[0]);
    }
  }, []);

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setQuestion(e.target.value);
  };

  const randomizeQuestion = () => {
    const randomIndex = Math.floor(Math.random() * QUESTIONS.length);
    setQuestion(QUESTIONS[randomIndex]);
  };

  return (
    <div className={styles.questionsContainer}>
      <div className={styles.questionRow}>
        <select
          className={styles.questionDropdown}
          value={question}
          onChange={handleSelect}
        >
          {QUESTIONS.map((q, idx) => (
            <option key={idx} value={q}>
              {q}
            </option>
          ))}
        </select>

        <button
          className={styles.shuffleButton}
          onClick={randomizeQuestion}
          title="Choose random question"
        >
          <Shuffle size={20} />
        </button>
      </div>
    </div>
  );
};

export default InterviewQuestions;
