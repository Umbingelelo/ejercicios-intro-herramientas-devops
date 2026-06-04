# Laboratorio: Despliegue de Microservicios en Amazon EKS (usando la consola de AWS)

### Actividad 3.1 — ISY1101 Introducción a Herramientas DevOps · Módulo 3

> **Repositorio base:** `https://github.com/Umbingelelo/micro-servicios-k8s`
> **Entorno:** AWS Academy — Learner Lab
> **Método principal:** Consola de AWS (interfaz web). La línea de comandos solo se usa para lo que la consola no puede hacer: construir imágenes Docker y operar el clúster con `kubectl`.
> **Tiempo estimado:** 120 – 180 minutos (la creación del clúster por sí sola tarda 10–15 min, y el grupo de nodos otros 3–5 min).
> **Nivel:** Conocimientos básicos de Docker, línea de comandos y AWS.

---

## 0. Qué vas a hacer en este laboratorio (lee esto primero)

Este laboratorio te lleva por el ciclo completo de **llevar una aplicación de microservicios a Kubernetes** usando los servicios gestionados de Amazon Web Services, creando tú mismo toda la infraestructura desde la **consola de AWS**. Al terminar, habrás:

1. Clonado el repositorio y entendido su estructura de monorepo.
2. Configurado tus credenciales temporales de AWS Academy.
3. Creado desde cero una **VPC y toda su red** (subredes, gateway de internet, tablas de rutas) en la consola.
4. Creado un clúster de **Amazon EKS** (Elastic Kubernetes Service) desde la consola.
5. Creado un **grupo de nodos** (las máquinas EC2 donde corren los contenedores) desde la consola.
6. Conectado `kubectl` al clúster y verificado los nodos.
7. Creado repositorios en **Amazon ECR** (Elastic Container Registry) desde la consola, construido las imágenes Docker de los 3 microservicios y subido cada una.
8. Desplegado los microservicios y comprobado que **se comunican entre sí por el DNS interno** del clúster.
9. Expuesto un servicio a Internet con un **LoadBalancer** y lo habrás probado con `curl`.
10. **Eliminado todos los recursos** para no gastar el presupuesto del lab.

### Mapa del laboratorio (qué herramienta usas en cada paso)

Este lab combina dos entornos: la **consola de AWS** (navegador) para crear la infraestructura, y la **terminal** de tu computador para construir imágenes y operar el clúster. Este mapa te ubica:

```
   TERMINAL (tu computador)              CONSOLA DE AWS (navegador)
   ------------------------              --------------------------
   Paso 1  Clonar el repo
   Paso 2  Copiar credenciales  ------>  (se copian desde "AWS Details")
                                         Paso 3  Crear VPC + red
                                         Paso 4  Crear clúster EKS
                                         Paso 5  Crear grupo de nodos
   Paso 6  Conectar kubectl     <------  (apunta al clúster recién creado)
                                         Paso 7a Crear repos en ECR
   Paso 7b Build y push de imágenes
   Paso 8  Desplegar (kubectl apply) y verificar el DNS interno
   Paso 9  Exponer con LoadBalancer y probar con curl
   Paso 10 Borrar el LoadBalancer  +     Paso 10 Borrar nodos, clúster, ECR y VPC
```

### La aplicación: una tienda online con 3 microservicios

El repositorio es una arquitectura de microservicios sencilla (backend en Python + FastAPI). Son **3 servicios independientes** que se comunican por HTTP interno:

```
                       +---------------------+
 POST /orders -------> |   orders-service    |  (puerto 8003)  <- punto de entrada
   (cliente)           |   "el orquestador"  |
                       +----------+----------+
                         HTTP     |     HTTP
              +----------------+  |  +--------------------+
              v                |     v                    |
   +----------------------+    |  +----------------------+
   |  products-service    |    |  |  inventory-service   |
   |  (puerto 8001)       |    |  |  (puerto 8002)       |
   |  catalogo / precios  |    |  |  stock / reservas    |
   +----------------------+    |  +----------------------+
```

| Servicio            | Puerto | Responsabilidad                            | Quien lo llama                         |
| ------------------- | ------ | ------------------------------------------ | -------------------------------------- |
| `products-service`  | 8001   | Catálogo de productos (id, nombre, precio) | Lo llama `orders-service`              |
| `inventory-service` | 8002   | Stock disponible y reservas                | Lo llama `orders-service`              |
| `orders-service`    | 8003   | Crea pedidos orquestando el flujo          | Lo llamas tú (punto de entrada)        |

**El flujo de un pedido (`POST /orders`)** es el corazón didáctico del lab:

1. `orders-service` le pregunta a `products-service` el precio y nombre del producto.
2. Le pide a `inventory-service` que reserve (descuente) el stock.
3. Si ambos pasos van bien, registra el pedido y devuelve el total.

**La idea clave que demuestra el laboratorio:** el código NO cambia entre tu máquina local y EKS. Lo único que cambia es la configuración (las variables de entorno `PRODUCTS_SERVICE_URL` e `INVENTORY_SERVICE_URL`), porque tanto Docker Compose como Kubernetes resuelven los servicios por su nombre. En Kubernetes eso se llama DNS interno del clúster, y comprobarlo es el objetivo central del lab.

---

## 1. LO MÁS IMPORTANTE: cómo funciona AWS Academy Learner Lab

> Lee esta sección completa antes de empezar. La mayoría de los problemas en este laboratorio vienen de no entender estas limitaciones. AWS Academy NO es una cuenta normal de AWS: es un entorno educativo de tiempo y presupuesto limitados.

| Limitación | Qué significa para ti | Qué hacer |
| --- | --- | --- |
| **Credenciales temporales** | Las claves de acceso (`aws_access_key_id`, etc.) caducan cuando cierras el lab o pasan ~3-4 horas. Cada vez que reinicias el lab, son nuevas. | Reconfigurar credenciales cada sesión (Paso 2). |
| **Región obligatoria** | Solo `us-east-1` (Norte de Virginia) funciona de forma fiable. | Usa siempre `us-east-1`. Verifica la región arriba a la derecha en la consola. |
| **Presupuesto limitado** | Tienes un crédito acotado (~100 USD). EKS, los nodos EC2, el NAT Gateway y el LoadBalancer cuestan dinero por hora, estén o no en uso. | Elimina TODO al terminar (Paso 10). No dejes el clúster encendido "para mañana". |
| **No puedes crear roles IAM** | El Learner Lab bloquea la creación de roles. Pero existe un rol pre-creado llamado **`LabRole`** con los permisos necesarios. | Usa `LabRole` como rol del clúster y de los nodos (Pasos 4 y 5). |
| **OIDC / IRSA deshabilitado** | No puedes instalar el AWS Load Balancer Controller (que requiere OIDC). | Por eso usamos un `Service type: LoadBalancer` simple (Paso 9), que NO necesita ese componente. |
| **Recursos acotados** | Hay límites de vCPU e instancias. | Usa nodos pequeños (`t3.small`) y pocos (2). |

> **Regla de oro:** si terminas tu sesión de trabajo y aún no vas a presentar la actividad, ejecuta el Paso 10 (limpieza). Volver a crear todo al día siguiente toma ~30 minutos, pero dejarlo encendido puede consumir todo tu presupuesto en una noche.

---

## 2. Requisitos previos: herramientas a instalar

Como creamos la infraestructura desde la consola, solo necesitas **4 herramientas** locales (no necesitas `eksctl`). Verifica cada una con su comando de versión.

| Herramienta | Para qué sirve | Comando para verificar |
| --- | --- | --- |
| **Git** | Clonar el repositorio | `git --version` |
| **Docker** | Construir las imágenes de los microservicios | `docker --version` |
| **AWS CLI v2** | Autenticarte en ECR y conectar `kubectl` al clúster | `aws --version` |
| **kubectl** | Operar el clúster de Kubernetes (desplegar, verificar) | `kubectl version --client` |

### Instalación en macOS (con Homebrew)

