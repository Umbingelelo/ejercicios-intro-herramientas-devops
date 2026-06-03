# Laboratorio: Despliegue de Microservicios en Amazon EKS

### Actividad 3.1 — ISY1101 Introducción a Herramientas DevOps · Módulo 3

> **Repositorio base:** `https://github.com/Umbingelelo/micro-servicios-k8s`
> **Entorno:** AWS Academy — *Learner Lab*
> **Tiempo estimado:** 90 – 150 minutos (la creación del clúster por sí sola tarda 15–20 min)
> **Nivel:** Conocimientos básicos de Docker, línea de comandos y AWS.

---

## 0. ¿Qué vas a hacer en este laboratorio? (lee esto primero)

Este laboratorio te lleva de la mano por el ciclo completo de **llevar una aplicación de microservicios a producción en Kubernetes** usando los servicios gestionados de Amazon Web Services. Al terminar, habrás:

1. Clonado el repositorio y entendido su estructura de *monorepo*.
2. Configurado tus credenciales temporales de **AWS Academy**.
3. Creado un clúster de **Amazon EKS** (Elastic Kubernetes Service) con `eksctl`.
4. Creado repositorios en **Amazon ECR** (Elastic Container Registry), construido las imágenes Docker de los 3 microservicios y subido cada una.
5. Desplegado los microservicios en el clúster con manifiestos de Kubernetes y comprobado que **se comunican entre sí por el DNS interno** del clúster.
6. Expuesto un servicio a Internet con un **LoadBalancer** y lo habrás probado con `curl`.
7. **Eliminado todos los recursos** para no gastar el presupuesto del lab.

### La aplicación: una tienda online con 3 microservicios

El repositorio es una arquitectura de microservicios sencilla (backend en Python + FastAPI). Son **3 servicios independientes** que se comunican por HTTP interno:

```
                       ┌─────────────────────┐
 POST /orders ───────► │   orders-service    │  (puerto 8003)  ← punto de entrada
   (cliente)           │   "el orquestador"  │
                       └──────────┬──────────┘
                         HTTP     │     HTTP
              ┌────────────────┐  │  ┌────────────────────┐
              ▼                │     ▼                    │
   ┌──────────────────────┐   │  ┌──────────────────────┐
   │  products-service    │   │  │  inventory-service   │
   │  (puerto 8001)       │   │  │  (puerto 8002)       │
   │  catálogo / precios  │   │  │  stock / reservas    │
   └──────────────────────┘   │  └──────────────────────┘
```

| Servicio            | Puerto | Responsabilidad                            | ¿Quién lo llama?                       |
| ------------------- | ------ | ------------------------------------------ | -------------------------------------- |
| `products-service`  | 8001   | Catálogo de productos (id, nombre, precio) | Lo llama `orders-service`              |
| `inventory-service` | 8002   | Stock disponible y reservas                | Lo llama `orders-service`              |
| `orders-service`    | 8003   | Crea pedidos orquestando el flujo          | Lo llamas **tú** (punto de entrada)    |

**El flujo de un pedido (`POST /orders`)** es el corazón didáctico del lab:

1. `orders-service` le pregunta a `products-service` el precio y nombre del producto.
2. Le pide a `inventory-service` que reserve (descuente) el stock.
3. Si ambos pasos van bien, registra el pedido y devuelve el total.

> **La idea clave que demuestra el laboratorio:** el código **NO cambia** entre tu máquina local y EKS. Lo único que cambia es la *configuración* (las variables de entorno `PRODUCTS_SERVICE_URL` e `INVENTORY_SERVICE_URL`), porque tanto Docker Compose como Kubernetes resuelven los servicios **por su nombre**. En Kubernetes eso se llama *DNS interno del clúster*, y comprobarlo es el objetivo central del lab.

---

## ⚠️ 1. LO MÁS IMPORTANTE: cómo funciona AWS Academy Learner Lab

> **Lee esta sección completa antes de empezar.** El 90% de los problemas en este laboratorio vienen de no entender estas limitaciones. AWS Academy **no es una cuenta normal de AWS**: es un entorno educativo de tiempo y presupuesto limitados.

| Limitación | Qué significa para ti | Qué hacer |
| --- | --- | --- |
| **Credenciales temporales** | Las claves de acceso (`aws_access_key_id`, etc.) **caducan** cuando cierras el lab o pasan ~3-4 horas. Cada vez que reinicias el lab, **son nuevas**. | Reconfigurar credenciales **cada sesión** (ver Paso 2). |
| **Región obligatoria** | Solo `us-east-1` (Norte de Virginia) funciona de forma fiable. Otras regiones dan errores de permisos. | Usa **siempre** `us-east-1`. No la cambies. |
| **Presupuesto limitado** | Tienes un crédito acotado (normalmente ~50 USD). EKS + nodos EC2 + LoadBalancer **cuestan dinero por hora**, incluso si no los usas. | **Elimina TODO al terminar** (Paso 7). No dejes el clúster encendido "para mañana". |
| **El lab se detiene solo** | Al cerrar sesión o agotar el tiempo, el entorno se "apaga", pero **los recursos creados pueden seguir facturando** (el plano de control de EKS y el LoadBalancer siguen cobrando). | Termina siempre con la limpieza del Paso 7. |
| **Permisos IAM restringidos** | No puedes crear usuarios IAM. Existe un rol pre-creado llamado **`LabRole`** y tu identidad es un rol asumido `voclabs`. | No intentes crear usuarios ni roles propios salvo que el laboratorio lo permita. |
| **Recursos acotados** | Hay límites de vCPU e instancias. No crees clústeres enormes. | Usa nodos pequeños (`t3.small`) y pocos (2). |

> 🔴 **Regla de oro:** si terminas tu sesión de trabajo y aún no vas a presentar la actividad, ejecuta el Paso 7 (limpieza). Volver a crear el clúster al día siguiente tarda 20 minutos, pero dejarlo encendido puede consumir todo tu presupuesto en una noche.

---

## 2. Requisitos previos: herramientas a instalar

Necesitas **5 herramientas** instaladas en tu computador. Verifica cada una al final con su comando de versión.

| Herramienta | Para qué sirve | Comando para verificar |
| --- | --- | --- |
| **Git** | Clonar el repositorio | `git --version` |
| **Docker** | Construir las imágenes de los microservicios | `docker --version` |
| **AWS CLI v2** | Hablar con AWS desde la terminal | `aws --version` |
| **kubectl** | Hablar con el clúster de Kubernetes | `kubectl version --client` |
| **eksctl** | Crear y borrar el clúster EKS con un comando | `eksctl version` |

