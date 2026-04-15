# Usa un'immagine Debian-based
FROM node:22-slim

ENV DEBIAN_FRONTEND=noninteractive

# 1. Installa Python e dipendenze di sistema
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# 2. Crea un ambiente virtuale per l'IA (metodo più pulito per evitare PEP 668)
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# 3. Installa le librerie IA dentro l'ambiente virtuale
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir ultralytics opencv-python-headless matplotlib numpy torch torchvision

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

COPY . .

EXPOSE 4321

CMD ["npm", "run", "dev", "--", "--host"]