> Si no tienes Homebrew, instálalo desde https://brew.sh

```bash
brew install git
brew install --cask docker     # Docker Desktop. Tras instalar, ABRE la app "Docker" y espera a que arranque el motor.
brew install awscli
brew install kubectl
```

### Instalación en Windows (con winget, en PowerShell como Administrador)

> `winget` viene incluido en Windows 10/11 modernos. Abre **PowerShell** (no CMD).

```powershell
winget install --id Git.Git -e
winget install --id Docker.DockerDesktop -e   # Tras instalar, ABRE "Docker Desktop" y espera a que diga "Engine running".
winget install --id Amazon.AWSCLI -e
winget install --id Kubernetes.kubectl -e
```

> Tras instalar en Windows, CIERRA y vuelve a abrir PowerShell para que reconozca los nuevos comandos en el PATH.

### Verifica que todo está instalado

```bash
git --version
docker --version
aws --version
kubectl version --client
```

> ADVERTENCIA: si `docker --version` responde pero más adelante un `docker build` falla con "Cannot connect to the Docker daemon", es porque Docker Desktop no está abierto. Ábrelo y espera a que arranque el motor.

---

## 3. Convención de notación de este documento

A lo largo del laboratorio verás dos tipos de instrucciones:

- **CONSOLA (interfaz web):** pasos numerados que haces en el navegador, dentro de la consola de AWS.
- **TERMINAL:** comandos que ejecutas en tu computador. Donde difieren por sistema operativo, verás dos bloques: **macOS / Linux** (bash/zsh) y **Windows (PowerShell)**.

> AVISO CRÍTICO PARA WINDOWS: en PowerShell, `curl` NO es el curl real: es un alias del comando `Invoke-WebRequest`, que se comporta distinto. Por eso en este laboratorio usarás **`curl.exe`** (con la extensión `.exe`) cada vez que necesites `curl`. Eso fuerza a Windows a usar el curl de verdad, que se comporta igual que en macOS.

> AVISO PARA ENVÍO DE JSON (peticiones `POST`): cuando una petición lleva un cuerpo JSON (los `POST /orders`), **NO lo escribas en línea** dentro del `curl`. Las comillas del JSON se rompen al pasar por el shell —especialmente en PowerShell, que destruye las comillas dobles aunque uses `\"`— y el servidor responde un **error de formato (HTTP 422)**. Por eso en este laboratorio guardamos el JSON en un archivo `order.json` y se lo pasamos a curl con **`-d @order.json`**: curl lee el archivo directamente y el cuerpo llega intacto, igual en macOS y en PowerShell.

---

## 4. Valores que usaremos

Para que todos usemos los mismos nombres:

| Concepto | Valor que usaremos |
| --- | --- |
| Región | `us-east-1` |
| Nombre de la VPC | `vpc-microservicios` |
| Nombre del clúster EKS | `microservicios-eks` |
| Nombre del grupo de nodos | `nodos-microservicios` |
| Repositorios ECR | `products-service`, `inventory-service`, `orders-service` |

---

# PASO 1 — Clonar el repositorio y verificar la estructura

### 1.1 Por qué este paso

Antes de tocar la nube, necesitamos el código en tu máquina y entender dónde está cada cosa. El repositorio es un monorepo: un solo repositorio que contiene varios servicios, cada uno en su propio directorio.

### 1.2 Clona el repositorio (TERMINAL)

Ubícate primero en una carpeta de trabajo (por ejemplo tu escritorio) y luego clona:

```bash
git clone https://github.com/Umbingelelo/micro-servicios-k8s.git
cd micro-servicios-k8s
```

> `git clone <url>` descarga una copia completa del repositorio. `cd micro-servicios-k8s` entra en la carpeta recién creada. Todos los comandos de terminal del laboratorio se ejecutan desde aquí (la raíz del repo).

### 1.3 Verifica la estructura (TERMINAL)

**macOS / Linux:**

```bash
ls -R
```

**Windows (PowerShell):**

```powershell
Get-ChildItem -Recurse -Name
```

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

Cada servicio (`products-service`, `inventory-service`, `orders-service`) tiene la misma estructura:

- **`Dockerfile`** — la "receta" para empaquetar el servicio en una imagen. El de `products-service` parte de `python:3.12-slim`, instala dependencias, copia el código y arranca el servidor en su puerto. Cada servicio usa su propio puerto: 8001, 8002 y 8003.
- **`k8s/deployment.yaml`** — le dice a Kubernetes qué imagen correr, cuántas **réplicas** (copias idénticas en ejecución; aquí `replicas: 2`) y cómo revisar la salud del **pod** mediante el endpoint `/health`. Un *pod* es la unidad mínima que ejecuta Kubernetes: uno o más contenedores corriendo juntos. Este archivo trae un marcador `<ACCOUNT_ID>` y `<REGION>` que reemplazaremos en el Paso 8.
- **`k8s/service.yaml`** — crea un Service de tipo `ClusterIP` (visible solo dentro del clúster) para que los otros servicios lo encuentren por su nombre.

> CONCEPTO CLAVE: dentro del `deployment.yaml` de `orders-service` verás variables de entorno apuntando a `http://products-service:8001` y `http://inventory-service:8002`. Esos nombres coinciden exactamente con el `name` de cada Service. Así es como un servicio "encuentra" a otro en Kubernetes: por DNS interno.

### 1.5 (Opcional pero recomendado) Pruébalo localmente con Docker Compose

Antes de la nube, conviene ver que la app funciona en tu máquina. Esto NO usa AWS y no consume presupuesto.

```bash
docker compose up --build
```

> `docker compose up` levanta los 3 servicios juntos en una red local. `--build` construye las imágenes la primera vez. Déjalo corriendo y abre OTRA terminal para probar.

En la otra terminal:

**macOS / Linux:**

```bash
curl http://localhost:8001/health
curl http://localhost:8002/health
curl http://localhost:8003/health
curl http://localhost:8003/config
echo '{"product_id": 1, "quantity": 2}' > order.json
curl -X POST http://localhost:8003/orders -H "Content-Type: application/json" -d @order.json
```

**Windows (PowerShell):**

```powershell
curl.exe http://localhost:8001/health
curl.exe http://localhost:8002/health
curl.exe http://localhost:8003/health
curl.exe http://localhost:8003/config
'{"product_id": 1, "quantity": 2}' | Set-Content -Encoding ascii order.json
curl.exe -X POST http://localhost:8003/orders -H "Content-Type: application/json" -d "@order.json"
```

Para detener: vuelve a la primera terminal, presiona `Ctrl + C`, y luego `docker compose down`.

> Si el pedido devolvió un JSON con `total` y `stock_remaining`, la comunicación entre servicios funciona en local. Ahora la replicaremos en EKS.

---

# PASO 2 — Configurar credenciales de AWS Academy (cada vez que reinicias el lab)

> Este es el paso que más se olvida. Cada vez que INICIAS (o reinicias) el Learner Lab, AWS te da credenciales NUEVAS. Las anteriores dejan de funcionar. Si un comando `aws` o `kubectl` da error de credenciales o "token expired", vuelve aquí.

Aunque crearemos la infraestructura desde la consola, igual necesitas estas credenciales en tu terminal para autenticarte en ECR (subir imágenes) y conectar `kubectl`.

### 2.1 Inicia el laboratorio en AWS Academy (CONSOLA)

1. Entra a tu curso en **AWS Academy** (a través de Canvas/Vocareum).
2. Abre el módulo del **Learner Lab** y haz clic en **Start Lab**.
3. Espera a que el círculo junto a "AWS" se ponga **verde** (1–2 minutos).
4. Haz clic en el texto **AWS** (al lado del círculo verde) para abrir la **consola de AWS** en una pestaña nueva. Esta es la consola que usaremos en los Pasos 3 a 5, 7 y 10.

### 2.2 Copia tus credenciales de CLI (CONSOLA)

