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

```
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

## Paso 1.1 – Clonar el repositorio

Abre una terminal (**Git Bash** en Windows, Terminal en macOS/Linux)
y clona el repositorio del curso:

```bash
git clone https://github.com/Umbingelelo/backend_intro_devops.git
git clone https://github.com/Umbingelelo/frontend_intro_devops.git
```

Entra a la carpeta del backend:

```bash
cd backend_intro_devops
```

> El profesor indicara la URL exacta del repositorio.

Verifica que tienes todos los archivos:

```bash
ls
# backend/  frontend/  docker-compose.yml  .env.example
```

---

## Paso 1.2 – Verificar Docker local

```bash
docker --version
docker images
```

Si Docker no esta corriendo, abre **Docker Desktop** (Windows/macOS)
o ejecuta `sudo systemctl start docker` (Linux).

---

## Paso 1.3 – El problema de localhost en arquitectura por capas

Abre `frontend/src/app/services/tareas.service.ts` y busca esta linea:

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

**Linux:**

```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip
unzip awscliv2.zip
sudo ./aws/install
aws --version
```

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

El metodo mas rapido es pegar el bloque directamente en el archivo
de credenciales de AWS:

**macOS / Linux — en la terminal:**

```bash
mkdir -p ~/.aws
nano ~/.aws/credentials
```

Borra el contenido anterior (si existe), pega el bloque completo y guarda
con `Ctrl+O`, Enter, `Ctrl+X`.

**Windows — en Git Bash (recomendado en el laboratorio):**

1. Abre **Git Bash** (clic derecho en el escritorio → *Git Bash Here*,
   o búscalo en el menú Inicio).

2. Crea la carpeta `.aws` si no existe y abre el archivo de credenciales:

```bash
mkdir -p ~/.aws
notepad ~/.aws/credentials
```

   Git Bash traduce `~/.aws/credentials` a `C:\Users\<TuUsuario>\.aws\credentials`.
   Si el archivo no existía, el Bloc de notas preguntará si deseas crearlo —
   haz clic en **Sí**.

3. En el Bloc de notas que se abre:
   - Selecciona todo el contenido anterior con **Ctrl + A** y bórralo.
   - Pega el bloque de credenciales con **Ctrl + V**.
   - Guarda el archivo con **Ctrl + S**.
   - Cierra el Bloc de notas.

> **¿No encuentras la carpeta `.aws` en el Explorador de archivos?**
> Las carpetas que empiezan con punto (`.`) están ocultas en Windows por defecto.
> Para verlas: Explorador de archivos → pestaña **Vista** → activa **Elementos ocultos**.
> La ruta es: `C:\Users\<TuUsuario>\.aws\`

**Windows — alternativa con PowerShell:**

1. Abre **PowerShell** desde el menú Inicio (no requiere «Ejecutar como administrador»).

2. Ejecuta los siguientes comandos:

```powershell
# Crear la carpeta .aws si no existe
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.aws"

# Abrir el archivo de credenciales en el Bloc de notas
notepad "$env:USERPROFILE\.aws\credentials"
```

3. En el Bloc de notas: borra el contenido anterior, pega el bloque
   de credenciales (**Ctrl + V**), guarda (**Ctrl + S**) y cierra.

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

```bash
aws sts get-caller-identity
```

Deberia responder un JSON como este:

```json
{
    "UserId": "AROA4BUJWSL7...",
    "Account": "828143735550",
    "Arn": "arn:aws:sts::828143735550:assumed-role/LabRole/..."
}
```

Si ves el JSON, las credenciales estan activas y el CLI esta listo.

---

### Autenticar Docker contra ECR

```bash
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  <ACCOUNT-ID>.dkr.ecr.us-east-1.amazonaws.com
```

Resultado esperado: `Login Succeeded`
---

# Parte 3 – Build y push de imagenes a ECR (15 min)

Asegurate de estar dentro de `actividad-docker/`.

## Paso 3.1 – Construir la imagen del backend

```bash
docker build -t tareas-backend:1.0 ./backend
docker images | grep tareas-backend
```

---

## Paso 3.2 – Etiquetar y publicar el backend en ECR

`docker tag` crea un alias con el URI completo de ECR.
`docker push` sube la imagen capa por capa.

```bash
docker tag tareas-backend:1.0 <URI-BACKEND>:1.0
docker push <URI-BACKEND>:1.0
```

Ejemplo con un Account ID real:

```bash
docker tag tareas-backend:1.0 123456789012.dkr.ecr.us-east-1.amazonaws.com/tareas-backend:1.0
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/tareas-backend:1.0
```

Cuando termine, ve a la consola de AWS → ECR → `tareas-backend` → **Images**
y confirma que aparece la imagen con el tag `1.0`.

> **Observa el output del push:** Docker sube capa por capa. Si una capa ya
> existe en ECR (por ejemplo `node:20-alpine`) dira `Layer already exists`
> y la saltara. Esto hace que las actualizaciones sean muy rapidas.

---

## Paso 3.3 – Construir y publicar la imagen inicial del frontend

Por ahora construimos el frontend con `localhost` como URL del backend.
Lo corregiremos en el Paso 5 una vez que tengamos la IP del EC2 backend.

```bash
docker build -t tareas-frontend:1.0 ./frontend
docker tag tareas-frontend:1.0 <URI-FRONTEND>:1.0
docker push <URI-FRONTEND>:1.0
```

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
chmod 400 ~/devops-key-<TU-NOMBRE>.pem
ssh -i ~/devops-key-<TU-NOMBRE>.pem ec2-user@<IP-BACKEND>
```

