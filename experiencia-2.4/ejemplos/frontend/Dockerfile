# ============================================================
# Dockerfile - Frontend Angular (PRODUCCION)
# Experiencia 4 - Registries y GitHub Actions
#
# Mejoras respecto a Experiencia 2:
#   1) Multi-stage: builder Angular + runtime Nginx
#   2) Usuario no root (imagen nginx-unprivileged)
#   3) Imagen final ~25 MB en lugar de ~1.2 GB de `ng serve`
# ============================================================

# ---------- ETAPA 1: builder ----------
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build de produccion: genera artefactos estaticos en /app/dist.
# El nombre exacto de la subcarpeta depende de angular.json (suele ser
# el nombre del proyecto). Aqui consolidamos en /app/build-output/
# para que la siguiente etapa los copie a una ruta predecible.
RUN npm run build && \
    mkdir -p /app/build-output && \
    ( cp -r /app/dist/*/browser/* /app/build-output/ 2>/dev/null || \
      cp -r /app/dist/*/* /app/build-output/ )

# ---------- ETAPA 2: runtime ----------
# Imagen oficial de Nginx en variante `unprivileged`: corre como
# usuario `nginx` (uid 101) y escucha en el puerto 8080 sin necesitar root.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

LABEL maintainer="curso-devops"
LABEL descripcion="Frontend Angular - Experiencia 4"

# Configuracion de Nginx para SPA (rutas Angular)
COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf

# Artefactos compilados
COPY --from=builder --chown=nginx:nginx /app/build-output/ /usr/share/nginx/html/

USER nginx
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ > /dev/null || exit 1

# El CMD por defecto de la imagen base arranca nginx en foreground.
