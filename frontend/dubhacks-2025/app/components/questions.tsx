"use client";

import React, { useState } from "react";
import { Shuffle } from "lucide-react";

import styles from "../styles/questions.module.css"; 

const QUESTIONS = [
  "Tell me about yourself.",
  "What’s your biggest strength?",
  "What’s your biggest weakness?",
  "Describe a time you overcame a challenge.",
  "Why do you want to work here?",
  "Tell me about a time you led a team.",
  "Where do you see yourself in 5 years?",
];

const InterviewQuestions: React.FC<{ question: string; setQuestion: (q: string) => void }> = ({ question, setQuestion }) => {
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
