# Ejercicio 2.5 — Despliegue automatizado del Casino en AWS (3 EC2 + ECR)

> **Asignatura:** Introducción a Herramientas DevOps (ISY1101)
> **Última práctica antes de la EP2.**
> **Duración estimada:** 4–6 horas (en pareja).
> **Modalidad:** trabajo individual o en pareja, fuera del aula.

---

## 0. ¿Qué van a lograr al terminar?

Al cierre del ejercicio, **un push a la rama `main`** de su fork del frontend
provocará que GitHub Actions, sin que ustedes toquen una sola consola más:

1. construya la imagen Docker del frontend,
2. la suba a **Amazon ECR** (registro privado dentro de su cuenta AWS),
3. se conecte por SSH a la **EC2 del frontend** y haga `docker pull` + `docker run`,
4. y deje el casino visible en el navegador con el cambio recién hecho.

Lo mismo ocurre con el backend (en su propia EC2) y con la base de
datos (en su propia EC2). **Tres servicios, tres instancias, tres
security groups distintos**, todo orquestado desde GitHub Actions.

Es el flujo end-to-end que vimos en la **clase teórica 2.4 + 2.5**
(slides 14–16: ECR, slides 28–29: pipeline → EC2). Acá lo van a
ejecutar de verdad y con la arquitectura que les van a pedir en la EP2.

---

## 1. Arquitectura objetivo

```
                          Internet
                              │
                              ▼  (HTTP :80)
                ┌──────────────────────────────┐
                │  EC2-frontend  (Nginx)        │
                │  SG-frontend                  │
                │  inbound: 22 (mi IP), 80 (any)│
                └─────────────┬─────────────────┘
                              │  (HTTP :3000, solo
                              │   desde SG-frontend)
                              ▼
                ┌──────────────────────────────┐
                │  EC2-backend   (Node)         │
                │  SG-backend                   │
                │  inbound: 22 (mi IP),         │
                │           3000 desde SG-front │
                └─────────────┬─────────────────┘
                              │  (Postgres :5432,
                              │   solo desde SG-backend)
                              ▼
                ┌──────────────────────────────┐
                │  EC2-database  (Postgres)     │
                │  SG-database                  │
                │  inbound: 22 (mi IP),         │
                │           5432 desde SG-back  │
                │  Volumen Docker: pg_data      │
                └──────────────────────────────┘

                ┌──────────────────────────────┐
                │  Amazon ECR (privado)         │
                │   ├── casino-frontend         │
                │   ├── casino-backend          │
                │   └── casino-db               │
                └──────────────────────────────┘
```

