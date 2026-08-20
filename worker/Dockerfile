# NeverLate Studio — Demucs stem-separation worker (Phase 13).
# Deployed as its own Railway service, separate from the Express app.
# See docs/migration/2026-08-20-phase13-demucs-worker-plan.md.

FROM python:3.11-slim

# ffmpeg: audio muxing (piano->other merge) and yt-dlp's extraction backend.
# git: some demucs/torch sub-dependencies still fetch via git during install.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# CPU-only torch build first — Railway has no GPU, and the default PyPI
# wheel would otherwise pull in a multi-GB CUDA build for nothing.
RUN pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

CMD ["python", "main.py"]
