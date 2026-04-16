# Experiencia 2 – Docker en local con Node + Angular

> **Asignatura:** Introducción a Herramientas DevOps
> **Experiencias cubiertas:** 2.1 (Fundamentos de Docker) y 2.2 (Orquestación con Docker Compose)
> **Duración estimada:** 1 h 30 min
> **Modalidad:** Trabajo autónomo en local (NO se necesita nube)
> **Requisitos previos:** tener instalado Docker Desktop (Windows/Mac) o Docker Engine + Docker Compose (Linux).

---

## 📑 Tabla de contenidos

1. [Objetivos de aprendizaje](#-objetivos-de-aprendizaje)
2. [¿Qué construiremos?](#-qué-construiremos)
3. [Conceptos clave antes de empezar](#-conceptos-clave-antes-de-empezar)
4. [Planificación de los 90 minutos](#-planificación-de-los-90-minutos)
5. [**Experiencia 2.1 – Fundamentos de Docker**](#-experiencia-21--fundamentos-de-docker)
   - Paso 1. Verificar la instalación
   - Paso 2. Clonar el repositorio base
   - Paso 3. Entender el Dockerfile del backend
   - Paso 4. Construir la imagen del backend
   - Paso 5. Correr el contenedor y probarlo
   - Paso 6. Comandos de inspección
6. [**Experiencia 2.2 – Volúmenes, redes y Docker Compose**](#-experiencia-22--volúmenes-redes-y-docker-compose)
   - Paso 7. Volúmenes: persistir los datos
   - Paso 8. Redes: conectar contenedores
   - Paso 9. Dockerfile del frontend Angular
   - Paso 10. `docker-compose.yml`: levantar todo junto
   - Paso 11. Probar la aplicación completa
   - Paso 12. Comandos útiles de Compose
7. [Cuestionario de autoevaluación](#-cuestionario-de-autoevaluación)
8. [Reto opcional](#-reto-opcional)
9. [Solución de problemas (Troubleshooting)](#-solución-de-problemas-troubleshooting)
10. [Entregables y criterios de evaluación](#-entregables-y-criterios-de-evaluación)
11. [Glosario rápido](#-glosario-rápido)

---

## 🎯 Objetivos de aprendizaje

Al terminar esta experiencia el estudiante será capaz de:

- Explicar la diferencia entre **imagen** y **contenedor** en Docker.
- Escribir un **Dockerfile** partiendo de una imagen oficial.
- **Construir** imágenes (`docker build`) y **ejecutar** contenedores (`docker run`).
- **Publicar puertos** del contenedor al host y explicar el mapeo `host:contenedor`.
- Usar **volúmenes** para persistir datos entre reinicios.
- Crear una **red** personalizada para conectar varios contenedores.
- Orquestar múltiples servicios con **Docker Compose** (`docker compose up`).
- Aplicar buenas prácticas con `.dockerignore` y variables de entorno.

---

## 🏗️ ¿Qué construiremos?

Una pequeña aplicación de **gestión de tareas** (To‑Do) con dos servicios:

```
┌────────────────────────┐        HTTP / JSON        ┌────────────────────────┐
│  Frontend (Angular 17) │ ────────────────────────▶ │   Backend (Node 20     │
│  Puerto 4200           │                           │   + Express)           │
│  Contenedor:           │                           │   Puerto 3000          │
│   tareas-frontend      │                           │   Contenedor:          │
│                        │                           │   tareas-backend       │
└────────────────────────┘                           └──────────┬─────────────┘
                                                                │
                                                    ┌───────────▼───────────┐
                                                    │ Volumen:              │
                                                    │  datos-tareas         │
                                                    │ (persiste tareas.json)│
                                                    └───────────────────────┘
```

Los dos contenedores viven en una **red bridge** llamada `red-devops` y se levantan/detienen juntos con `docker compose`.

---

## 🔑 Conceptos clave antes de empezar

| Concepto | Idea corta | Ejemplo en esta práctica |
|---|---|---|
| **Imagen** | Plantilla de solo lectura (receta). | `tareas-backend:1.0` |
| **Contenedor** | Instancia en ejecución de una imagen. | `tareas-backend` |
| **Dockerfile** | Archivo de texto con los pasos para construir una imagen. | `./backend/Dockerfile` |
| **Build** | Proceso que transforma un Dockerfile en imagen. | `docker build -t ...` |
| **Registry** | Repositorio remoto de imágenes (Docker Hub). | `node:20-alpine` lo baja de Docker Hub |
| **Puerto publicado** | Mapeo `host:contenedor` para que el navegador llegue al contenedor. | `-p 3000:3000` |
| **Volumen** | Almacenamiento que sobrevive al contenedor. | `datos-tareas:/data` |
| **Bind mount** | Mapea una carpeta del host dentro del contenedor. | `./frontend:/app` |
| **Red** | Canal de comunicación entre contenedores. | `red-devops` |
| **docker-compose** | Orquestador local de varios servicios en un YAML. | `docker-compose.yml` |

> 💡 **Metáfora útil:** la **imagen** es como la receta de un pastel, el **contenedor** es el pastel ya horneado. Puedes hornear muchos pasteles (contenedores) desde la misma receta (imagen).

---

## ⏱️ Planificación de los 90 minutos

| Bloque | Tiempo | Actividad |
|---|---|---|
| 0 | 5 min | Verificar Docker y clonar repo |
| **Experiencia 2.1** | **35 min** | Imagen del backend + comandos básicos |
| Pausa activa | 5 min | – |
| **Experiencia 2.2** | **40 min** | Volúmenes, redes y Docker Compose |
| Cierre | 5 min | Autoevaluación y limpieza |
| **Total** | **90 min** | |

---

# 🐳 Experiencia 2.1 – Fundamentos de Docker

## Paso 1. Verificar la instalación (3 min)

Abre una terminal y ejecuta:

```bash
docker --version
docker compose version
docker run hello-world
```

Deberías ver algo como:

```
Docker version 26.x.x, build ...
Docker Compose version v2.x.x
Hello from Docker!
```

> ❓ **¿Qué pasó cuando ejecutaste `hello-world`?**
>
> 1. Docker buscó la imagen `hello-world` **localmente**, no la encontró.
> 2. La **descargó** desde Docker Hub (registry público).
> 3. **Creó un contenedor** a partir de ella.
> 4. **Ejecutó** el programa que imprime el mensaje.
> 5. El contenedor terminó y quedó en estado `Exited`.

Ejecuta `docker ps -a` para ver ese contenedor detenido.

---

## Paso 2. Clonar el repositorio base (2 min)

```bash
git clone <URL-del-repositorio> experiencia2-docker
cd experiencia2-docker
```

Estructura que encontrarás:

```
experiencia2-docker/
├── backend/                 # API Node/Express
│   ├── src/server.js
│   ├── package.json
│   ├── Dockerfile
│   └── .dockerignore
├── frontend/                # App Angular
│   ├── src/...
│   ├── package.json
│   ├── angular.json
│   ├── Dockerfile
│   └── .dockerignore
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md   ← este archivo
```

---

## Paso 3. Entender el Dockerfile del backend (5 min)

Abre `backend/Dockerfile` y **léelo línea por línea**. Cada instrucción tiene un propósito:

```dockerfile
FROM node:20-alpine               # 1. Imagen base (ligera, basada en Alpine Linux)
LABEL maintainer="curso-devops"   # 2. Metadatos
WORKDIR /app                      # 3. Crea /app y se posiciona ahí
COPY package*.json ./             # 4. Copia SOLO manifiestos para aprovechar caché
RUN npm install --omit=dev        # 5. Instala dependencias de producción
COPY . .                          # 6. Copia el resto del código
EXPOSE 3000                       # 7. Documenta el puerto interno
CMD ["node", "src/server.js"]     # 8. Comando que corre al iniciar el contenedor
```

### ¿Por qué copiamos `package.json` primero?
Docker cachea **cada capa**. Si cambiamos un archivo de `src/`, las capas anteriores (incluida la de `npm install`) se reusan, y el build es mucho más rápido.

### ¿Qué es `.dockerignore`?
Un archivo similar a `.gitignore` que indica qué NO se copia al contexto de build. Evita copiar `node_modules/`, logs o el propio `.git`.

---

## Paso 4. Construir la imagen del backend (5 min)

Desde la raíz del proyecto:

```bash
docker build -t tareas-backend:1.0 ./backend
```

- `-t tareas-backend:1.0` → le ponemos **nombre** (`tareas-backend`) y **tag** (`1.0`).
- `./backend` → carpeta de contexto (ahí busca el `Dockerfile`).

Al terminar, verifica que exista:

```bash
docker images
```

Deberías ver tu imagen junto con `node:20-alpine` (la base que se bajó de Docker Hub).

> 🧪 **Mini‑reto:** vuelve a correr `docker build` sin cambiar nada. ¿Por qué tarda apenas 1 segundo? → Porque Docker **reutiliza las capas** cacheadas.

---

## Paso 5. Correr el contenedor y probarlo (10 min)

```bash
docker run -d \
  --name tareas-backend \
  -p 3000:3000 \
  -e MENSAJE_BIENVENIDA="Hola desde Docker" \
  tareas-backend:1.0
```

Desglose de cada flag:

| Flag | Qué hace |
|---|---|
| `-d` | **Detached mode**: corre en segundo plano |
| `--name tareas-backend` | Nombre amigable del contenedor |
| `-p 3000:3000` | Publica `host:contenedor` → el navegador entra por el puerto 3000 del host |
| `-e VARIABLE=valor` | Inyecta una variable de entorno |

Prueba en otra terminal o en el navegador:

```bash
curl http://localhost:3000
curl http://localhost:3000/api/tareas
```

Deberías recibir JSON con las 3 tareas iniciales.

> ✅ **Checkpoint 2.1:** si respondió el JSON, ¡tu primer contenedor está corriendo!

---

## Paso 6. Comandos de inspección (10 min)

Practica estos comandos, son los que usarás **todos los días**:

```bash
# Listar contenedores en ejecución
docker ps

# Listar TODOS (incluso los detenidos)
docker ps -a

# Ver logs del contenedor (últimas líneas)
docker logs tareas-backend
docker logs -f tareas-backend          # en vivo (sigue imprimiendo)

# Entrar al contenedor (shell interactivo)
docker exec -it tareas-backend sh
# Dentro: ls, ps, cat src/server.js, exit

# Ver información detallada (JSON)
docker inspect tareas-backend

# Ver uso de recursos
docker stats --no-stream

# Detener / iniciar / reiniciar
docker stop tareas-backend
docker start tareas-backend
docker restart tareas-backend

# Eliminar el contenedor (debe estar detenido)
docker stop tareas-backend
docker rm tareas-backend

# Eliminar la imagen
docker rmi tareas-backend:1.0
```

> 📝 **Anota en tu cuaderno** la salida de `docker ps`, `docker logs` y `docker inspect`. Lo usarás en la autoevaluación.

---

# 🧩 Experiencia 2.2 – Volúmenes, redes y Docker Compose

## Paso 7. Volúmenes: persistir los datos (8 min)

El backend guarda las tareas en `/data/tareas.json` **dentro del contenedor**. Si el contenedor se elimina, los datos se pierden. Solución → **volumen**.

### 7.1 Crear un volumen nombrado

```bash
docker volume create datos-tareas
docker volume ls
docker volume inspect datos-tareas
```

### 7.2 Correr el backend usando el volumen

Primero elimina el contenedor anterior (si aún existe):

```bash
docker rm -f tareas-backend
```

Luego:

```bash
docker run -d \
  --name tareas-backend \
  -p 3000:3000 \
  -v datos-tareas:/data \
  tareas-backend:1.0
```

El flag `-v datos-tareas:/data` monta el **volumen nombrado** en la ruta `/data` del contenedor.

### 7.3 Probar la persistencia

```bash
# Crear una tarea nueva
curl -X POST http://localhost:3000/api/tareas \
  -H "Content-Type: application/json" \
  -d '{"titulo":"Estudiar volúmenes"}'

# Comprobar
curl http://localhost:3000/api/tareas
```

Ahora **destruye y recrea el contenedor**:

```bash
docker rm -f tareas-backend

docker run -d --name tareas-backend \
  -p 3000:3000 \
  -v datos-tareas:/data \
  tareas-backend:1.0

curl http://localhost:3000/api/tareas
```

🎉 La tarea que creaste **sigue ahí** aunque el contenedor se haya destruido. Eso es un volumen en acción.

### 7.4 Tipos de volumen – resumen

| Tipo | Sintaxis | Cuándo usarlo |
|---|---|---|
| **Nombrado** | `-v mi-vol:/ruta` | Persistencia gestionada por Docker (BD, caché). |
| **Bind mount** | `-v /host/ruta:/ruta` o `-v ./src:/app` | Desarrollo con hot‑reload; editar en el host, correr en el contenedor. |
| **Anónimo** | `-v /ruta` | Evitar que un volumen nombrado sobrescriba una carpeta dentro de la imagen (ej. `node_modules`). |

---

## Paso 8. Redes: conectar contenedores (5 min)

Por defecto los contenedores están en la red `bridge` predeterminada, pero **no se pueden resolver por nombre**. Creamos una red propia:

```bash
docker network create red-devops
docker network ls
```

Re‑creamos el backend dentro de esa red:

```bash
docker rm -f tareas-backend

docker run -d --name tareas-backend \
  --network red-devops \
  -p 3000:3000 \
  -v datos-tareas:/data \
  tareas-backend:1.0
```

Ahora, cualquier otro contenedor que se una a `red-devops` puede llamar al backend como **`http://tareas-backend:3000`** (¡sin localhost ni IPs!). Lo comprobaremos con:

```bash
docker run --rm -it --network red-devops alpine sh
# dentro del contenedor alpine:
apk add --no-cache curl
curl http://tareas-backend:3000/api/tareas
exit
```

> 🧠 **Dato clave:** los nombres de contenedor funcionan como **DNS interno** dentro de una red personalizada.

---

## Paso 9. Dockerfile del frontend Angular (5 min)

Abre `frontend/Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 4200
CMD ["npm", "run", "start"]
```

Diferencias con el backend:
- Instalamos **todas** las dependencias (necesitamos Angular CLI, que es `devDependency`).
- Exponemos `4200`, el puerto por defecto de `ng serve`.
- El script `start` usa `--host 0.0.0.0 --poll 2000` para que el servidor escuche fuera del contenedor y detecte cambios en archivos montados por bind mount.

> ⚠️ **Importante:** este Dockerfile es para **desarrollo**. Para producción se usa un build multi‑stage con Nginx. En esta experiencia nos quedamos en desarrollo.

---

## Paso 10. `docker-compose.yml`: levantar todo junto (12 min)

Abre el archivo `docker-compose.yml` en la raíz. Los puntos clave son:

```yaml
services:
  backend:
    build: ./backend
    image: tareas-backend:1.0
    container_name: tareas-backend
    ports: ["3000:3000"]
    environment:
      - PORT=3000
      - MENSAJE_BIENVENIDA=API de Tareas corriendo en Docker
    volumes:
      - datos-tareas:/data
    networks: [red-devops]

  frontend:
    build: ./frontend
    image: tareas-frontend:1.0
    container_name: tareas-frontend
    ports: ["4200:4200"]
    volumes:
      - ./frontend:/app            # bind mount → hot reload
      - /app/node_modules          # volumen anónimo para no pisar node_modules
    depends_on: [backend]
    networks: [red-devops]

networks:
  red-devops:
    driver: bridge

volumes:
  datos-tareas:
```

### Cosas a observar
- Un solo archivo describe **dos servicios**, **una red** y **un volumen**.
- `depends_on` define el **orden de arranque** (no espera a que esté "listo", solo a que esté creado).
- `build:` apunta a una carpeta con Dockerfile; `image:` da nombre/tag a la imagen resultante.

### Antes de arrancar, limpia lo anterior

```bash
docker rm -f tareas-backend 2>/dev/null
docker network rm red-devops 2>/dev/null
```

### Levanta todo el stack

```bash
docker compose up --build
```

La primera vez:
- Construye la imagen del frontend (puede tomar 1–2 min por `npm install`).
- Reusa o construye la del backend.
- Crea la red y el volumen si no existen.
- Arranca los dos contenedores y muestra los logs combinados.

Para dejarlo corriendo en segundo plano:

```bash
docker compose up --build -d
docker compose logs -f
```

---

## Paso 11. Probar la aplicación completa (5 min)

1. Abre el navegador en **http://localhost:4200** → verás la app Angular.
2. El backend responde en **http://localhost:3000/api/tareas**.
3. Agrega una tarea desde la UI y recarga → debe seguir ahí (volumen).
4. Marca una tarea como completada → se tacha visualmente.
5. Elimínala → desaparece de la lista.

> ✅ **Checkpoint 2.2:** si la UI carga y puedes crear/eliminar tareas, tu stack Dockerizado funciona.

---

## Paso 12. Comandos útiles de Compose (5 min)

```bash
# Levantar
docker compose up                 # en primer plano
docker compose up -d              # en segundo plano
docker compose up --build         # fuerza rebuild
docker compose up --force-recreate

# Estado
docker compose ps                 # servicios y puertos
docker compose logs               # logs combinados
docker compose logs -f backend    # logs de un servicio, en vivo

# Entrar a un contenedor
docker compose exec backend sh
docker compose exec frontend sh

# Escalar (solo tiene sentido si no hay container_name fijo)
# docker compose up -d --scale backend=3

# Detener y limpiar
docker compose stop               # para los contenedores
docker compose down               # para y elimina contenedores + red
docker compose down -v            # ADEMÁS elimina volúmenes (¡borra datos!)
docker compose down --rmi all     # ADEMÁS elimina las imágenes
```

---

## 🧪 Cuestionario de autoevaluación

Responde en tu cuaderno (o en un archivo `respuestas.md`):

1. ¿Qué diferencia hay entre `docker stop` y `docker rm`?
2. ¿Qué pasa si ejecutas `docker compose down -v` y luego `docker compose up`? ¿Siguen las tareas que creaste?
3. ¿Por qué el frontend usa `http://localhost:3000` y no `http://backend:3000` si están en la misma red?
4. Describe en dos líneas qué hace el flag `-p 4200:4200`.
5. ¿Qué ocurre si cambias el puerto publicado a `-p 5000:3000` y no reinicias la app Angular?
6. ¿Qué ganamos con el `.dockerignore`?
7. Si borras la imagen `tareas-backend:1.0`, ¿qué pasa con el contenedor que ya está corriendo?
8. Explica con tus palabras qué es una capa (layer) en Docker.

---

## 🚀 Reto opcional (+10 min)

Elige **uno**:

- **A.** Agrega un tercer servicio a `docker-compose.yml` con **Redis** oficial (`redis:7-alpine`) en la misma red, y conéctate con `docker compose exec backend sh` + `apk add redis` para hacer un `PING`.
- **B.** Modifica el `CMD` del backend para usar `nodemon` y monta un bind mount sobre `./backend/src`. Cambia un `console.log` y comprueba el hot‑reload.
- **C.** Reemplaza el Dockerfile del frontend por un **multi‑stage** que sirva el build estático con `nginx:alpine` en el puerto 80.

---

## 🛠️ Solución de problemas (Troubleshooting)

| Síntoma | Causa probable | Solución |
|---|---|---|
| `Error: port is already allocated` | Otro proceso usa el puerto 3000 o 4200 | Cambia el lado izquierdo del `-p` (ej. `-p 3001:3000`) |
| La UI carga pero las tareas no aparecen | CORS o backend caído | Revisa `docker compose logs backend` y que el navegador use `http://localhost:3000` |
| `ng serve` no recompila al guardar archivos | Bind mount sin polling (Windows/Mac) | Ya usamos `--poll 2000`; revisa que el bind mount esté en `docker-compose.yml` |
| `npm install` tarda muchísimo | Red lenta o caché perdida | Repite el build; las capas se cachean |
| `Cannot find module 'express'` dentro del contenedor | `node_modules` fue sobrescrito por el bind mount | Agrega el volumen anónimo `- /app/node_modules` (ya incluido) |
| `docker: permission denied` en Linux | Usuario fuera del grupo `docker` | `sudo usermod -aG docker $USER` y reiniciar sesión |

---

## 📦 Entregables y criterios de evaluación

Sube a tu repositorio **personal** de GitHub la carpeta completa con:

- `backend/` con su `Dockerfile` y `.dockerignore`.
- `frontend/` con su `Dockerfile` y `.dockerignore`.
- `docker-compose.yml` en la raíz.
- `respuestas.md` con las 8 preguntas del cuestionario.
- **Captura de pantalla** de:
  1. `docker ps` mostrando los dos contenedores corriendo.
  2. La UI en `http://localhost:4200` con al menos 2 tareas creadas por ti.
  3. `docker volume ls` mostrando `datos-tareas`.

### Rúbrica (100 pts)

| Criterio | Puntos |
|---|---|
| Backend se construye y corre correctamente | 20 |
| Frontend se construye y consume la API | 20 |
| `docker-compose.yml` con red + volumen + 2 servicios | 25 |
| Volumen persiste datos tras `docker rm` | 10 |
| `.dockerignore` correcto en ambos servicios | 5 |
| Respuestas del cuestionario | 10 |
| Capturas de pantalla solicitadas | 10 |

---

## 📖 Glosario rápido

- **Host**: tu computador, el "anfitrión".
- **Imagen**: plantilla inmutable que contiene SO mínimo + app.
- **Contenedor**: proceso aislado que ejecuta una imagen.
- **Capa (layer)**: cada instrucción del Dockerfile crea una capa cacheable.
- **Registry**: servidor que almacena imágenes (Docker Hub, GitHub Container Registry…).
- **Compose**: herramienta que levanta varios servicios con un YAML.
- **Bridge network**: red virtual interna que permite comunicación entre contenedores.
- **Bind mount**: carpeta del host montada dentro del contenedor.
- **Volumen nombrado**: almacenamiento gestionado por Docker en `/var/lib/docker/volumes`.

---

## 🧹 Limpieza final (opcional)

Si quieres dejar tu máquina como al principio:

```bash
docker compose down -v --rmi all
docker system prune -af --volumes   # ⚠️ elimina TODO lo de Docker
```

---

> **Felicitaciones.** Has construido, empaquetado y orquestado una aplicación completa usando solo Docker en local. Estos mismos conceptos son la base de las siguientes experiencias del curso (CI/CD, registries privados y despliegue en la nube). 🐳