**Solo el frontend es accesible desde Internet.** El backend solo
acepta tráfico desde la EC2 del frontend. La BD solo acepta tráfico
desde la EC2 del backend. Esto es exactamente lo que pide la pauta
oficial de la EP2 (IE7 + IE9: "el Frontend se comunica correctamente
con el Backend desplegado en la subred privada").

---

## 2. Repositorios base (NO clonar, hacer fork)

Los dos repos del casino ya están publicados por el docente:

- **Frontend Angular:** https://github.com/Umbingelelo/frontend_intro_devops_casino
- **Backend Node + Postgres:** https://github.com/Umbingelelo/backend_intro_devops_casino

> ⚠️ Trabajen siempre sobre **su propio fork**.

Cada repo trae el código pero **no** trae:

- `Dockerfile` (uno para front, dos en el repo del back: backend y BD)
- `docker-compose.yml` (no se va a usar compose en este ejercicio: cada
  EC2 corre **un solo `docker run`**)
- `.github/workflows/*.yml`

Ese es el trabajo del ejercicio.

---

## 3. Prerrequisitos

| Recurso              | Para qué                                      |
|----------------------|-----------------------------------------------|
| Cuenta GitHub        | Para hacer fork y guardar sus cambios         |
| AWS Academy Lab abierto | Levantar 3 EC2 + 3 repositorios ECR        |
| Docker Desktop local | Probar las imágenes antes de hacer push       |
| Git CLI              | `git clone`, `git checkout`, `git push`       |
| AWS CLI v2 instalado | Probar el login a ECR localmente              |
| VS Code (recomendado)| Editar los archivos                           |
| Una llave SSH        | Para que Actions se conecte a las EC2         |

---

## 4. Paso a paso

### Paso 1 — Hacer fork de los dos repos

1. Abran cada URL de la sección 2 con su sesión iniciada en GitHub.
2. Botón **"Fork"** arriba a la derecha → **"Create fork"**.
3. Quedarán con dos repos en su cuenta:
   - `https://github.com/<su-usuario>/frontend_intro_devops_casino`
   - `https://github.com/<su-usuario>/backend_intro_devops_casino`

### Paso 2 — Clonar localmente y crear la rama `dev`

```bash
git clone https://github.com/<su-usuario>/backend_intro_devops_casino.git
git clone https://github.com/<su-usuario>/frontend_intro_devops_casino.git

cd backend_intro_devops_casino && git checkout -b dev && git push -u origin dev && cd ..
cd frontend_intro_devops_casino && git checkout -b dev && git push -u origin dev && cd ..
```

> 💡 La rama `dev` es donde van a trabajar. `main` queda intacto hasta
> que abran un Pull Request más adelante (paso 13).

### Paso 3 — Escribir el `Dockerfile` del **backend**

En `backend_intro_devops_casino/Dockerfile`. Esqueleto guiado:

```dockerfile
# Etapa 1: instalar deps
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src

# Etapa 2: runtime mínimo
FROM node:20-alpine AS runtime
WORKDIR /app
# TODO: COPY --from=builder /app/node_modules ./node_modules
# TODO: COPY --from=builder /app/src ./src
# TODO: COPY package.json ./
# TODO: addgroup -S app && adduser -S app -G app
# TODO: USER app
EXPOSE 3000
CMD ["node", "src/server.js"]
```

Recuerden de la **clase 2.4** (slide 7): alpine + multi-stage +
usuario no root + capas mínimas.

### Paso 4 — Escribir el `Dockerfile` de la **base de datos**

> 🔑 Esto es lo nuevo respecto al ejercicio anterior. La BD también
> es una imagen propia que ustedes construyen y suben a ECR.

En el repo del backend, creen `db/Dockerfile`:

```dockerfile
FROM postgres:16-alpine
# Postgres ejecuta TODO archivo .sql que encuentre en este path,
# la primera vez que arranca con un volumen vacio.
COPY init.sql /docker-entrypoint-initdb.d/01-init.sql
EXPOSE 5432
```

> 🧠 ¿Por qué construir una imagen para la BD en vez de usar
> `postgres:16-alpine` directo? Porque así el `init.sql` queda
> **embebido** en la imagen — no depende de un archivo externo
> en la EC2. Versionado, reproducible, deployable como cualquier otro.
> Slide 5 de la clase teórica: "una imagen → muchos containers".

### Paso 5 — Escribir el `Dockerfile` del **frontend**

En `frontend_intro_devops_casino/Dockerfile`:

```dockerfile
# Etapa 1: build Angular
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Etapa 2: servir con Nginx
FROM nginx:alpine AS runtime
# TODO: COPY --from=builder /app/dist/casino-frontend/browser /usr/share/nginx/html
# TODO: COPY default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

`default.conf` (en la raíz del repo del frontend, junto al Dockerfile):

```
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
}
```

> ⚙️ **Antes** de buildear definitivo, editen
> `src/environments/environment.prod.ts` para que `apiBaseUrl`
> apunte a la **IP pública de la EC2 del backend**:
> `apiBaseUrl: 'http://<IP-publica-ec2-backend>:3000'`. Si dejan
> `localhost`, el navegador del usuario buscará el backend en su
> propia máquina y no funcionará.

### Paso 6 — Probar las imágenes en local

Antes de tocar AWS, comprueben que cada imagen levanta sola:

```bash
# DB
docker build -t casino-db:dev backend_intro_devops_casino/db
docker run -d --name db-test \
  -e POSTGRES_USER=casino -e POSTGRES_PASSWORD=casino -e POSTGRES_DB=casino_db \
  -p 5432:5432 -v pg_data:/var/lib/postgresql/data casino-db:dev

