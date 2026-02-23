# ── Stage 1: dependency install ──────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /install

# Install CPU-only PyTorch first (avoids pulling in massive CUDA wheels)
RUN pip install --no-cache-dir \
    torch==2.2.2 \
    --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt


# ── Stage 2: runtime image ───────────────────────────────────────────────────
FROM python:3.11-slim

# Hugging Face Spaces runs as a non-root user (UID 1000)
RUN useradd -m -u 1000 appuser

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application source
COPY main.py .

# ── Environment variables ─────────────────────────────────────────────────────
# Directory where Hugging Face caches downloaded models.
# Mounting a persistent volume (or using HF Spaces cache) here prevents
# re-downloading the model on each cold start.
ENV HF_HOME=/app/.cache/huggingface
ENV TRANSFORMERS_CACHE=/app/.cache/huggingface/transformers

# Pin the model so it is consistent across deployments
ENV BERT_MODEL=distilroberta-base

# Disable tokenizer parallelism warnings in a single-process service
ENV TOKENIZERS_PARALLELISM=false

# Port that Hugging Face Spaces expects
ENV PORT=7860

# ── Permissions ───────────────────────────────────────────────────────────────
RUN mkdir -p /app/.cache/huggingface && chown -R appuser:appuser /app

# ── Pre-bake model at BUILD time (runs as root so it can write cache) ─────────
# Downloads distilroberta-base once into the image layer — no network at runtime.
RUN python -c "from bert_score import BERTScorer; BERTScorer(model_type='distilroberta-base', device='cpu')"

USER appuser

# ── Runtime ──────────────────────────────────────────────────────────────────
EXPOSE 7860

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1"]