### Instalación en macOS (con Homebrew)

> Si no tienes Homebrew, instálalo desde https://brew.sh

```bash
# Git suele venir preinstalado; si no:
brew install git

# Docker Desktop (incluye el motor Docker)
brew install --cask docker
# IMPORTANTE: tras instalar, ABRE la app "Docker" desde Aplicaciones y espera
# a que el ícono de la ballena en la barra superior deje de animarse.

# AWS CLI v2
brew install awscli

# kubectl
brew install kubectl

# eksctl
brew install eksctl
```

### Instalación en Windows (con winget, en PowerShell como Administrador)

> `winget` viene incluido en Windows 10/11 modernos. Abre **PowerShell** (no CMD).

```powershell
# Git
winget install --id Git.Git -e

# Docker Desktop (incluye el motor Docker)
winget install --id Docker.DockerDesktop -e
# IMPORTANTE: tras instalar, ABRE "Docker Desktop" desde el menú Inicio y espera
# a que diga "Engine running" (abajo a la izquierda).

# AWS CLI v2
winget install --id Amazon.AWSCLI -e

# kubectl
winget install --id Kubernetes.kubectl -e

# eksctl
winget install --id Weaveworks.eksctl -e
```

> 💡 **Tras instalar en Windows, CIERRA y vuelve a abrir PowerShell** para que reconozca los nuevos comandos en el `PATH`.

### Verifica que todo está instalado

Ejecuta esto (funciona igual en macOS y PowerShell). Cada línea debe imprimir una versión, no un error:

```bash
git --version
docker --version
aws --version
kubectl version --client
eksctl version
```

> ⚠️ Si `docker --version` responde pero más adelante un `docker build` falla con *"Cannot connect to the Docker daemon"*, es porque **Docker Desktop no está abierto/corriendo**. Ábrelo y espera a que arranque el motor.

---

## 3. Convención de notación de este documento

A lo largo del laboratorio verás bloques separados para cada sistema operativo:

- 🍎 **macOS / Linux** → terminal con `bash` o `zsh`.
- 🪟 **Windows** → **PowerShell** (NO el CMD antiguo).

Donde un comando es idéntico en ambos, aparece una sola vez.

> 🪟 **Aviso crítico para usuarios de Windows:** en PowerShell, `curl` **NO es el curl real**: es un alias del comando `Invoke-WebRequest`, que se comporta distinto. Por eso en este laboratorio usarás **`curl.exe`** (con la extensión `.exe`) cada vez que necesites `curl`. Eso fuerza a Windows a usar el curl de verdad, que se comporta igual que en macOS.

---

## 4. Variables que usaremos

Para no repetir nombres, definiremos algunas variables de entorno. **Anótalas mentalmente:**

| Variable | Valor que usaremos | Qué es |
| --- | --- | --- |
| `AWS_REGION` | `us-east-1` | Región obligatoria de AWS Academy |
| `CLUSTER_NAME` | `microservicios-eks` | Nombre que le pondremos al clúster |
| `AWS_ACCOUNT_ID` | *(se calcula solo)* | El número de 12 dígitos de tu cuenta |

> Las variables de entorno **se borran al cerrar la terminal**. Si cierras y reabres la terminal a mitad del lab, tendrás que volver a definirlas (los pasos te recuerdan cuándo).

🍎 **macOS / Linux:**

```bash
export AWS_REGION=us-east-1
export CLUSTER_NAME=microservicios-eks
```

🪟 **Windows (PowerShell):**

```powershell
$env:AWS_REGION = "us-east-1"
$env:CLUSTER_NAME = "microservicios-eks"
```

---

# PASO 1 — Clonar el repositorio y verificar la estructura

### 1.1 ¿Por qué este paso?

Antes de tocar la nube, necesitamos el código en tu máquina y entender **dónde está cada cosa**. El repositorio es un *monorepo*: un solo repositorio que contiene varios servicios, cada uno en su propio directorio.

### 1.2 Clona el repositorio

Ubícate primero en una carpeta donde quieras trabajar (por ejemplo tu escritorio), y luego clona:

```bash
git clone https://github.com/Umbingelelo/micro-servicios-k8s.git
cd micro-servicios-k8s
```

> `git clone <url>` descarga una copia completa del repositorio.
> `cd micro-servicios-k8s` entra en la carpeta recién creada. **Todos los comandos siguientes del laboratorio se ejecutan desde aquí** (la raíz del repo).

### 1.3 Verifica la estructura

🍎 **macOS / Linux:**

```bash
ls -R
```

🪟 **Windows (PowerShell):**

```powershell
Get-ChildItem -Recurse -Name
```

> `ls -R` (o `Get-ChildItem -Recurse`) lista los archivos **de forma recursiva**, es decir, también los de las subcarpetas.

Deberías ver una estructura como esta:

```
micro-servicios-k8s/
├── docker-compose.yml          # Levanta los 3 servicios localmente (pruebas)
├── README.md
├── scripts/
│   ├── build-and-push-ecr.sh   # Script que construye y sube imágenes a ECR
│   └── deploy-eks.sh           # Script que aplica los manifiestos en el clúster
├── products-service/
│   ├── app/main.py             # Código de la API REST
│   ├── requirements.txt        # Dependencias Python
│   ├── Dockerfile              # Receta para construir la imagen Docker
│   └── k8s/
│       ├── deployment.yaml     # Cómo se despliega el pod en Kubernetes
│       └── service.yaml        # Cómo se expone el servicio (DNS interno)
├── inventory-service/          # (misma estructura que products-service)
└── orders-service/             # (misma estructura)
```

### 1.4 Qué mirar en cada microservicio

Cada uno de los 3 servicios (`products-service`, `inventory-service`, `orders-service`) tiene **exactamente la misma estructura**:

- **`Dockerfile`** → la "receta" para empaquetar el servicio en una imagen. Por ejemplo, el de `products-service` parte de `python:3.12-slim`, instala dependencias, copia el código y arranca el servidor en su puerto. Cada servicio usa su propio puerto: 8001, 8002 y 8003.
- **`k8s/deployment.yaml`** → le dice a Kubernetes **qué imagen** correr, cuántas réplicas (aquí `replicas: 2`) y cómo revisar la salud del pod (`/health`). Aquí hay un marcador `<ACCOUNT_ID>` y `<REGION>` que **reemplazaremos** en el Paso 4.
- **`k8s/service.yaml`** → crea un *Service* de tipo `ClusterIP` (visible solo **dentro** del clúster) para que los otros servicios lo encuentren por su nombre.

> 💡 **Concepto clave:** dentro del `deployment.yaml` de `orders-service` verás variables de entorno apuntando a `http://products-service:8001` y `http://inventory-service:8002`. Esos nombres (`products-service`, `inventory-service`) coinciden **exactamente** con el `name` de cada Service. Así es como un servicio "encuentra" a otro en Kubernetes: por DNS interno.

### 1.5 (Opcional pero recomendado) Pruébalo localmente con Docker Compose

Antes de la nube, conviene ver que la app funciona en tu máquina. Esto **no usa AWS** y no consume presupuesto.

```bash
docker compose up --build
```

> `docker compose up` levanta los 3 servicios juntos en una red local. `--build` fuerza a construir las imágenes desde cero la primera vez. Déjalo corriendo y abre **otra** terminal para probar.

En la otra terminal:

🍎 **macOS / Linux:**

```bash
curl http://localhost:8001/health    # products-service
curl http://localhost:8002/health    # inventory-service
curl http://localhost:8003/health    # orders-service
curl http://localhost:8003/config    # ver a qué URLs internas apunta orders

# Crear un pedido: orders llama a products + inventory por detrás
curl -X POST http://localhost:8003/orders \
     -H "Content-Type: application/json" \
     -d '{"product_id": 1, "quantity": 2}'
```

🪟 **Windows (PowerShell):**

```powershell
curl.exe http://localhost:8001/health
curl.exe http://localhost:8002/health
curl.exe http://localhost:8003/health
curl.exe http://localhost:8003/config

# Crear un pedido (ojo: las comillas internas van escapadas con \" en PowerShell)
curl.exe -X POST http://localhost:8003/orders -H "Content-Type: application/json" -d "{\"product_id\": 1, \"quantity\": 2}"
```

Para detener Docker Compose, vuelve a la primera terminal y presiona `Ctrl + C`, luego:

```bash
docker compose down
```

> Si el pedido te devolvió un JSON con `total` y `stock_remaining`, ¡la comunicación entre servicios funciona en local! Ahora la replicaremos en EKS.

---

# PASO 2 — Configurar credenciales de AWS Academy (cada vez que reinicias el lab)

> 🔴 **Este es el paso que más se olvida.** Cada vez que **inicias** (o reinicias) el Learner Lab, AWS te da **credenciales nuevas**. Las anteriores dejan de funcionar. Si un comando `aws` te da error de credenciales o "token expired", vuelve aquí.

### 2.1 Inicia el laboratorio en AWS Academy

1. Entra a tu curso en **AWS Academy** (a través de Canvas/Vocareum).
2. Abre el módulo del **Learner Lab** y haz clic en **Start Lab**.
3. Espera a que el círculo junto a "AWS" se ponga **verde** 🟢 (puede tardar 1–2 minutos).

### 2.2 Copia tus credenciales

1. Haz clic en **AWS Details** (arriba a la derecha del panel del lab).
2. Junto a **AWS CLI**, haz clic en **Show**.
3. Verás un bloque de texto parecido a este (los valores cambian en cada sesión):

```ini
[default]
aws_access_key_id=ASIAXXXXEXAMPLE
aws_secret_access_key=wJalrXUtnFEMI/EXAMPLEKEY
aws_session_token=IQoJb3JpZ2luX2VjE...=  (cadena muy larga)
```

> El **`aws_session_token`** es lo que diferencia a AWS Academy de una cuenta normal: son credenciales **temporales**. Sin el token, nada funciona.

### 2.3 Pega las credenciales en tu archivo de configuración

El archivo donde van se llama `credentials` y vive en la carpeta `.aws` de tu carpeta de usuario.

🍎 **macOS / Linux:**

```bash
# Crea la carpeta si no existe (no da error si ya existe)
mkdir -p ~/.aws

# Abre el archivo en un editor de texto simple
nano ~/.aws/credentials
```

> Borra cualquier contenido anterior, **pega el bloque completo** que copiaste de AWS Details, y guarda con `Ctrl+O`, `Enter`, y sal con `Ctrl+X`.

🪟 **Windows (PowerShell):**

```powershell
# Crea la carpeta si no existe
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.aws" | Out-Null

# Abre el archivo en el Bloc de notas
notepad "$env:USERPROFILE\.aws\credentials"
```

> Si el Bloc de notas pregunta si quieres crear el archivo, di que **Sí**. Pega el bloque completo, guarda (`Ctrl+S`) y cierra.

### 2.4 Fija la región por defecto

Crea también un archivo `config` para no tener que escribir `--region` en cada comando.

🍎 **macOS / Linux:**

```bash
cat > ~/.aws/config <<'EOF'
[default]
region = us-east-1
output = json
EOF
```

> `cat > archivo <<'EOF' ... EOF` es una forma de escribir varias líneas en un archivo de una sola vez.

🪟 **Windows (PowerShell):**

```powershell
@"
[default]
region = us-east-1
output = json
"@ | Set-Content -Path "$env:USERPROFILE\.aws\config"
```

### 2.5 Verifica que las credenciales funcionan

```bash
aws sts get-caller-identity
```

> Este comando pregunta a AWS "¿quién soy?". Si responde con un JSON que contiene un `Arn` parecido a `arn:aws:sts::123456789012:assumed-role/voclabs/user...`, **¡tus credenciales funcionan!** 🎉

Ahora guarda tu **Account ID** (el número de 12 dígitos) en una variable, porque lo necesitarás para ECR:

🍎 **macOS / Linux:**

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "Mi Account ID es: $AWS_ACCOUNT_ID"
```

🪟 **Windows (PowerShell):**

```powershell
$env:AWS_ACCOUNT_ID = (aws sts get-caller-identity --query Account --output text)
Write-Host "Mi Account ID es: $env:AWS_ACCOUNT_ID"
```

> `--query Account` extrae solo el campo "Account" del JSON, y `--output text` lo devuelve como texto plano (sin comillas ni llaves), perfecto para guardarlo en una variable.

> ⚠️ **AWS Academy:** si más adelante ves errores como `ExpiredToken`, `InvalidClientTokenId` o `Unable to locate credentials`, significa que tu sesión caducó. Vuelve a **Start Lab**, repite los pasos 2.2 a 2.5 con las credenciales **nuevas**, y vuelve a definir las variables `AWS_REGION`, `CLUSTER_NAME` y `AWS_ACCOUNT_ID`.

---

# PASO 3 — Crear el clúster de Amazon EKS con eksctl

### 3.1 ¿Qué vamos a crear?

`eksctl` es una herramienta que crea un clúster de Kubernetes completo **con un solo comando**. Por detrás, crea automáticamente: el plano de control de EKS, una red (VPC) con subredes, los roles necesarios y un grupo de **nodos EC2** (las máquinas donde correrán tus pods). Internamente usa **CloudFormation** (la infraestructura como código de AWS).

> ⏱️ **Este paso tarda entre 15 y 20 minutos.** Es normal. No cierres la terminal ni el lab mientras corre.

### 3.2 Asegúrate de tener las variables definidas

Si abriste una terminal nueva, vuelve a definirlas:

🍎 **macOS / Linux:**

```bash
export AWS_REGION=us-east-1
export CLUSTER_NAME=microservicios-eks
```

🪟 **Windows (PowerShell):**

```powershell
$env:AWS_REGION = "us-east-1"
$env:CLUSTER_NAME = "microservicios-eks"
```

### 3.3 Crea el clúster

🍎 **macOS / Linux:**

```bash
eksctl create cluster \
  --name "$CLUSTER_NAME" \
  --region "$AWS_REGION" \
  --nodes 2 \
  --node-type t3.small \
  --managed
```

🪟 **Windows (PowerShell):**

```powershell
eksctl create cluster `
  --name $env:CLUSTER_NAME `
  --region $env:AWS_REGION `
  --nodes 2 `
  --node-type t3.small `
  --managed
```

**Qué significa cada opción:**

| Opción | Significado |
| --- | --- |
| `--name` | El nombre del clúster (`microservicios-eks`). |
| `--region` | Región AWS. **Siempre `us-east-1`** en AWS Academy. |
| `--nodes 2` | Crea 2 nodos (máquinas EC2). Coincide con `replicas: 2` de cada deployment. |
| `--node-type t3.small` | Tipo de máquina **pequeña y barata** (2 vCPU, 2 GB RAM). Suficiente para el lab y amable con el presupuesto. |
| `--managed` | Usa un *Managed Node Group* (AWS administra los nodos por ti). |

> El símbolo `\` (macOS) y `` ` `` (PowerShell) al final de cada línea sirve para **partir un comando largo en varias líneas**. También puedes escribir todo en una sola línea si prefieres.

> 💡 **Sobre la versión de Kubernetes:** no fijamos `--version` a propósito; así `eksctl` usa **la versión por defecto soportada** en ese momento, que es lo más seguro. Si tu docente te indica una versión específica, agrégala con `--version 1.31` (o la que corresponda). Evita versiones muy antiguas: pueden caer en "soporte extendido" de EKS y **costar más por hora**.

### 3.4 ¿Cómo sé que terminó?

Mientras corre, verás muchas líneas de log. Cuando termina con éxito, la última línea se parece a:

```
[✓]  EKS cluster "microservicios-eks" in "us-east-1" region is ready
```

`eksctl` configura automáticamente `kubectl` para que apunte a tu nuevo clúster. Verifícalo:

```bash
kubectl get nodes -o wide
```

> Deberías ver **2 nodos** en estado `Ready`. Si los ves, ¡tu clúster está vivo! `-o wide` muestra columnas extra como la IP y el tipo de instancia.

### 3.5 (Si abriste otra terminal) Reconecta kubectl al clúster

Si en algún momento `kubectl` "no encuentra" el clúster (por ejemplo, en una terminal nueva o tras reiniciar el lab), reconéctalo así:

```bash
aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION"
```

🪟 En PowerShell:

```powershell
aws eks update-kubeconfig --name $env:CLUSTER_NAME --region $env:AWS_REGION
```

> Este comando reescribe el archivo `~/.kube/config` con los datos del clúster para que `kubectl` sepa a dónde conectarse y cómo autenticarse.

> ⚠️ **AWS Academy — advertencias de este paso:**
> - El **plano de control de EKS cuesta ~0,10 USD/hora** y los **2 nodos EC2 también facturan por hora**, estén o no en uso. Por eso es vital eliminar todo al final (Paso 7).
> - Si `eksctl` falla con un error de permisos IAM (por ejemplo, al crear roles), tu permiso del lab puede no soportar EKS con la configuración por defecto. **Avísale a tu docente**: puede ser necesario ajustar la configuración del lab o usar el rol `LabRole`.
> - **No crees más de un clúster a la vez.** Consumen muchos recursos y presupuesto.

---

# PASO 4 — Crear repositorios en ECR, construir y subir las imágenes

### 4.1 ¿Qué es ECR y por qué lo necesitamos?

Tus nodos de Kubernetes no tienen el código fuente: solo saben **descargar imágenes Docker** desde un registro y ejecutarlas. **Amazon ECR** es ese registro privado de imágenes (como Docker Hub, pero dentro de tu cuenta AWS). El flujo es:

```
   docker build           docker push                 Kubernetes
[ código ] ─────► [ imagen local ] ─────► [ imagen en ECR ] ─────► [ pod corriendo en EKS ]
```

Crearemos **3 repositorios** en ECR (uno por servicio), con estos nombres exactos (inferidos del repositorio):

- `products-service`
- `inventory-service`
- `orders-service`

La dirección completa de cada imagen tendrá esta forma:

```
<ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/<nombre-servicio>:latest
```

Por ejemplo: `123456789012.dkr.ecr.us-east-1.amazonaws.com/products-service:latest`

### 4.2 Verifica que tienes las variables y Docker corriendo

```bash
echo $AWS_ACCOUNT_ID    # 🍎  debe mostrar tus 12 dígitos
echo $AWS_REGION        # 🍎  debe mostrar us-east-1
```

🪟 PowerShell:

```powershell
echo $env:AWS_ACCOUNT_ID
echo $env:AWS_REGION
```

> Si están vacías, vuelve al Paso 2.5 (Account ID) y Paso 4 anterior (región). Y recuerda: **Docker Desktop debe estar abierto y corriendo.**