# Backend (apuntando a la BD local)
docker build -t casino-backend:dev backend_intro_devops_casino
docker run -d --name back-test --link db-test:db \
  -e DB_HOST=db -e DB_USER=casino -e DB_PASSWORD=casino -e DB_NAME=casino_db \
  -e JWT_SECRET=dev -p 3000:3000 casino-backend:dev

# Frontend
docker build -t casino-frontend:dev frontend_intro_devops_casino
docker run -d --name front-test -p 8080:80 casino-frontend:dev
```

Verifiquen:

- http://localhost:3000/health → `{"status":"ok"}`
- http://localhost:8080 → casino, login `demo` / `demo1234`.

Si todo funciona, **paren los contenedores** (`docker rm -f db-test back-test front-test`)
y sigan. Si algo falla, depuren acá. **No avancen con problemas locales a la nube.**

### Paso 7 — Crear los 3 repositorios en ECR

1. Abran el laboratorio en **AWS Academy → Learner Lab → Start Lab**.
2. Cuando la luz quede verde, click en **AWS** para abrir la consola.
3. Vayan a **Elastic Container Registry (ECR) → Repositories → Create**.
4. Creen **tres repositorios privados**, uno por cada imagen, todos
   en la misma región (la del lab; típicamente `us-east-1`):

   | Repositorio        | Visibilidad |
   |--------------------|-------------|
   | `casino-frontend`  | Private     |
   | `casino-backend`   | Private     |
   | `casino-db`        | Private     |

5. Para cada uno, copien el **URI** que les da AWS. Tiene esta forma:
   `123456789012.dkr.ecr.us-east-1.amazonaws.com/casino-frontend`.
   Guárdenlo: lo van a necesitar varias veces.

> 🧠 ECR vs Docker Hub (slides 11–16): elegimos ECR porque es
> **privado por defecto**, no tiene rate limit en pulls (importante
> en CI), está en la misma red de AWS que las EC2 (pull rápido) y
> se autentica con IAM. En Docker Hub free solo tienen 1 repo
> privado y rate-limit de 100 pulls / 6h.

### Paso 8 — Levantar las 3 instancias EC2

Vayan a **EC2 → Launch instances**. Repitan **tres veces** con estos
parámetros:

| Instancia      | AMI               | Tipo      | IP pública | Storage |
|----------------|-------------------|-----------|------------|---------|
| `casino-frontend` | Amazon Linux 2023 | t2.small  | Sí         | 20 GB   |
| `casino-backend`  | Amazon Linux 2023 | t2.small  | Sí¹        | 20 GB   |
| `casino-database` | Amazon Linux 2023 | t2.small  | Sí¹        | 20 GB   |

¹ Para esta práctica las tres instancias tendrán IP pública
(simplifica el SSH desde Actions). En la **EP2** ustedes pondrán el
backend y la BD en subnet privada con NAT/Bastion. Acá quedará
simulado vía security groups.

**Key pair:** creen una sola llamada `casino-key`, descarguen
`casino-key.pem` y guárdenla. Las 3 EC2 usan la misma.

### Paso 9 — Crear los 3 Security Groups (lo crítico)

> 🔒 Esta es **la parte que evalúa la EP2 en IE7**. El acceso entre
> servicios debe estar restringido por security group, no por IP
> abierta.

Vayan a **EC2 → Security Groups → Create security group**.

#### `SG-frontend`
- Inbound:
  - SSH (22) ← `Mi IP`
  - HTTP (80) ← `0.0.0.0/0`
- Outbound: All traffic (default)

#### `SG-backend`
- Inbound:
  - SSH (22) ← `Mi IP`
  - **TCP 3000 ← Source: `SG-frontend`** (no `0.0.0.0/0`)
- Outbound: All traffic

#### `SG-database`
- Inbound:
  - SSH (22) ← `Mi IP`
  - **TCP 5432 ← Source: `SG-backend`**
- Outbound: All traffic

> 💡 Para que el campo "Source" acepte un security group, deben
> haber creado primero el SG referenciado. Por eso conviene crearlos
> en orden: `SG-frontend` → `SG-backend` → `SG-database`.

Asignen cada SG a su EC2 correspondiente:

- `casino-frontend` → `SG-frontend`
- `casino-backend`  → `SG-backend`
- `casino-database` → `SG-database`

Anoten las **3 IPs públicas** (las van a usar como secrets en GitHub).

### Paso 10 — Preparar Docker en cada EC2

Conéctense por SSH a cada una de las 3 instancias y ejecuten:

```bash
chmod 400 casino-key.pem
ssh -i casino-key.pem ec2-user@<IP-publica>