1. En el panel del lab, haz clic en **AWS Details** (arriba a la derecha).
2. Junto a **AWS CLI**, haz clic en **Show**.
3. Verás un bloque parecido a este (los valores cambian en cada sesión):

```ini
[default]
aws_access_key_id=ASIAXXXXEXAMPLE
aws_secret_access_key=wJalrXUtnFEMI/EXAMPLEKEY
aws_session_token=IQoJb3JpZ2luX2VjE...=  (cadena muy larga)
```

> El `aws_session_token` es lo que diferencia a AWS Academy de una cuenta normal: son credenciales temporales. Sin el token, nada funciona desde la terminal.

### 2.3 Pega las credenciales en tu archivo de configuración (TERMINAL)

El archivo donde van se llama `credentials` y vive en la carpeta oculta `.aws` de tu carpeta de usuario. La forma más cómoda de crearlo y editarlo es con **Visual Studio Code** (VS Code), porque te permite ver y pegar el bloque sin pelear con editores de terminal.

**Recomendado: abrir el archivo con Visual Studio Code**

Primero asegúrate de que el comando `code` esté disponible en tu terminal:

- En **Windows**, el instalador de VS Code agrega `code` al PATH automáticamente (si no, reinstala marcando esa casilla).
- En **macOS**, abre VS Code, presiona `Cmd+Shift+P`, escribe `Shell Command: Install 'code' command in PATH` y dale Enter (solo se hace una vez).

Luego crea la carpeta y abre el archivo en VS Code:

**macOS / Linux:**

```bash
mkdir -p ~/.aws
code ~/.aws/credentials
```

**Windows (PowerShell):**

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.aws" | Out-Null
code "$env:USERPROFILE\.aws\credentials"
```

> VS Code abrirá el archivo (vacío si es nuevo). Borra cualquier contenido anterior, **pega el bloque completo** de 4 líneas que copiaste de AWS Details (las 3 claves bajo `[default]`), y guarda con `Ctrl+S` (en macOS, `Cmd+S`). Cierra la pestaña. Listo.

**Alternativa sin VS Code** (por si no lo tienes instalado): en macOS/Linux usa `nano ~/.aws/credentials` (guardar con `Ctrl+O`, `Enter`, salir con `Ctrl+X`); en Windows usa `notepad "$env:USERPROFILE\.aws\credentials"` (si pregunta si crear el archivo, di que Sí; guarda con `Ctrl+S`).

### 2.4 Fija la región por defecto (TERMINAL)

**macOS / Linux:**

```bash
cat > ~/.aws/config <<'EOF'
[default]
region = us-east-1
output = json
EOF
```

**Windows (PowerShell):**

```powershell
@"
[default]
region = us-east-1
output = json
"@ | Set-Content -Path "$env:USERPROFILE\.aws\config"
```

### 2.5 Verifica que las credenciales funcionan (TERMINAL)

```bash
aws sts get-caller-identity
```

> Si responde un JSON con un `Arn` parecido a `arn:aws:sts::123456789012:assumed-role/voclabs/user...`, tus credenciales funcionan. Anota tu **Account ID** (el número de 12 dígitos que aparece en el ARN): lo necesitarás para ECR.

> ADVERTENCIA AWS ACADEMY: si más adelante ves errores como `ExpiredToken`, `InvalidClientTokenId` o `Unable to locate credentials`, tu sesión caducó. Vuelve a **Start Lab**, repite los pasos 2.2 a 2.5 con las credenciales NUEVAS.

---

# PASO 3 — Crear la VPC y toda la red (CONSOLA)

### 3.1 Qué es una VPC y por qué la creamos

Una **VPC** (Virtual Private Cloud) es tu red privada dentro de AWS: el "terreno" donde vivirán el clúster y los nodos. Para que EKS funcione, la red necesita varias piezas:

- **Subredes** en al menos **2 zonas de disponibilidad (AZ)** distintas. EKS lo exige para alta disponibilidad.
- Un **Internet Gateway (IGW)**: la "puerta" que conecta la VPC con Internet (necesario para descargar imágenes de ECR y para el LoadBalancer público).
- **Tablas de rutas**: las "reglas de tráfico" que dicen cómo salen y entran los paquetes.
- **DNS habilitado** en la VPC (DNS hostnames + DNS resolution), o los nodos no podrán registrarse en el clúster.

> Para este laboratorio usaremos una red sencilla y económica: una VPC con **2 subredes públicas** en 2 AZ distintas, un Internet Gateway y SIN NAT Gateway. Los nodos irán en subredes públicas para que puedan descargar las imágenes de ECR directamente, evitando el costo del NAT Gateway. (En un entorno de producción real se usarían subredes privadas + NAT Gateway, más seguro pero más caro.)

### 3.2 Verifica tu región (CONSOLA)

En la consola de AWS, arriba a la derecha, confirma que dice **N. Virginia (us-east-1)**. Si no, cámbiala. Todo el laboratorio debe hacerse en esa región.

### 3.3 Crea la VPC con el asistente "VPC and more" (CONSOLA)

1. En la barra de búsqueda superior de la consola, escribe **VPC** y entra al servicio **VPC**.
2. Haz clic en **Create VPC**.
3. Arriba, selecciona la opción **VPC and more** (crea la VPC y toda la red de una vez, mostrándote cada pieza).
4. Completa así:
   - **Name tag auto-generation:** marca la casilla y escribe `vpc-microservicios`. AWS usará ese nombre como prefijo para todos los recursos.
   - **IPv4 CIDR block:** deja `10.0.0.0/16`. Un *CIDR* es la forma de escribir un rango de direcciones IP; `/16` reserva ~65.000 direcciones para tu red, más que suficiente.
   - **IPv6 CIDR block:** `No IPv6 CIDR block`.
   - **Tenancy:** `Default`.
   - **Number of Availability Zones (AZs):** `2`.
   - **Number of public subnets:** `2`.
   - **Number of private subnets:** `0` (para esta práctica no usaremos privadas).
   - **NAT gateways:** `None` (para no gastar presupuesto).
   - **VPC endpoints:** `None`.
   - **DNS options:** deja marcadas **Enable DNS hostnames** y **Enable DNS resolution** (vienen activadas por defecto; son obligatorias para EKS).
5. A la derecha verás un **diagrama en vivo (Preview)** que muestra lo que se va a crear: la VPC, las 2 subredes públicas (una por AZ), el Internet Gateway y las tablas de rutas. Obsérvalo: eso es exactamente "la red".
6. Haz clic en **Create VPC** y espera a que termine (unos segundos). Luego **View VPC**.

> Qué acabas de crear, pieza por pieza:
> - 1 **VPC** (`vpc-microservicios-vpc`).
> - 2 **subredes públicas** (`...-subnet-public1-us-east-1a` y `...-public2-us-east-1b`), una en cada AZ.
> - 1 **Internet Gateway** (`...-igw`), conectado a la VPC.
> - 1 **tabla de rutas pública** (`...-rtb-public`) con una ruta `0.0.0.0/0` hacia el Internet Gateway. Por eso son "públicas".

Así se ve la red que acabas de crear (y dónde vivirán las piezas de los próximos pasos):

```
                              Internet
                                 |
                         +---------------+
                         |   Internet    |   IGW: la "puerta" hacia Internet
                         |   Gateway     |
                         +-------+-------+
                                 |
              Tabla de rutas publica:  0.0.0.0/0  -->  IGW
                                 |
 +===============================|================================+
 |  VPC  vpc-microservicios-vpc      CIDR 10.0.0.0/16             |
 |                                                                |
 |   AZ us-east-1a                        AZ us-east-1b           |
 |   +--------------------------+   +--------------------------+  |
 |   | Subred publica 1         |   | Subred publica 2         |  |
 |   | IP publica automatica    |   | IP publica automatica    |  |
 |   | tag role/elb = 1         |   | tag role/elb = 1         |  |
 |   +--------------------------+   +--------------------------+  |
 |                                                                |
 |   Aqui se ubicaran:  los 2 nodos EC2 (Paso 5)                  |
 |                      el Load Balancer publico (Paso 9)         |
 +================================================================+
