# Experiencia 4 – Registries y CI: Docker Hub, Amazon ECR y tu primer GitHub Actions

> **Asignatura:** Introduccion a Herramientas DevOps (ISY1101)
> **Unidad:** 2.4 – Gestion y versionado de imagenes en Amazon ECR y Docker Hub
> **Duracion estimada:** 2 horas
> **Prerequisitos:** haber completado las Experiencias 2 (Docker en local) y 3 (EC2 + ECR)
> **Sistema de referencia:** Windows / macOS / Linux con Docker Desktop o Docker Engine

---

## Por que esta experiencia es distinta de la 3

En la **Experiencia 3** ya hiciste `docker push` a Amazon ECR desde tu maquina y desplegaste en EC2 a mano. Aqui no vamos a repetir eso. La Experiencia 4 introduce **cuatro temas nuevos** que la EA2 (Evaluacion Parcial N°2) evalua explicitamente:

| Tema nuevo | Por que importa | Indicador EA2 |
|---|---|---|
| **Dockerfile multi-stage + usuario no root** | Imagenes mas pequenas y seguras. La EA2 lo evalua con 20%. | IE1 |
| **Docker Hub vs Amazon ECR** | Saber cuando usar un registry publico y cuando uno privado, y como versionar imagenes. | IE4 |
| **GitHub Actions (build + push automatico)** | Es la base del pipeline CI/CD que pide la EA2. | IE4 (20%) |
| **Rama `deploy` + GitHub Secrets** | Disparador del pipeline y manejo seguro de credenciales. Tal cual lo exige la EA2. | IE4 |

> **Lo que NO veremos aqui:** el deploy automatico a EC2. Eso queda para la Experiencia 5. En esta sesion el pipeline llega hasta `push` al registry; la EC2 sigue siendo manual como en la Experiencia 3.

---

## Que construiremos

Vamos a tomar los repositorios **`backend_intro_devops`** y **`frontend_intro_devops`** que ya conoces, y a transformarlos en **proyectos listos para CI**:

```
                             [ Tu fork en GitHub ]
                                       |
                            git push origin deploy
                                       |
                                       v
                         [ GitHub Actions ]   (runner ubuntu-latest)
                                       |
                          docker build (multi-stage)
                                       |
                  +--------------------+---------------------+
                  |                                          |
                  v                                          v
         [ Docker Hub (publico) ]                  [ Amazon ECR (privado) ]
        usuario/tareas-backend                   <ID>.dkr.ecr.../tareas-backend
            :v1.0.0  :latest  :<sha>                 :v1.0.0  :latest  :<sha>
```

Los **dos repositorios** terminaran con la misma estructura:

```
backend_intro_devops/                  frontend_intro_devops/
+-- Dockerfile               (multi-stage, no root)
+-- .dockerignore
+-- .github/
|   +-- workflows/
|       +-- build-and-push-dockerhub.yml
|       +-- build-and-push-ecr.yml      (BONUS)
+-- src/                     (codigo de la app, sin cambios)
+-- package.json
```

---

## Tabla de contenidos

