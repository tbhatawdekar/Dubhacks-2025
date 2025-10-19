from fastapi import APIRouter

router = APIRouter(tags=["database"])

interview_questions: list[str] = [
  "Tell me about yourself.",
  "What are your strengths and weaknesses?",
  "Why do you want this job?",
  "Why did you leave your last job?"
]

@router.get("/get-questions", response_model=list[str])
def getInterviewQuestions() -> list[str]:
  return interview_questions