sudo dnf update -y
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
exit
```

Vuelvan a entrar para que tome el grupo `docker`:

```bash
ssh -i casino-key.pem ec2-user@<IP-publica>
docker --version
```

Repitan en las **tres** EC2.

### Paso 11 — Configurar credenciales AWS y Secrets en GitHub

#### 11.1 Obtener credenciales temporales del Learner Lab

> ⚠️ **AWS Academy** entrega credenciales **temporales** que rotan
> cada vez que abren el lab. Tendrán que actualizarlas en GitHub
> cada sesión nueva (es la razón por la que en producción usaríamos
> OIDC en vez de access keys).

En el Learner Lab → click en **AWS Details → AWS CLI → Show**.
Copien las tres líneas:

```
aws_access_key_id     = ASIA...
aws_secret_access_key = ...
aws_session_token     = ...
```

#### 11.2 Generar una llave SSH dedicada para Actions

```bash
ssh-keygen -t ed25519 -f gh-actions-key -N ""
# Quedan 2 archivos: gh-actions-key (privada) y gh-actions-key.pub
```

En **cada una de las 3 EC2** agreguen la pública:

```bash
ssh -i casino-key.pem ec2-user@<IP-de-cada-ec2>
echo "<contenido de gh-actions-key.pub>" >> ~/.ssh/authorized_keys
```

#### 11.3 Configurar Secrets en cada fork

En **Settings → Secrets and variables → Actions → New repository secret**.

**Comunes a ambos repos** (frontend y backend):

| Nombre                  | Valor                                            |
|-------------------------|--------------------------------------------------|
| `AWS_ACCESS_KEY_ID`     | El `ASIA...` del paso 11.1                       |
| `AWS_SECRET_ACCESS_KEY` | El secret del paso 11.1                          |
| `AWS_SESSION_TOKEN`     | El session token del paso 11.1 (Academy)         |
| `AWS_REGION`            | `us-east-1` (o la que les dio el lab)            |
| `AWS_ACCOUNT_ID`        | Los 12 dígitos del URI del ECR                   |
| `EC2_SSH_KEY`           | Contenido completo del `gh-actions-key`          |

**Solo en el repo del backend:**

| Nombre              | Valor                                  |
|---------------------|----------------------------------------|
| `EC2_BACKEND_HOST`  | IP pública de `casino-backend`         |
| `EC2_DATABASE_HOST` | IP pública de `casino-database`        |
| `DB_HOST_PRIVATE`   | **IP privada** de `casino-database`    |
| `DB_PASSWORD`       | Cadena aleatoria larga                 |
| `JWT_SECRET`        | Cadena aleatoria larga                 |

**Solo en el repo del frontend:**

| Nombre              | Valor                                  |
|---------------------|----------------------------------------|
| `EC2_FRONTEND_HOST` | IP pública de `casino-frontend`        |

> 🧠 La IP **privada** de la BD (`DB_HOST_PRIVATE`) la usa el backend
> para conectarse internamente sin pasar por internet. La encuentran
> en el detalle de la EC2 (`Private IPv4 address`).

### Paso 12 — Workflows de GitHub Actions

#### 12.1 Workflow del backend → push a ECR + deploy en EC2-backend

`backend_intro_devops_casino/.github/workflows/deploy-backend.yml`:

```yaml
name: Build & Deploy backend