```

### 3.4 Etiqueta las subredes para el LoadBalancer (CONSOLA)

Para que más adelante el Service de tipo LoadBalancer (Paso 9) encuentre dónde crear el balanceador, las subredes públicas necesitan una etiqueta especial. Esto lo hacemos a mano:

1. En el menú izquierdo del servicio VPC, entra a **Subnets**.
2. Marca la primera subred pública (`vpc-microservicios-subnet-public1-...`).
3. Abajo, pestaña **Tags** → **Manage tags** → **Add new tag**:
   - **Key:** `kubernetes.io/role/elb`
   - **Value:** `1`
4. Guarda. Repite exactamente lo mismo con la **segunda** subred pública.

> Esta etiqueta le dice a Kubernetes/EKS: "esta subred sirve para balanceadores de carga públicos (elb = Elastic Load Balancer)". Sin ella, el LoadBalancer puede quedarse en estado pendiente.

### 3.5 Confirma que el auto-asignado de IP pública está activo (CONSOLA)

Como los nodos irán en subredes públicas SIN NAT, necesitan recibir una IP pública para salir a Internet (descargar imágenes). El asistente ya lo activa, pero verifícalo:

1. En **Subnets**, selecciona cada subred pública.
2. Si en sus detalles **Auto-assign public IPv4 address** dice `No`, ve a **Actions → Edit subnet settings → Enable auto-assign public IPv4 address → Save**.

> ADVERTENCIA AWS ACADEMY: una VPC en sí no cuesta dinero, pero recuerda que NO creamos NAT Gateway justamente para no gastar. Si en otro tutorial ves que se crea un NAT Gateway, ten presente que ese sí factura por hora.

---

# PASO 4 — Crear el clúster de Amazon EKS (CONSOLA)

### 4.1 Qué es el clúster

El **clúster** es el "cerebro" de Kubernetes (el plano de control): la parte gestionada por AWS que coordina todo. Todavía no tiene máquinas para correr contenedores; esas las agregamos en el Paso 5.

Un clúster de EKS tiene dos mitades. AWS gestiona y cobra el **plano de control**; tú gestionas el **plano de datos** (los nodos):

```
   PLANO DE CONTROL (lo gestiona AWS)            PLANO DE DATOS (tus nodos, Paso 5)
   +-------------------------------+             +------------------------------+
   |  Control Plane de EKS         |             |  Grupo de nodos (EC2)        |
   |   - API server                | <-- API --> |   nodo 1  (t3.small)         |
   |   - scheduler                 |             |   nodo 2  (t3.small)         |
   |   - etcd (estado del cluster) |             |   (aqui corren los pods)     |
   +-------------------------------+             +------------------------------+
              ^
              |  kubectl  (tus comandos, desde el Paso 6)
         tu computador
```

> TEN PACIENCIA: crear el plano de control tarda normalmente 10–15 minutos en quedar `Active`, y en momentos de carga del lab puede demorar 20 minutos o más. Es completamente normal. NO canceles ni vuelvas a crear el clúster pensando que se colgó: refresca la página cada par de minutos y espera a que el estado pase a `Active`. Aprovecha esa espera para avanzar con el Paso 7 (crear los repositorios en ECR y subir las imágenes), que no depende de que el clúster esté listo.

### 4.2 Sobre el rol del clúster en AWS Academy

El clúster necesita un **rol IAM de servicio** para actuar en tu nombre. En una cuenta normal lo crearías tú, pero en AWS Academy **no puedes crear roles**. Usaremos el rol pre-creado **`LabRole`**, que ya tiene los permisos necesarios.

### 4.3 Crea el clúster (CONSOLA)

1. En la barra de búsqueda de la consola, escribe **EKS** y entra a **Elastic Kubernetes Service**.
2. Haz clic en **Create cluster** (o **Add cluster → Create**).
3. En **Configuration options**, elige **Custom configuration** y **DESACTIVA** la casilla **Use EKS Auto Mode** (en este lab gestionamos los nodos nosotros).
4. En **Cluster configuration**:
   - **Name:** `microservicios-eks`
   - **Cluster IAM role / Cluster service role:** selecciona **`LabRole`** en el desplegable.
   - **Kubernetes version:** deja la versión por defecto que ofrece la consola (es una versión soportada).
5. Haz clic en **Next**.
6. En **Specify networking**:
   - **VPC:** selecciona `vpc-microservicios-vpc` (la que creaste en el Paso 3).
   - **Subnets:** selecciona las **2 subredes públicas** de esa VPC.
   - **Security groups:** deja el que se sugiere por defecto (o ninguno adicional).
   - **Cluster endpoint access:** deja **Public** (así puedes conectar `kubectl` desde tu máquina).
7. Haz clic en **Next** en las pantallas siguientes (**Configure observability**, **Select add-ons**, **Configure selected add-ons settings**) dejando los valores por defecto.
8. En **Review and create**, haz clic en **Create**.
9. Verás el estado **Creating**. Espera (refrescando) hasta que cambie a **Active** antes de continuar.

> ADVERTENCIA AWS ACADEMY:
> - El plano de control de EKS cuesta ~0,10 USD/hora desde que está `Active`. Por eso es vital eliminar todo al final (Paso 10).
> - Si `LabRole` no aparece en el desplegable de roles, o la creación falla con un error de permisos, avísale a tu docente: el permiso del lab puede necesitar ajustes.
> - IMPORTANTE: el clúster lo está creando tu identidad del lab (`voclabs`). Esa misma identidad será la única que pueda usar `kubectl` (Paso 6). Por eso debes conectar `kubectl` con las MISMAS credenciales del lab.

---

# PASO 5 — Crear el grupo de nodos (CONSOLA)

### 5.1 Qué es un grupo de nodos

Los **nodos** son las máquinas EC2 donde realmente se ejecutan tus contenedores (pods). Un **grupo de nodos gestionado** (Managed Node Group) es un conjunto de nodos que AWS administra por ti (parches, escalado). Igual que el clúster, usará el rol **`LabRole`**.

### 5.2 Crea el grupo de nodos (CONSOLA)

1. En la consola de EKS, entra a tu clúster `microservicios-eks` (debe estar **Active**).
2. Ve a la pestaña **Compute**.
3. Haz clic en **Add node group**.
4. En **Configure node group**:
   - **Name:** `nodos-microservicios`
   - **Node IAM role:** selecciona **`LabRole`**.
   - Haz clic en **Next**.
5. En **Set compute and scaling configuration**:
   - **AMI type:** `Amazon Linux 2023 (AL2023_x86_64_STANDARD)` (el valor por defecto).
   - **Capacity type:** `On-Demand`.
   - **Instance types:** elige **`t3.small`** (quita el tipo por defecto si es más grande, para cuidar el presupuesto).
   - **Disk size:** `20 GiB` está bien.
   - **Desired size:** `2` | **Minimum size:** `2` | **Maximum size:** `2`.
   - Haz clic en **Next**.
6. En **Specify networking**:
   - **Subnets:** selecciona las **2 subredes públicas** de tu VPC.
   - **Configure remote access to nodes:** déjalo **desactivado** (no necesitamos SSH).
   - Haz clic en **Next**.
7. En **Review and create**, haz clic en **Create**.
8. Espera a que el estado del grupo de nodos pase de **Creating** a **Active**. Suele tardar 3–5 minutos, pero también puede demorar más mientras AWS arranca y registra las máquinas EC2. Ten paciencia y refresca; no lo borres ni lo recrees por impaciencia.

> NOTA: 2 nodos coinciden con `replicas: 2` de cada deployment, suficiente para los 6 pods de la aplicación. Como las subredes tienen IP pública automática y ruta al Internet Gateway, los nodos podrán descargar las imágenes desde ECR sin NAT Gateway.

---

# PASO 6 — Conectar kubectl al clúster y verificar los nodos (TERMINAL)

### 6.1 Conecta kubectl

`kubectl` es la herramienta para dar órdenes al clúster. Necesita un archivo de configuración (`kubeconfig`) que apunte a tu clúster. Este comando lo genera:

**macOS / Linux:**

```bash
aws eks update-kubeconfig --region us-east-1 --name microservicios-eks
```

**Windows (PowerShell):**

```powershell
aws eks update-kubeconfig --region us-east-1 --name microservicios-eks
```

> Este comando usa tus credenciales del lab (las del Paso 2) para escribir el archivo `~/.kube/config`. Como esas credenciales son la misma identidad (`voclabs`) que creó el clúster, `kubectl` tendrá permiso.

### 6.2 Verifica que ves el clúster y los nodos

```bash
kubectl get svc
```

> Debe aparecer el servicio `kubernetes` (`ClusterIP`). Si lo ves, la conexión funciona.

```bash
kubectl get nodes -o wide
```

> Deberías ver **2 nodos** en estado `Ready`. Si los ves, tu clúster ya tiene capacidad de cómputo y está listo para recibir la aplicación.

> ALTERNATIVA (si tu lab tiene CloudShell): en la consola de EKS, dentro de tu clúster, el botón **Connect** abre AWS CloudShell con `kubectl` ya configurado. Si tu Learner Lab no tiene CloudShell habilitado, usa el método de terminal de arriba.

> ADVERTENCIA: si `kubectl get nodes` da un error de autorización ("Unauthorized" o "You must be logged in"), casi siempre es porque conectaste con credenciales distintas a las que crearon el clúster. Vuelve a copiar las credenciales del lab (Paso 2) y repite `update-kubeconfig`.

---

# PASO 7 — Crear repositorios en ECR y subir las imágenes

### 7.1 Qué es ECR y por qué lo necesitamos

Tus nodos no tienen el código fuente: solo saben **descargar imágenes Docker** desde un registro y ejecutarlas. **Amazon ECR** es ese registro privado de imágenes (como Docker Hub, pero dentro de tu cuenta AWS). El flujo es:

```
   docker build           docker push                 Kubernetes
