# ============================================================
# Dockerfile - Backend (Node.js + Express)
# Experiencia 2 - Introduccion a Herramientas DevOps
# ============================================================

# 1) Imagen base oficial de Node (ligera: alpine ~ 50MB)
FROM node:20-alpine

# 2) Metadatos (opcional, buena practica)
LABEL maintainer="curso-devops"
LABEL descripcion="API de tareas - Experiencia 2"

# 3) Directorio de trabajo dentro del contenedor
WORKDIR /app

# 4) Copiamos SOLO los package*.json primero.
#    Esto aprovecha la cache de Docker: si no cambian
#    las dependencias, no se reinstalan en cada build.
COPY package*.json ./

# 5) Instalamos dependencias de produccion
RUN npm install --omit=dev

# 6) Copiamos el resto del codigo fuente
COPY . .

# 7) Puerto interno que expone el contenedor
EXPOSE 3000

# 8) Comando que se ejecuta al iniciar el contenedor
CMD ["node", "src/server.js"]
