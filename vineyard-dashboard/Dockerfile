# Usa l'immagine ufficiale di Node.js
FROM node:22-alpine

# Imposta la cartella di lavoro nel container
WORKDIR /app

# Copia i file delle dipendenze
# Nota: assicurati di avere eseguito 'npm install' sul Mac prima, 
# così il package-lock.json è aggiornato con Leaflet
COPY package.json package-lock.json ./

# Installa le dipendenze
RUN npm install --legacy-peer-deps

# Copia il resto del codice del progetto
COPY . .

# Esponi la porta di Astro (default 4321)
EXPOSE 4321

# Comando per avviare Astro in modalità sviluppo con accesso esterno
CMD ["npm", "run", "dev", "--", "--host"]