### 4.3 Autentica Docker contra tu registro ECR

Para subir imágenes, Docker debe iniciar sesión en ECR. El token de login dura **12 horas**.

🍎 **macOS / Linux:**

```bash
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
```

🪟 **Windows (PowerShell):**

```powershell
aws ecr get-login-password --region $env:AWS_REGION | docker login --username AWS --password-stdin "$($env:AWS_ACCOUNT_ID).dkr.ecr.$($env:AWS_REGION).amazonaws.com"
```

**Cómo leer este comando:** `aws ecr get-login-password` genera una contraseña temporal; el símbolo `|` (*pipe*) se la pasa directamente a `docker login` por la entrada estándar (`--password-stdin`), sin que la contraseña quede escrita en pantalla. El usuario siempre es `AWS`.

> Si funciona, verás `Login Succeeded`.

### 4.4 Crea los 3 repositorios en ECR

Hacemos un repositorio por servicio. El comando es **idempotente** gracias al `||`: si el repositorio ya existe, no falla.

🍎 **macOS / Linux:**

```bash
for svc in products-service inventory-service orders-service; do
  aws ecr describe-repositories --repository-names "$svc" --region "$AWS_REGION" >/dev/null 2>&1 \
    || aws ecr create-repository --repository-name "$svc" --region "$AWS_REGION"
done
```

🪟 **Windows (PowerShell):**

```powershell
foreach ($svc in @("products-service","inventory-service","orders-service")) {
  aws ecr describe-repositories --repository-names $svc --region $env:AWS_REGION 2>$null
  if ($LASTEXITCODE -ne 0) {
    aws ecr create-repository --repository-name $svc --region $env:AWS_REGION
  }
}
```

> `describe-repositories` pregunta si el repo ya existe; si no existe (devuelve error), entonces `create-repository` lo crea. Así puedes ejecutar esto las veces que quieras sin romper nada.

### 4.5 Construye y sube cada imagen

Ahora, para cada servicio, construimos su imagen desde su propio directorio (`./products-service`, etc.), la etiquetamos con la dirección de ECR y la subimos.

🍎 **macOS / Linux:**

```bash
REGISTRY="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

for svc in products-service inventory-service orders-service; do
  echo ">> Construyendo $svc ..."
  docker build -t "$svc:latest" "./$svc"
  docker tag "$svc:latest" "$REGISTRY/$svc:latest"
  docker push "$REGISTRY/$svc:latest"
  echo ">> $svc publicado en $REGISTRY/$svc:latest"
done
```

🪟 **Windows (PowerShell):**

```powershell
$REGISTRY = "$($env:AWS_ACCOUNT_ID).dkr.ecr.$($env:AWS_REGION).amazonaws.com"

foreach ($svc in @("products-service","inventory-service","orders-service")) {
  Write-Host ">> Construyendo $svc ..."
  docker build -t "$svc`:latest" "./$svc"
  docker tag "$svc`:latest" "$REGISTRY/$svc`:latest"
  docker push "$REGISTRY/$svc`:latest"
  Write-Host ">> $svc publicado en $REGISTRY/$svc`:latest"
}
```

**Qué hace cada línea por servicio:**

- `docker build -t "<svc>:latest" "./<svc>"` → construye la imagen usando el `Dockerfile` que está dentro de la carpeta del servicio.
- `docker tag ...` → le pone a la imagen una **segunda etiqueta** con la dirección completa de ECR (el "nombre" que ECR espera).
- `docker push ...` → sube la imagen a ECR.

> 🪟 En PowerShell, el backtick antes de los dos puntos (`` `: ``) evita que se interprete como separador de drive. Si te resulta confuso, puedes hacer los 3 servicios manualmente, uno por uno, sustituyendo el nombre.

> 💡 **Alternativa rápida (solo macOS/Linux):** el repo trae un script que hace exactamente esto. Desde la raíz del repo:
> ```bash
> AWS_ACCOUNT_ID=$AWS_ACCOUNT_ID AWS_REGION=$AWS_REGION ./scripts/build-and-push-ecr.sh
> ```

### 4.6 Verifica que las imágenes están en ECR

```bash
aws ecr describe-images --repository-name products-service --region "$AWS_REGION"
```

> Debería listar una imagen con el tag `latest`. Repite cambiando el nombre del repo para los otros dos.

> ⚠️ **AWS Academy:** las imágenes en ECR ocupan almacenamiento (también cuesta, aunque poco). El Paso 7 te muestra cómo borrar los repositorios.

---

# PASO 5 — Desplegar los microservicios en EKS y verificar la comunicación interna

### 5.1 Reemplaza los marcadores en los deployment.yaml

Los archivos `*/k8s/deployment.yaml` traen la imagen escrita como un marcador:

```yaml
image: <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/products-service:latest
```

Debemos sustituir `<ACCOUNT_ID>` y `<REGION>` por tus valores reales. **Atención: esto difiere bastante entre macOS y Windows.**

🍎 **macOS:**

```bash
sed -i '' "s|<ACCOUNT_ID>|$AWS_ACCOUNT_ID|g; s|<REGION>|$AWS_REGION|g" */k8s/deployment.yaml
```

🐧 **Linux** (nota: sin las comillas vacías):

```bash
sed -i "s|<ACCOUNT_ID>|$AWS_ACCOUNT_ID|g; s|<REGION>|$AWS_REGION|g" */k8s/deployment.yaml
```

🪟 **Windows (PowerShell):**

```powershell
Get-ChildItem -Path . -Recurse -Filter deployment.yaml | ForEach-Object {
  (Get-Content $_.FullName) `
    -replace '<ACCOUNT_ID>', $env:AWS_ACCOUNT_ID `
    -replace '<REGION>', $env:AWS_REGION |
  Set-Content $_.FullName
}
```

> `sed` (macOS/Linux) y el bloque de PowerShell hacen lo mismo: buscar el texto `<ACCOUNT_ID>` y `<REGION>` en los 3 `deployment.yaml` y reemplazarlo por tus valores. La `g` en `sed` significa "todas las ocurrencias de la línea".

**Verifica que el reemplazo funcionó** (no debe quedar ningún `<ACCOUNT_ID>`):

🍎 **macOS / Linux:**

```bash
grep -r "image:" */k8s/deployment.yaml
```

