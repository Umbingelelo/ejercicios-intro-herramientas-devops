# ============================================================
# Dockerfile - Frontend Angular
# Experiencia 2 - Introduccion a Herramientas DevOps
#
# IMPORTANTE: Este Dockerfile esta pensado para DESARROLLO.
# Levanta `ng serve` dentro del contenedor con hot-reload.
# ============================================================

# 1) Imagen base Node (Angular CLI necesita Node para compilar)
FROM node:20-alpine

# 2) Carpeta de trabajo
WORKDIR /app

# 3) Copiamos package*.json y aprovechamos cache
COPY package*.json ./

# 4) Instalamos TODAS las dependencias (incluidas dev: Angular CLI)
RUN npm install

# 5) Copiamos el resto del proyecto
COPY . .

# 6) Puerto por defecto de `ng serve`
EXPOSE 4200

# 7) Arrancamos el servidor de desarrollo.
#    --host 0.0.0.0 permite que el puerto sea accesible desde fuera del contenedor.
#    --poll 2000    fuerza al compilador a detectar cambios en volumenes montados
#                    (necesario en Windows/Mac con Docker Desktop).
CMD ["npm", "run", "start"]
