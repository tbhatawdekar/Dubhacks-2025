// utils/audioAPI.ts
const API = "http://dubhacks-api-env.eba-cd7p6ibt.us-west-2.elasticbeanstalk.com"; // adjust for production

export async function transcribeAudio(blob: Blob) {
  const form = new FormData();
  const file = new File([blob], "answer.webm", { type: "audio/webm" });
  form.append("file", file);

  const res = await fetch(`${API}/api/transcribe`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error("Failed to transcribe audio");
  }

  return res.json(); // { transcript: "..." }
}

export async function summarizeTranscript(transcript: string) {
  const res = await fetch(`${API}/api/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
  });

  if (!res.ok) {
    throw new Error("Failed to summarize transcript");
  }

  return res.json(); // { main_points, feedback, metrics }
}

// Optional: all-in-one endpoint
export async function analyzeAudio(blob: Blob) {
  const form = new FormData();
  form.append("file", blob, "answer.webm");

  const res = await fetch(`${API}/api/analyze-audio`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error("Failed to analyze audio");
  }

  return res.json(); // { transcript, main_points, feedback, metrics }
}

export async function getInterviewQuestions() {
  const res = await fetch(`${API}/api/get-questions`, {
    method: "GET",
  });

  if (!res.ok) {
    throw new Error("Failed to fetch interview questions");
  }

  return res.json();
}