on:
  push:
    branches: [ main ]
    paths-ignore: [ 'db/**' ]   # cambios solo en db/ no disparan este job

jobs:
  build-push-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configurar credenciales AWS (temporales del Learner Lab)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id:     ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-session-token:     ${{ secrets.AWS_SESSION_TOKEN }}
          aws-region:            ${{ secrets.AWS_REGION }}

      - name: Login a ECR
        id: ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build & push backend
        env:
          REGISTRY: ${{ steps.ecr.outputs.registry }}
        run: |
          IMAGE=$REGISTRY/casino-backend
          docker build -t $IMAGE:${{ github.sha }} -t $IMAGE:latest .
          docker push $IMAGE:${{ github.sha }}
          docker push $IMAGE:latest

      - name: Desplegar en EC2-backend
        uses: appleboy/ssh-action@v1
        env:
          IMAGE: ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com/casino-backend:latest
        with:
          host: ${{ secrets.EC2_BACKEND_HOST }}
          username: ec2-user
          key: ${{ secrets.EC2_SSH_KEY }}
          envs: IMAGE
          script: |
            # Login a ECR desde la EC2 con sus credenciales del rol o pasandolas
            aws ecr get-login-password --region ${{ secrets.AWS_REGION }} 2>/dev/null \
              | docker login --username AWS --password-stdin \
                ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com \
              || true
            docker pull "$IMAGE"
            docker rm -f casino-backend || true
            docker run -d --name casino-backend --restart unless-stopped \
              -p 3000:3000 \
              -e DB_HOST=${{ secrets.DB_HOST_PRIVATE }} \
              -e DB_USER=casino \
              -e DB_PASSWORD=${{ secrets.DB_PASSWORD }} \
              -e DB_NAME=casino_db \
              -e JWT_SECRET=${{ secrets.JWT_SECRET }} \
              -e CORS_ORIGIN="*" \
              "$IMAGE"
```

> 🔐 Para que la EC2 pueda hacer `aws ecr get-login-password` necesita
> credenciales AWS. La forma limpia es asociar un **IAM role**
> `LabInstanceProfile` (que en Learner Lab viene predefinido) a cada
> EC2 al lanzarla. Si no, una alternativa rápida es exportar las
> credenciales temporales en cada deploy vía Secrets — más feo pero
> funciona en clase.

#### 12.2 Workflow de la BD → push a ECR + deploy en EC2-database

`backend_intro_devops_casino/.github/workflows/deploy-db.yml`:

```yaml
name: Build & Deploy database

on:
  push:
    branches: [ main ]
    paths: [ 'db/**', '.github/workflows/deploy-db.yml' ]

jobs:
  build-push-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id:     ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-session-token:     ${{ secrets.AWS_SESSION_TOKEN }}
          aws-region:            ${{ secrets.AWS_REGION }}
      - id: ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build & push casino-db
        env:
          REGISTRY: ${{ steps.ecr.outputs.registry }}
        run: |
          IMAGE=$REGISTRY/casino-db
          docker build -t $IMAGE:${{ github.sha }} -t $IMAGE:latest ./db
          docker push $IMAGE:${{ github.sha }}
          docker push $IMAGE:latest

      - name: Desplegar en EC2-database
        uses: appleboy/ssh-action@v1
        env:
          IMAGE: ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com/casino-db:latest
        with:
          host: ${{ secrets.EC2_DATABASE_HOST }}
          username: ec2-user
          key: ${{ secrets.EC2_SSH_KEY }}
          envs: IMAGE
          script: |
            aws ecr get-login-password --region ${{ secrets.AWS_REGION }} 2>/dev/null \
              | docker login --username AWS --password-stdin \
                ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com \
              || true
            docker volume create pg_data || true
            docker pull "$IMAGE"
            docker rm -f casino-db || true
            docker run -d --name casino-db --restart unless-stopped \
              -p 5432:5432 \
              -v pg_data:/var/lib/postgresql/data \
              -e POSTGRES_USER=casino \
              -e POSTGRES_PASSWORD=${{ secrets.DB_PASSWORD }} \
              -e POSTGRES_DB=casino_db \
              "$IMAGE"
