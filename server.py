"""
STRATA Web Application Server
Entrypoint launching the modernized FastAPI backend with Uvicorn
"""

import os
import uvicorn
from backend.app import app

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Starting STRATA on port {port}...")
    uvicorn.run("backend.app:app", host="0.0.0.0", port=port, reload=False)