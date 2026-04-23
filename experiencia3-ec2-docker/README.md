# Experiencia 3 – Contenedores en AWS: ECR + EC2 por capas

> **Asignatura:** Introduccion a Herramientas DevOps
> **Unidad:** 2.3 – Contenedores en la Nube
> **Duracion estimada:** 2 horas
> **Prerequisito:** haber completado la Experiencia 2 (Docker en local)
> **Sistema de referencia:** Amazon Linux 2023 en EC2

---

## Que construiremos?

Desplegaremos la aplicacion de tareas con una **arquitectura de 2 capas en AWS**:
el backend corre en una EC2 y el frontend en otra EC2 separada.
Las imagenes se publican en **Amazon ECR** (registro privado de contenedores de AWS)
y cada servidor las descarga desde ahi.

```text
[ Tu computador local ]
        |
  git clone + docker build
        |
        v
  [ Amazon ECR ]
  tareas-backend:1.0  <--pull-- [ EC2 Backend  | puerto 3000 ]
  tareas-frontend:2.0 <--pull-- [ EC2 Frontend | puerto 4200 ]
                                       |
                              http://<IP-FRONT>:4200
                                       |
                              (navegador del usuario)
                                       |
                              http://<IP-BACK>:3000  <-- llamada directa del browser
                                       |
                              [ EC2 Backend ]
```

> **Diferencia clave con la Experiencia 2:** antes todo corria junto con
> Docker Compose en tu maquina. Ahora cada servicio tiene su propio servidor
> en la nube. Los Security Groups reemplazan la red bridge de Compose.

---

## Tabla de contenidos