```

> ⚠️ Si después de un `docker rm -f` el volumen `pg_data` ya tenía
> datos de un esquema anterior, el `init.sql` **no** se vuelve a
> ejecutar (Postgres solo lo corre si el volumen está vacío). Si
> cambian el `init.sql` a propósito y necesitan empezar de cero:
> `docker volume rm pg_data` (⚠️ borra todo).

#### 12.3 Workflow del frontend

`frontend_intro_devops_casino/.github/workflows/deploy-frontend.yml`:

```yaml
name: Build & Deploy frontend

on:
  push:
    branches: [ main ]

jobs:
  build-push-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id:     ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-session-token:     ${{ secrets.AWS_SESSION_TOKEN }}
          aws-region:            ${{ secrets.AWS_REGION }}
      - id: ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build & push frontend
        env:
          REGISTRY: ${{ steps.ecr.outputs.registry }}
        run: |
          IMAGE=$REGISTRY/casino-frontend
          docker build -t $IMAGE:${{ github.sha }} -t $IMAGE:latest .
          docker push $IMAGE:${{ github.sha }}
          docker push $IMAGE:latest

      - name: Desplegar en EC2-frontend
        uses: appleboy/ssh-action@v1
        env:
          IMAGE: ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com/casino-frontend:latest
        with:
          host: ${{ secrets.EC2_FRONTEND_HOST }}
          username: ec2-user
          key: ${{ secrets.EC2_SSH_KEY }}
          envs: IMAGE
          script: |
            aws ecr get-login-password --region ${{ secrets.AWS_REGION }} 2>/dev/null \
              | docker login --username AWS --password-stdin \
                ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com \
              || true
            docker pull "$IMAGE"
            docker rm -f casino-frontend || true
            docker run -d --name casino-frontend --restart unless-stopped \
              -p 80:80 "$IMAGE"
```

### Paso 13 — Empujar `dev`, abrir Pull Request, mergear y ver el deploy

#### 13.1 Primer deploy (todo nuevo)

En **cada repo**, en la rama `dev`:

```bash
git add .
git commit -m "feat: dockerfile, ECR push y deploy automatizado a EC2"
git push origin dev
```

En GitHub:

1. Aparece un banner "Compare & pull request" → click.
2. Base: `main` ← Compare: `dev`.
3. Título: `feat: contenedorización + CI/CD a 3 EC2 + ECR`.
4. **Create pull request → Merge pull request**.

> ⚙️ **Orden recomendado de merge:**
> 1. Mergear primero el repo del backend (eso dispara `deploy-db` y
>    `deploy-backend` en cualquier orden; la BD debe quedar arriba
>    antes de que el backend reciba la primera petición).
> 2. Esperar a que ambos jobs terminen verdes y verificar:
>    `curl http://<ip-backend>:3000/health`
> 3. Mergear el repo del frontend.

Vayan a la pestaña **Actions** y vean correr los jobs (slide 26:
events → jobs → steps → runners). Cuando todo esté verde, abran
`http://<IP-publica-EC2-frontend>` en el navegador. Casino visible,
login `demo` / `demo1234`.

#### 13.2 El cambio en el front que demuestra el despliegue automático

Esto es lo que les van a pedir mostrar como **evidencia**.

```bash
cd frontend_intro_devops_casino
git checkout dev
git pull
```

Editen algo visible en la UI. Sugerencias:

- Cambiar el título "Casino DevOps" del header
  (`src/app/components/header/header.component.ts`) por
  `"Casino DevOps — <su nombre/dupla>"`.
- O cambiar el color principal `#f5c542` por otro en `styles.css`.
- O agregar una etiqueta con la fecha del despliegue en el lobby.

```bash
git add .
git commit -m "feat(ui): branding personalizado dupla X"
git push origin dev
```

En GitHub: **Compare & pull request → Merge**. Vayan a **Actions** y
vean correr `deploy-frontend.yml`. Cuando termine (~2–3 min),
refresquen la URL de la EC2-frontend: el cambio aparece **sin que
nadie tocó SSH**.