[ codigo ] ------> [ imagen local ] ------> [ imagen en ECR ] ------> [ pod corriendo en EKS ]
```

Crearemos **3 repositorios** en ECR (uno por servicio): `products-service`, `inventory-service`, `orders-service`. La creación de repos la haremos en la **consola**; la construcción y subida de imágenes es por **terminal** (la consola no puede construir imágenes).

### 7.2 Crea los 3 repositorios en la consola (CONSOLA)

1. En la barra de búsqueda de la consola, escribe **ECR** y entra a **Elastic Container Registry**.
2. En **Repositories** (privados), haz clic en **Create repository**.
3. **Visibility:** `Private`. **Repository name:** escribe `products-service`. Deja el resto por defecto. **Create**.
4. Repite los pasos 2–3 para crear `inventory-service` y `orders-service`.
5. Al terminar, deberías ver los **3 repositorios** listados. Anota la **URI** de cualquiera de ellos: tiene la forma `<ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/products-service`.

> TRUCO: si seleccionas un repositorio y haces clic en **View push commands**, la consola te muestra los comandos exactos de login, build, tag y push para ese repositorio. Abajo te damos la versión para los 3 a la vez.

### 7.3 Define tus variables en la terminal (TERMINAL)

**macOS / Linux:**

```bash
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export REGISTRY="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
echo "Mi registro ECR es: $REGISTRY"
```

**Windows (PowerShell):**

```powershell
$env:AWS_REGION = "us-east-1"
$env:AWS_ACCOUNT_ID = (aws sts get-caller-identity --query Account --output text)
$env:REGISTRY = "$($env:AWS_ACCOUNT_ID).dkr.ecr.$($env:AWS_REGION).amazonaws.com"
Write-Host "Mi registro ECR es: $($env:REGISTRY)"
```

### 7.4 Autentica Docker contra ECR (TERMINAL)

Asegúrate de que **Docker Desktop esté abierto**. El token de login dura 12 horas.

**macOS / Linux:**

```bash
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"
```

**Windows (PowerShell):**

```powershell
aws ecr get-login-password --region $env:AWS_REGION | docker login --username AWS --password-stdin $env:REGISTRY
```

> `aws ecr get-login-password` genera una contraseña temporal; el `|` (pipe) se la pasa a `docker login` por la entrada estándar, sin escribirla en pantalla. Si funciona, verás `Login Succeeded`.

### 7.5 Construye y sube cada imagen (TERMINAL)

Para cada servicio: construir desde su carpeta, etiquetar con la dirección de ECR y subir.

**macOS / Linux:**

```bash
for svc in products-service inventory-service orders-service; do
  echo ">> Construyendo $svc ..."
  docker build -t "$svc:latest" "./$svc"
  docker tag "$svc:latest" "$REGISTRY/$svc:latest"
  docker push "$REGISTRY/$svc:latest"
  echo ">> $svc publicado en $REGISTRY/$svc:latest"
done
```

**Windows (PowerShell):**

```powershell
foreach ($svc in @("products-service","inventory-service","orders-service")) {
  Write-Host ">> Construyendo $svc ..."
  docker build -t "$svc`:latest" "./$svc"
  docker tag "$svc`:latest" "$($env:REGISTRY)/$svc`:latest"
  docker push "$($env:REGISTRY)/$svc`:latest"
  Write-Host ">> $svc publicado"
}
```

> En PowerShell, el backtick antes de los dos puntos (`` `: ``) evita que se interprete como separador de unidad. Si te confunde, puedes hacer los 3 servicios uno por uno sustituyendo el nombre a mano.

### 7.6 Verifica en la consola (CONSOLA)

Vuelve a la consola de ECR, entra a `products-service` y confirma que aparece una imagen con el tag `latest`. Repite con los otros dos.

---

# PASO 8 — Desplegar los microservicios y verificar la comunicación interna (TERMINAL)

### 8.1 Reemplaza los marcadores en los deployment.yaml

Los archivos `*/k8s/deployment.yaml` traen la imagen como un marcador:

```yaml
image: <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/products-service:latest
```

Hay que sustituir `<ACCOUNT_ID>` y `<REGION>` por tus valores reales.

**macOS:**

```bash
sed -i '' "s|<ACCOUNT_ID>|$AWS_ACCOUNT_ID|g; s|<REGION>|$AWS_REGION|g" */k8s/deployment.yaml
```

**Linux** (sin las comillas vacías):

```bash
sed -i "s|<ACCOUNT_ID>|$AWS_ACCOUNT_ID|g; s|<REGION>|$AWS_REGION|g" */k8s/deployment.yaml
```

**Windows (PowerShell):**

```powershell
Get-ChildItem -Path . -Recurse -Filter deployment.yaml | ForEach-Object {
  (Get-Content $_.FullName) `
    -replace '<ACCOUNT_ID>', $env:AWS_ACCOUNT_ID `
    -replace '<REGION>', $env:AWS_REGION |
  Set-Content $_.FullName
}
```

Verifica que no quedó ningún marcador `< >`:

**macOS / Linux:**

```bash
grep -r "image:" */k8s/deployment.yaml
```

**Windows (PowerShell):**

```powershell
Select-String -Path "*/k8s/deployment.yaml" -Pattern "image:"
```

> Deberías ver tu Account ID real (12 dígitos) y `us-east-1` en las 3 líneas.

### 8.2 Aplica los manifiestos al clúster

`kubectl apply -f <archivo>` le dice a Kubernetes "crea (o actualiza) lo descrito en este archivo".

```bash
kubectl apply -f products-service/k8s/deployment.yaml
kubectl apply -f products-service/k8s/service.yaml

kubectl apply -f inventory-service/k8s/deployment.yaml
kubectl apply -f inventory-service/k8s/service.yaml

kubectl apply -f orders-service/k8s/deployment.yaml
kubectl apply -f orders-service/k8s/service.yaml
```