1. [Objetivos de aprendizaje](#1-objetivos-de-aprendizaje)
2. [Conceptos clave](#2-conceptos-clave)
3. [Planificacion de las 2 horas](#3-planificacion-de-las-2-horas)
4. [Parte 1 – Clonar y preparar el proyecto en local](#parte-1--clonar-y-preparar-el-proyecto-en-local-15-min)
5. [Parte 2 – Crear repositorios en Amazon ECR](#parte-2--crear-repositorios-en-amazon-ecr-15-min)
6. [Parte 3 – Build y push de imagenes a ECR](#parte-3--build-y-push-de-imagenes-a-ecr-15-min)
7. [Parte 4 – EC2 Backend: lanzar, instalar y correr](#parte-4--ec2-backend-lanzar-instalar-y-correr-20-min)
8. [Parte 5 – Ajustar el frontend y republicar imagen](#parte-5--ajustar-el-frontend-y-republicar-imagen-15-min)
9. [Parte 6 – EC2 Frontend: lanzar, instalar y correr](#parte-6--ec2-frontend-lanzar-instalar-y-correr-20-min)
10. [Parte 7 – Probar la aplicacion end-to-end](#parte-7--probar-la-aplicacion-end-to-end-10-min)
11. [Cuestionario de autoevaluacion](#cuestionario-de-autoevaluacion)
12. [Solucion de problemas](#solucion-de-problemas)
13. [Entregables y rubrica](#entregables-y-rubrica)
14. [Limpieza final (obligatoria)](#limpieza-final-obligatoria)
15. [Glosario](#glosario)

---

## 1. Objetivos de aprendizaje

Al terminar esta experiencia el estudiante sera capaz de:

- Clonar un repositorio y preparar imagenes Docker localmente para despliegue en la nube.
- Crear repositorios en **Amazon ECR** y autenticar Docker contra el registro privado.
- Etiquetar (`docker tag`) y publicar (`docker push`) imagenes a ECR desde la maquina local.
- Lanzar dos instancias **Amazon EC2** y configurar **Security Groups por capa**.
- Instalar Docker en EC2 y descargar (`docker pull`) imagenes desde ECR usando un **IAM Instance Profile**.
- Comprender por que `localhost` no funciona entre capas y como corregir la URL del backend.
- Verificar que la aplicacion funciona de punta a punta accediendo por IP publica.

---

## 2. Conceptos clave

| Concepto | Idea central |
|---|---|
| **ECR (Elastic Container Registry)** | Registro privado de imagenes Docker en AWS. Como tener tu propio Docker Hub dentro de tu cuenta. |
| **Repositorio ECR** | Espacio dentro de ECR donde se guardan las versiones (tags) de una imagen. Se crea uno por servicio. |
| **docker tag** | Asigna un alias con el URI de ECR a una imagen local para poder publicarla. |
| **docker push / pull** | Enviar una imagen al registro (push) o descargarla desde el registro (pull). |
| **Arquitectura por capas** | Cada servicio en su propio servidor, comunicandose por red publica o privada de AWS. |
| **Security Group** | Firewall virtual de EC2. Cada capa tiene su propio SG con solo los puertos que necesita. |
| **IAM Instance Profile** | Permiso asignado a una EC2 para que pueda hablar con ECR sin credenciales manuales. |
| **SPA y baseUrl** | Angular es una app que corre en el **navegador del usuario**. Por eso la URL del backend no puede ser `localhost` cuando el frontend y el backend estan en distintos servidores. |

---

## 3. Planificacion de las 2 horas

| Parte | Duracion | Actividad |
|---|---|---|
| 1 | 15 min | Clonar el repo y entender la estructura |
| 2 | 15 min | Crear repositorios ECR y autenticar Docker |
| 3 | 15 min | Build y push de las imagenes a ECR |
| 4 | 20 min | Lanzar EC2 Backend, instalar Docker, pull y run |
| 5 | 15 min | Editar URL del frontend, rebuild y push |
| 6 | 20 min | Lanzar EC2 Frontend, instalar Docker, pull y run |
| 7 | 10 min | Probar end-to-end y tomar evidencias |
| Cierre | 10 min | Cuestionario y limpieza |
| **Total** | **120 min** | |

---

# Parte 1 – Clonar y preparar el proyecto en local (15 min)

## Paso 1.1 – Crear la carpeta de trabajo y clonar los repositorios

Como son dos repositorios separados (uno para backend y otro para frontend),
primero crea una carpeta que los contenga a ambos y entra en ella.

**Git Bash / macOS / Linux:**

```bash
mkdir exp3-aws
cd exp3-aws
```

**PowerShell (Windows):**

```powershell
New-Item -ItemType Directory -Name exp3-aws
cd exp3-aws
```

| Comando | Significado |
|---|---|
| `mkdir exp3-aws` / `New-Item -Name exp3-aws` | Crea la carpeta de trabajo para esta experiencia |
| `cd exp3-aws` | Entra a la carpeta. Todos los pasos siguientes se ejecutan desde aquí. |

Abre una terminal (**Git Bash** en Windows, Terminal en macOS/Linux)
y clona los dos repositorios dentro de `exp3-aws/`:

```bash
git clone https://github.com/Umbingelelo/backend_intro_devops.git
git clone https://github.com/Umbingelelo/frontend_intro_devops.git
```

| Parte | Significado |
|---|---|
| `git clone` | Descarga una copia completa del repositorio remoto en tu máquina local |
| URL `.git` | Dirección del repositorio en GitHub |
| (carpeta resultante) | Git crea una subcarpeta con el nombre del repo automáticamente |

La estructura de carpetas quedará así:

```text
exp3-aws/
├── backend_intro_devops/    ← repositorio del backend (Node.js + Express)
│   ├── Dockerfile
│   ├── server.js
│   └── ...
└── frontend_intro_devops/   ← repositorio del frontend (Angular)
    ├── Dockerfile
    ├── src/
    └── ...
```

> **Importante:** todos los comandos `docker build` de esta experiencia
> se ejecutan desde la carpeta `exp3-aws/` (el nivel que contiene ambas
> subcarpetas). Si te mueves dentro de un repo, vuelve con `cd ..`.

Verifica que ambas carpetas están presentes:

**Git Bash / macOS / Linux:**

```bash
ls
# backend_intro_devops/   frontend_intro_devops/
```

**PowerShell (Windows):**

```powershell
dir
# o también: ls  (alias de Get-ChildItem, muestra lo mismo con diferente formato)
```

---

## Paso 1.2 – Verificar Docker local

**Git Bash / PowerShell / macOS / Linux** (el CLI de Docker es multiplataforma):

```bash
docker --version   # muestra la versión instalada de Docker
docker images      # lista las imágenes descargadas en tu máquina
```

| Comando | Qué hace |
|---|---|
| `docker --version` | Imprime la versión del cliente Docker; confirma que está instalado |
| `docker images` | Lista todas las imágenes locales (nombre, tag, ID, tamaño) |

Si Docker no esta corriendo, abre **Docker Desktop** (Windows/macOS)
o ejecuta `sudo systemctl start docker` (Linux).

---

## Paso 1.3 – El problema de localhost en arquitectura por capas

Abre `frontend_intro_devops/src/app/services/tareas.service.ts` y busca esta linea:

```typescript
readonly baseUrl = 'http://localhost:3000';
```

> **Por que esto es un problema en la nube?**
>
> Angular es una aplicacion de pagina unica (SPA): el codigo JavaScript
> corre en el **navegador del usuario**, no en el servidor del frontend.
> Cuando el usuario abre `http://IP-FRONTEND:4200`, la app Angular carga
> en su computador. Desde ahi, la llamada a `http://localhost:3000` apunta
> a la maquina del propio usuario, no al servidor backend en AWS.
>
> Con la Experiencia 2 funcionaba porque todo corria en `localhost`.
> Con dos EC2 separadas, `localhost` del frontend NO llega al backend EC2.
>
> **Solucion (Paso 5):** cambiar `localhost` por la IP publica del backend EC2.

---

# Parte 2 – Crear repositorios en Amazon ECR (15 min)

> Abre la **Consola de AWS**.
> Si usas AWS Academy, inicia el Learner Lab y haz clic en **AWS**.
> Verifica que la region sea **us-east-1 (N. Virginia)** o la que indique tu profesor.

## Paso 2.1 – Crear el repositorio del backend

1. En la barra de busqueda escribe **ECR** y entra a **Elastic Container Registry**.
2. Haz clic en **Create repository**.
3. **Visibility:** Private.
4. **Repository name:** `tareas-backend`
5. Deja el resto con los valores por defecto y haz clic en **Create repository**.

---

## Paso 2.2 – Crear el repositorio del frontend

Repite el proceso:

1. **Create repository** → Private → Name: `tareas-frontend` → **Create repository**.

---

## Paso 2.3 – Copiar los URI de cada repositorio

En la lista de repositorios veras la columna **URI**. Los URIs tienen esta forma:

```
<ACCOUNT-ID>.dkr.ecr.us-east-1.amazonaws.com/tareas-backend
<ACCOUNT-ID>.dkr.ecr.us-east-1.amazonaws.com/tareas-frontend
```

**Anota ambos URI**, los usaras en los siguientes pasos:

```
URI backend:   _________________________________________________
URI frontend:  _________________________________________________
Account ID:    ________________ (los primeros 12 digitos del URI)
```

---

## Paso 2.4 – Instalar y configurar el AWS CLI en tu maquina local

El AWS CLI es la herramienta de linea de comandos para interactuar con AWS
desde la terminal. Lo usaras para autenticar Docker contra ECR.

### Verificar si ya esta instalado

```bash
aws --version
```

Si responde `aws-cli/2.x.x`, ya esta instalado — salta a **"Obtener credenciales"**.

---

### Instalar AWS CLI v2

**Windows:**

1. Descarga el instalador: `https://awscli.amazonaws.com/AWSCLIV2.msi`
2. Ejecuta el `.msi` y sigue el asistente (Next → Next → Install).
3. Cierra y vuelve a abrir Git Bash o PowerShell.
4. Verifica con `aws --version`.

**macOS:**

```bash
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o AWSCLIV2.pkg
sudo installer -pkg AWSCLIV2.pkg -target /
aws --version
```

| Comando | Significado |
|---|---|
| `curl "URL" -o AWSCLIV2.pkg` | Descarga el archivo desde la URL y lo guarda con el nombre indicado en `-o` |
| `sudo installer -pkg ... -target /` | Ejecuta el instalador de macOS (`.pkg`) en el sistema raíz (`/`) |
| `aws --version` | Verifica que la instalación fue exitosa |

**Linux:**

```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip
unzip awscliv2.zip
sudo ./aws/install
aws --version
```

| Comando | Significado |
|---|---|
| `curl "URL" -o awscliv2.zip` | Descarga el instalador comprimido desde AWS |
| `unzip awscliv2.zip` | Descomprime el archivo `.zip` en la carpeta actual |
| `sudo ./aws/install` | Ejecuta el script de instalación con permisos de superusuario |
| `aws --version` | Confirma que la instalación fue exitosa |

---

### Obtener las credenciales desde AWS Academy

1. En el Learner Lab, haz clic en **AWS Details** (esquina superior derecha).
2. Haz clic en **Show** junto a *AWS CLI*.
3. Veras un bloque de texto con este formato:

```
[default]
aws_access_key_id=ASIA4BUJWSL7GKK3SV4M
aws_secret_access_key=6dFVjKXBDxs41+mxUHAyO3WPiE1mdfQSMj7ecaed
aws_session_token=IQoJb3JpZ2luX2VjEJf//////////wEaCXVzLXdlc3Qt...
```

> Estas son credenciales temporales generadas por AWS Academy.
> **No las compartas ni las subas a GitHub.**
> Expiran cada ~4 horas; si un comando falla con `ExpiredTokenException`
> repite desde este punto.

---

### Pegar las credenciales en tu maquina

**macOS / Linux — en la terminal:**

```bash
mkdir -p ~/.aws
nano ~/.aws/credentials
```

| Parte | Significado |
|---|---|
| `mkdir -p ~/.aws` | Crea la carpeta `~/.aws` (`~` = tu carpeta de usuario). `-p` evita error si ya existe. |
| `nano` | Editor de texto en terminal. Más sencillo que `vi` para principiantes. |
| `~/.aws/credentials` | Ruta del archivo de credenciales que lee el AWS CLI por defecto. |
| `Ctrl+O` → Enter | Guardar el archivo en `nano`. |
| `Ctrl+X` | Salir de `nano`. |

Borra el contenido anterior (si existe), pega el bloque completo y guarda
con `Ctrl+O`, Enter, `Ctrl+X`.

---

**Windows — método recomendado (PowerShell directo)**

> ⚠️ **Problema frecuente en Windows:** si intentas crear el archivo
> manualmente desde el Explorador o con el Bloc de notas, Windows agrega
> automáticamente la extensión `.txt` y el archivo queda como
> `credentials.txt`. El AWS CLI no reconoce esa extensión y las
> credenciales **no funcionan**. Usa el método PowerShell de abajo para
> evitar ese problema.

1. Abre **PowerShell** desde el menú Inicio
   *(búscalo como "PowerShell" — no requiere «Ejecutar como administrador»)*.

2. Crea la carpeta `.aws` con este comando:

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.aws"
```

| Flag | Significado |
|---|---|
| `New-Item` | Crea un elemento nuevo (archivo o carpeta) en PowerShell |
| `-ItemType Directory` | Indica que el elemento a crear es una carpeta |
| `-Force` | No falla si la carpeta ya existe; la deja tal como está |
| `-Path "$env:USERPROFILE\.aws"` | Ruta destino. `$env:USERPROFILE` se expande a `C:\Users\<TuUsuario>\.aws` |

3. Escribe el bloque de credenciales directamente al archivo **sin abrir
   ningún editor**, pegando el siguiente comando en PowerShell y
   reemplazando los tres valores con los tuyos de AWS Details:

```powershell
@"
[default]
aws_access_key_id=PEGA_TU_ACCESS_KEY_ID
aws_secret_access_key=PEGA_TU_SECRET_ACCESS_KEY
aws_session_token=PEGA_TU_SESSION_TOKEN
"@ | Set-Content -Path "$env:USERPROFILE\.aws\credentials" -Encoding utf8
```

| Parte | Significado |
|---|---|
| `@" ... "@` | Bloque de texto multilínea en PowerShell (heredoc). Todo lo que esté dentro se trata como texto literal. |
| `Set-Content` | Escribe el texto en el archivo, creándolo si no existe. Sobrescribe el contenido anterior. |
| `-Path` | Ruta destino del archivo de credenciales. |
| `-Encoding utf8` | Guarda en UTF-8 sin BOM, el formato que espera el AWS CLI. Sin este flag, PowerShell usa UTF-16 que AWS CLI no lee. |

   > **¿Cómo pegar en PowerShell?** Clic derecho en la ventana de
   > PowerShell pega el contenido del portapapeles. También puedes usar
   > `Ctrl + V` si tu versión lo soporta.

4. Verifica que el archivo existe y tiene contenido:

```powershell
Get-Content "$env:USERPROFILE\.aws\credentials"
```

| Comando | Significado |
|---|---|
| `Get-Content` | Lee y muestra el contenido de un archivo en PowerShell (equivalente a `cat` en Linux) |
| `"$env:USERPROFILE\.aws\credentials"` | Ruta del archivo de credenciales de AWS |

   Debes ver el bloque `[default]` con tus tres claves. Si sale vacío o
   da error, repite desde el paso 3.

---

**Windows — método alternativo con Git Bash**

Si prefieres usar Git Bash y quieres evitar el problema del `.txt`,
usa `tee` en lugar de Notepad:

```bash
mkdir -p ~/.aws
cat > ~/.aws/credentials << 'EOF'
[default]
aws_access_key_id=PEGA_TU_ACCESS_KEY_ID
aws_secret_access_key=PEGA_TU_SECRET_ACCESS_KEY
aws_session_token=PEGA_TU_SESSION_TOKEN
EOF
```

| Parte | Significado |
|---|---|
| `cat >` | Redirige la salida del bloque al archivo indicado, sobrescribiéndolo si ya existe. Evita abrir ningún editor. |
| `<< 'EOF'` | Inicio del heredoc: indica que el texto a continuación se trata como entrada literal hasta encontrar `EOF` solo en una línea. |
| Resultado | El archivo `credentials` se crea **sin extensión `.txt`** directamente desde la terminal. |

   Después de pegar el comando, presiona **Enter** — el archivo se crea
   automáticamente sin extensión `.txt`.

El archivo debe quedar exactamente asi (con tus propios valores):

```
[default]
aws_access_key_id=ASIA4BUJWSL7GKK3SV4M
aws_secret_access_key=6dFVjKXBDxs41+mxUHAyO3WPiE1mdfQSMj7ecaed
aws_session_token=IQoJb3JpZ2luX2VjEJf//////////wEaCXVzLXdlc3Qt...
```

> **No uses `aws configure`** con credenciales de Academy: ese comando
> no guarda el `aws_session_token`, que es obligatorio para que funcione.

---

### Verificar que la configuracion es correcta

**Git Bash / macOS / Linux:**

```bash
aws sts get-caller-identity
```

**PowerShell:**

```powershell
aws sts get-caller-identity
```

| Parte | Significado |
|---|---|
| `aws sts` | STS = Security Token Service: servicio de AWS que gestiona credenciales temporales |
| `get-caller-identity` | Subcomando que devuelve el usuario/rol asociado a las credenciales activas |

> Solo lectura: no modifica nada en AWS. Es el equivalente a «¿quién soy yo?».

Deberia responder un JSON como este:

```json
{
    "UserId": "AROA4BUJWSL7...",
    "Account": "828143735550",
    "Arn": "arn:aws:sts::828143735550:assumed-role/LabRole/..."
}
```

Si ves el JSON, las credenciales estan activas y el CLI esta listo.
Si ves `ExpiredTokenException`, vuelve al paso **"Obtener credenciales"**
y repega el nuevo bloque desde AWS Details.

---

### Autenticar Docker contra ECR

**Git Bash / macOS / Linux:**

```bash
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  <ACCOUNT-ID>.dkr.ecr.us-east-1.amazonaws.com
```

**PowerShell (Windows):**

```powershell
aws ecr get-login-password --region us-east-1 |
  docker login --username AWS --password-stdin `
  <ACCOUNT-ID>.dkr.ecr.us-east-1.amazonaws.com
```

> En PowerShell, la continuación de línea usa el backtick `` ` `` en vez
> de `\`. El `|` funciona igual que en bash cuando conecta programas
> externos como `aws` y `docker` (PowerShell les pasa el texto directamente).

**¿Qué hace cada parte?**

| Fragmento | Significado |
|---|---|
| `aws ecr get-login-password` | Obtiene un token temporal de autenticación para ECR (válido 12 h) |
| `--region us-east-1` | Región de AWS donde están tus repositorios ECR |
| `\|` | Pipe: envía la salida del comando anterior como entrada al siguiente |
| `docker login` | Autentica Docker contra un registro de imágenes |
| `--username AWS` | Usuario estándar que exige ECR (siempre es literalmente `AWS`) |
| `--password-stdin` | Lee la contraseña desde stdin en vez de pedirla interactiva (más seguro) |
| `<ACCOUNT-ID>.dkr.ecr...` | URL del registro privado ECR de tu cuenta |

Resultado esperado: `Login Succeeded`
---

# Parte 3 – Build y push de imagenes a ECR (15 min)

Asegurate de estar en la carpeta `exp3-aws/` (la que contiene ambos repositorios).

## Paso 3.1 – Construir la imagen del backend

**Git Bash / macOS / Linux:**

```bash
docker build -t tareas-backend:1.0 ./backend_intro_devops
docker images | grep tareas-backend
```

**PowerShell (Windows):**

```powershell
docker build -t tareas-backend:1.0 ./backend_intro_devops
docker images | Select-String "tareas-backend"
```

| Flag / parte | Significado |
|---|---|
| `docker build` | Construye una imagen Docker a partir de un `Dockerfile` |
| `-t tareas-backend:1.0` | Asigna nombre (`tareas-backend`) y tag (`1.0`) a la imagen. Sin tag, Docker usa `latest`. |
| `./backend_intro_devops` | Ruta al contexto de build: carpeta del repo backend, que contiene el `Dockerfile` |
| `docker images` | Lista todas las imágenes locales |
| `\| grep tareas-backend` | (Git Bash / Linux) Filtra la salida para mostrar solo las líneas que contienen `tareas-backend` |
| `\| Select-String "tareas-backend"` | (PowerShell) Equivalente a `grep`: busca líneas que coincidan con el texto indicado |

---

## Paso 3.2 – Etiquetar y publicar el backend en ECR

`docker tag` crea un alias con el URI completo de ECR.
`docker push` sube la imagen capa por capa.

**Git Bash / PowerShell / macOS / Linux** (mismo comando en todos los sistemas):

```bash
docker tag tareas-backend:1.0 <URI-BACKEND>:1.0
docker push <URI-BACKEND>:1.0
```

| Comando | Significado |
|---|---|
| `docker tag <origen> <destino>` | Crea un alias (tag) sobre una imagen existente sin duplicar los datos. `<origen>` es el nombre local; `<destino>` es el URI de ECR con su tag. |
| `docker push <URI>:tag` | Sube la imagen (capa por capa) al registro remoto indicado en el URI. Requiere haber hecho `docker login` previamente. |

Ejemplo con un Account ID real (reemplaza `123456789012` con el tuyo):

```bash
docker tag tareas-backend:1.0 123456789012.dkr.ecr.us-east-1.amazonaws.com/tareas-backend:1.0
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/tareas-backend:1.0
```

> Este bloque es el mismo comando que el anterior, con el URI completo
> escrito explícitamente. No hay flags adicionales.

Cuando termine, ve a la consola de AWS → ECR → `tareas-backend` → **Images**
y confirma que aparece la imagen con el tag `1.0`.

> **Observa el output del push:** Docker sube capa por capa. Si una capa ya
> existe en ECR (por ejemplo `node:20-alpine`) dira `Layer already exists`
> y la saltara. Esto hace que las actualizaciones sean muy rapidas.

---

## Paso 3.3 – Construir y publicar la imagen inicial del frontend

Por ahora construimos el frontend con `localhost` como URL del backend.
Lo corregiremos en el Paso 5 una vez que tengamos la IP del EC2 backend.

**Git Bash / PowerShell / macOS / Linux** (mismo comando en todos los sistemas):

```bash
docker build -t tareas-frontend:1.0 ./frontend_intro_devops
docker tag tareas-frontend:1.0 <URI-FRONTEND>:1.0
docker push <URI-FRONTEND>:1.0
```

> Los flags de `docker build`, `docker tag` y `docker push` son los mismos
> que en los Pasos 3.1 y 3.2. Aquí se aplican al contexto `./frontend_intro_devops`
> y al URI del repositorio ECR del frontend.

---

# Parte 4 – EC2 Backend: lanzar, instalar y correr (20 min)

## Paso 4.1 – Lanzar la instancia EC2 del backend

En la consola de AWS → **EC2 → Launch instance**:

**Nombre:** `ec2-backend-<TU-NOMBRE>`

**AMI:** Amazon Linux 2023 AMI *(Free tier eligible)*

**Tipo de instancia:** t2.micro

**Key Pair:** haz clic en **Create new key pair**
- Nombre: `devops-key-<TU-NOMBRE>`
- Tipo: RSA / Formato: `.pem`
- El archivo se descarga automaticamente — **guardalo en lugar seguro**

**Network settings → Edit:**
- Auto-assign public IP: **Enable**
- Security group: **Create security group** — Nombre: `sg-backend`

Reglas de entrada (Inbound rules):

| Tipo | Puerto | Origen | Por que |
|---|---|---|---|
| SSH | 22 | My IP | Solo tu IP puede acceder por SSH |
| Custom TCP | 3000 | 0.0.0.0/0 | El navegador del usuario llama al backend directamente |

> **Por que el puerto 3000 esta abierto a todos?**
> Angular es una SPA que corre en el navegador. El browser del usuario
> llama al backend EC2 directamente, no a traves del frontend EC2.
> Por eso el backend debe ser accesible desde internet.

**Advanced details → IAM instance profile:** selecciona **LabRole**

> **LabRole** es el perfil preconfigurado en AWS Academy que ya tiene
> permisos para leer imagenes de ECR. Gracias a el, la EC2 puede hacer
> `docker pull` desde ECR sin necesitar credenciales manuales.

**Storage:** 8 GiB gp3 (por defecto)

Haz clic en **Launch instance**.

---

## Paso 4.2 – Obtener la IP publica del backend

Ve a **EC2 → Instances**, espera a que el estado sea **Running**
y los status checks muestren **2/2 checks passed**.

Copia la **Public IPv4 address**:

```
IP publica del backend EC2: ___________________
```

Guardala — la necesitaras en el Paso 5.

---

## Paso 4.3 – Conectarse al backend por SSH

**Git Bash / macOS / Linux:**

```bash
# Quitar permisos excesivos al archivo de clave privada (SSH lo exige)
chmod 400 ~/devops-key-<TU-NOMBRE>.pem

# Conectarse a la instancia EC2
ssh -i ~/devops-key-<TU-NOMBRE>.pem ec2-user@<IP-BACKEND>
```

| Flag / argumento | Significado |
|---|---|
| `chmod 400` | Deja el archivo de solo lectura para el dueño. SSH rechaza claves con permisos abiertos. |
| `ssh -i` | Indica la clave privada (identity file) a usar para autenticarse. |
| `ec2-user` | Usuario predeterminado de Amazon Linux 2023 en EC2. |
| `@<IP-BACKEND>` | IP pública de la instancia EC2 backend. |

**PowerShell (Windows):**

```powershell
# Restringir permisos del archivo .pem para que SSH lo acepte
icacls "C:\Users\$env:USERNAME\devops-key-<TU-NOMBRE>.pem" /inheritance:r /grant:r "$env:USERNAME:(R)"

# Conectarse a la instancia EC2
ssh -i "C:\Users\$env:USERNAME\devops-key-<TU-NOMBRE>.pem" ec2-user@<IP-BACKEND>
```

| Flag / argumento | Significado |
|---|---|
| `icacls ... /inheritance:r` | Elimina los permisos heredados del archivo. |
| `/grant:r "$env:USERNAME:(R)"` | Otorga solo lectura (`R`) a tu usuario de Windows. |
| `ssh -i "ruta"` | Mismo flag que en Linux: especifica la clave privada. |

> **¿Dónde está el archivo `.pem`?** Al descargarlo desde la consola de
> AWS, el navegador lo guarda en `C:\Users\<TuUsuario>\Downloads\`.
> Puedes moverlo a `C:\Users\<TuUsuario>\` para acortar el comando.

Escribe `yes` cuando pregunte por la huella digital del servidor.
El prompt de Amazon Linux confirma que estas dentro:

```
[ec2-user@ip-172-31-XX-XX ~]$
```

---

## Paso 4.4 – Instalar Docker en el backend EC2

Todos los siguientes comandos se ejecutan **dentro de la sesion SSH**:

```bash
# Actualizar paquetes del sistema
sudo dnf update -y

# Instalar Docker
sudo dnf install docker -y

# Iniciar Docker y habilitarlo para que arranque al reiniciar la instancia
sudo systemctl start docker
sudo systemctl enable docker

# Agregar tu usuario al grupo docker (evita usar sudo en cada comando)
sudo usermod -aG docker ec2-user

# Agregar 1 GB de swap (precaucion con t2.micro de solo 1 GB de RAM)
sudo dd if=/dev/zero of=/swapfile bs=128M count=8
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

| Comando | Significado |
|---|---|
| `sudo dnf update -y` | Actualiza todos los paquetes instalados. `dnf` es el gestor de paquetes de Amazon Linux 2023 (equivalente a `apt` en Ubuntu). `-y` responde "sí" automáticamente a todas las preguntas. |
| `sudo dnf install docker -y` | Instala el motor Docker. En Amazon Linux 2023, `docker-compose-plugin` no está en los repos por defecto; como esta experiencia no usa Compose en EC2, no se instala. |
| `sudo systemctl start docker` | Inicia el servicio Docker ahora mismo. `systemctl` controla los servicios del sistema (systemd). |
| `sudo systemctl enable docker` | Configura Docker para que arranque automáticamente cada vez que la instancia se reinicie. |
| `sudo usermod -aG docker ec2-user` | Agrega el usuario `ec2-user` al grupo `docker`. `-a` = append (no reemplaza grupos existentes), `-G docker` = grupo al que se agrega. Evita tener que escribir `sudo` antes de cada comando de Docker. |
| `sudo dd if=/dev/zero of=/swapfile bs=128M count=8` | Crea un archivo de 1 GB lleno de ceros para usarlo como swap. `if` = input file, `of` = output file, `bs` = block size, `count` = número de bloques (128M × 8 = 1 GB). |
| `sudo chmod 600 /swapfile` | Restringe el acceso al archivo de swap: solo el propietario (root) puede leer y escribir. Linux exige estos permisos para activar swap. |
| `sudo mkswap /swapfile` | Formatea el archivo como espacio de swap (escribe la cabecera que Linux necesita). |
| `sudo swapon /swapfile` | Activa el archivo de swap para que el sistema lo use como memoria adicional. |

Cierra la sesion y reconectate para activar el grupo docker:

```bash
exit
ssh -i ~/devops-key-<TU-NOMBRE>.pem ec2-user@<IP-BACKEND>
```

Verifica:

```bash
docker ps       # responde sin error (lista vacia)
free -h         # muestra ~1 GB en la fila Swap
```

| Comando | Significado |
|---|---|
| `docker ps` | Lista los contenedores en ejecución. Sin `-a` solo muestra los activos. Si responde sin error, Docker está corriendo y tu usuario tiene permisos. |
| `free -h` | Muestra el uso de memoria RAM y swap. `-h` = human-readable (muestra MB/GB en vez de bytes). La fila `Swap` debe mostrar ~1.0G. |

---

## Paso 4.5 – Autenticar Docker en el backend EC2 contra ECR

Gracias al **IAM Instance Profile (LabRole)** asignado al crear la instancia,
la EC2 ya tiene permisos para leer ECR. Solo debes autenticar Docker.

Los siguientes comandos se ejecutan **dentro de la sesión SSH** (en el
terminal conectado a la EC2, no en tu máquina local):

```bash
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  <ACCOUNT-ID>.dkr.ecr.us-east-1.amazonaws.com
```

| Parte del comando | Qué hace |
|---|---|
| `aws ecr get-login-password` | Pide a AWS un token temporal para el registro ECR |
| `--region us-east-1` | Región donde creaste los repositorios ECR |
| `\|` | Pipe: conecta la salida del primer comando con la entrada del segundo |
| `docker login --username AWS` | Autentica Docker; el usuario siempre es `AWS` para ECR |
| `--password-stdin` | Recibe la contraseña por stdin (desde el pipe); más seguro que escribirla |
| URL final | Dominio del registro privado ECR de tu cuenta |

Resultado esperado: `Login Succeeded`

> **Sin LabRole** necesitarias ejecutar `aws configure` en el servidor y
> pegar tus credenciales personales. Eso es un riesgo de seguridad: si
> alguien accede al servidor, tambien tiene tus credenciales. El IAM Role
> elimina ese riesgo.

---

## Paso 4.6 – Descargar la imagen desde ECR y correr el backend

```bash
# Descargar la imagen del backend desde ECR
docker pull <URI-BACKEND>:1.0

# Correr el contenedor
docker run -d \
  --name tareas-backend \
  -p 3000:3000 \
  -e MENSAJE_BIENVENIDA="Backend en AWS EC2" \
  -v datos-tareas:/data \
  <URI-BACKEND>:1.0
```

| Flag | Significado |
|---|---|
| `docker pull <URI>:1.0` | Descarga la imagen con el tag `1.0` desde ECR al servidor |
| `docker run -d` | Inicia el contenedor en modo **detached** (en segundo plano; la terminal queda libre) |
| `--name tareas-backend` | Nombre legible para el contenedor; se usa en `docker stop`, `docker logs`, etc. |
| `-p 3000:3000` | Mapea el puerto 3000 del host al puerto 3000 del contenedor (`host:contenedor`) |
| `-e MENSAJE_BIENVENIDA=...` | Inyecta una variable de entorno dentro del contenedor |
| `-v datos-tareas:/data` | Monta el volumen `datos-tareas` en `/data` dentro del contenedor (persistencia) |

Verifica que esta corriendo:

```bash
docker ps
# debe aparecer tareas-backend en estado "Up"

curl http://localhost:3000/api/tareas
# debe devolver JSON con las 3 tareas iniciales
```

| Comando | Significado |
|---|---|
| `docker ps` | Lista contenedores activos. La columna `STATUS` debe decir `Up X seconds/minutes`. |
| `curl http://localhost:3000/api/tareas` | Hace una petición HTTP GET al endpoint del backend. `curl` es un cliente HTTP de línea de comandos. Si responde con JSON, el backend está funcionando. |

> **Checkpoint 4:** abre `http://<IP-BACKEND>:3000/api/tareas` en tu
> navegador local. Si ves el JSON, el backend esta corriendo en la nube.

---

# Parte 5 – Ajustar el frontend y republicar imagen (15 min)

> Vuelve a tu **terminal local** (no la sesion SSH del servidor).
> Asegúrate de estar en la carpeta `exp3-aws/` antes de ejecutar los comandos.

## Paso 5.1 – Editar la URL del backend en el frontend

Debes cambiar **una sola línea** en el archivo
`frontend_intro_devops/src/app/services/tareas.service.ts`:

```
Antes:   readonly baseUrl = 'http://localhost:3000';
Después: readonly baseUrl = 'http://<IP-BACKEND>:3000';
```

Usa la IP pública del backend EC2 que anotaste en el Paso 4.2.
Sigue las instrucciones para el editor disponible en el laboratorio.

---

### Opción A – Visual Studio Code (recomendado si está instalado)

1. Abre **Visual Studio Code** desde el menú Inicio.

2. En la barra de menú superior: **File → Open Folder…**

3. Navega a la carpeta `exp3-aws/frontend_intro_devops` que clonaste en el Paso 1.1.
   La ruta suele ser:
   ```
   C:\Users\<TuUsuario>\exp3-aws\frontend_intro_devops
   ```
   Selecciona esa carpeta y haz clic en **Seleccionar carpeta**.

4. En el panel izquierdo (Explorador de archivos de VS Code), expande las
   carpetas hasta llegar al archivo:
   ```
   frontend_intro_devops
   └── src
       └── app
           └── services
               └── tareas.service.ts
   ```
   Haz doble clic en `tareas.service.ts` para abrirlo en el editor.

5. Usa la búsqueda integrada para encontrar la línea exacta:
   - Presiona **Ctrl + F**
   - Escribe `localhost:3000`
   - VS Code resalta la coincidencia en el archivo

6. Cierra el buscador con **Escape** y edita la línea directamente:

   **Antes:**
   ```typescript
   readonly baseUrl = 'http://localhost:3000';
   ```

   **Después** (sustituye con la IP real de tu backend EC2):
   ```typescript
   readonly baseUrl = 'http://54.234.12.88:3000';
   ```

7. Guarda con **Ctrl + S**.

   > VS Code muestra un círculo (●) junto al nombre del archivo cuando hay
   > cambios sin guardar. Después de **Ctrl + S** el círculo desaparece —
   > eso confirma que el archivo fue guardado.

---

### Opción B – Notepad++ (común en laboratorios de universidades)

1. Abre el **Explorador de archivos** de Windows y navega a:
   ```
   C:\Users\<TuUsuario>\exp3-aws\frontend_intro_devops\src\app\services
   ```

2. Haz clic derecho sobre `tareas.service.ts` → **Edit with Notepad++**
   *(Si no aparece esa opción, haz clic derecho → Abrir con → Notepad++)*.

3. Usa Buscar y Reemplazar para hacer el cambio con precisión:
   - Presiona **Ctrl + H**
   - **Buscar:** `http://localhost:3000`
   - **Reemplazar con:** `http://<IP-BACKEND>:3000`
     (escribe la IP real, por ejemplo `http://54.234.12.88:3000`)
   - Haz clic en **Reemplazar todo**

4. Guarda con **Ctrl + S**.

---

### Opción C – Bloc de notas de Windows (si no hay otro editor)

> El Bloc de notas no tiene resaltado de código, pero funciona para este
> cambio puntual.

1. En el **Explorador de archivos**, navega a:
   ```
   C:\Users\<TuUsuario>\exp3-aws\frontend_intro_devops\src\app\services
   ```

2. Haz clic derecho sobre `tareas.service.ts` → **Abrir con → Bloc de notas**
   *(Si no aparece: clic derecho → «Abrir con» → «Elegir otra aplicación» → busca Bloc de notas o Notepad)*.

3. Busca la línea con `localhost:3000`:
   - Presiona **Ctrl + F**
   - Escribe `localhost:3000` → **Buscar siguiente**
   - La línea quedará seleccionada en pantalla

4. Cierra el cuadro de búsqueda con **Escape** y edita la línea manualmente.

5. Guarda con **Ctrl + S**.

---

### Resultado esperado (en cualquier editor)

La línea modificada debe verse así, con la IP real de tu backend:

```typescript
readonly baseUrl = 'http://54.234.12.88:3000';
```

> **Nota:** en proyectos reales no se hardcodea la IP en el código fuente.
> Se usan variables de entorno (`environment.ts` en Angular) configuradas
> en tiempo de build. Para esta experiencia lo hacemos directamente para
> simplificar y enfocarnos en ECR y la arquitectura por capas.

---

## Paso 5.2 – Reconstruir y publicar la imagen actualizada con tag 2.0

**Git Bash / PowerShell / macOS / Linux** (mismo comando en todos los sistemas):

```bash
# Ejecutar desde exp3-aws/ (no desde dentro del repo)
docker build -t tareas-frontend:2.0 ./frontend_intro_devops
docker tag tareas-frontend:2.0 <URI-FRONTEND>:2.0
docker push <URI-FRONTEND>:2.0
```

> Los flags son los mismos que en los Pasos 3.1 y 3.2.
> La única diferencia es el tag `2.0`: esta imagen ya tiene la IP real
> del backend en `baseUrl`, a diferencia de la `1.0` que tenía `localhost`.

En la consola de AWS (ECR → `tareas-frontend` → Images) ahora deben aparecer
dos versiones: `1.0` (con localhost) y `2.0` (con la IP real del backend).

> **Por que guardamos el tag 1.0?**
> ECR guarda el historial de imagenes. Si el tag `2.0` tiene un bug,
> puedes volver al `1.0` con un simple `docker pull <URI>:1.0`.
> Esto se llama **rollback** y es una practica esencial en DevOps.

---

# Parte 6 – EC2 Frontend: lanzar, instalar y correr (20 min)

## Paso 6.1 – Lanzar la instancia EC2 del frontend

En la consola de AWS → **EC2 → Launch instance**:

**Nombre:** `ec2-frontend-<TU-NOMBRE>`

**AMI:** Amazon Linux 2023 AMI

**Tipo de instancia:** t2.micro

**Key Pair:** selecciona el mismo `.pem` que creaste en el Paso 4.1
*(no es necesario crear uno nuevo)*

**Network settings → Edit:**
- Auto-assign public IP: **Enable**
- Security group: **Create security group** — Nombre: `sg-frontend`

Reglas de entrada (Inbound rules):

| Tipo | Puerto | Origen | Por que |
|---|---|---|---|
| SSH | 22 | My IP | Solo tu IP accede por SSH |
| Custom TCP | 4200 | 0.0.0.0/0 | Acceso publico al frontend Angular |

**Advanced details → IAM instance profile:** selecciona **LabRole**

Haz clic en **Launch instance**.

---

## Paso 6.2 – Obtener la IP publica del frontend

Espera a que el estado sea **Running / 2/2 checks passed** y copia la IP:

```
IP publica del frontend EC2: ___________________
```

---

## Paso 6.3 – Conectarse al frontend por SSH

Abre una **segunda terminal** (puedes mantener la sesion del backend abierta):

```bash
ssh -i ~/devops-key-<TU-NOMBRE>.pem ec2-user@<IP-FRONTEND>
```

> Los flags `-i` y el usuario `ec2-user` son los mismos que en el Paso 4.3.
> Solo cambia la IP: aquí apunta a la instancia del **frontend**.
> Asegúrate de que el archivo `.pem` ya tiene permisos `400` (lo hiciste en el Paso 4.3).

---

## Paso 6.4 – Instalar Docker en el frontend EC2

Los comandos son exactamente los mismos que en el Paso 4.4:

```bash
sudo dnf update -y
sudo dnf install docker -y
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ec2-user
sudo dd if=/dev/zero of=/swapfile bs=128M count=8
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

> La explicación de cada flag y comando se encuentra en el **Paso 4.4**.

Cierra y reconecta la sesion SSH:

```bash
exit
ssh -i ~/devops-key-<TU-NOMBRE>.pem ec2-user@<IP-FRONTEND>
docker ps && free -h
```

| Parte | Significado |
|---|---|
| `exit` | Cierra la sesión SSH actual. Necesario para que el cambio de grupo `docker` tome efecto. |
| `ssh -i ... ec2-user@<IP-FRONTEND>` | Vuelve a conectarse a la EC2 del frontend (flags descritos en Paso 4.3). |
| `docker ps && free -h` | Ejecuta ambos comandos en secuencia. `&&` significa "ejecuta el segundo solo si el primero tuvo éxito". |

---

## Paso 6.5 – Autenticar Docker contra ECR y descargar la imagen del frontend

```bash
# Autenticar contra ECR (mismo comando que en el backend)
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  <ACCOUNT-ID>.dkr.ecr.us-east-1.amazonaws.com

# Descargar la imagen del frontend (tag 2.0, con la IP del backend)
docker pull <URI-FRONTEND>:2.0

# Correr el contenedor
docker run -d \
  --name tareas-frontend \
  -p 4200:4200 \
  <URI-FRONTEND>:2.0
```

> El comando `aws ecr get-login-password | docker login` es idéntico al del
> Paso 4.5 — consulta esa sección para la explicación de cada flag.

| Flag de `docker run` | Significado |
|---|---|
| `-d` | Modo detached: el contenedor corre en segundo plano |
| `--name tareas-frontend` | Nombre legible para referenciar el contenedor en otros comandos |
| `-p 4200:4200` | Expone el puerto 4200 del contenedor al puerto 4200 del host (la EC2) |

Angular tarda 2-3 minutos en compilar. Sigue los logs:

```bash
docker logs -f tareas-frontend
```

| Flag | Significado |
|---|---|
| `docker logs` | Muestra la salida estándar (stdout/stderr) del contenedor |
| `-f` | Follow: mantiene el stream abierto en tiempo real (como `tail -f`). Presiona `Ctrl+C` para salir sin detener el contenedor. |

Espera hasta ver:

```
** Angular Live Development Server is listening on 0.0.0.0:4200 **
✔ Compiled successfully.
```

Presiona `Ctrl+C` para salir de los logs sin detener el contenedor.

---

# Parte 7 – Probar la aplicacion end-to-end (10 min)

## Paso 7.1 – Verificar cada capa individualmente

**Backend** (desde tu navegador o terminal local):

```
http://<IP-BACKEND>:3000
http://<IP-BACKEND>:3000/api/tareas
```

Deberia responder con JSON.

**Frontend** (desde tu navegador):

```
http://<IP-FRONTEND>:4200
```

Deberia cargar la interfaz de la aplicacion de tareas.

---

## Paso 7.2 – Verificar la comunicacion entre capas

En el pie de pagina de la aplicacion (componente `app.component.ts`) aparece
la URL del backend. Confirma que muestra la IP de tu EC2 backend, no `localhost`.

Luego prueba las funcionalidades:

1. **Crea al menos 2 tareas** desde la interfaz.
2. **Marca una tarea como completada**.
3. **Elimina una tarea** y verifica que desaparece.

---

## Paso 7.3 – Verificar la persistencia del backend

Reinicia solo el contenedor del backend y verifica que los datos sobreviven
gracias al volumen:

```bash
# En la terminal SSH del backend:
docker restart tareas-backend
```

| Comando | Significado |
|---|---|
| `docker restart <nombre>` | Detiene y vuelve a iniciar el contenedor indicado. Los volúmenes persisten: los datos en `/data` sobreviven al reinicio. |

Recarga la pagina en el navegador: las tareas deben seguir existiendo.

> **Checkpoint final:** la aplicacion tiene dos servidores en AWS comunicandose
> a traves de internet. Backend y frontend son independientes: puedes
> actualizar uno sin tocar el otro. Esto es una arquitectura de microservicios
> basica en produccion.

---

## Cuestionario de autoevaluacion

Crea el archivo `respuestas_exp3.md` en tu maquina local y responde:

1. ¿Que es Amazon ECR y en que se diferencia de Docker Hub?

2. Explica el flujo completo desde `docker build` hasta que la imagen corre en EC2.
   Menciona todos los comandos involucrados en orden.

3. ¿Por que fue necesario cambiar `localhost` por la IP del backend en
   `tareas.service.ts`? ¿Que tipo de aplicacion es Angular (SPA) y como
   afecta esto a la comunicacion entre capas?

4. ¿Que ventaja tiene usar un **IAM Instance Profile (LabRole)** en lugar
   de configurar `aws configure` con tus credenciales personales en el servidor?

5. Publicaste el frontend con dos tags (`1.0` y `2.0`). ¿Por que es importante
   no borrar el tag `1.0`? ¿Que es un rollback y cuando se usaria?

6. Describe las reglas de Security Group de cada instancia. ¿Por que el
   backend necesita el puerto 3000 abierto a internet si el frontend
   esta en su propia EC2?

7. ¿Que diferencia hay entre detener (Stop) y terminar (Terminate) una instancia
   EC2? ¿Que pasa con el volumen `datos-tareas` si terminas el backend?

8. En esta arquitectura el frontend llama al backend por IP publica de AWS.
   ¿Que ventaja tendria usar la **IP privada** si ambas EC2 estan en la
   misma VPC?

---

## Solucion de problemas

| Sintoma | Causa probable | Solucion |
|---|---|---|
| `Permission denied (publickey)` | Permisos del .pem incorrectos o usuario equivocado | `chmod 400 clave.pem`; asegurate de usar `ec2-user` (Amazon Linux) |
| `Connection timed out` al SSH | Puerto 22 no abierto en SG o IP equivocada | Verifica la regla SSH del SG y la IP publica actual |
| `ExpiredTokenException` en aws ecr | Credenciales de Academy expiradas | Ve al Learner Lab, copia el nuevo bloque de credenciales y repite `aws configure` |
| `no basic auth credentials` al hacer pull en EC2 | Docker en EC2 no esta autenticado contra ECR | Repite el `aws ecr get-login-password ... \| docker login ...` en esa EC2 |
| `AccessDeniedException` al hacer pull | IAM Instance Profile sin permisos de ECR | Verifica que asignaste LabRole al crear la instancia |
| La pagina carga pero las tareas no aparecen | `baseUrl` incorrecto o backend caido | Confirma la IP en `tareas.service.ts`; verifica `docker ps` en el backend |
| Error CORS en la consola del navegador | El backend rechaza peticiones del frontend | El `server.js` del proyecto ya tiene CORS; si lo modificaste, verifica `app.use(cors())` |
| `Killed` durante `npm install` | Sin suficiente memoria en t2.micro | Verifica swap con `free -h`; si no existe, ejecuta los comandos del Paso 4.4 |
| El frontend compila pero no conecta al backend | Firewall del backend bloqueando el puerto 3000 | Verifica que el SG del backend tiene puerto 3000 abierto a `0.0.0.0/0` |

---

## Entregables y rubrica

Sube a la plataforma indicada por el profesor:

**Archivo `respuestas_exp3.md`** con las 8 preguntas del cuestionario.

**Carpeta `evidencias/`** con las siguientes capturas de pantalla:

1. ECR con los dos repositorios y las imagenes con sus tags visibles (`1.0` y `2.0`).
2. EC2 Backend en estado Running con la IP publica visible.
3. EC2 Frontend en estado Running con la IP publica visible.
4. `docker ps` corriendo en el backend EC2 (muestra `tareas-backend` activo).
5. `docker ps` corriendo en el frontend EC2 (muestra `tareas-frontend` activo).
6. La aplicacion en el navegador en `http://<IP-FRONTEND>:4200` con 2 tareas creadas.
7. El pie de pagina de la app mostrando la URL del backend con la IP real (no `localhost`).

### Rubrica (100 pts)

| Criterio | Puntos |
|---|---|
| Repositorios ECR creados con imagenes publicadas (`1.0` y `2.0` del frontend) | 20 |
| EC2 Backend corriendo imagen desde ECR con SG correcto | 20 |
| EC2 Frontend corriendo imagen desde ECR con SG correcto | 20 |
| Aplicacion accesible desde el navegador por IP publica del frontend | 20 |
| `baseUrl` correctamente actualizado en la imagen `2.0` | 10 |
| Cuestionario `respuestas_exp3.md` respondido | 10 |

---

## Limpieza final (obligatoria)

> Las instancias EC2 en ejecucion consumen creditos de AWS Academy.
> Realiza esta limpieza al finalizar la experiencia o al cerrar la sesion.

### 1 – Detener contenedores en cada EC2

**Backend EC2 (terminal SSH del backend):**

```bash
docker stop tareas-backend
docker rm tareas-backend
docker volume rm datos-tareas
exit
```

| Comando | Significado |
|---|---|
| `docker stop <nombre>` | Envía la señal SIGTERM al contenedor y espera hasta 10 s para que se detenga limpiamente. |
| `docker rm <nombre>` | Elimina el contenedor detenido. No elimina la imagen ni el volumen. |
| `docker volume rm datos-tareas` | Elimina el volumen nombrado `datos-tareas`. **Los datos se pierden permanentemente.** |
| `exit` | Cierra la sesión SSH. |

**Frontend EC2 (terminal SSH del frontend):**

```bash
docker stop tareas-frontend
docker rm tareas-frontend
exit
```

> `docker stop` y `docker rm` funcionan igual que en el backend.
> El frontend no tiene volumen persistente, por lo que no es necesario `docker volume rm`.

### 2 – Terminar las instancias EC2

En la consola de AWS → **EC2 → Instances**, selecciona ambas instancias
y elige **Instance state → Terminate instance → Confirm**.

> **Stop vs Terminate:** Stop conserva la instancia y cobra almacenamiento.
> Terminate la elimina definitivamente. Usa Terminate al finalizar la experiencia.

### 3 – Limpiar ECR (opcional)

En **ECR → Repositories**, entra a cada repositorio, selecciona las imagenes
y haz clic en **Delete**. Luego elimina los repositorios vacios.

---

## Glosario

- **ECR:** Elastic Container Registry; registro privado de imagenes Docker en AWS.
- **docker tag:** crea un alias de una imagen local con el URI completo de ECR.
- **docker push:** sube una imagen local al registro remoto (ECR, Docker Hub, etc.).
- **docker pull:** descarga una imagen desde el registro al servidor local.
- **IAM Instance Profile:** permiso asignado a una EC2 para acceder a otros servicios AWS sin credenciales manuales.
- **SPA (Single Page Application):** app web cuyo codigo corre en el navegador del usuario, no en el servidor.
- **Security Group:** firewall virtual de EC2; controla los puertos accesibles.
- **Rollback:** reversion a una version anterior de una imagen cuando la nueva version tiene problemas.
- **Tag de imagen:** etiqueta de version de una imagen Docker (`1.0`, `2.0`, `latest`).
- **IP publica:** direccion de internet de una instancia EC2; cambia al reiniciar. Usar Elastic IP para fijarla.
- **IP privada:** direccion interna de la VPC de AWS; no cambia y no es accesible desde internet.
- **Swap:** espacio en disco usado como RAM adicional cuando la memoria fisica se agota.

---

> **Felicitaciones.** Implementaste un flujo completo de DevOps:
> construiste imagenes localmente, las versionaste y publicaste en un
> registro privado (ECR), y las desplegaste en dos servidores reales en
> AWS con arquitectura por capas.
> Este flujo es exactamente el que se usa en proyectos de produccion y
> es la base de los pipelines CI/CD que veras en las proximas unidades.
>
> Vuelve al [README del repositorio](../../README.md) para ver la proxima experiencia.
