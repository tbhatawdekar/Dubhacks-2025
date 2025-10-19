import os
import uvicorn

from app.main import app

port = int(os.environ.get("PORT", 8000))  # fallback to 8000 if not set

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=port)
