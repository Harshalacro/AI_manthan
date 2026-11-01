# Backup JalDrishti API on Hugging Face Spaces (Docker).
# The Space holds only this file and README.md: the build pulls the backend
# from GitHub, so the backup always runs the same code as Render.
# Setup: docs/BACKUP_BACKEND.md

FROM python:3.12-slim

# Spaces run the container as user 1000.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1
WORKDIR /home/user

ARG REPO=Harshalacro/AI_manthan
ARG BRANCH=main
# The branch's code as an archive. A remote ADD is re-downloaded on every build,
# so a rebuild never reuses stale code from the build cache.
ADD --chown=user https://github.com/${REPO}/archive/refs/heads/${BRANCH}.tar.gz /tmp/src.tar.gz
RUN mkdir app && tar -xzf /tmp/src.tar.gz -C app --strip-components=1 && rm /tmp/src.tar.gz

WORKDIR /home/user/app/backend
RUN pip install --no-cache-dir --user --upgrade pip \
    && pip install --no-cache-dir --user -r requirements.txt

EXPOSE 7860
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 7860 --proxy-headers --forwarded-allow-ips='*'"]
