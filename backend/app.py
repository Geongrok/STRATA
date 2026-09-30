from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse

from backend.database import engine, Base, SessionLocal
from backend.seed_data import seed_database
from backend.routers import materials, hardeners, calculations, formulations, chat

BASE_DIR = Path(__file__).resolve().parent.parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create DB tables
    Base.metadata.create_all(bind=engine)
    # Seed database with initial materials and hardeners
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="STRATA — The Composite Compendium API",
    description="Industrial Materials Database, Micromechanics Engine, Laminate Visualizer & ASTM Standards API",
    version="2.0.0",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Routers
app.include_router(materials.router)
app.include_router(hardeners.router)
app.include_router(calculations.router)
app.include_router(formulations.router)
app.include_router(chat.router)

# Mount Static Files
static_dir = BASE_DIR / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

templates_dir = BASE_DIR / "templates"
templates = Jinja2Templates(directory=str(templates_dir))


@app.get("/", response_class=HTMLResponse)
async def serve_index(request: Request):
    index_file = templates_dir / "index.html"
    if index_file.exists():
        return templates.TemplateResponse("index.html", {"request": request})
    # Fallback to strata.html if templates/index.html is not yet created
    fallback_file = BASE_DIR / "strata.html"
    if fallback_file.exists():
        return HTMLResponse(content=fallback_file.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>STRATA API is running. UI templates initializing...</h1>")


@app.get("/strata.html", response_class=HTMLResponse)
async def serve_legacy(request: Request):
    return await serve_index(request)