1. [Objetivos de aprendizaje](#objetivos-de-aprendizaje)
2. [Conceptos clave](#conceptos-clave)
3. [Planificacion de las 2 horas](#planificacion-de-las-2-horas)
4. [Parte 1 – Dockerfiles multi-stage + usuario no root](#parte-1--dockerfiles-multi-stage--usuario-no-root-40-min)
5. [Parte 2 – Publicar en Docker Hub (registry publico)](#parte-2--publicar-en-docker-hub-registry-publico-20-min)
6. [Parte 3 – Publicar en Amazon ECR (registry privado)](#parte-3--publicar-en-amazon-ecr-registry-privado-20-min)
7. [Parte 4 – Tu primer pipeline en GitHub Actions](#parte-4--tu-primer-pipeline-en-github-actions-30-min)
8. [Parte 5 – Probar el pipeline end-to-end](#parte-5--probar-el-pipeline-end-to-end-10-min)
9. [Cuestionario de autoevaluacion](#cuestionario-de-autoevaluacion)
10. [Reto opcional](#reto-opcional)
11. [Solucion de problemas (Troubleshooting)](#solucion-de-problemas-troubleshooting)
12. [Entregables y criterios de evaluacion](#entregables-y-criterios-de-evaluacion)
13. [Glosario](#glosario)

---

## Objetivos de aprendizaje

Al terminar esta experiencia el estudiante sera capaz de:

- Construir imagenes Docker con **multi-stage build** y **usuario no root**, justificando cada decision.
- Comparar **Docker Hub** (publico) y **Amazon ECR** (privado) y elegir cual usar segun el caso.
- Aplicar **versionado de tags** (`vX.Y.Z`, `latest`, `<sha>`) y explicar los anti-patrones.
- Crear un **workflow de GitHub Actions** que se dispare con un push a la rama `deploy` y publique imagenes en un registry.
- Configurar **GitHub Secrets** para credenciales (Docker Hub Access Token, AWS).
- Verificar el pipeline desde la pestana **Actions** y desde la consola del registry.

---

## Conceptos clave

### 1. Imagen vs contenedor (repaso de un parrafo)

Una **imagen** es una plantilla inmutable (codigo + dependencias + SO minimo). Un **contenedor** es la instancia en ejecucion. La imagen vive en un **registry**; cuando haces `docker run` el demonio descarga la imagen (si no esta) y crea un contenedor a partir de ella.

### 2. Registry publico vs privado

| | **Docker Hub** | **Amazon ECR** |
|---|---|---|
| Acceso | Publico por defecto (cualquiera puede `pull`) | Privado por defecto (requiere IAM o token) |
| Cuenta | Cuenta personal gratuita en hub.docker.com | Forma parte de tu cuenta AWS |
| Cuando elegirlo | Imagenes open source, demos, equipos pequenos | Aplicaciones internas de empresa, integracion con ECS/EKS |
| Limites gratuitos | 1 repositorio privado; rate limit de pulls anonimos | Pago por almacenamiento y trafico, pero gratis dentro de tu VPC |
| Autenticacion en CI | Access Token (revocable) | Credenciales IAM o STS temporales |

> **Regla practica:** si el codigo es abierto y no contiene secretos -> Docker Hub. Si es producto de empresa, prefiere ECR (o Docker Hub privado de pago).

### 3. Versionado de tags

Una imagen no es nada sin su tag. **El tag es la "version" de la imagen.**

| Tag | Cuando usarlo | Anti-patron |
|---|---|---|
| `vX.Y.Z` (ej. `v1.0.0`) | Releases reales (semver). Permite hacer rollback exacto. | Saltarse versiones o no incrementar |
| `latest` | Apuntador "ultima version estable". Comodo para demos y para `docker pull` rapido. | Confiar en `latest` en produccion (no es reproducible) |
| `<git-sha>` (ej. `a1b2c3d`) | Trazabilidad exacta entre imagen y commit. Lo usan los pipelines. | Olvidarlo: sin SHA no puedes mapear bug -> codigo |
| `dev`, `staging`, `prod` | Promocion entre ambientes. | Pisarlos sin proceso (perdida de historial) |

**Buena practica en CI:** publicar siempre **tres tags a la vez**: `vX.Y.Z` + `latest` + `<sha>`.

### 4. Multi-stage build

La idea es **separar build y runtime** en dos imagenes encadenadas:

```
[ stage builder ]  --> instala dependencias, compila (npm ci, ng build, etc.)
        |
        | COPY --from=builder
        v
[ stage runtime ]  --> imagen final, sin toolchain, lista para correr
```

Beneficios:
- **Imagen final mas pequena:** solo el binario / artefacto, sin compiladores ni `node_modules` de dev.
- **Menos superficie de ataque:** menos paquetes = menos CVEs.
- **Builds reproducibles:** la receta describe build y runtime juntos.

> Comparativa real (esta experiencia, frontend Angular):
> - Single-stage con `ng serve`: ~1.2 GB
> - Multi-stage con `nginx-unprivileged`: ~25 MB

### 5. Usuario no root

Por defecto, los contenedores corren como `root` dentro del contenedor. Si un atacante logra romper la app, ya tiene `root` (al menos dentro del contenedor). La defensa es:

```dockerfile
RUN adduser -D -u 1000 appuser
USER appuser
```

O aprovechar usuarios que la imagen base ya trae (`node` en `node:alpine`, `nginx` en `nginx-unprivileged`). **La EA2 lo evalua explicitamente en IE1.**

### 6. GitHub Actions: anatomia minima

Un workflow es un YAML en `.github/workflows/` con esta estructura:

```yaml
name: CI - Build and push          # nombre visible en la pestana Actions
on:                                 # cuando se dispara
  push:
    branches: [ "deploy" ]
jobs:
  build-and-push:
    runs-on: ubuntu-latest          # maquina virtual gratuita
    steps:
      - uses: actions/checkout@v4   # clona tu codigo en el runner
      - run: docker build .         # cualquier comando de shell
```

| Concepto | Que es |
|---|---|
| **workflow** | Un archivo `.yml` con un proceso automatizado |
| **event** (`on:`) | El disparador (push, pull_request, schedule, manual...) |
| **job** | Conjunto de pasos que comparten el mismo runner |
| **step** | Un comando o una "action" reutilizable |
| **action** (`uses:`) | Componente reutilizable publicado por alguien (ej. `actions/checkout`) |
| **runner** | Maquina virtual que ejecuta los jobs (`ubuntu-latest`, `windows-latest`, `macos-latest`) |
| **secret** | Variable cifrada accesible como `${{ secrets.NOMBRE }}` |

---

## Planificacion de las 2 horas

| Bloque | Tiempo | Actividad |
|---|---|---|
| 0 | 5 min | Forks de los dos repos, clonado y branch `deploy` |
| Parte 1 | 40 min | Reescribir Dockerfiles a multi-stage + no root |
| Parte 2 | 20 min | Push manual a Docker Hub |
| Pausa | 5 min | – |
| Parte 3 | 20 min | Push manual a ECR (con tags v1, v2, latest) |
| Parte 4 | 30 min | Crear el workflow de GitHub Actions |
| Parte 5 | 10 min | Disparar el pipeline y validar |
| Cierre | 10 min | Cuestionario y limpieza |
| **Total** | **2 h** | |

---

## Paso 0 – Preparacion (5 min)

Vamos a trabajar sobre **forks** de los dos repos de la app de tareas.

1. Abre en GitHub:
   - https://github.com/Umbingelelo/backend_intro_devops
   - https://github.com/Umbingelelo/frontend_intro_devops
2. Haz clic en **Fork** (arriba a la derecha) en ambos. Quedan en `https://github.com/<TU_USUARIO>/backend_intro_devops` y `https://github.com/<TU_USUARIO>/frontend_intro_devops`.
3. Crea una carpeta de trabajo y clona **tu fork** (no el original):

```bash
mkdir exp4-registries
cd exp4-registries
git clone https://github.com/<TU_USUARIO>/backend_intro_devops.git
git clone https://github.com/<TU_USUARIO>/frontend_intro_devops.git
```

4. En cada repo crea la rama `deploy` que va a disparar el pipeline:

```bash
cd backend_intro_devops
git checkout -b deploy
cd ../frontend_intro_devops
git checkout -b deploy
cd ..
```

> **Por que `deploy` y no `main`?** La EA2 lo exige textualmente: "Uso de triggers basados en la rama `deploy`". La idea es que `main` quede como rama estable para revisar codigo y `deploy` como gatillo del pipeline.


---

# Parte 1 – Dockerfiles multi-stage + usuario no root (40 min)

> **Que cambia respecto a la Experiencia 2:** los Dockerfiles que ya tienes en los repos son **single-stage y corren como root**. Aqui los reemplazamos por versiones de produccion.

## Paso 1.1 – Backend: del single-stage al multi-stage (15 min)

Abre `backend_intro_devops/Dockerfile`. Hoy tiene esta forma (resumida):

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "src/server.js"]
```

Vamos a reemplazar todo el archivo por esta version multi-stage. Puedes copiar la plantilla desde este mismo repo en `experiencia-2.4/ejemplos/backend/Dockerfile`:

```dockerfile
# ---------- ETAPA 1: builder ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

# ---------- ETAPA 2: runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/src ./src

RUN mkdir -p /data && chown -R node:node /data

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "src/server.js"]
```

### Que cambia y por que

| Cambio | Por que |
|---|---|
| `FROM ... AS builder` y `FROM ... AS runtime` | Dos etapas: una para resolver dependencias, otra para correr |
| `npm ci --omit=dev` en vez de `npm install --omit=dev` | `ci` es estricto: falla si `package-lock.json` no concuerda. Ideal para CI. |
| `COPY --from=builder --chown=node:node` | Copia desde la etapa anterior con dueno `node`, no `root` |
| `RUN mkdir -p /data && chown -R node:node /data` | El usuario `node` debe poder escribir el volumen |
| `USER node` | Cambia al usuario sin privilegios antes del CMD |
| `HEALTHCHECK` | Permite a Docker / Compose / EC2 saber si el contenedor esta vivo |

### Probar en local

```bash
cd backend_intro_devops
docker build -t tareas-backend:v1.0.0 .
docker images tareas-backend
```

Levantalo y verifica que **no corres como root**:

```bash
docker run -d --name tb-test -p 3000:3000 tareas-backend:v1.0.0
docker exec tb-test whoami
# Debe responder: node
docker exec tb-test id
# Debe responder algo como: uid=1000(node) gid=1000(node) groups=1000(node)
```

Verifica que la API sigue respondiendo:

```bash
curl http://localhost:3000/api/tareas
```

Limpia:

```bash
docker rm -f tb-test
```

> **Checkpoint 1.1:** la imagen pesa lo mismo o menos que la single-stage, `whoami` responde `node` y la API funciona igual.

---

## Paso 1.2 – Frontend: build de produccion con Nginx (20 min)

El Dockerfile actual del frontend usa `ng serve`, que es un servidor de **desarrollo** y trae todo el toolchain de Angular dentro de la imagen final (~1.2 GB). En produccion eso es inaceptable.

Reemplaza `frontend_intro_devops/Dockerfile` por esta version (plantilla en `experiencia-2.4/ejemplos/frontend/Dockerfile`):

```dockerfile
# ---------- ETAPA 1: builder ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && \
    mkdir -p /app/build-output && \
    ( cp -r /app/dist/*/browser/* /app/build-output/ 2>/dev/null || \
      cp -r /app/dist/*/* /app/build-output/ )

# ---------- ETAPA 2: runtime ----------
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder --chown=nginx:nginx /app/build-output/ /usr/share/nginx/html/
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ > /dev/null || exit 1
```

Y crea junto a el un archivo `nginx.conf` (plantilla en `ejemplos/frontend/nginx.conf`):

```nginx
server {
  listen 8080;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;
  gzip on;
  gzip_types text/plain text/css application/json application/javascript;
  location / { try_files $uri $uri/ /index.html; }
  location ~* \.(?:js|css|woff2?|svg|png|jpg|jpeg|gif|ico)$ {
    expires 1y; add_header Cache-Control "public, immutable";
  }
  location = /index.html { add_header Cache-Control "no-store"; }
}
```

### Por que `nginx-unprivileged`?

La imagen oficial `nginx:alpine` corre como `root` para poder escuchar en el puerto 80. La variante **`nginxinc/nginx-unprivileged`** corre como usuario `nginx` (uid 101) y escucha en **8080**, sin necesitar root. Cumple con IE1 sin que tengas que escribir un `RUN adduser` a mano.

### Probar en local

```bash
cd frontend_intro_devops
docker build -t tareas-frontend:v1.0.0 .
docker images tareas-frontend
```

Compara el tamano con la imagen vieja (si la conservaste): la nueva debe ser **decenas de veces mas pequena**.

```bash
docker run -d --name tf-test -p 4200:8080 tareas-frontend:v1.0.0
docker exec tf-test whoami
# Debe responder: nginx
```

Abre http://localhost:4200 en el navegador. Veras la app Angular cargada (recuerda que el backend tiene que estar corriendo aparte para que se vean las tareas).

Limpia:

```bash
docker rm -f tf-test
```

> **Checkpoint 1.2:** imagen final < 50 MB, `whoami` responde `nginx`, la app carga.

---

## Paso 1.3 – Commit en la rama deploy (5 min)

Aun no estamos publicando nada. Solo dejamos los Dockerfiles preparados para cuando llegue el pipeline.

```bash
cd backend_intro_devops
git add Dockerfile
git commit -m "feat(docker): multi-stage build con usuario no root"
git push origin deploy

cd ../frontend_intro_devops
git add Dockerfile nginx.conf
git commit -m "feat(docker): multi-stage Angular + nginx-unprivileged"
git push origin deploy
```

> **Checkpoint 1.3:** ambos repos tienen la rama `deploy` empujada con los nuevos Dockerfiles.


---

# Parte 2 – Publicar en Docker Hub (registry publico) (20 min)

> **Por que Docker Hub primero?** Es el registry mas simple del mundo: una sola URL, una sola cuenta, un solo token. Nos permite enfocarnos en el flujo `tag -> push -> pull` sin pelearnos con AWS Academy.

## Paso 2.1 – Cuenta y Access Token (5 min)

1. Si no tienes cuenta, crea una en https://hub.docker.com (es gratis).
2. Anota tu **usuario** (no es tu email; es el handle).
3. Genera un **Access Token** (no uses tu contrasena en CI):
   - Ve a **Account Settings -> Security -> New Access Token**.
   - Description: `exp4-curso-devops`.
   - Permissions: **Read & Write**.
   - Copia el token **una sola vez** (no se vuelve a mostrar). Pegalo en un archivo temporal `secrets.txt` que NO commitearas.

> **Por que un token y no la contrasena?** El token es revocable, tiene scopes y nunca expone tu cuenta principal. Si se filtra, lo regeneras y listo.

## Paso 2.2 – Login desde tu terminal (2 min)

```bash
docker login -u <TU_USUARIO_DOCKERHUB>
# Cuando pida password, pega el TOKEN (no tu contrasena).
```

Deberias ver:

```
Login Succeeded
```

## Paso 2.3 – Tag con tres versiones a la vez (5 min)

Una imagen puede tener multiples tags. Es lo que hace que `:latest`, `:v1.0.0` y `:<sha>` apunten al mismo binario sin duplicarlo.

```bash
USER=<TU_USUARIO_DOCKERHUB>
SHA=$(git -C backend_intro_devops rev-parse --short HEAD)

# Backend
docker tag tareas-backend:v1.0.0 $USER/tareas-backend:v1.0.0
docker tag tareas-backend:v1.0.0 $USER/tareas-backend:latest
docker tag tareas-backend:v1.0.0 $USER/tareas-backend:$SHA

# Frontend
SHA_FE=$(git -C frontend_intro_devops rev-parse --short HEAD)
docker tag tareas-frontend:v1.0.0 $USER/tareas-frontend:v1.0.0
docker tag tareas-frontend:v1.0.0 $USER/tareas-frontend:latest
docker tag tareas-frontend:v1.0.0 $USER/tareas-frontend:$SHA_FE
```

> **PowerShell (Windows):** sustituye la asignacion `USER=...` por `$USER = "<TU_USUARIO>"` y `$SHA = git -C backend_intro_devops rev-parse --short HEAD`.

## Paso 2.4 – Push (5 min)

```bash
docker push $USER/tareas-backend:v1.0.0
docker push $USER/tareas-backend:latest
docker push $USER/tareas-backend:$SHA

docker push $USER/tareas-frontend:v1.0.0
docker push $USER/tareas-frontend:latest
docker push $USER/tareas-frontend:$SHA_FE
```

Observa el output: las capas que **comparten** las imagenes (por ejemplo `node:20-alpine`) se suben **una sola vez**. Por eso el segundo push es muy rapido.

## Paso 2.5 – Verificar desde la web y desde otra maquina (3 min)

1. Abre `https://hub.docker.com/r/<TU_USUARIO>/tareas-backend`. Veras tu repo publico con los tres tags listados en la pestana **Tags**.
2. Verifica que **cualquier maquina** puede descargar tu imagen sin login (porque es publica):

```bash
docker logout
docker pull <TU_USUARIO>/tareas-backend:v1.0.0
```

> **Captura para evidencias:** la pestana **Tags** mostrando `v1.0.0`, `latest` y el SHA, con timestamps cercanos.

> **Cuestion para discutir en clase:** si tu codigo usara una API key dentro del bundle, publicar en Docker Hub publico la expondria al mundo. Por eso para apps de empresa se prefiere ECR.


---

# Parte 3 – Publicar en Amazon ECR (registry privado) (20 min)

> **Repaso comprimido** de lo que viste en la Experiencia 3. Aqui solo agregamos el **versionado serio** con tres tags simultaneos.

## Paso 3.1 – Verificar credenciales y crear repos (5 min)

Si ya tienes el AWS CLI configurado de la Experiencia 3, valida:

```bash
aws sts get-caller-identity
```

Si responde `ExpiredTokenException`, regenera credenciales desde **AWS Details -> AWS CLI** en el Learner Lab y vuelve a pegarlas en `~/.aws/credentials`.

Crea los repositorios (si aun no existen):

```bash
aws ecr create-repository --repository-name tareas-backend  --region us-east-1
aws ecr create-repository --repository-name tareas-frontend --region us-east-1
```

Anota tu **Account ID** (12 digitos):

```bash
aws sts get-caller-identity --query Account --output text
```

## Paso 3.2 – Login y tag triple (5 min)

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGISTRY=${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com

aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin $REGISTRY

# Backend
SHA=$(git -C backend_intro_devops rev-parse --short HEAD)
docker tag tareas-backend:v1.0.0 $REGISTRY/tareas-backend:v1.0.0
docker tag tareas-backend:v1.0.0 $REGISTRY/tareas-backend:latest
docker tag tareas-backend:v1.0.0 $REGISTRY/tareas-backend:$SHA

# Frontend
SHA_FE=$(git -C frontend_intro_devops rev-parse --short HEAD)
docker tag tareas-frontend:v1.0.0 $REGISTRY/tareas-frontend:v1.0.0
docker tag tareas-frontend:v1.0.0 $REGISTRY/tareas-frontend:latest
docker tag tareas-frontend:v1.0.0 $REGISTRY/tareas-frontend:$SHA_FE
```

## Paso 3.3 – Push y verificacion (5 min)

```bash
docker push $REGISTRY/tareas-backend:v1.0.0
docker push $REGISTRY/tareas-backend:latest
docker push $REGISTRY/tareas-backend:$SHA

docker push $REGISTRY/tareas-frontend:v1.0.0
docker push $REGISTRY/tareas-frontend:latest
docker push $REGISTRY/tareas-frontend:$SHA_FE
```

En la consola de AWS -> **ECR -> tareas-backend -> Images**, deberias ver los tres tags apuntando al **mismo Image Digest** (porque son el mismo binario con tres etiquetas).

## Paso 3.4 – Simular un cambio y publicar `v1.0.1` (5 min)

Esto es para que veas como el versionado refleja un cambio real.

1. Edita `backend_intro_devops/src/server.js` y cambia el mensaje de bienvenida:

```javascript
const MENSAJE_BIENVENIDA = process.env.MENSAJE_BIENVENIDA || 'API de Tareas v1.0.1';
```

2. Reconstruye y publica con el tag nuevo:

```bash
cd backend_intro_devops
docker build -t tareas-backend:v1.0.1 .
docker tag tareas-backend:v1.0.1 $REGISTRY/tareas-backend:v1.0.1
docker tag tareas-backend:v1.0.1 $REGISTRY/tareas-backend:latest   # latest ahora apunta al nuevo
docker push $REGISTRY/tareas-backend:v1.0.1
docker push $REGISTRY/tareas-backend:latest
```

3. En la consola de ECR, observa que:
   - Aparece un nuevo Image Digest para `v1.0.1`.
   - El tag `latest` se **movio** del digest viejo al nuevo.
   - El tag `v1.0.0` sigue donde estaba (eso es lo que permite hacer rollback).

> **Idea clave:** los tags son punteros mutables a digests inmutables. El digest `sha256:...` es la verdad; el tag es solo una etiqueta movible.


---

# Parte 4 – Tu primer pipeline en GitHub Actions (30 min)

Hasta aqui lo hacias **a mano**: build, tag, push. Es repetitivo y propenso a errores. Vamos a delegarselo a GitHub Actions: cada vez que hagas push a la rama `deploy`, GitHub construira la imagen y la publicara por ti.

## Paso 4.1 – Anatomia de un workflow (5 min)

Crea el archivo `.github/workflows/build-and-push-dockerhub.yml` en `backend_intro_devops/`. Plantilla en `experiencia-2.4/ejemplos/workflows/build-and-push-dockerhub.yml`:

```yaml
name: CI - Build and push to Docker Hub

on:
  push:
    branches: [ "deploy" ]
  workflow_dispatch:

env:
  IMAGE_NAME: ${{ vars.IMAGE_NAME || 'tareas-backend' }}
  IMAGE_VERSION: "v1.0.0"

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - name: Checkout del codigo
        uses: actions/checkout@v4

      - name: Configurar Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login en Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Build y push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: ./Dockerfile
          push: true
          platforms: linux/amd64
          tags: |
            ${{ secrets.DOCKERHUB_USERNAME }}/${{ env.IMAGE_NAME }}:${{ env.IMAGE_VERSION }}
            ${{ secrets.DOCKERHUB_USERNAME }}/${{ env.IMAGE_NAME }}:latest
            ${{ secrets.DOCKERHUB_USERNAME }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### Linea por linea, lo mas importante

| Linea | Que dice |
|---|---|
| `on: push: branches: [ "deploy" ]` | Solo se dispara con push a la rama `deploy`. La EA2 lo exige asi. |
| `workflow_dispatch` | Te permite lanzarlo a mano desde la pestana Actions, sin commit |
| `env: IMAGE_VERSION: "v1.0.0"` | Cambias esta variable cuando haces release. En clase es manual; en industria sale de tags de Git. |
| `permissions: contents: read` | Minimo privilegio: el workflow solo lee tu repo |
| `actions/checkout@v4` | Clona tu repo en el runner |
| `docker/login-action@v3` | Hace `docker login` con secrets, sin exponerlos en logs |
| `docker/build-push-action@v6` | Hace build y push en un solo paso, usando Buildx |
| `tags: \| ...` | Tres tags en simultaneo: `vX.Y.Z`, `latest`, `<sha>` |
| `cache-from / cache-to: type=gha` | Cache de capas en GitHub. Builds repetidos toman segundos. |

## Paso 4.2 – Configurar GitHub Secrets (5 min)

En tu fork del backend, ve a **Settings -> Secrets and variables -> Actions -> New repository secret** y agrega:

| Nombre | Valor |
|---|---|
| `DOCKERHUB_USERNAME` | tu handle de Docker Hub |
| `DOCKERHUB_TOKEN` | el access token que generaste en el Paso 2.1 |

Luego ve a la pestana **Variables** (al lado de Secrets) y crea:

| Nombre | Valor |
|---|---|
| `IMAGE_NAME` | `tareas-backend` |

> **Por que separar secrets y variables?** Los secrets se cifran y nunca se imprimen en logs. Las variables son texto plano (no son sensibles), pero centralizan configuracion para que no la dupliques en cada workflow.

Repite el mismo proceso en el fork del frontend, esta vez con `IMAGE_NAME=tareas-frontend`.

## Paso 4.3 – Bonus: workflow paralelo a ECR (10 min)

Si quieres publicar tambien en ECR desde el pipeline, anade `.github/workflows/build-and-push-ecr.yml` (plantilla en `ejemplos/workflows/build-and-push-ecr.yml`):

```yaml
name: CI - Build and push to Amazon ECR
on:
  push: { branches: [ "deploy" ] }
  workflow_dispatch:
jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id:    ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-session-token:     ${{ secrets.AWS_SESSION_TOKEN }}
          aws-region:            us-east-1
      - id: ecr-login
        uses: aws-actions/amazon-ecr-login@v2
      - uses: docker/setup-buildx-action@v3
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          platforms: linux/amd64
          tags: |
            ${{ steps.ecr-login.outputs.registry }}/tareas-backend:v1.0.0
            ${{ steps.ecr-login.outputs.registry }}/tareas-backend:latest
            ${{ steps.ecr-login.outputs.registry }}/tareas-backend:${{ github.sha }}
```

Y agrega como secrets:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN`

> **Atencion AWS Academy:** las credenciales son temporales (~4 h). Si el workflow falla con `ExpiredTokenException`, regenera credenciales y actualiza los tres secrets. En empresa real se usan **OIDC** + roles IAM (sin secrets); por ahora basta con conocer la limitacion.

## Paso 4.4 – Commit y push de los workflows (10 min)

```bash
cd backend_intro_devops
mkdir -p .github/workflows
# (copia los archivos de plantilla aqui)
git checkout deploy
git add .github/
git commit -m "ci(actions): pipeline build+push a Docker Hub y ECR"
git push origin deploy
```

> **Inmediatamente** despues del push, ve a tu repo en GitHub -> pestana **Actions**. Veras el workflow corriendo en tiempo real.


---

# Parte 5 – Probar el pipeline end-to-end (10 min)

## Paso 5.1 – Lectura del primer run (3 min)

En la pestana **Actions** de GitHub:

1. Click en el run mas reciente.
2. Click en el job `build-and-push`.
3. Despliega cada step. Busca:
   - **Login en Docker Hub:** `Login Succeeded`.
   - **Build y push:** las capas que se subieron y el digest final.
   - **Resumen:** los tres tags publicados (en `Step Summary`).

## Paso 5.2 – Disparar un cambio real (5 min)

Edita algo simple en el codigo. Por ejemplo en `backend_intro_devops/src/server.js`:

```javascript
const MENSAJE_BIENVENIDA = process.env.MENSAJE_BIENVENIDA || 'API de Tareas - desplegado por Actions';
```

```bash
git add src/server.js
git commit -m "chore: actualizar mensaje de bienvenida (test pipeline)"
git push origin deploy
```

Vuelve a Actions: aparece un **nuevo run** automaticamente. Observa que:
- El step de build dice `Layer cache hit` para casi todo (gracias a `cache-from: type=gha`).
- El push solo sube las capas que cambiaron.
- En Docker Hub, el tag `latest` ahora apunta al nuevo digest.

## Paso 5.3 – Verificar la imagen (2 min)

Desde tu maquina local, descarga la imagen recien publicada y correla:

```bash
docker pull <TU_USUARIO>/tareas-backend:latest
docker run --rm -p 3000:3000 <TU_USUARIO>/tareas-backend:latest
```

Abre http://localhost:3000 -> deberias ver el nuevo mensaje.

> **Checkpoint final:** un cambio en codigo, un push, y una imagen actualizada en el registry. Eso es CI.

---

## Cuestionario de autoevaluacion

Crea `respuestas.md` en la raiz de **cada** repositorio (backend y frontend) y responde:

1. Cual es la diferencia entre **Docker Hub publico** y **ECR privado**? Da un caso de uso real para cada uno.
2. Que ventajas trae el **multi-stage build**? Cita al menos dos.
3. Que riesgo concreto evitas al correr el contenedor con un usuario distinto a `root`?
4. Por que publicamos **tres tags simultaneos** (`v1.0.0`, `latest`, `<sha>`) y no solo `latest`?
5. Cual es la diferencia entre un **tag** y un **digest** en una imagen Docker?
6. Que pasaria si tu workflow de Actions usara `branches: [ "main" ]` en lugar de `branches: [ "deploy" ]`?
7. Que diferencia hay entre **Secrets** y **Variables** en la configuracion de un repo de GitHub?
8. Por que es importante usar `permissions: contents: read` en un workflow?
9. En el archivo `nginx-unprivileged`, por que escuchamos en `8080` y no en `80`?
10. Si tus credenciales de AWS Academy expiran cada 4 h, que estrategia usarias en un pipeline real para no estar regenerandolas?

---

## Reto opcional

Elige **uno** y documentalo en `respuestas.md`:

- **A.** Modifica el workflow para que la variable `IMAGE_VERSION` se calcule **automaticamente** a partir del ultimo tag de Git (`git describe --tags --always`). Asi no tienes que editar el YAML cada release.
- **B.** Anade un step que ejecute `npm test` ANTES del build, y que el push solo ocurra si los tests pasan. (Si no hay tests, anade uno trivial que verifique `node -e "require('./src/server.js')"`.)
- **C.** Crea un workflow que publique a Docker Hub **y** a ECR en paralelo (dos jobs simultaneos en el mismo workflow), no en archivos separados.
- **D.** Usa **Trivy** o **Docker Scout** como step adicional para escanear la imagen antes del push y fallar el pipeline si hay vulnerabilidades **HIGH** o **CRITICAL**.

---

## Solucion de problemas (Troubleshooting)

### Generales

| Sintoma | Causa probable | Solucion |
|---|---|---|
| `denied: requested access to the resource is denied` al `docker push` | No hiciste login o el repo no existe | `docker login` (Docker Hub) o `aws ecr get-login-password ... \| docker login ...` (ECR) |
| `EACCES: permission denied, mkdir '/data'` al iniciar el contenedor | Olvidaste `chown -R node:node /data` antes del `USER node` | Revisa el orden de instrucciones en el Dockerfile |
| `nginx: [emerg] bind() to 0.0.0.0:80 failed (13: Permission denied)` | Estas usando `nginx:alpine` (root) y trataste de sacarle el USER root | Cambia a `nginxinc/nginx-unprivileged` y publica en `8080` |
| El build de Angular falla con `Could not find /app/dist/...` | El nombre de la subcarpeta de `dist/` no coincide con `angular.json` | Revisa la salida de `ng build`: la subcarpeta es la que dice `outputPath` |
| La imagen pesa 1+ GB en el frontend | Olvidaste cambiar el Dockerfile a multi-stage; sigue usando `ng serve` | Reemplaza el Dockerfile por la version con builder + `nginx-unprivileged` |
| `npm ci` falla con `Missing package-lock.json` | Tu repo no tiene lockfile | Ejecuta `npm install` localmente, commitea el `package-lock.json`, o cambia a `npm install` en el Dockerfile |

### Especificos de GitHub Actions

| Sintoma | Causa probable | Solucion |
|---|---|---|
| `Error: Username and password required` en el step de login | Falta el secret `DOCKERHUB_TOKEN` o esta mal escrito | Revisa Settings -> Secrets. Los nombres son sensibles a mayusculas |
| `ExpiredTokenException` en el step de ECR | Credenciales de AWS Academy expiraron | Regenera credenciales y actualiza los tres secrets (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`) |
| `no matching manifest for linux/amd64` al hacer pull en EC2 | Construiste en Mac M1/M2 sin `platforms: linux/amd64` | Asegurate de que el step `build-push-action` tenga `platforms: linux/amd64` |
| El workflow no se dispara con el push | Estas haciendo push a `main` y el trigger es `deploy` | `git push origin deploy` (no `main`). O lanzalo manualmente con `workflow_dispatch` |
| `Resource not accessible by integration` en algun step | Te falta el bloque `permissions:` en el job | Anade `permissions: contents: read` al job |
| Cache no se usa entre runs | Primer run o cambios en `package.json` | El cache se calienta en el primer build; despues hay hits. Si nunca hace hit, revisa que tengas `cache-from: type=gha` y `cache-to: type=gha,mode=max` |

### Especificos de Docker Hub

| Sintoma | Solucion |
|---|---|
| `unauthorized: incorrect username or password` | Estas usando tu contrasena en vez del Access Token. Genera token en Account Settings -> Security |
| `toomanyrequests: You have reached your pull rate limit` | Login con tu cuenta antes de hacer pull (los anonimos tienen rate limit muy bajo) |
| El repo no aparece publico aunque hiciste push | Docker Hub crea repos publicos por default, pero verifica en Settings del repo |

---

## Entregables y criterios de evaluacion

Entrega los **dos forks** con la siguiente estructura:

```
backend_intro_devops/                     frontend_intro_devops/
+-- Dockerfile                  (multi-stage, USER no root)
+-- .dockerignore
+-- nginx.conf                  (solo frontend)
+-- .github/workflows/
|   +-- build-and-push-dockerhub.yml
|   +-- build-and-push-ecr.yml  (BONUS, opcional)
+-- evidencias/                 (capturas — ver checklist en recursos/)
+-- respuestas.md               (cuestionario)
+-- src/                        (codigo de la app)
+-- package.json
```

### Rubrica (100 pts) — alineada con la EA2

| Criterio | Puntos | Indicador EA2 |
|---|---|---|
| Dockerfile multi-stage funcional, backend y frontend | 25 | IE1 |
| Usuario no root verificable con `whoami` | 10 | IE1 |
| Imagen publicada en Docker Hub con tres tags (`vX.Y.Z`, `latest`, `<sha>`) | 15 | IE4 |
| Imagen publicada en ECR con tres tags | 10 | IE4 |
| Workflow `.github/workflows/build-and-push-*.yml` correcto | 15 | IE4 |
| Trigger en rama `deploy` funcionando (run en verde tras push) | 10 | IE4 |
| Secrets configurados (sin filtrar valores en logs) | 5 | IE4 |
| Cuestionario contestado (10 preguntas) | 5 | IE8 |
| Evidencias completas y ordenadas | 5 | IE8 |

### Modalidad de entrega

- Sube las URLs de tus dos forks al sistema de evaluacion indicado por el profesor.
- Acompana cada URL con el link a un **run en verde** de la pestana Actions.

---

## Glosario

- **Registry:** servidor que almacena imagenes Docker. Ejemplos: Docker Hub, Amazon ECR, GitHub Container Registry.
- **Repositorio (en un registry):** espacio dentro del registry donde guardas las versiones de una imagen.
- **Tag:** etiqueta movible que apunta a un digest. Ej: `v1.0.0`, `latest`, `a1b2c3d`.
- **Digest:** hash inmutable (`sha256:...`) que identifica el contenido exacto de una imagen.
- **Multi-stage build:** Dockerfile con varios `FROM` que separan fases (build, runtime).
- **Capa (layer):** cada instruccion del Dockerfile crea una capa cacheable y compartible entre imagenes.
- **Workflow:** archivo YAML en `.github/workflows/` que define un proceso automatizado en GitHub Actions.
- **Runner:** maquina virtual que ejecuta los jobs de un workflow.
- **Secret:** variable cifrada en GitHub, accesible como `${{ secrets.NOMBRE }}`.
- **Variable de repositorio:** valor en texto plano (no sensible) accesible como `${{ vars.NOMBRE }}`.
- **Buildx:** plugin de Docker que habilita builds avanzados (multi-plataforma, cache distribuido).
- **OIDC:** mecanismo moderno para que GitHub Actions asuma un rol IAM en AWS sin secrets de larga duracion (no se usa en Academy, pero conviene conocerlo).

---

## Limpieza opcional

Si quieres dejar la maquina como al principio:

```bash
docker logout
docker rmi $(docker images "tareas-*" -q) 2>/dev/null
docker system prune -f
```

---

> **Felicitaciones.** Acabas de versionar imagenes en dos registries y de automatizar tu primer pipeline CI. En la **Experiencia 5** lo extenderemos: el pipeline tambien desplegara la imagen en EC2 automaticamente, y agregaremos la capa de base de datos. Vuelve al [README principal](../README.md) para ver el resto del curso.

