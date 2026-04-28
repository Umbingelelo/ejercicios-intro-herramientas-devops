# ============================================================
# Dockerfile - Backend (Node.js + Express)
# Experiencia 4 - Registries y GitHub Actions
#
# Mejoras respecto a Experiencia 2:
#   1) Multi-stage build (builder + runtime)
#   2) Usuario no root (node, uid 1000 ya viene en la imagen base)
#   3) Imagen final mas pequena y mas segura
# ============================================================

# ---------- ETAPA 1: builder ----------
# Aqui resolvemos dependencias (y, si en el futuro hay un paso de build,
# tambien compilariamos aqui).
FROM node:20-alpine AS builder

WORKDIR /app

# Solo manifiestos primero -> aprovechamos la cache de capas.
COPY package*.json ./

# `npm ci` es mas estricto y reproducible que `npm install`:
# falla si package-lock.json no concuerda. Es lo IDEAL en CI.
#
# IMPORTANTE: el repo backend_intro_devops original NO trae
# package-lock.json, por eso aqui detectamos su presencia y caemos a
# `npm install` si falta. Asi el build no se rompe a quien aun no haya
# generado el lockfile.
#
# Recomendacion: ejecuta `npm install` UNA vez en tu maquina (en la
# raiz del repo, FUERA de Docker) y commitea el package-lock.json
# resultante. A partir de ese commit todos los builds usaran `npm ci`
# (reproducible y mas rapido).
RUN if [ -f package-lock.json ]; then \
      echo ">>> package-lock.json encontrado: usando npm ci (reproducible)"; \
      npm ci --omit=dev; \
    else \
      echo ">>> AVISO: package-lock.json NO encontrado, usando npm install --omit=dev"; \
      echo ">>> Genera el lockfile con 'npm install' en tu host y commitealo."; \
      npm install --omit=dev; \
    fi

# Resto del codigo
COPY . .

# (Aqui iria un `RUN npm run build` si el backend tuviera un paso de transpilacion.)

# ---------- ETAPA 2: runtime ----------
# Imagen final: solo Node + lo necesario para correr la app.
FROM node:20-alpine AS runtime

LABEL maintainer="curso-devops"
LABEL descripcion="API de tareas - Experiencia 4"

WORKDIR /app

# La imagen oficial node:alpine ya trae el usuario `node` (uid 1000).
# Copiamos los artefactos cambiando el dueno a `node`.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/src ./src

# Carpeta de datos para el volumen (la app escribe /data/tareas.json).
RUN mkdir -p /data && chown -R node:node /data

# Cambiamos al usuario no privilegiado ANTES de exponer el puerto y CMD.
USER node

EXPOSE 3000

# Healthcheck: util para Compose y para que EC2 sepa cuando reiniciar.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "src/server.js"]