5. **Capturen evidencia** (screenshots) de:
   - Los PRs mergeados a `main` en ambos repos.
   - Los runs de Actions verdes con los pasos visibles.
   - Las **3 imágenes** publicadas en ECR con tag `latest` y SHA.
   - La URL de la EC2-frontend mostrando el cambio.
   - `docker ps` en cada EC2 mostrando 1 contenedor corriendo.
   - Los 3 security groups con sus reglas.

> 🎯 Eso, exactamente eso, es lo que les van a pedir mostrar en la
> presentación de la EP2 (slides 28–29 de la teoría + IE9 de la
> rúbrica EP2).

---

## 5. Verificación final (checklist antes de entregar)

- [ ] Tengo dos forks (frontend y backend), cada uno con la rama `dev`
      empujada al remoto.
- [ ] El repo del backend tiene **dos** Dockerfiles: `Dockerfile`
      (backend) y `db/Dockerfile` (Postgres con `init.sql` embebido).
- [ ] El repo del frontend tiene `Dockerfile` multi-stage Angular →
      Nginx con `default.conf` para SPA.
- [ ] Tengo **3 repositorios privados** en ECR: `casino-frontend`,
      `casino-backend`, `casino-db`.
- [ ] Tengo **3 instancias EC2** (`casino-frontend`, `casino-backend`,
      `casino-database`), cada una con su SG correspondiente.
- [ ] `SG-frontend` permite 80 desde Internet. `SG-backend` permite
      3000 **solo desde** `SG-frontend`. `SG-database` permite 5432
      **solo desde** `SG-backend`.
- [ ] Tengo Secrets configurados en ambos forks (`AWS_*`, `EC2_*`,
      `DB_PASSWORD`, `JWT_SECRET`, `EC2_SSH_KEY`).
- [ ] Tengo **3 workflows** (`deploy-frontend.yml`, `deploy-backend.yml`,
      `deploy-db.yml`) con trigger en `push` a `main`.
- [ ] Hice un PR de `dev → main` en cada repo y lo mergeé.
- [ ] Veo **3 runs verdes** en la pestaña **Actions** entre ambos
      repos.
- [ ] Veo **3 imágenes** en ECR con tags `latest` + `${{ github.sha }}`.
- [ ] Abro `http://<IP-EC2-frontend>` y veo el casino con mi cambio
      personalizado.
- [ ] Hice un segundo cambio en el frontend, lo empujé, y volvió a
      desplegarse automáticamente.
- [ ] El backend **no es accesible** desde mi navegador (la IP
      pública no responde en el puerto 3000 desde mi máquina), pero
      sí responde desde la EC2-frontend (verificable con
      `ssh ec2-frontend → curl http://<ip-privada-back>:3000/health`).

---

## 6. Pauta de evaluación (alineada a la rúbrica de la EP2)

| Indicador | 100% | 60% | 0% | Pond. |
|---|---|---|---|---|
| **IE1.** Dockerfile backend multi-stage, usuario no root, alpine | OK | Single-stage o como root | No presenta | 10% |
| **IE2.** Dockerfile frontend multi-stage Angular → Nginx con SPA fallback | OK | Sin fallback o sirve con `ng serve` | No presenta | 10% |
| **IE3.** Dockerfile DB que extiende `postgres:16-alpine` con `init.sql` embebido | OK | Usa Postgres oficial sin `init.sql` | No presenta | 10% |
| **IE4.** 3 repositorios privados en ECR con imágenes versionadas (`latest` + SHA) | OK | Solo `latest` | Sin ECR / usa Docker Hub | 10% |
| **IE5.** 3 EC2 con security groups cruzados (front→back→db, no abiertos) | OK | SG abiertos a 0.0.0.0/0 | Sin SG / 1 sola EC2 | 15% |
| **IE6.** 3 workflows en `main` con `build → ECR push → SSH deploy` | OK | Solo build y push | No corre | 20% |
| **IE7.** Manejo de Secrets (`AWS_*`, `EC2_SSH_KEY`, `DB_*`, `JWT_SECRET`) | Todo en Secrets | Algún valor en texto plano | Credenciales en el repo | 10% |
| **IE8.** Casino accesible en EC2-frontend con login + saldo + un juego operativo | OK | Carga pero falla algo | No carga | 5% |
| **IE9.** Cambio visible en el front demostrado vía push a `main` con captura | Demostrado | Push hecho pero sin captura | No demuestra | 5% |
| **IE10.** Documentación: `README` actualizado en cada fork + commits descriptivos + PRs documentadas | OK | Documentación básica | Sin commits descriptivos | 5% |