🪟 **Windows (PowerShell):**

```powershell
Select-String -Path "*/k8s/deployment.yaml" -Pattern "image:"
```

> Deberías ver tu Account ID real (12 dígitos) y `us-east-1` en las 3 líneas, sin marcadores `< >`.

### 5.2 Aplica los manifiestos al clúster

`kubectl apply -f <archivo>` le dice a Kubernetes "crea (o actualiza) lo que está descrito en este archivo". Aplicamos el deployment y el service de cada microservicio:

```bash
kubectl apply -f products-service/k8s/deployment.yaml
kubectl apply -f products-service/k8s/service.yaml

kubectl apply -f inventory-service/k8s/deployment.yaml
kubectl apply -f inventory-service/k8s/service.yaml

kubectl apply -f orders-service/k8s/deployment.yaml
kubectl apply -f orders-service/k8s/service.yaml
```

> 💡 **Alternativa (solo macOS/Linux):** `./scripts/deploy-eks.sh` hace los 6 `apply` por ti y espera a que todo esté listo.

### 5.3 Verifica que los pods están corriendo

```bash
kubectl get pods
```

> Espera ~1 minuto. Deberías ver **6 pods** (2 por servicio) en estado `Running` y `READY 1/1`. Si ves `ImagePullBackOff` o `ErrImagePull`, el clúster no pudo descargar la imagen de ECR → revisa la sección de problemas comunes al final.

Para ver más detalle de un pod específico (útil si algo falla):

```bash
kubectl describe pod <nombre-del-pod>
kubectl logs <nombre-del-pod>
```

Verifica también los Services:

```bash
kubectl get svc
```

> Verás `products-service`, `inventory-service` y `orders-service` como tipo `ClusterIP`. Eso significa que **solo son accesibles dentro del clúster** (todavía no desde Internet).

Espera a que los despliegues estén "estables":

```bash
kubectl rollout status deployment/products-service
kubectl rollout status deployment/inventory-service
kubectl rollout status deployment/orders-service
```

### 5.4 ⭐ Verifica la COMUNICACIÓN INTER-SERVICIO (el objetivo del lab)

Esta es la parte importante. Vamos a comprobar que `orders-service` puede hablar con los otros dos **por DNS interno**, sin que nosotros le digamos ninguna IP.

**(a) Demuestra la resolución DNS desde dentro de un pod.** Le pedimos a un pod de `orders-service` que, desde adentro, llame a `products-service` por su nombre:

```bash
kubectl exec deploy/orders-service -- python -c "import urllib.request; print(urllib.request.urlopen('http://products-service:8001/health').read())"
```

> Si responde algo como `b'{"status":"ok","service":"products-service"}'`, significa que **dentro del clúster, el nombre `products-service` se resolvió por DNS interno** hasta el pod correcto. ✅ Ese es exactamente el concepto central del laboratorio.

**(b) Prueba el flujo completo de un pedido.** Como los servicios son `ClusterIP` (internos), usamos `port-forward` para alcanzar `orders-service` desde tu máquina temporalmente. En **una terminal**:

```bash
kubectl port-forward svc/orders-service 8003:8003
```

> `port-forward` abre un "túnel" desde el puerto 8003 de tu máquina hacia el Service dentro del clúster. Déjalo corriendo y abre **otra** terminal para las pruebas.

En la **otra** terminal:

🍎 **macOS / Linux:**

```bash
# Ver a qué URLs internas apunta orders-service
curl http://localhost:8003/config

# Crear un pedido (orders llama a products + inventory por DNS interno)
curl -X POST http://localhost:8003/orders \
     -H "Content-Type: application/json" \
     -d '{"product_id": 2, "quantity": 1}'

# Listar pedidos
curl http://localhost:8003/orders
```

🪟 **Windows (PowerShell):**

```powershell
curl.exe http://localhost:8003/config

curl.exe -X POST http://localhost:8003/orders -H "Content-Type: application/json" -d "{\"product_id\": 2, \"quantity\": 1}"

curl.exe http://localhost:8003/orders
```

> Si el `POST /orders` te devuelve un pedido con `total` y `stock_remaining`, **¡felicidades!** Acabas de confirmar que `orders-service` resolvió `http://products-service:8001` y `http://inventory-service:8002` por el DNS interno de Kubernetes y orquestó el flujo completo. Cuando termines, vuelve a la primera terminal y presiona `Ctrl + C` para cerrar el `port-forward`.

> ⚠️ **AWS Academy:** `port-forward` y `kubectl exec` **no cuestan dinero extra** (van por el plano de control que ya pagas). Úsalos con tranquilidad para depurar.

---

# PASO 6 — Exponer un servicio a Internet con LoadBalancer y probarlo con curl

### 6.1 ¿Por qué un LoadBalancer?

Hasta ahora `orders-service` solo es accesible dentro del clúster. Para que sea alcanzable **desde Internet** (sin `port-forward`), creamos un Service de tipo **`LoadBalancer`**. En EKS, esto provisiona automáticamente un **Elastic Load Balancer** de AWS (un *Classic Load Balancer* por defecto) con una dirección pública, **sin necesidad de instalar componentes adicionales**.

> 🎓 **Por qué esto es ideal para AWS Academy:** un Service `type: LoadBalancer` "simple" usa la integración nativa de EKS y crea un Classic Load Balancer sin que tengas que instalar el *AWS Load Balancer Controller* (que requiere permisos IAM/OIDC que el Learner Lab suele restringir). Más simple = menos cosas que pueden fallar.

### 6.2 Crea el manifiesto del LoadBalancer

En lugar de modificar el servicio interno existente, **añadimos un nuevo Service** que apunta a los mismos pods de `orders-service` pero expuesto al exterior. Crea un archivo nuevo llamado `orders-service-lb.yaml` en la raíz del repo con este contenido:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: orders-service-lb
  labels:
    app: orders-service
spec:
  type: LoadBalancer          # <-- esto pide a AWS un balanceador público
  selector:
    app: orders-service       # apunta a los MISMOS pods que el service interno
  ports:
    - name: http
      protocol: TCP
      port: 80                # puerto público (HTTP estándar)
      targetPort: 8003        # puerto del contenedor orders-service
