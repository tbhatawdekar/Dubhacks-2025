// utils/audioAPI.ts
const API = "http://localhost:5000"; // adjust for production

export async function transcribeAudio(blob: Blob) {
  const form = new FormData();
  form.append("file", blob, "answer.webm");

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
