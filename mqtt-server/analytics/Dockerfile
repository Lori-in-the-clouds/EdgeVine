FROM python:3.11-slim

WORKDIR /app

# Installa dipendenze di sistema per psycopg2 e pandas
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# La cartella 'scripts' conterrà i tuoi file .py per l'analisi
# La cartella 'archive' conterrà i file Parquet salvati sul Mac
RUN mkdir -p /app/scripts /app/archive

CMD ["python", "scripts/fetch_and_archive.py"]
