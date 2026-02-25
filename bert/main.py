import os
import logging
import contextlib
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S%z",
)
logger = logging.getLogger("bert_service")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
MODEL_NAME: str = os.environ.get("BERT_MODEL", "vinai/phobert-base")

# ---------------------------------------------------------------------------
# Global scorer — loaded once at startup
# ---------------------------------------------------------------------------
from bert_score import BERTScorer  # noqa: E402  (import after env vars are in scope)

bert_scorer: BERTScorer | None = None


# ---------------------------------------------------------------------------
# Lifespan (replaces deprecated @app.on_event)
# ---------------------------------------------------------------------------
@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    global bert_scorer
    logger.info(f"Loading BERTScorer with model='{MODEL_NAME}' on CPU …")
    try:
        bert_scorer = BERTScorer(
            model_type=MODEL_NAME,
            lang="vi",
            num_layers=9,
            device="cpu",
            rescale_with_baseline=False,
        )
        logger.info("BERTScorer loaded successfully.")
    except Exception as exc:
        logger.error(f"Failed to load BERTScorer: {exc}")
        raise RuntimeError(f"Could not load BERTScorer: {exc}") from exc

    yield  # ── server is running ──

    logger.info("Shutting down BERT service.")
    bert_scorer = None


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="BERTScore Similarity Service",
    description="Lightweight microservice to compute BERTScore F1 between a reference and candidate text.",
    version="1.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class ScoreRequest(BaseModel):
    reference_text: str
    candidate_text: str


class ScoreResponse(BaseModel):
    f1_score: float
    model_used: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/healthz", status_code=200, tags=["Health"])
async def health_check():
    """Liveness / readiness probe."""
    if bert_scorer is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet.")
    return {"status": "ok", "model_loaded": True, "model_used": MODEL_NAME}


@app.post("/calculate-score", response_model=ScoreResponse, tags=["Scoring"])
async def calculate_score(payload: ScoreRequest):
    """
    Calculate BERTScore F1 between a reference text and a candidate text.

    - **reference_text**: The ground-truth / source text.
    - **candidate_text**: The generated summary or text to evaluate.
    """
    if bert_scorer is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet.")

    try:
        logger.info("Computing BERTScore …")
        _, _, F1 = bert_scorer.score(
            cands=[payload.candidate_text],
            refs=[payload.reference_text],
        )
        f1_value = round(float(F1[0].item()), 6)
        logger.info(f"BERTScore F1 = {f1_value}")
        return ScoreResponse(f1_score=f1_value, model_used=MODEL_NAME)
    except Exception as exc:
        logger.exception("Error during BERTScore calculation.")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Local dev entry-point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 7860))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
