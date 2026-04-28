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

# `npm ci` es lo IDEAL en CI (reproducible y mas rapido), pero requiere
# package-lock.json. El repo frontend_intro_devops original NO trae
# lockfile, por eso aqui detectamos su presencia y caemos a
# `npm install` si falta.
#
# OJO: aqui SI necesitamos las devDependencies (Angular CLI), por lo
# tanto NO se usa --omit=dev en esta etapa.
#
# Recomendacion: ejecuta `npm install` UNA vez en tu maquina (raiz del
# repo, fuera de Docker) y commitea el package-lock.json. A partir de
# ese commit todos los builds usaran `npm ci`.
RUN if [ -f package-lock.json ]; then \
      echo ">>> package-lock.json encontrado: usando npm ci"; \
      npm ci; \
    else \
      echo ">>> AVISO: package-lock.json NO encontrado, usando npm install"; \
      echo ">>> Genera el lockfile con 'npm install' en tu host y commitealo."; \
      npm install; \
    fi

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