### 8.3 Verifica que los pods corren

```bash
kubectl get pods
```

> Espera ~1 minuto. Deberías ver **6 pods** (2 por servicio) en `Running` y `READY 1/1`. Si ves `ImagePullBackOff` o `ErrImagePull`, el clúster no pudo descargar la imagen de ECR: revisa la sección de problemas comunes.

```bash
kubectl get svc
```

> Verás `products-service`, `inventory-service` y `orders-service` como tipo `ClusterIP` (solo accesibles dentro del clúster por ahora).

Esto es lo que acabas de desplegar dentro del clúster: 6 pods repartidos en los 2 nodos, y 3 Services que los agrupan y les dan un nombre DNS interno:

```
   +------------------- nodo 1 -------------------+   +------------------- nodo 2 -------------------+
   |  pod products    pod inventory   pod orders  |   |  pod products    pod inventory   pod orders  |
   +----------------------------------------------+   +----------------------------------------------+

   Cada par de pods esta detras de un Service (ClusterIP) con su nombre DNS interno:

       http://products-service:8001    -->  pods de products-service
       http://inventory-service:8002   -->  pods de inventory-service
       http://orders-service:8003      -->  pods de orders-service

   orders-service llama a los otros DOS por esos NOMBRES (DNS interno), nunca por IP.
   Por eso el codigo no cambia entre tu maquina y la nube: el nombre es siempre el mismo.
```

### 8.4 Verifica la COMUNICACIÓN INTER-SERVICIO (el objetivo del lab)

**(a) Resolución DNS desde dentro de un pod.** Le pedimos a un pod de `orders-service` que llame a `products-service` por su nombre:

```bash
kubectl exec deploy/orders-service -- python -c "import urllib.request; print(urllib.request.urlopen('http://products-service:8001/health').read())"
```

> Si responde algo como `b'{"status":"ok","service":"products-service"}'`, significa que dentro del clúster el nombre `products-service` se resolvió por DNS interno hasta el pod correcto. Ese es el concepto central del laboratorio.

**(b) Flujo completo de un pedido.** Como los servicios son `ClusterIP`, usamos `port-forward` para alcanzar `orders-service` temporalmente. En UNA terminal:

```bash
kubectl port-forward svc/orders-service 8003:8003
```

> `port-forward` abre un túnel desde el puerto 8003 de tu máquina hacia el Service dentro del clúster. Déjalo corriendo y abre OTRA terminal.

En la otra terminal:

**macOS / Linux:**

```bash
curl http://localhost:8003/config
echo '{"product_id": 2, "quantity": 1}' > order.json
curl -X POST http://localhost:8003/orders -H "Content-Type: application/json" -d @order.json
curl http://localhost:8003/orders
```

**Windows (PowerShell):**

```powershell
curl.exe http://localhost:8003/config
'{"product_id": 2, "quantity": 1}' | Set-Content -Encoding ascii order.json
curl.exe -X POST http://localhost:8003/orders -H "Content-Type: application/json" -d "@order.json"
curl.exe http://localhost:8003/orders
```

> Si el `POST /orders` devuelve un pedido con `total` y `stock_remaining`, confirmaste que `orders-service` resolvió `http://products-service:8001` y `http://inventory-service:8002` por el DNS interno de Kubernetes. Cuando termines, vuelve a la primera terminal y presiona `Ctrl + C` para cerrar el `port-forward`.

---

# PASO 9 — Exponer un servicio a Internet con LoadBalancer y probarlo con curl

### 9.1 Por qué un LoadBalancer

Hasta ahora `orders-service` solo es accesible dentro del clúster. Para alcanzarlo desde Internet, creamos un Service de tipo **`LoadBalancer`**. En EKS, esto provisiona automáticamente un **Elastic Load Balancer** de AWS (un Classic Load Balancer) con una dirección pública, **sin instalar componentes adicionales**.

> Por qué esto es ideal para AWS Academy: un Service `type: LoadBalancer` simple usa la integración nativa de EKS y NO requiere el AWS Load Balancer Controller (que necesita OIDC/IRSA, deshabilitado en el Learner Lab). Gracias a la etiqueta `kubernetes.io/role/elb` que pusiste en las subredes (Paso 3.4), AWS sabrá dónde colocar el balanceador.

Este será el recorrido completo de una petición desde Internet hasta los 3 microservicios:

```
   Internet (tu navegador o curl)
        |
        |  http://<DNS-del-LoadBalancer>/orders   (puerto 80)
        v
   +----------------------------+
   |  Classic Load Balancer     |   lo crea AWS al aplicar el Service type: LoadBalancer
   +-------------+--------------+
                 |  reenvia al puerto 8003
                 v
        +-------------------+
        |  orders-service   |  (pods)
        +----+---------+----+
             |         |
       DNS interno   DNS interno
       :8001         :8002
             v         v
   +-----------------+  +-------------------+
   | products-service|  | inventory-service |
   +-----------------+  +-------------------+

   De Internet solo se expone orders-service. products e inventory siguen siendo
   ClusterIP (privados): solo se alcanzan desde dentro del cluster.
```

### 9.2 Crea el manifiesto del LoadBalancer (TERMINAL)

Añadimos un nuevo Service que apunta a los mismos pods de `orders-service` pero expuesto al exterior. Crea un archivo `orders-service-lb.yaml` en la raíz del repo:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: orders-service-lb
  labels:
    app: orders-service
spec:
  type: LoadBalancer          # pide a AWS un balanceador publico
  selector:
    app: orders-service       # apunta a los MISMOS pods que el service interno
  ports:
    - name: http
      protocol: TCP
      port: 80                # puerto publico (HTTP estandar)
      targetPort: 8003        # puerto del contenedor orders-service