```

> Fíjate que `selector: app: orders-service` es lo que conecta este Service con los pods correctos (los `deployment.yaml` etiquetan sus pods con `app: orders-service`). El balanceador escuchará en el puerto **80** y reenviará al **8003** del contenedor, así podrás usar la URL sin escribir el puerto.

Cómo crear el archivo rápidamente:

🍎 **macOS / Linux:**

```bash
cat > orders-service-lb.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: orders-service-lb
  labels:
    app: orders-service
spec:
  type: LoadBalancer
  selector:
    app: orders-service
  ports:
    - name: http
      protocol: TCP
      port: 80
      targetPort: 8003
EOF
```

🪟 **Windows (PowerShell):**

```powershell
@"
apiVersion: v1
kind: Service
metadata:
  name: orders-service-lb
  labels:
    app: orders-service
spec:
  type: LoadBalancer
  selector:
    app: orders-service
  ports:
    - name: http
      protocol: TCP
      port: 80
      targetPort: 8003
"@ | Set-Content -Path "orders-service-lb.yaml"
```

### 6.3 Aplica el LoadBalancer

```bash
kubectl apply -f orders-service-lb.yaml
```

### 6.4 Obtén la dirección pública (paciencia: tarda 2–5 minutos)

```bash
kubectl get svc orders-service-lb
```

> Al principio, la columna `EXTERNAL-IP` dirá `<pending>`. AWS está creando el balanceador. Repite el comando cada ~30 segundos hasta que aparezca una **dirección DNS larga**, como:
> `a1b2c3d4e5f6...us-east-1.elb.amazonaws.com`

Para guardar esa dirección en una variable automáticamente:

🍎 **macOS / Linux:**

```bash
export LB_URL=$(kubectl get svc orders-service-lb -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "Mi LoadBalancer está en: http://$LB_URL"
```

🪟 **Windows (PowerShell):**

```powershell
$env:LB_URL = (kubectl get svc orders-service-lb -o jsonpath="{.status.loadBalancer.ingress[0].hostname}")
Write-Host "Mi LoadBalancer está en: http://$($env:LB_URL)"
```

> ⏱️ Aunque `EXTERNAL-IP` ya muestre la dirección, el balanceador puede tardar **1–2 minutos más** en empezar a responder (espera a que pasen sus *health checks*). Si `curl` falla al primer intento, espera un poco y reintenta.

### 6.5 Prueba el servicio desde Internet con curl

🍎 **macOS / Linux:**

```bash
# Salud del servicio
curl http://$LB_URL/health

# Ver configuración interna
curl http://$LB_URL/config

# Crear un pedido a través de Internet (orders sigue llamando a products+inventory por DNS interno)
curl -X POST http://$LB_URL/orders \
     -H "Content-Type: application/json" \
     -d '{"product_id": 1, "quantity": 3}'

# Listar pedidos
curl http://$LB_URL/orders
```

🪟 **Windows (PowerShell):**

```powershell
curl.exe "http://$($env:LB_URL)/health"

curl.exe "http://$($env:LB_URL)/config"

curl.exe -X POST "http://$($env:LB_URL)/orders" -H "Content-Type: application/json" -d "{\"product_id\": 1, \"quantity\": 3}"

curl.exe "http://$($env:LB_URL)/orders"
```

> 🎉 Si recibes respuestas JSON, **tu aplicación de microservicios está corriendo en Kubernetes en la nube, accesible desde Internet, y comunicándose internamente por DNS.** Has completado el flujo técnico del laboratorio.

> ⚠️ **AWS Academy — advertencia importante del LoadBalancer:**
> - El Classic Load Balancer **factura por hora y por tráfico**, igual que el clúster. **No lo dejes encendido.**
> - 🔴 **Debes borrar este Service `orders-service-lb` ANTES de borrar el clúster** (lo hacemos en el Paso 7). Si borras el clúster sin borrar el Service, el balanceador puede quedar "huérfano" en tu cuenta **siguiendo facturando**, y es molesto de encontrar y eliminar a mano.

---

# PASO 7 — Limpiar TODOS los recursos (¡no te saltes esto!)

> 🔴 **Este paso es obligatorio.** Cada minuto que el clúster, los nodos y el LoadBalancer siguen encendidos consume tu presupuesto de AWS Academy. Hazlo siempre que termines tu sesión de trabajo.

El orden correcto importa: **primero los balanceadores, luego el clúster, luego ECR.**

### 7.1 Borra primero los Services de tipo LoadBalancer

Esto es lo que libera el Elastic Load Balancer en AWS. **Hazlo antes de borrar el clúster.**

```bash
kubectl delete -f orders-service-lb.yaml
```

O, si no tienes el archivo a mano:

```bash
kubectl delete svc orders-service-lb
```

Confirma que no quedan Services con dirección externa:

```bash
kubectl get svc --all-namespaces
```

> Ningún Service debería tener ya un `EXTERNAL-IP` de tipo `...elb.amazonaws.com`. Si lo tiene, bórralo antes de seguir.

### 7.2 Borra el clúster completo con eksctl

Este comando elimina el clúster, los nodos EC2, la VPC y todo lo que `eksctl` creó (vía CloudFormation). Tarda **10–15 minutos**.

🍎 **macOS / Linux:**

```bash
eksctl delete cluster --name "$CLUSTER_NAME" --region "$AWS_REGION"
```

🪟 **Windows (PowerShell):**

```powershell
eksctl delete cluster --name $env:CLUSTER_NAME --region $env:AWS_REGION
```

> Verás logs indicando que borra los *stacks* `eksctl-microservicios-eks-nodegroup-...` y `eksctl-microservicios-eks-cluster`. Espera a que termine.

### 7.3 Borra los repositorios de ECR

Las imágenes en ECR siguen ocupando almacenamiento. Bórralas (`--force` elimina también las imágenes dentro):

🍎 **macOS / Linux:**

```bash
for svc in products-service inventory-service orders-service; do
  aws ecr delete-repository --repository-name "$svc" --region "$AWS_REGION" --force
done
```

🪟 **Windows (PowerShell):**

```powershell
foreach ($svc in @("products-service","inventory-service","orders-service")) {
  aws ecr delete-repository --repository-name $svc --region $env:AWS_REGION --force
}
```

### 7.4 Verifica que no quedó nada facturando

```bash
# ¿Quedan clústeres? (debe decir "[]" o no listar el tuyo)
eksctl get cluster --region "$AWS_REGION"

# ¿Quedan repos ECR? (no debe listar los 3 servicios)
aws ecr describe-repositories --region "$AWS_REGION"
```

> 💡 **Revisión visual extra:** entra a la consola de AWS (desde el lab) y revisa que en **CloudFormation** no queden stacks `eksctl-*`, en **EC2 → Load Balancers** no quede ningún balanceador, y en **EC2 → Instances** no queden nodos corriendo. Si quedó algo, bórralo a mano.

### 7.5 Detén el laboratorio

Finalmente, en el panel de AWS Academy, haz clic en **End Lab**. Esto pausa el entorno.

> ✅ **Checklist de limpieza:** ¿borraste el Service LoadBalancer? ¿borraste el clúster con `eksctl delete cluster`? ¿borraste los 3 repos ECR? ¿revisaste CloudFormation y Load Balancers en la consola? Si todo está en orden, tu presupuesto está a salvo.

---

# 8. Problemas comunes y cómo resolverlos

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `Unable to locate credentials` / `ExpiredToken` / `InvalidClientTokenId` | Las credenciales del lab caducaron o no se configuraron. | Repite el **Paso 2** con credenciales nuevas. Reinicia el lab si hace falta. |
| `Cannot connect to the Docker daemon` | Docker Desktop no está abierto. | Abre Docker Desktop y espera a que el motor arranque. |
| `eksctl create cluster` falla con error de IAM (crear roles) | El permiso del Learner Lab no permite esa operación. | Avísale a tu docente; puede requerir ajustes del lab o usar `LabRole`. |
| Pods en `ImagePullBackOff` / `ErrImagePull` | La imagen no existe en ECR, el nombre/Account ID en el `deployment.yaml` está mal, o falta el reemplazo de `<ACCOUNT_ID>`. | Revisa el **Paso 5.1** (`grep image:`) y que el **Paso 4** subió las 3 imágenes. |
| `EXTERNAL-IP` se queda en `<pending>` mucho tiempo | El balanceador tarda, o falta permiso para crear ELB. | Espera 5 min. Si sigue, revisa permisos del lab con tu docente. |
| `curl` al LoadBalancer da "connection refused" o cuelga | El balanceador aún no pasa sus health checks. | Espera 1–2 min más tras ver el `EXTERNAL-IP` y reintenta. |
| 🪟 `curl` en PowerShell se comporta raro (no acepta `-X`, devuelve HTML) | `curl` es un alias de `Invoke-WebRequest`. | Usa **`curl.exe`** en su lugar (con la extensión). |
| `kubectl` dice `connection refused` o no encuentra el clúster | El `kubeconfig` no apunta al clúster (terminal nueva o lab reiniciado). | Ejecuta `aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION"`. |
| Pods `Pending` y no arrancan | No hay capacidad en los nodos (muy pequeños) o falta de recursos. | Verifica con `kubectl describe pod <pod>`; si es capacidad, recrea el clúster con `t3.medium`. |

### Comandos de diagnóstico útiles

```bash
kubectl get pods -o wide              # estado y nodo de cada pod
kubectl describe pod <nombre-pod>     # eventos y errores de un pod
kubectl logs <nombre-pod>             # logs de la aplicación
kubectl get svc                       # estado de los servicios
kubectl get events --sort-by=.lastTimestamp   # eventos recientes del clúster
```

---

# 9. Checklist de verificación de la actividad

Marca cada ítem a medida que lo completas:

- [ ] **Paso 1:** Cloné el repo y verifiqué que existen los 3 directorios de servicios y los `k8s/`.
- [ ] **Paso 2:** Configuré las credenciales y `aws sts get-caller-identity` responde con mi rol `voclabs`.
- [ ] **Paso 3:** Creé el clúster y `kubectl get nodes` muestra 2 nodos `Ready`.
- [ ] **Paso 4:** Subí las 3 imágenes a ECR y `aws ecr describe-images` las lista.
- [ ] **Paso 5:** Los 6 pods están `Running 1/1` y el comando `kubectl exec` demostró la resolución DNS interna.
- [ ] **Paso 5:** El `POST /orders` vía `port-forward` devolvió un pedido con `total`.
- [ ] **Paso 6:** El Service `orders-service-lb` tiene un `EXTERNAL-IP` y `curl` desde Internet funciona.
- [ ] **Paso 7:** Borré el LoadBalancer, el clúster (`eksctl delete cluster`) y los 3 repos ECR, y lo verifiqué en la consola.

---

# 10. Resumen rápido de comandos (chuleta)

```bash
# --- Credenciales (cada sesión del lab) ---
aws sts get-caller-identity
export AWS_REGION=us-east-1
export CLUSTER_NAME=microservicios-eks
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# --- Crear clúster ---
eksctl create cluster --name "$CLUSTER_NAME" --region "$AWS_REGION" --nodes 2 --node-type t3.small --managed
kubectl get nodes -o wide

# --- ECR: login, crear repos, build & push ---
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
# (crear repos y push: ver Paso 4)

# --- Reemplazar marcadores y desplegar ---
sed -i '' "s|<ACCOUNT_ID>|$AWS_ACCOUNT_ID|g; s|<REGION>|$AWS_REGION|g" */k8s/deployment.yaml   # macOS
kubectl apply -f products-service/k8s/deployment.yaml
kubectl apply -f products-service/k8s/service.yaml
# (idem inventory-service y orders-service)
kubectl get pods

# --- Verificar comunicación interna ---
kubectl exec deploy/orders-service -- python -c "import urllib.request; print(urllib.request.urlopen('http://products-service:8001/health').read())"
kubectl port-forward svc/orders-service 8003:8003

# --- Exponer con LoadBalancer ---
kubectl apply -f orders-service-lb.yaml
kubectl get svc orders-service-lb

# --- LIMPIEZA (obligatoria) ---
kubectl delete svc orders-service-lb
eksctl delete cluster --name "$CLUSTER_NAME" --region "$AWS_REGION"
for svc in products-service inventory-service orders-service; do aws ecr delete-repository --repository-name "$svc" --region "$AWS_REGION" --force; done
```

---

> **Documento de apoyo docente — ISY1101 Introducción a Herramientas DevOps, Módulo 3, Actividad 3.1.**
> Comandos verificados contra la documentación oficial de AWS (Amazon EKS, Amazon ECR, AWS CLI). Estructura, puertos, nombres de imágenes y manifiestos inferidos del repositorio `Umbingelelo/micro-servicios-k8s`.