**PowerShell (Windows):**

```powershell
icacls "C:\Users\TuNombre\devops-key-TuNombre.pem" /inheritance:r /grant:r "$($env:USERNAME):(R)"
ssh -i "C:\Users\TuNombre\devops-key-TuNombre.pem" ec2-user@<IP-BACKEND>
```

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

# Instalar Docker y el plugin de Compose
sudo dnf install docker docker-compose-plugin -y

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

---

## Paso 4.5 – Autenticar Docker en el backend EC2 contra ECR

Gracias al **IAM Instance Profile (LabRole)** asignado al crear la instancia,
la EC2 ya tiene permisos para leer ECR. Solo debes autenticar Docker:

```bash
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  <ACCOUNT-ID>.dkr.ecr.us-east-1.amazonaws.com
```

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

Verifica que esta corriendo:

```bash
docker ps
# debe aparecer tareas-backend en estado "Up"

curl http://localhost:3000/api/tareas
# debe devolver JSON con las 3 tareas iniciales
```

> **Checkpoint 4:** abre `http://<IP-BACKEND>:3000/api/tareas` en tu
> navegador local. Si ves el JSON, el backend esta corriendo en la nube.

---

# Parte 5 – Ajustar el frontend y republicar imagen (15 min)

> Vuelve a tu **terminal local** (no la sesion SSH del servidor).

## Paso 5.1 – Editar la URL del backend en el frontend

Debes cambiar **una sola línea** en el archivo
`frontend/src/app/services/tareas.service.ts`:

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

3. Navega a la carpeta `frontend_intro_devops` que clonaste en el Paso 1.1.
   La ruta suele ser:
   ```
   C:\Users\<TuUsuario>\frontend_intro_devops
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
   C:\Users\<TuUsuario>\frontend_intro_devops\src\app\services
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
   C:\Users\<TuUsuario>\frontend_intro_devops\src\app\services
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

```bash
# Reconstruir con la URL del backend correcta
docker build -t tareas-frontend:2.0 ./frontend

# Etiquetar para ECR
docker tag tareas-frontend:2.0 <URI-FRONTEND>:2.0

# Publicar en ECR
docker push <URI-FRONTEND>:2.0
```

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

---

## Paso 6.4 – Instalar Docker en el frontend EC2

Los comandos son exactamente los mismos que en el Paso 4.4:

```bash
sudo dnf update -y
sudo dnf install docker docker-compose-plugin -y
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ec2-user
sudo dd if=/dev/zero of=/swapfile bs=128M count=8
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

Cierra y reconecta la sesion SSH:

```bash
exit
ssh -i ~/devops-key-<TU-NOMBRE>.pem ec2-user@<IP-FRONTEND>
docker ps && free -h
```

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

Angular tarda 2-3 minutos en compilar. Sigue los logs:

```bash
docker logs -f tareas-frontend
```

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

**Frontend EC2 (terminal SSH del frontend):**

```bash
docker stop tareas-frontend
docker rm tareas-frontend
exit
```

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