```

Para crearlo rápido:

**macOS / Linux:**

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

**Windows (PowerShell):**

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

### 9.3 Aplica el LoadBalancer (TERMINAL)

```bash
kubectl apply -f orders-service-lb.yaml
```

### 9.4 Obtén la dirección pública (paciencia: 2–5 minutos)

```bash
kubectl get svc orders-service-lb
```

> Al principio `EXTERNAL-IP` dirá `<pending>`. Repite el comando cada ~30 segundos hasta que aparezca una dirección DNS larga, como `a1b2c3...us-east-1.elb.amazonaws.com`.

Para guardarla en una variable:

**macOS / Linux:**

```bash
export LB_URL=$(kubectl get svc orders-service-lb -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "Mi LoadBalancer esta en: http://$LB_URL"
```

**Windows (PowerShell):**

```powershell
$env:LB_URL = (kubectl get svc orders-service-lb -o jsonpath="{.status.loadBalancer.ingress[0].hostname}")
Write-Host "Mi LoadBalancer esta en: http://$($env:LB_URL)"
```

> Aunque ya aparezca la dirección, el balanceador puede tardar 1–2 minutos más en responder (espera a que pasen sus health checks). Si `curl` falla al primer intento, espera y reintenta.

> NOTA (CONSOLA): puedes ver el balanceador creado en la consola, en **EC2 → Load Balancers**. Esto te servirá para confirmar en la limpieza que se borró.

### 9.5 Prueba el servicio desde Internet con curl (TERMINAL)

**macOS / Linux:**

```bash
curl http://$LB_URL/health
curl http://$LB_URL/config
echo '{"product_id": 1, "quantity": 3}' > order.json
curl -X POST http://$LB_URL/orders -H "Content-Type: application/json" -d @order.json
curl http://$LB_URL/orders
```

**Windows (PowerShell):**

```powershell
curl.exe "http://$($env:LB_URL)/health"
curl.exe "http://$($env:LB_URL)/config"
'{"product_id": 1, "quantity": 3}' | Set-Content -Encoding ascii order.json
curl.exe -X POST "http://$($env:LB_URL)/orders" -H "Content-Type: application/json" -d "@order.json"
curl.exe "http://$($env:LB_URL)/orders"
```

> Si recibes respuestas JSON, tu aplicación de microservicios está corriendo en Kubernetes en la nube, accesible desde Internet, y comunicándose internamente por DNS. Completaste el flujo técnico del laboratorio.

> ADVERTENCIA AWS ACADEMY (LoadBalancer):
> - El Classic Load Balancer factura por hora y por tráfico. No lo dejes encendido.
> - Debes borrar el Service `orders-service-lb` ANTES de borrar el clúster (Paso 10). Si borras el clúster sin borrar el Service, el balanceador puede quedar huérfano facturando, y es molesto eliminarlo a mano.

---

# PASO 10 — Limpiar TODOS los recursos (obligatorio)

> Cada minuto que el clúster, los nodos y el LoadBalancer siguen encendidos consume tu presupuesto. Hazlo siempre que termines tu sesión de trabajo. El orden importa: primero el balanceador, luego los nodos, luego el clúster, luego la red y ECR.

### 10.1 Borra el Service LoadBalancer (TERMINAL)

Esto libera el Elastic Load Balancer en AWS. Hazlo ANTES de borrar el clúster.

```bash
kubectl delete -f orders-service-lb.yaml
```

O, si no tienes el archivo a mano:

```bash
kubectl delete svc orders-service-lb
```

Confirma que ningún Service tiene ya un `EXTERNAL-IP` de tipo `...elb.amazonaws.com`:

```bash
kubectl get svc --all-namespaces
```

### 10.2 Borra el grupo de nodos (CONSOLA)

1. Consola de **EKS** → tu clúster `microservicios-eks` → pestaña **Compute**.
2. Selecciona el grupo de nodos `nodos-microservicios` → **Delete**.
3. Escribe el nombre para confirmar y borra. Espera a que desaparezca (varios minutos).

### 10.3 Borra el clúster (CONSOLA)

1. Consola de **EKS** → **Clusters** → selecciona `microservicios-eks`.
2. **Delete cluster** → escribe el nombre para confirmar → **Delete**.
3. Espera a que el clúster desaparezca de la lista.

### 10.4 Borra los repositorios de ECR (CONSOLA)

1. Consola de **ECR** → **Repositories**.
2. Selecciona `products-service`, `inventory-service` y `orders-service` → **Delete**.
3. Confirma escribiendo `delete`. (Esto borra también las imágenes dentro.)

### 10.5 Borra la VPC y su red (CONSOLA)

1. Consola de **VPC** → **Your VPCs**.
2. Selecciona `vpc-microservicios-vpc` → **Actions → Delete VPC**.
3. La consola te mostrará que también borrará las subredes, el Internet Gateway y las tablas de rutas asociadas. Confirma escribiendo `delete`.

> Si la consola NO te deja borrar la VPC (dice que tiene dependencias), suele ser porque el LoadBalancer o los nodos aún no terminaron de borrarse. Espera unos minutos y reintenta.

### 10.6 Verifica que no quedó nada facturando (CONSOLA)

Revisa rápidamente en la consola:
- **EC2 → Load Balancers:** no debe quedar ningún balanceador.
- **EC2 → Instances:** no deben quedar instancias (nodos) corriendo.
- **EKS → Clusters:** vacío (o sin tu clúster).
- **VPC → Your VPCs:** sin `vpc-microservicios`.

### 10.7 Detén el laboratorio

En el panel de AWS Academy, haz clic en **End Lab**.

> Checklist de limpieza: ¿borraste el Service LoadBalancer? ¿el grupo de nodos? ¿el clúster? ¿los 3 repos ECR? ¿la VPC? ¿revisaste EC2 Load Balancers e Instances? Si todo está en orden, tu presupuesto está a salvo.

---

# 11. Problemas comunes y cómo resolverlos

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `Unable to locate credentials` / `ExpiredToken` / `InvalidClientTokenId` | Las credenciales del lab caducaron o no se configuraron. | Repite el Paso 2 con credenciales nuevas. |
| `Cannot connect to the Docker daemon` | Docker Desktop no está abierto. | Abre Docker Desktop y espera a que arranque el motor. |
| `LabRole` no aparece al crear el clúster o el grupo de nodos | El permiso del Learner Lab puede variar. | Avísale a tu docente; puede requerir ajustes del lab. |
| `kubectl` da `Unauthorized` / `You must be logged in to the server` | Conectaste con credenciales distintas a las que crearon el clúster. | Recopia las credenciales del lab (Paso 2) y repite `aws eks update-kubeconfig`. |
| Pods en `ImagePullBackOff` / `ErrImagePull` | La imagen no existe en ECR, el Account ID/región del `deployment.yaml` está mal, o los nodos no tienen salida a Internet. | Revisa el Paso 8.1 (`grep image:`), que el Paso 7 subió las 3 imágenes, y que las subredes tienen IP pública automática (Paso 3.5). |
| `EXTERNAL-IP` del LoadBalancer se queda en `<pending>` | Falta la etiqueta `kubernetes.io/role/elb=1` en las subredes públicas, o el balanceador tarda. | Verifica el Paso 3.4 y espera ~5 min. Si persiste, añade también a cada subred pública la etiqueta `kubernetes.io/cluster/microservicios-eks` con valor `shared`. |
| `curl` al LoadBalancer da "connection refused" o cuelga | El balanceador aún no pasa sus health checks. | Espera 1–2 min más y reintenta. |
| En PowerShell, `curl` se comporta raro (no acepta `-X`, devuelve HTML) | `curl` es un alias de `Invoke-WebRequest`. | Usa `curl.exe` (con la extensión). |
| El `POST /orders` devuelve un error de formato / `HTTP 422` (`JSON decode error`) | El cuerpo JSON en línea se rompió por las comillas del shell (típico en PowerShell, que descarta las comillas dobles aunque uses `\"`). | Usa el método de archivo: guarda el JSON en `order.json` y envíalo con `-d @order.json` (ya está aplicado en los Pasos 1.5, 8.4 y 9.5). |
| Los nodos no pasan a `Ready` | Subredes sin ruta a Internet, o sin IP pública. | Revisa que la tabla de rutas pública apunte al IGW y que las subredes auto-asignen IP pública (Paso 3). |
| No puedo borrar la VPC (tiene dependencias) | El LoadBalancer o los nodos aún existen. | Termina los Pasos 10.1–10.3 y reintenta. |

### Comandos de diagnóstico útiles (TERMINAL)

```bash
kubectl get pods -o wide              # estado y nodo de cada pod
kubectl describe pod <nombre-pod>     # eventos y errores de un pod
kubectl logs <nombre-pod>             # logs de la aplicacion
kubectl get svc                       # estado de los servicios
kubectl get events --sort-by=.lastTimestamp   # eventos recientes del cluster
```

---

# 12. Checklist de verificación de la actividad

- [ ] **Paso 1:** Cloné el repo y verifiqué los 3 directorios de servicios y sus `k8s/`.
- [ ] **Paso 2:** Configuré credenciales y `aws sts get-caller-identity` responde con mi rol `voclabs`.
- [ ] **Paso 3:** Creé la VPC con 2 subredes públicas en 2 AZ, Internet Gateway y etiqueté las subredes con `kubernetes.io/role/elb=1`.
- [ ] **Paso 4:** Creé el clúster EKS con `LabRole` y quedó `Active`.
- [ ] **Paso 5:** Creé el grupo de nodos (`t3.small`, 2 nodos) con `LabRole` y quedó `Active`.
- [ ] **Paso 6:** Conecté `kubectl` y `kubectl get nodes` muestra 2 nodos `Ready`.
- [ ] **Paso 7:** Creé los 3 repos en ECR y subí las 3 imágenes.
- [ ] **Paso 8:** Los 6 pods están `Running 1/1`, `kubectl exec` demostró la resolución DNS interna y el `POST /orders` devolvió un pedido.
- [ ] **Paso 9:** El Service `orders-service-lb` tiene `EXTERNAL-IP` y `curl` desde Internet funciona.
- [ ] **Paso 10:** Borré LoadBalancer, grupo de nodos, clúster, repos ECR y VPC; lo verifiqué en la consola.

---

# 13. Resumen rápido de comandos de terminal (chuleta)

```bash
# --- Credenciales (cada sesion del lab) ---
aws sts get-caller-identity
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export REGISTRY="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

# --- Conectar kubectl (tras crear el cluster + nodos en la consola) ---
aws eks update-kubeconfig --region us-east-1 --name microservicios-eks
kubectl get nodes -o wide

# --- ECR: login y push (los repos se crean en la consola) ---
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY"
for svc in products-service inventory-service orders-service; do
  docker build -t "$svc:latest" "./$svc"
  docker tag "$svc:latest" "$REGISTRY/$svc:latest"
  docker push "$REGISTRY/$svc:latest"
done

# --- Reemplazar marcadores y desplegar ---
sed -i '' "s|<ACCOUNT_ID>|$AWS_ACCOUNT_ID|g; s|<REGION>|$AWS_REGION|g" */k8s/deployment.yaml   # macOS
kubectl apply -f products-service/k8s/deployment.yaml
kubectl apply -f products-service/k8s/service.yaml
# (idem inventory-service y orders-service)
kubectl get pods

# --- Verificar comunicacion interna ---
kubectl exec deploy/orders-service -- python -c "import urllib.request; print(urllib.request.urlopen('http://products-service:8001/health').read())"
kubectl port-forward svc/orders-service 8003:8003

# --- Exponer con LoadBalancer ---
kubectl apply -f orders-service-lb.yaml
kubectl get svc orders-service-lb

# --- Limpieza (terminal): borra el LoadBalancer; el resto se borra en la consola ---
kubectl delete svc orders-service-lb
```

---

# 14. Glosario de términos

Si alguna palabra del laboratorio no te quedó clara, búscala aquí.

| Término | Qué significa |
| --- | --- |
| **AWS Academy / Learner Lab** | Entorno educativo de AWS con tiempo, presupuesto y permisos limitados. No es una cuenta normal de AWS. |
| **Consola de AWS** | La interfaz web (navegador) para crear y administrar recursos de AWS con clics. |
| **AWS CLI** | "Command Line Interface": herramienta para usar AWS escribiendo comandos en la terminal. |
| **Credenciales temporales / `aws_session_token`** | Claves de acceso que caducan. AWS Academy las renueva cada vez que inicias el lab. |
| **Región (`us-east-1`)** | Zona geográfica de centros de datos de AWS. En el lab solo funciona bien `us-east-1`. |
| **AZ (Availability Zone)** | Zona de disponibilidad: un centro de datos aislado dentro de una región. Usar 2 AZ da tolerancia a fallos. |
| **VPC (Virtual Private Cloud)** | Tu red privada y aislada dentro de AWS, donde viven tus recursos. |
| **CIDR (`10.0.0.0/16`)** | Notación para describir un rango de direcciones IP. El número tras `/` indica cuántas direcciones abarca. |
| **Subred (subnet)** | Una porción de la VPC ubicada en una AZ concreta. Puede ser pública (con salida a Internet) o privada. |
| **Internet Gateway (IGW)** | El componente que conecta la VPC con Internet. |
| **Tabla de rutas (route table)** | Reglas que indican hacia dónde se envía el tráfico de red (p. ej. `0.0.0.0/0 -> IGW`). |
| **NAT Gateway** | Permite que subredes privadas salgan a Internet sin ser accesibles desde fuera. Cuesta dinero; en este lab NO lo usamos. |
| **IAM / rol IAM** | Sistema de permisos de AWS. Un *rol* otorga permisos a un servicio o usuario. |
| **`LabRole`** | Rol IAM pre-creado en AWS Academy con permisos amplios. Lo usamos porque el lab no deja crear roles. |
| **`voclabs`** | La identidad (rol asumido) con la que actúas dentro de AWS Academy. |
| **OIDC / IRSA** | Mecanismo para dar permisos AWS a pods individuales. Está deshabilitado en el lab; por eso usamos un LoadBalancer simple. |
| **EKS (Elastic Kubernetes Service)** | El servicio gestionado de Kubernetes de AWS. |
| **Kubernetes (k8s)** | Plataforma que orquesta (despliega, escala, reinicia) contenedores. |
| **Plano de control (control plane)** | El "cerebro" del clúster (API server, scheduler, etc.). En EKS lo gestiona AWS. |
| **Plano de datos / nodos** | Las máquinas EC2 donde corren tus contenedores. Tú las gestionas (grupo de nodos). |
| **Nodo** | Una máquina (instancia EC2) que forma parte del clúster y ejecuta pods. |
| **Grupo de nodos gestionado (Managed Node Group)** | Conjunto de nodos cuyo ciclo de vida administra AWS (parches, escalado). |
| **`t3.small`** | Tipo de instancia EC2 pequeña (2 vCPU, 2 GB RAM). Económica, suficiente para el lab. |
| **EC2** | "Elastic Compute Cloud": las máquinas virtuales de AWS. |
| **Pod** | La unidad mínima de Kubernetes: uno o más contenedores que corren juntos en un nodo. |
| **Réplica** | Cada copia idéntica de un pod en ejecución. `replicas: 2` significa 2 copias. |
| **Deployment** | Objeto de Kubernetes que describe qué imagen correr y cuántas réplicas mantener. |
| **Service** | Objeto de Kubernetes que da un nombre y una dirección estable a un grupo de pods. |
| **ClusterIP** | Tipo de Service accesible SOLO dentro del clúster (privado). |
| **LoadBalancer (tipo de Service)** | Tipo de Service que pide a AWS un balanceador con dirección pública para exponer pods a Internet. |
| **DNS interno del clúster** | El sistema que permite a un servicio encontrar a otro por su nombre (p. ej. `products-service`) sin conocer su IP. |
| **kubectl** | Herramienta de línea de comandos para dar órdenes al clúster de Kubernetes. |
| **kubeconfig (`~/.kube/config`)** | Archivo que le dice a `kubectl` a qué clúster conectarse y cómo autenticarse. |
| **manifiesto (YAML)** | Archivo de texto (`.yaml`) que describe un recurso de Kubernetes (deployment, service, etc.). |
| **ECR (Elastic Container Registry)** | Registro privado de imágenes Docker dentro de tu cuenta AWS. |
| **Imagen Docker** | Paquete que contiene la app y todo lo que necesita para ejecutarse. |
| **Contenedor** | Una instancia en ejecución de una imagen. |
| **Registro / repositorio** | El registro es el servidor de imágenes (ECR); un repositorio guarda las versiones de UNA imagen. |
| **`latest` (tag)** | Etiqueta de versión de una imagen. `latest` suele apuntar a "la más reciente". |
| **Classic Load Balancer (CLB)** | Tipo de balanceador de AWS que crea por defecto un Service `type: LoadBalancer` simple. |
| **`curl`** | Herramienta de terminal para hacer peticiones HTTP. En PowerShell usa `curl.exe`. |
| **`port-forward`** | Túnel temporal de `kubectl` desde un puerto de tu máquina hacia un Service del clúster. |
| **CloudFormation** | Servicio de AWS que crea recursos a partir de plantillas (infraestructura como código). |

---

> Documento de apoyo docente — ISY1101 Introducción a Herramientas DevOps, Módulo 3, Actividad 3.1.
> Pasos de consola y comandos verificados contra la documentación oficial de AWS (Amazon EKS, Amazon ECR, requisitos de red de VPC/subredes, AWS CLI). Estructura, puertos, nombres de imágenes y manifiestos inferidos del repositorio `Umbingelelo/micro-servicios-k8s`. Adaptado a las restricciones de AWS Academy Learner Lab (rol `LabRole`, OIDC deshabilitado, región us-east-1, presupuesto limitado).
