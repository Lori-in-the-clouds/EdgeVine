# syntax=docker/dockerfile:1.7
FROM ghcr.io/astral-sh/uv:0.11.11 AS uv

FROM node:22-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV NPM_CONFIG_AUDIT=false
ENV NPM_CONFIG_FUND=false
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
ENV CV_VIRTUAL_ENV=/opt/cv-venv
ENV PREDICTION_VIRTUAL_ENV=/opt/predictions-venv
ENV CV_PYTHON=/opt/cv-venv/bin/python
ENV PREDICTION_PYTHON=/opt/predictions-venv/bin/python

RUN apt-get update && apt-get install -y \
    --no-install-recommends \
    ca-certificates \
    python3 \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=uv /uv /uvx /usr/local/bin/

WORKDIR /app

ENV PATH="/opt/cv-venv/bin:/opt/predictions-venv/bin:$PATH"

COPY CV/pyproject.toml CV/uv.lock /tmp/cv/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv venv "$CV_VIRTUAL_ENV" --python python3 && \
    cd /tmp/cv && \
    VIRTUAL_ENV="$CV_VIRTUAL_ENV" uv sync --frozen --no-dev --active

COPY Predictions/pyproject.toml Predictions/uv.lock /tmp/predictions/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv venv "$PREDICTION_VIRTUAL_ENV" --python python3 && \
    cd /tmp/predictions && \
    VIRTUAL_ENV="$PREDICTION_VIRTUAL_ENV" uv sync --frozen --no-dev --active

COPY vineyard-dashboard/package.json vineyard-dashboard/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps

COPY vineyard-dashboard/ .
COPY Predictions/ /Predictions/

ENV YOLO_CONFIG_DIR=/tmp

EXPOSE 4321

CMD ["npm", "run", "dev", "--", "--host"]