**Total: 100%**

---

## 7. Problemas comunes y soluciones rápidas

| Síntoma                                              | Causa probable                                          | Cómo resolver                                                  |
|------------------------------------------------------|----------------------------------------------------------|-----------------------------------------------------------------|
| `permission denied` al hacer SSH                     | El `.pem` no tiene `chmod 400`                          | `chmod 400 casino-key.pem`                                      |
| Workflow falla en el step de SSH                     | `EC2_SSH_KEY` mal pegado (faltan saltos de línea)       | Re-pegar el contenido completo del archivo de llave privada    |
| `denied: requested access to the resource is denied` al push a ECR | El repo no existe o credenciales expiraron       | Crear el repo en ECR / actualizar secrets `AWS_*` (Learner Lab rota) |
| `aws ecr get-login-password` falla en la EC2         | La EC2 no tiene IAM role o credenciales                 | Asociar `LabInstanceProfile` al lanzar la EC2                  |
| Backend levanta pero da `ECONNREFUSED` a la BD       | `DB_HOST` apunta mal o SG bloquea                       | Usar la **IP privada** de la BD; verificar SG-database         |
| Frontend carga pero la API falla con CORS            | `apiBaseUrl` = `localhost` en `environment.prod.ts`     | Cambiar a `http://<IP-publica-EC2-backend>:3000` y rebuild     |
| Postgres no inicia el `init.sql` la 2ª vez           | Ya hay un `pg_data` con datos                           | `docker volume rm pg_data` (⚠️ borra todo)                      |
| Las credenciales AWS funcionaban y ahora no          | Credenciales temporales del Learner Lab caducaron       | Reabrir lab → copiar nuevas → actualizar `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` y `AWS_SESSION_TOKEN` en GitHub Secrets |
| Mi IP cambió y no puedo entrar por SSH               | El SG tenía "Mi IP" → cambia con la red                 | Editar SG → actualizar IP                                       |
| 4 horas y el lab se cerró                            | Es el límite del Learner Lab                            | Apaguen las EC2 al terminar; los volúmenes persisten            |

---

## 8. Para profundizar (clase teórica 2.4 + 2.5)

Si algo de los slides quedó borroso, repasen:

- **Bloque 1 (slides 3–7):** imagen vs contenedor, multi-stage build, alpine.
- **Bloque 2 (slides 8–10):** tags, SemVer, ciclo de vida — *nunca* `:latest` solo en producción.
- **Bloque 4 (slides 14–16):** ECR — privado, IAM, sin rate limit, integrado con AWS.
- **Bloque 6 (slides 21–23):** problemas que resuelve CI/CD.
- **Bloque 7 (slides 24–27):** anatomía de un workflow YAML.
- **Bloque 8 (slides 28–29):** pipeline end-to-end y deploy automático en EC2 — el corazón de este ejercicio.

---

## 9. Entrega

- Compartir al docente, vía AVA, los **dos enlaces** a sus forks.
- Enviar también las **capturas** del checklist (paso 13.2 punto 5).
- Plazo: el indicado en el AVA. Recomendado **no dejarlo para el día
  antes de la EP2**: si algo falla, queremos detectarlo en clase.

---

> ✍️ **Recordatorio final:** este ejercicio prepara la EP2. Todo lo
> que hagan acá (3 Dockerfiles, ECR, 3 EC2 con SGs cruzados, 3
> workflows) es **directamente reutilizable**. La EP2 cambia el
> dominio (Innovatech Chile), pasa a usar la rama `deploy` como
> trigger, y la presentación es individual frente al curso.
