# syntax=docker/dockerfile:1.7
FROM ghcr.io/astral-sh/uv:0.11.11 AS uv

FROM node:22-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV NPM_CONFIG_AUDIT=false
ENV NPM_CONFIG_FUND=false
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

RUN apt-get update && apt-get install -y \
    --no-install-recommends \
    ca-certificates \
    python3 \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=uv /uv /uvx /usr/local/bin/

WORKDIR /app

ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY CV/pyproject.toml CV/uv.lock /tmp/cv/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv venv /opt/venv --python python3 && \
    cd /tmp/cv && \
    uv sync --frozen --no-dev --active

COPY vineyard-dashboard/package.json vineyard-dashboard/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps

COPY vineyard-dashboard/ .

ENV YOLO_CONFIG_DIR=/tmp

EXPOSE 4321

CMD ["npm", "run", "dev", "--", "--host"]
