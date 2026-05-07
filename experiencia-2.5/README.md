Ejercicio 2.5 — Despliegue automatizado del Casino en AWS (3 EC2 + ECR)
> Asignatura: Introducción a Herramientas DevOps (ISY1101)
> Última práctica antes de la EP2.
> Duración estimada: 4–6 horas (en pareja).
> Modalidad: trabajo individual o en pareja, fuera del aula.
> 💻 Si están en un PC del laboratorio que se restaura cada vez:
> sigan paso a paso la sección 3 (instalación desde cero). No se
> salten esa parte aunque crean que ya está instalado.
***0. ¿Qué van a lograr al terminar?
Al cierre del ejercicio, un push a la rama main de su fork del frontend
provocará que GitHub Actions, sin que ustedes toquen una sola consola más:
construya la imagen Docker del frontend,
la suba a Amazon ECR (registro privado dentro de su cuenta AWS),
se conecte por SSH a la EC2 del frontend y haga docker pull + docker run,
y deje el casino visible en el navegador con el cambio recién hecho.
Lo mismo ocurre con el backend (en su propia EC2) y con la base de
datos (en su propia EC2). **Tres servicios, tres instancias, tres
security groups distintos**, todo orquestado desde GitHub Actions.
Es el flujo end-to-end que vimos en la clase teórica 2.4 + 2.5
(slides 14–16: ECR, slides 28–29: pipeline → EC2). Acá lo van a
ejecutar de verdad.
***1. Arquitectura objetivo y por qué
                       Internet  (su navegador)
                              │
                              ▼  HTTP :80
              ┌────────────────────────────────────────┐
              │  EC2-frontend                           │
              │  Nginx con reverse proxy:               │
              │   • /         → archivos estaticos      │
              │   • /api/*    → http://<back-priv>:3000 │
              │   • /health   → http://<back-priv>:3000 │
              │  SG-frontend                            │
              │  in: 22 (mi IP) + 80 (any)              │
              └─────────────────┬──────────────────────┘
                                │  HTTP :3000
                                │  (la EC2 frontend → la EC2 backend
                                │   por IP privada, dentro del VPC)
                                ▼
              ┌────────────────────────────────────────┐
              │  EC2-backend  (Node + Express)          │
              │  SG-backend                             │
              │  in: 22 (mi IP) + 3000 desde SG-frontend│
              └─────────────────┬──────────────────────┘
                                │  Postgres :5432
                                ▼
              ┌────────────────────────────────────────┐
              │  EC2-database  (Postgres 16)            │
              │  SG-database                            │
              │  in: 22 (mi IP) + 5432 desde SG-backend │
              │  Volumen Docker: pg_data                │
              └────────────────────────────────────────┘
              ┌────────────────────────────────────────┐
              │  Amazon ECR (privado)                   │
              │   ├── casino-frontend                   │
              │   ├── casino-backend                    │
              │   └── casino-db                         │
              └────────────────────────────────────────┘
> 🧠 **¿Por qué reverse proxy en el frontend y no llamar al backend
> directo desde el navegador?**
> Porque SG-backend solo permite tráfico desde SG-frontend. Si
> el navegador del usuario llamara al backend directo (otra IP en
> internet), el SG bloquearía la petición. La solución es que
> Nginx (que sí está en SG-frontend) actúe de intermediario: el
> navegador habla solo con el frontend, y Nginx reenvía las llamadas
> /api/* al backend por la red privada del VPC. Es exactamente lo
> que pide la pauta oficial de la EP2: *"el Frontend se comunica
> correctamente con el Backend desplegado en la subred privada"*.
Solo el frontend es accesible desde Internet. El backend solo
acepta tráfico desde la EC2 del frontend. La BD solo acepta tráfico
desde la EC2 del backend.
***2. Repositorios base (NO clonar, hacer fork)
Los dos repos del casino ya están publicados por el docente:
Frontend Angular: <https://github.com/Umbingelelo/frontend_intro_devops_casino>
Backend Node + Postgres: <https://github.com/Umbingelelo/backend_intro_devops_casino>
> ⚠️ Trabajen siempre sobre su propio fork.
Cada repo trae el código pero no trae:
Dockerfile (uno para front, dos en el repo del back: backend y BD)
default.conf.template (config de Nginx con reverse proxy)
.github/workflows/*.yml
Ese es el trabajo del ejercicio.
***3. Prerrequisitos — instalación desde cero
Si están en un PC del laboratorio que se restaura cada sesión, sigan
todo el bloque que corresponde a su sistema. Si ya tienen las
herramientas instaladas, salten al paso 4.
3.1 Cuentas y accesos (ambos sistemas operativos)
Recurso Para qué
Cuenta GitHub Hacer fork y guardar sus cambios
AWS Academy abierto Levantar 3 EC2 + 3 repos ECR
Email Duoc activo Receptor de notificaciones de Actions
3.2 Software (mismas versiones recomendadas en ambos SO)
Herramienta Versión mínima Para qué
Git 2.40+ clone, push, branches
Node.js LTS 20.x probar el frontend en local
Docker Desktop 4.x construir y correr imágenes
AWS CLI v2 2.15+ autenticarse a ECR localmente
OpenSSH client (incluido) conectarse a las EC2
VS Code reciente editar archivos
3.3 Instalación en macOS (incluye M1 / M2 / M3)

# 1) Homebrew (si no lo tienen)

/bin/bash -c "$(curl -fsSL <https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh>)"

# 2) Herramientas

brew install git node@20 awscli
brew install --cask docker visual-studio-code

# 3) Levantar Docker Desktop una vez (icono en la barra superior)

# 4) Verificar

git --version
node --version
docker --version
aws --version
> 🍎 Mac con chip Apple Silicon (M1 / M2 / M3): Docker construye
> imágenes en arquitectura ARM64 por defecto. Las EC2 t2.small
> que vamos a usar en AWS son x86_64 (amd64). Una imagen ARM
> no corre en una EC2 x86 (exec format error).
> En este ejercicio el docker build definitivo lo hace **GitHub
> Actions** (corre sobre ubuntu-latest, x86), así que la imagen que
> llega a EC2 siempre será correcta. Pero si quieren probar local
> antes de empujar, corran:
>
> ```bash
> docker buildx build --platform linux/amd64 -t casino-backend:dev .
> # o agreguen --platform linux/amd64 a docker run para emular.
> ```
>
3.4 Instalación en Windows 10 / 11 (PowerShell + Git Bash)
> ⚠️ Recomendación fuerte: trabajen en Git Bash (lo instala
> Git for Windows). Los comandos chmod, ssh, rutas con /, y
> heredocs funcionan exactamente igual que en Mac/Linux. PowerShell
> tiene diferencias (variables, comillas, permisos) que te van a
> hacer perder tiempo.
>
# Ejecutar PowerShell como Administrador

# 1) Instalar winget (Windows 11 lo trae; Windows 10 instalarlo desde Microsoft Store: "App Installer")

# 2) Herramientas

winget install --id Git.Git -e --silent
winget install --id OpenJS.NodeJS.LTS -e --silent
winget install --id Docker.DockerDesktop -e --silent
winget install --id Amazon.AWSCLI -e --silent
winget install --id Microsoft.VisualStudioCode -e --silent

# 3) Reiniciar PowerShell (para que el PATH tome los binarios nuevos)

exit
> ⚠️ PC de laboratorio sin permisos de administrador / sin WSL2:
> Docker Desktop necesita WSL2 habilitado y suele pedir reinicio
> con permisos admin la primera vez. Si no lo pueden habilitar:
>
> 1. Pueden saltarse el Paso 6 (prueba local) completo. Todo el
>    build definitivo lo hace GitHub Actions en ubuntu-latest, así
>    que el ejercicio se completa igual.
> 2. Igual instalen Git y AWS CLI (los van a usar).
> 3. Validen el resultado abriendo el navegador en
>    http://<IP-EC2-frontend> cuando el pipeline quede verde.
Después (si el laboratorio lo permite) abran Docker Desktop una
vez (debe quedar el icono en la bandeja). En la primera apertura
puede pedir habilitar WSL 2 o reiniciar el PC: confirmen y
reinicien si lo solicita.
Verifiquen en una nueva ventana de PowerShell:
git --version
node --version
docker --version
aws --version
> 💡 **A partir de aquí, en este README los comandos se muestran en
> sintaxis bash.** Si están en Windows, abran Git Bash (botón
> derecho en una carpeta → "Open Git Bash here") y todo funciona.
3.5 Configurar Git con su identidad (una vez)
git config --global user.name  "Nombre Apellido"
git config --global user.email "<alumno@duocuc.cl>"
git config --global init.defaultBranch main
git config --global core.autocrlf input    # ⚠️ Windows: evita que CRLF rompa scripts dentro del Docker
3.6 Acceder a AWS Academy y comprobar el lab
<https://awsacademy.instructure.com> → iniciar sesión.
Curso → Modules → Learner Lab.
Botón Start Lab y esperar a que el círculo quede verde.
Click en AWS para abrir la consola.
Esquina superior derecha: la región debe decir **us-east-1
   (N. Virginia)**. Si dice otra cosa, cambien a us-east-1 (todo
   el ejercicio asume esa región).
***4. Paso a paso
Paso 1 — Hacer fork de los dos repos
Abran cada URL de la sección 2 con su sesión iniciada en GitHub.
Botón "Fork" arriba a la derecha → "Create fork".
Quedarán con dos repos en su cuenta:
<https://github.com/><su-usuario>/frontend_intro_devops_casino
<https://github.com/><su-usuario>/backend_intro_devops_casino
Paso 2 — Clonar localmente y crear la rama dev
En la carpeta donde guardan proyectos del curso (ejemplo:
~/Documents/devops/):
cd ~/Documents/devops
git clone <https://github.com/><su-usuario>/backend_intro_devops_casino.git
git clone <https://github.com/><su-usuario>/frontend_intro_devops_casino.git
cd backend_intro_devops_casino
git checkout -b dev
git push -u origin dev
cd ..
cd frontend_intro_devops_casino
git checkout -b dev
git push -u origin dev
cd ..
> 💡 La rama dev es donde van a trabajar todos los archivos nuevos
> (Dockerfile, default.conf.template, workflows). main queda
> intacto hasta que abran un Pull Request más adelante (paso 13).
Paso 3 — Escribir el Dockerfile del backend
En backend_intro_devops_casino/Dockerfile. Esqueleto guiado:

# ---------- Etapa builder ----------

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src

# ---------- Etapa runtime ----------

FROM node:20-alpine AS runtime
WORKDIR /app

# TODO: COPY --from=builder /app/node_modules ./node_modules

# TODO: COPY --from=builder /app/src ./src

# TODO: COPY package.json ./

# TODO: addgroup -S app && adduser -S app -G app

# TODO: USER app

EXPOSE 3000
CMD ["node", "src/server.js"]
Recuerden de la clase 2.4 (slide 7): alpine + multi-stage +
usuario no root + capas mínimas.
Paso 4 — Escribir el Dockerfile de la base de datos
En el repo del backend, creen db/Dockerfile:
FROM postgres:16-alpine

# Postgres ejecuta TODO archivo .sql que encuentre en este path

# la primera vez que arranca con un volumen vacio

COPY init.sql /docker-entrypoint-initdb.d/01-init.sql
EXPOSE 5432
> 🧠 ¿Por qué construir una imagen para la BD en vez de usar
> postgres:16-alpine directo? Porque así el init.sql queda
> embebido en la imagen — no depende de un archivo externo
> en la EC2. Versionado, reproducible, deployable como cualquier otra.
Paso 5 — Escribir el Dockerfile y default.conf.template del frontend
5.1 Dockerfile
En frontend_intro_devops_casino/Dockerfile:

# ---------- Etapa builder: compilar Angular ----------

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Salida real de Angular 17: dist/casino-frontend/browser/

# ---------- Etapa runtime: servir con Nginx ----------

FROM nginx:alpine AS runtime

# Borrar la config default de Nginx para no chocar con la nuestra

RUN rm -f /etc/nginx/conf.d/default.conf

# La imagen oficial nginx:alpine corre envsubst sobre los archivos

# que esten en /etc/nginx/templates/*.template y los emite a

# /etc/nginx/conf.d/<mismoNombre>.conf al arrancar el contenedor

COPY default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist/casino-frontend/browser /usr/share/nginx/html
EXPOSE 80
5.2 default.conf.template
En la raíz del repo del frontend, junto al Dockerfile:
server {
    listen 80;
    server_name_;
    root /usr/share/nginx/html;
    index index.html;
    # Reverse proxy hacia el backend (otra EC2, IP privada).
    # ${BACKEND_HOST} es una variable de entorno que pasamos al
    # 'docker run' en el deploy (-e BACKEND_HOST=...).
    location /api/ {
        proxy_pass         http://${BACKEND_HOST}:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
    # Health del backend a traves del proxy
    location /health {
        proxy_pass http://${BACKEND_HOST}:3000/health;
    }
    # Single Page App: cualquier ruta no encontrada → index.html
    # (necesario para que /lobby, /slots, /blackjack funcionen al
    # recargar la pagina).
    location / {
        try_files $uri $uri/ /index.html;
    }
}
> 🧠 Por qué template y no .conf directo: en nginx:alpine,
> cualquier archivo en /etc/nginx/templates/*.template pasa por
> envsubst al arrancar el contenedor, sustituyendo ${VAR} con
> la variable de entorno del mismo nombre. Así no tenemos que
> reconstruir la imagen cuando cambia la IP privada del backend:
> basta con docker run -e BACKEND_HOST=<nueva-ip>.
5.3 environment.prod.ts ya viene listo en el repo
El archivo src/environments/environment.prod.ts viene con
apiBaseUrl: '' (cadena vacía). Eso significa que el JS del navegador
hará llamadas a rutas relativas (/api/auth/login), que aterrizan
en el mismo Nginx, que las reenvía al backend. No hay que tocarlo.
Paso 6 — Probar las imágenes en local (antes de tocar AWS)
> 🍎 Mac M1/M2/M3: agreguen --platform linux/amd64 a los
> docker build y docker run si quieren replicar exactamente el
> comportamiento de las EC2. Para una prueba rápida en local podrían
> omitirlo y dejar que Docker construya en ARM (más rápido), pero
> antes de empujar a GitHub recuerden que CI compilará en x86.
>
# 0) Una red para que los 3 contenedores se vean por nombre

docker network create casino-net

# 1) BASE DE DATOS

docker build -t casino-db:dev backend_intro_devops_casino/db
docker volume create pg_data
docker run -d --name casino-db --network casino-net \
  -e POSTGRES_USER=casino -e POSTGRES_PASSWORD=casino -e POSTGRES_DB=casino_db \
  -v pg_data:/var/lib/postgresql/data \
  -p 5432:5432 \
  casino-db:dev

# 2) BACKEND (apuntando al contenedor de la BD por nombre 'casino-db')

docker build -t casino-backend:dev backend_intro_devops_casino
docker run -d --name casino-backend --network casino-net \
  -e DB_HOST=casino-db -e DB_USER=casino -e DB_PASSWORD=casino -e DB_NAME=casino_db \
  -e JWT_SECRET=dev -e CORS_ORIGIN="*" \
  -p 3000:3000 \
  casino-backend:dev

# 3) FRONTEND (Nginx con reverse proxy hacia 'casino-backend')

docker build -t casino-frontend:dev frontend_intro_devops_casino
docker run -d --name casino-frontend --network casino-net \
  -e BACKEND_HOST=casino-backend \
  -p 8080:80 \
  casino-frontend:dev
Verifiquen:
<http://localhost:8080> — casino visible.
<http://localhost:8080/health> — debe responder {"status":"ok"} (proxy → backend).
Login con demo / demo1234.
Si algo falla, depurar acá. No avancen con problemas locales
a la nube.

# Ver logs si algo se cuelga

docker logs -f casino-backend
docker logs -f casino-frontend

# Limpiar al terminar

docker rm -f casino-frontend casino-backend casino-db
docker network rm casino-net
docker volume rm pg_data    # ⚠️ borra los datos
Paso 7 — Crear los 3 repositorios en ECR
En la consola AWS (con el lab abierto): ECR → Repositories → Create.
Crear tres repositorios privados en la región us-east-1:
Repositorio Visibilidad
casino-frontend Private
casino-backend Private
casino-db Private
Para cada uno, copien el URI (formato
   123456789012.dkr.ecr.us-east-1.amazonaws.com/casino-frontend).
Anoten su AWS Account ID (los 12 dígitos del URI).
> 🧠 ECR vs Docker Hub (slides 11–16): privado por defecto, sin rate
> limit en pulls, mismo VPC que las EC2 (pull rápido), autenticación
> por IAM. En Docker Hub free solo tienen 1 repo privado y rate-limit
> de 100 pulls / 6h, lo que rompe pipelines reales.
Paso 8 — Levantar las 3 instancias EC2 (con instance profile)
Vayan a EC2 → Launch instances. Repitan tres veces con estos
parámetros idénticos salvo el nombre:
Campo Valor
Name casino-frontend / casino-backend / casino-database
AMI Amazon Linux 2023
Instance type t2.small (o t3.small)
Auto-assign public IP Enable
Storage 20 GiB gp3
Key pair (ver paso 8.1)
Security group (creado en paso 9 — usen default por ahora y luego asignan el correcto)
Advanced details → IAM instance profile LabInstanceProfile ⚠️ OBLIGATORIO
> 🔐 LabInstanceProfile es un rol IAM precreado por AWS Academy
> que permite que la EC2 haga aws ecr get-login-password sin pasar
> credenciales temporales por SSH. **Sin esto, los workflows van a
> fallar al intentar docker pull desde ECR en la EC2.** Está bajo
> "Advanced details" (al final del formulario). No lo olviden.
8.1 Generar la key pair (una sola, las 3 EC2 la comparten)
En la pantalla de Launch instance, sección Key pair (login):
Botón Create new key pair
Name: casino-key
Key pair type: RSA
Format: .pem
Click Create key pair → se descarga casino-key.pem.
Guárdenlo en ~/.ssh/casino-key.pem (Mac/Linux) o
  C:\Users\<usuario>\.ssh\casino-key.pem (Windows).
Ajustar permisos del archivo (sin esto, SSH lo rechaza por inseguro):

# Mac / Linux

chmod 400 ~/.ssh/casino-key.pem
> 🪟 Windows: chmod 400 desde Git Bash NO basta si usan el
> ssh.exe nativo de Windows (el que viene con OpenSSH y winget),
> porque ese cliente lee los ACL de NTFS, no los bits de Cygwin.
> Ejecuten siempre los icacls siguientes en PowerShell, además
> del chmod de Git Bash si lo hicieron:
>
# PowerShell

icacls "$env:USERPROFILE\.ssh\casino-key.pem" /inheritance:r
icacls "$env:USERPROFILE\.ssh\casino-key.pem" /grant:r "$($env:USERNAME):(R)"
Una vez lanzadas las 3 EC2, anoten IP pública e IP privada
de cada una. Las van a usar varias veces.
Paso 9 — Crear los 3 Security Groups (lo crítico)
Vayan a EC2 → Security Groups → Create security group.
Crearlos en este orden (cada uno referencia al anterior).
> ⚠️ Los 3 SGs deben estar en la MISMA VPC (la default del Lab,
> que es la misma de sus 3 EC2). Si los crean en VPCs distintas, no
> podrán referenciarse cruzados (SG-backend → SG-frontend).
> 🔓 ¿Por qué SSH abierto a 0.0.0.0/0 y no solo a "Mi IP"?
> Porque el deploy lo hace GitHub Actions desde un runner con IP
> dinámica que cambia en cada ejecución y pertenece a un rango público
> enorme. La protección real del puerto 22 es la llave SSH privada
> (gh-actions-key) que solo conoce GitHub. En producción se usaría
> AWS SSM o self-hosted runners para evitar esto.
SG-frontend
Description: casino-frontend SG
VPC: la default (la misma de sus EC2)
Inbound rules:
Type Protocol Port Source Para qué
SSH TCP 22 0.0.0.0/0 GitHub Actions runner (deploy SSH)
HTTP TCP 80 0.0.0.0/0 Acceso publico al casino
Outbound: All traffic (default).
SG-backend
Description: casino-backend SG
Inbound rules:
Type Protocol Port Source Para qué
SSH TCP 22 0.0.0.0/0 GitHub Actions runner (deploy)
Custom TCP TCP 3000 SG-frontend (en Source elijan "Custom" y tipeen el ID/nombre del SG) Solo Nginx puede llamar al API
SG-database
Inbound rules:
Type Protocol Port Source Para qué
SSH TCP 22 0.0.0.0/0 GitHub Actions runner
Custom TCP TCP 5432 SG-backend Solo el backend ve la BD
> 💡 No usen 0.0.0.0/0 para los puertos 3000 y 5432. Si lo hacen,
> rompen exactamente la regla que la EP2 evalúa en IE7.
Asignen cada SG a su EC2 correspondiente:
casino-frontend → SG-frontend
casino-backend  → SG-backend
casino-database → SG-database
(EC2 → seleccionar instancia → **Actions → Security → Change security
groups** → quitar el default y agregar el correcto).
Paso 10 — Preparar Docker en cada EC2
Conéctense por SSH a cada una de las 3 instancias y ejecuten lo
mismo:

# Mac / Linux / Git Bash

ssh -i ~/.ssh/casino-key.pem ec2-user@<IP-publica>

# Dentro de la EC2

sudo dnf update -y
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user

# AWS CLI v2 ya viene en Amazon Linux 2023; verifiquen

aws --version
exit
Vuelvan a entrar para que tome el grupo docker:
ssh -i ~/.ssh/casino-key.pem ec2-user@<IP-publica>
docker --version
docker run --rm hello-world   # comprueba que el daemon responde
Repitan en las tres EC2.
Paso 11 — Llaves SSH para Actions y Secrets en GitHub
11.1 Generar una llave SSH dedicada para Actions

# Mac / Linux / Git Bash

ssh-keygen -t ed25519 -f ~/.ssh/gh-actions-key -N ""

# Quedan: gh-actions-key (privada) y gh-actions-key.pub (publica)

# PowerShell puro (cuando pida passphrase, presionen Enter dos veces)

ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\gh-actions-key"
Agreguen la pública a las 3 EC2 (una por una):

# Mostrar la publica

cat ~/.ssh/gh-actions-key.pub

# Conectarse a cada EC2 y pegarla en authorized_keys

ssh -i ~/.ssh/casino-key.pem ec2-user@<IP-publica>
echo "<aqui la linea ssh-ed25519 ... que copiaron>" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
exit
11.2 Obtener credenciales temporales del Learner Lab
> ⚠️ **Las credenciales del Learner Lab cambian cada vez que abren
> el lab.** Cuando vengan a la próxima sesión, deben actualizar
> los Secrets AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY y
> AWS_SESSION_TOKEN o sus workflows fallarán con un error de
> token expirado.
En el lab → AWS Details → AWS CLI → Show. Copien las 3 líneas:
aws_access_key_id     = ASIA...
aws_secret_access_key = ...
aws_session_token     = ...
11.3 Configurar Secrets en cada fork
En cada fork: **Settings → Secrets and variables → Actions → New
repository secret**.
Comunes a ambos repos:
Nombre Valor
AWS_ACCESS_KEY_ID El ASIA... del paso 11.2
AWS_SECRET_ACCESS_KEY El secret del paso 11.2
AWS_SESSION_TOKEN El session token del paso 11.2 (Academy)
AWS_REGION us-east-1
AWS_ACCOUNT_ID Los 12 dígitos del URI del ECR
EC2_SSH_KEY Contenido completo de gh-actions-key (incluyendo -----BEGIN ...----- y -----END ...-----)
Solo en el repo del backend:
Nombre Valor
EC2_BACKEND_HOST IP pública de casino-backend
EC2_DATABASE_HOST IP pública de casino-database
DB_HOST_PRIVATE IP privada de casino-database (la del VPC)
DB_PASSWORD Cadena aleatoria larga (la usa Postgres)
JWT_SECRET Otra cadena aleatoria larga
Solo en el repo del frontend:
Nombre Valor
EC2_FRONTEND_HOST IP pública de casino-frontend
BACKEND_HOST_PRIVATE IP privada de casino-backend (la del VPC)
> 🔒 Nunca commiteen estas credenciales. Si por error pegan una
> en un archivo y empujan, regeneren el token y actualicen el Secret.
Paso 12 — Workflows de GitHub Actions
12.1 Workflow del backend → push a ECR + deploy en EC2-backend
backend_intro_devops_casino/.github/workflows/deploy-backend.yml:
name: Build & Deploy backend
on:
  workflow_dispatch:           # permite lanzarlo manual desde la pestana Actions
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
        with:
          mask-password: 'true'
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
            # La EC2 tiene LabInstanceProfile -> puede hacer ecr get-login sin secrets
            aws ecr get-login-password --region ${{ secrets.AWS_REGION }} \
              | docker login --username AWS --password-stdin \
                ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com
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
12.2 Workflow de la BD → push a ECR + deploy en EC2-database
backend_intro_devops_casino/.github/workflows/deploy-db.yml:
name: Build & Deploy database
on:
  workflow_dispatch:
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
        with:
          mask-password: 'true'
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
            aws ecr get-login-password --region ${{ secrets.AWS_REGION }} \
              | docker login --username AWS --password-stdin \
                ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com
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
> ⚠️ Si después de un docker rm -f el volumen pg_data ya tenía
> datos, el init.sql no se vuelve a ejecutar (Postgres solo lo
> corre si el volumen está vacío). Si cambian el init.sql y
> necesitan empezar de cero: en la EC2-database hacer
> docker volume rm pg_data (⚠️ borra todo).
12.3 Workflow del frontend
frontend_intro_devops_casino/.github/workflows/deploy-frontend.yml:
name: Build & Deploy frontend
on:
  workflow_dispatch:
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
        with:
          mask-password: 'true'
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
            aws ecr get-login-password --region ${{ secrets.AWS_REGION }} \
              | docker login --username AWS --password-stdin \
                ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com
            docker pull "$IMAGE"
            docker rm -f casino-frontend || true
            docker run -d --name casino-frontend --restart unless-stopped \
              -p 80:80 \
              -e BACKEND_HOST=${{ secrets.BACKEND_HOST_PRIVATE }} \
              "$IMAGE"
Paso 13 — Empujar dev, abrir Pull Request, mergear y ver el deploy
13.1 Primer deploy
En cada repo, en la rama dev:
git add .
git status                           # revisen que no esten subiendo .pem o secrets
git commit -m "feat: dockerfile, ECR push y deploy automatizado a EC2"
git push origin dev
En GitHub:
Aparece un banner "Compare & pull request" → click.
Base: main ← Compare: dev.
Título: feat: contenedorización + CI/CD a 3 EC2 + ECR.
Create pull request → Merge pull request.
> ⚙️ Orden recomendado de merge:
>
> 1. Mergear primero el repo del backend (eso dispara
>    deploy-db.yml y deploy-backend.yml; la BD debe quedar
>    arriba antes que el backend reciba la primera petición).
> 2. Esperar a que ambos jobs queden verdes y verificar desde la
>    EC2-frontend (vía SSH):
>
>    ```bash
>    curl http://<ip-privada-backend>:3000/health
>    # debe responder {"status":"ok","db":"up",...}
>    ```
>
> 3. Mergear el repo del frontend.
Vayan a la pestaña Actions y vean correr los jobs. Cuando todo
esté verde, abran http://<IP-publica-EC2-frontend> en el navegador.
Casino visible, login demo / demo1234.
13.2 El cambio en el front que demuestra el despliegue automático
Esto es lo que les van a pedir mostrar como evidencia.
cd frontend_intro_devops_casino
git checkout dev
git pull
Editen algo visible en la UI. Sugerencias:
Cambiar el título "Casino DevOps" del header
  (src/app/components/header/header.component.ts) por
  "Casino DevOps — <su nombre/dupla>".
O cambiar el color principal #f5c542 por otro en styles.css.
O agregar una etiqueta con la fecha del despliegue en el lobby.
git add .
git commit -m "feat(ui): branding personalizado dupla X"
git push origin dev
En GitHub: Compare & pull request → Merge. Vayan a Actions
y vean correr deploy-frontend.yml. Cuando termine (~2–3 min),
hagan refresh forzado en el navegador (Ctrl+Shift+R /
Cmd+Shift+R para evitar cache) en la URL de la EC2-frontend:
el cambio aparece sin que nadie tocó SSH.
Capturen evidencia (screenshots) de:
Los PRs mergeados a main en ambos repos.
Los runs de Actions verdes con los pasos visibles.
Las 3 imágenes publicadas en ECR (consola AWS).
La URL de la EC2-frontend mostrando el cambio.
docker ps en cada EC2 mostrando 1 contenedor corriendo.
Los 3 security groups con sus reglas.
> 🎯 Eso, exactamente eso, es lo que les van a pedir mostrar en la
> presentación de la EP2 (slides 28–29 de la teoría + IE9 de la
> rúbrica EP2).
***5. Verificación final (checklist antes de entregar)
Tengo dos forks (frontend y backend), cada uno con la rama dev
      empujada al remoto.
El repo del backend tiene dos Dockerfiles: Dockerfile
      (backend) y db/Dockerfile (Postgres con init.sql embebido).
El repo del frontend tiene Dockerfile multi-stage Angular →
      Nginx y default.conf.template con reverse proxy.
Tengo 3 repositorios privados en ECR.
Tengo 3 EC2 con el rol LabInstanceProfile adjunto.
SG-frontend permite 80 desde Internet. SG-backend permite
      3000 solo desde SG-frontend. SG-database permite 5432
      solo desde SG-backend.
Tengo Secrets configurados en ambos forks (incluyendo
      BACKEND_HOST_PRIVATE en el frontend y DB_HOST_PRIVATE en
      el backend).
Tengo 3 workflows con trigger en push a main.
Hice un PR de dev → main en cada repo y lo mergeé.
Veo 3 runs verdes en la pestaña Actions entre ambos
      repos.
Veo 3 imágenes en ECR con tags latest + ${{ github.sha }}.
Abro http://<IP-EC2-frontend> y veo el casino con mi cambio
      personalizado.
Hice un segundo cambio en el frontend, lo empujé, y volvió a
      desplegarse automáticamente.
Si intento curl http://<ip-publica-back>:3000/health desde mi
      PC, no responde (lo bloquea el SG). Si lo hago desde la
      EC2-frontend (SSH y curl con la IP privada del backend),
      sí responde.
***6. Pauta de evaluación (alineada a la rúbrica de la EP2)
Indicador 100% 60% 0% Pond.
IE1. Dockerfile backend multi-stage, usuario no root, alpine OK Single-stage o como root No presenta 10%
IE2. Dockerfile frontend multi-stage Angular → Nginx con SPA fallback y reverse proxy /api/* OK Sin reverse proxy o sin fallback No presenta 10%
IE3. Dockerfile DB que extiende postgres:16-alpine con init.sql embebido OK Sin init.sql No presenta 10%
IE4. 3 repositorios privados en ECR con imágenes versionadas (latest + SHA) OK Solo latest Sin ECR / Docker Hub 10%
IE5. 3 EC2 con SGs cruzados (3000 desde SG-frontend, 5432 desde SG-backend) y LabInstanceProfile adjunto OK 3000 o 5432 abiertos a 0.0.0.0/0 1 sola EC2 15%
IE6. 3 workflows en main con build → ECR push → SSH deploy OK Solo build/push No corre 20%
IE7. Manejo de Secrets (todos los AWS_*, EC2_*, **HOST_PRIVATE, DB**, JWT_SECRET) Todo en Secrets Algún valor en texto plano Credenciales en repo 10%
IE8. Casino accesible en EC2-frontend con login + saldo + un juego operativo OK Carga pero falla algo No carga 5%
IE9. Cambio visible en el front demostrado vía push a main con captura Demostrado Push hecho pero sin captura No demuestra 5%
IE10. Documentación: README actualizado en cada fork + commits descriptivos + PRs documentadas OK Documentación básica Sin commits 5%
Total: 100%
***7. Problemas comunes y soluciones rápidas
Errores cross-platform (Windows / Mac)
Síntoma Causa Cómo resolver
Permissions ... too open al hacer SSH (Mac/Linux/Git Bash) Falta chmod 400 en el .pem chmod 400 ~/.ssh/casino-key.pem
UNPROTECTED PRIVATE KEY FILE (Windows) El .pem heredó permisos amplios Comandos icacls del paso 8.1
exec format error al hacer docker run en EC2 Imagen ARM corriendo en EC2 x86 (Mac M1/M2) Asegurarse que CI hizo el build (corre en ubuntu-latest); para local usar --platform linux/amd64
Scripts dentro del Docker fallan con \r: not found Line endings CRLF de Windows git config --global core.autocrlf input antes de clonar
bash: command not found en PowerShell Comandos copiados de la guía no son nativos PS Abran Git Bash (botón derecho en la carpeta)
Errores de AWS / Lab
Síntoma Causa Cómo resolver
ExpiredToken o InvalidAccessKey en CI Credenciales del Learner Lab caducaron Reabrir lab → copiar nuevas → actualizar AWS_* en Secrets
Unable to locate credentials en EC2 al aws ecr get-login-password Falta LabInstanceProfile EC2 → Actions → Security → Modify IAM role → LabInstanceProfile
denied: requested access to the resource is denied al push a ECR El repo no existe en ECR Crearlo en us-east-1 con el nombre exacto
4 horas y el lab se cerró Límite del Learner Lab Reabrir lab; las IPs públicas pueden cambiar → actualizar secrets EC2_*_HOST
Errores de la app
Síntoma Causa Cómo resolver
Backend levanta pero ECONNREFUSED a la BD DB_HOST apunta mal o SG-database bloquea Usar IP privada de la BD; verificar SG-database
Frontend carga pero ningún botón funciona Reverse proxy mal configurado Verificar default.conf.template y BACKEND_HOST en docker run
502 Bad Gateway en el frontend Nginx no puede llegar al backend (SG o IP) Comprobar IP privada y que el SG-backend permita el tráfico
Postgres no inicia el init.sql la 2ª vez Ya hay un pg_data con datos En EC2-db: docker volume rm pg_data (⚠️ borra todo)
port is already allocated en EC2 Contenedor anterior aún corriendo docker rm -f <nombre> antes de re-desplegar
El frontend muestra el cambio pero el saldo es 0 Cache del navegador Refresh forzado: Ctrl+Shift+R / Cmd+Shift+R
***8. Para profundizar (clase teórica 2.4 + 2.5)
Si algo de los slides quedó borroso, repasen:
Bloque 1 (slides 3–7): imagen vs contenedor, multi-stage build, alpine.
Bloque 2 (slides 8–10): tags, SemVer, ciclo de vida.
Bloque 4 (slides 14–16): ECR — privado, IAM, sin rate limit.
Bloque 6 (slides 21–23): problemas que resuelve CI/CD.
Bloque 7 (slides 24–27): anatomía de un workflow YAML.
Bloque 8 (slides 28–29): pipeline end-to-end y deploy automático.
***9. Entrega
Compartir al docente, vía AVA, los dos enlaces a sus forks.
Enviar las capturas del checklist (paso 13.2 punto 5).
Plazo: el indicado en el AVA. Recomendado **no dejarlo para el día
  antes de la EP2**.
***> ✍️ Recordatorio final: este ejercicio prepara la EP2. Todo lo
> que hagan acá (3 Dockerfiles, ECR, 3 EC2 con SGs cruzados, 3
> workflows, reverse proxy en Nginx) es directamente reutilizable.
> La EP2 cambia el dominio (Innovatech Chile), pasa a usar la rama
> deploy como trigger, y la presentación es individual.
