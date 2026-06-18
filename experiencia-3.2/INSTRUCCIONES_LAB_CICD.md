# Laboratorio: CI/CD con GitHub Actions (infraestructura por consola)

### Actividad 3.2 — ISY1101 Introducción a Herramientas DevOps · Módulo 3

> **Repositorio base:** `https://github.com/Umbingelelo/micro-servicios-k8s`
> **Entorno:** AWS Academy — Learner Lab
> **Tiempo estimado:** 120 – 180 min (crear el clúster en la consola tarda ~15 min).
> **Este laboratorio es AUTÓNOMO:** incluye todos los pasos, desde crear la infraestructura hasta el despliegue automático, y deja el sistema listo para empezar la **Actividad 3.3 (HPA)**.
> **Reparto de tareas:** TODO lo de AWS (red/VPC, clúster, nodos, repositorios de imágenes) se crea **en la consola de AWS**. **GitHub Actions** se encarga solo del CI/CD de la aplicación: construir las imágenes, subirlas y desplegarlas.
> **Sistema operativo:** escrito pensando primero en **Windows (PowerShell)**; cada comando local aparece primero para Windows y debajo para macOS / Linux.

---

## 0. Qué vas a hacer en este laboratorio (lee esto primero)

En la Actividad 3.1 desplegaste a mano. Aquí montarás la infraestructura **en la consola de AWS** una sola vez, y luego harás que **un `git push` despliegue la aplicación automáticamente** con GitHub Actions. Eso es **CI/CD** (Integración y Entrega Continuas).

Al terminar habrás:

1. Tenido tu propia copia del repositorio (fork) con GitHub Actions habilitado.
2. Guardado tus credenciales de AWS Academy como **secrets** de GitHub.
3. Creado en la **consola de AWS**: la red (VPC), el clúster EKS, el grupo de nodos y los 3 repositorios ECR.
4. Creado un **workflow** de GitHub Actions que construye las imágenes, las sube a ECR y despliega la app (incluido el LoadBalancer).
5. Lanzado el **primer despliegue automático** con `git push`.
6. **Programado en Python** dos rutas personalizadas: una de **liveness** (`/live`, con el uptime del proceso) y una de **readiness** (`/ready`, que mide el uso real de recursos).
7. Hecho un **segundo despliegue** con tu cambio, y dejado todo **listo para la Actividad 3.3 (HPA)**.

### Quién hace qué

```
   CONSOLA DE AWS (una sola vez)              GITHUB ACTIONS (en cada git push)
   ----------------------------              ---------------------------------
   - Crear la VPC y la red                   - Construir las 3 imagenes Docker
   - Crear el cluster EKS                     - Subirlas a ECR
   - Crear el grupo de nodos                  - Desplegar en EKS (kubectl)
   - Crear los 3 repositorios ECR             - Publicar el LoadBalancer
                  |                                          |
                  +--------------------+---------------------+
                                       v
                     Aplicacion corriendo + LoadBalancer publico
                     => LISTO para la Actividad 3.3 (HPA)
```

> La infraestructura (red, clúster, nodos) cambia poco y la creas UNA vez en la consola. La aplicación cambia seguido, y de eso se encarga el pipeline. Separar "infraestructura" de "entrega de la app" es una buena práctica real de DevOps.

---

## 1. Convenciones: RUTA de trabajo y TERMINALES

> Lo de la consola se hace en el navegador. Lo local (clonar, crear archivos, `git push`) en una terminal ubicada en la carpeta del repo.

### 1.1 La carpeta del repositorio (tu ruta de trabajo)

Al clonar tu fork tendrás una carpeta `micro-servicios-k8s`. Esa es tu **ruta de trabajo**: toda terminal local debe estar dentro de ella y todos los archivos que crees van ahí.

- En **Windows**: `C:\Users\TU-USUARIO\micro-servicios-k8s`
- En **macOS / Linux**: `~/micro-servicios-k8s`

### 1.2 Cómo abrir la terminal en la ruta correcta

**Windows (PowerShell):**

```powershell
cd $env:USERPROFILE\micro-servicios-k8s
Get-Location
Get-ChildItem
```

> Qué hacen: `cd` entra a la carpeta (`$env:USERPROFILE` es `C:\Users\TU-USUARIO`). `Get-Location` muestra la carpeta actual (debe terminar en `\micro-servicios-k8s`). `Get-ChildItem` lista los archivos (debes ver `docker-compose.yml` y las carpetas de los servicios).

**macOS / Linux:**

```bash
cd ~/micro-servicios-k8s
pwd
ls
```

### 1.3 Abrir el repo en Visual Studio Code

```powershell
code .
```

> Qué hace: abre VS Code en la carpeta actual (`.`). Cuando digamos "crea `.github/workflows/deploy.yml`", la ruta es relativa al repo: su ruta completa en Windows sería `C:\Users\TU-USUARIO\micro-servicios-k8s\.github\workflows\deploy.yml`.

---

## 2. Recordatorio de AWS Academy

| Punto | Qué significa aquí |
| --- | --- |
| **Credenciales temporales que rotan** | Caducan al cerrar el lab y cambian en cada **Start Lab**. Debes **actualizar los 3 secrets** de GitHub cada sesión (Paso 2). |
| **OIDC deshabilitado** | No puedes usar el método "sin claves"; por eso guardamos credenciales temporales como secrets. |
| **No puedes crear roles IAM** | Existe el rol pre-creado **`LabRole`**. Lo eliges como rol del clúster y de los nodos en la consola. |
| **Región** | Solo `us-east-1`. Verifícala arriba a la derecha en la consola. |
| **Presupuesto** | El clúster, los nodos y el LoadBalancer cuestan por hora. Limpia por consola al terminar (Paso 12). |
| **Crear el clúster tarda** | ~15 min en quedar `Active`. Es normal; no canceles. |

---

## 3. Conceptos clave

- **CI/CD:** automatizar construir, probar y desplegar para que baste un `git push`.
- **GitHub Actions:** la automatización vive en archivos `.yml` dentro de `.github/workflows/`. **Workflow** = el archivo; **job** = grupo de pasos; **step** = un comando o una *action*; **runner** = la máquina temporal donde corre; **secret** = valor cifrado (credenciales).
- **Liveness vs. readiness:** dos chequeos de salud que programarás como rutas propias en Python. La *liveness* (`/live`): si falla, Kubernetes REINICIA el pod. La *readiness* (`/ready`): si falla, lo SACA del tráfico sin reiniciarlo.

---

# PASO 1 — Tener tu propia copia del repositorio en GitHub

Necesitas tu PROPIO repositorio porque vas a guardar secrets y hacer `push`.

### 1.1 Haz un fork (NAVEGADOR)

1. Entra a `https://github.com/Umbingelelo/micro-servicios-k8s`.
2. Arriba a la derecha, **Fork** → créalo en tu cuenta. Quedarás en `https://github.com/TU-USUARIO/micro-servicios-k8s`.

### 1.2 Habilita GitHub Actions en tu fork (NAVEGADOR)

1. En tu fork, pestaña **Actions**.
2. Clic en **I understand my workflows, go ahead and enable them**.

### 1.3 Clona tu fork (TERMINAL)

**Windows (PowerShell):**

```powershell
cd $env:USERPROFILE
git clone https://github.com/TU-USUARIO/micro-servicios-k8s.git
cd micro-servicios-k8s
```

> Qué hacen: `cd $env:USERPROFILE` te lleva a `C:\Users\TU-USUARIO`. `git clone <url>` descarga tu fork (crea la carpeta). `cd micro-servicios-k8s` entra a ella: tu ruta de trabajo.

**macOS / Linux:**

```bash
cd ~
git clone https://github.com/TU-USUARIO/micro-servicios-k8s.git
cd micro-servicios-k8s
```

---

# PASO 2 — Guardar tus credenciales de AWS como secrets

El pipeline necesita autenticarse en AWS para subir imágenes y desplegar.

### 2.1 Copia las credenciales del lab (NAVEGADOR)

1. En AWS Academy, **Start Lab** y espera el círculo verde. Haz clic en **AWS** para abrir la consola (la usarás en los pasos 3-6 y 12).
2. **AWS Details → AWS CLI → Show**. Verás `aws_access_key_id`, `aws_secret_access_key` y `aws_session_token`.

### 2.2 Crea los 3 secrets en tu repo (NAVEGADOR)

1. En tu fork: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Crea estos tres (nombre EXACTO):

| Name | Value |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | el valor de `aws_access_key_id` |
| `AWS_SECRET_ACCESS_KEY` | el valor de `aws_secret_access_key` |
| `AWS_SESSION_TOKEN` | el valor de `aws_session_token` (cadena larga) |

> LO MÁS IMPORTANTE: estas credenciales caducan. Cada sesión nueva del lab, vuelve aquí y **actualiza los 3 secrets**, o el pipeline fallará al hablar con AWS.

---

# FASE A — Crear la infraestructura en la CONSOLA de AWS

Esta parte se hace una sola vez, toda en el navegador (consola de AWS). Verifica siempre que arriba a la derecha la región sea **N. Virginia (us-east-1)**.

## PASO 3 — Crear la VPC y la red (CONSOLA)

1. En el buscador de la consola escribe **VPC** y entra al servicio **VPC**.
2. Clic en **Create VPC**.
3. Arriba, elige la opción **VPC and more** (crea la red completa de una vez).
4. Completa:
   - **Name tag auto-generation:** marca la casilla y escribe `microservicios-vpc`.
   - **IPv4 CIDR block:** deja `10.0.0.0/16`. (Un CIDR es un rango de direcciones IP; `/16` da ~65.000.)
   - **Number of Availability Zones (AZs):** `2`.
   - **Number of public subnets:** `2`.
   - **Number of private subnets:** `0`.
   - **NAT gateways:** `None` (para no gastar presupuesto).
   - **DNS options:** deja marcadas **Enable DNS hostnames** y **Enable DNS resolution** (obligatorias para EKS).
5. Clic en **Create VPC** y luego **View VPC**.

> Acabas de crear: 1 VPC, 2 subredes públicas (una por AZ), 1 Internet Gateway y 1 tabla de rutas pública (con ruta `0.0.0.0/0` hacia el Internet Gateway).

### 3.1 Etiqueta las subredes para el LoadBalancer (CONSOLA)

1. Menú izquierdo → **Subnets**.
2. Marca la primera subred pública (`microservicios-vpc-subnet-public1-...`) → pestaña **Tags** → **Manage tags** → **Add new tag**: **Key** `kubernetes.io/role/elb`, **Value** `1`. Guarda.
3. Repite con la **segunda** subred pública.

> Esta etiqueta le dice a Kubernetes en qué subredes puede crear el balanceador público. Sin ella, el LoadBalancer puede quedarse en `<pending>`.

## PASO 4 — Crear el clúster EKS (CONSOLA)

1. Buscador → **EKS** → **Elastic Kubernetes Service**.
2. **Create cluster** (o **Add cluster → Create**).
3. **Configuration options:** elige **Custom configuration** y **DESACTIVA** **Use EKS Auto Mode**.
4. **Cluster configuration:**
   - **Name:** `microservicios-eks`
   - **Cluster IAM role / Cluster service role:** selecciona **`LabRole`**.
   - **Kubernetes version:** deja la versión por defecto.
5. **Next**.
6. **Specify networking:**
   - **VPC:** `microservicios-vpc-vpc`.
   - **Subnets:** las **2 subredes públicas**.
   - **Cluster endpoint access:** **Public**.
7. **Next** en las pantallas siguientes dejando los valores por defecto → **Create**.
8. Espera (refrescando) hasta que el estado pase de **Creating** a **Active** (~15 min).

> En AWS Academy usamos `LabRole` porque no se pueden crear roles. Si `LabRole` no aparece o falla, avisa a tu docente.

## PASO 5 — Crear el grupo de nodos (CONSOLA)

1. En la consola de EKS, entra a tu clúster `microservicios-eks` (debe estar **Active**) → pestaña **Compute** → **Add node group**.
2. **Configure node group:** **Name** `nodos-microservicios`; **Node IAM role** = **`LabRole`** → **Next**.
3. **Set compute and scaling configuration:** **AMI type** `Amazon Linux 2023`; **Capacity type** `On-Demand`; **Instance types** `t3.small`; **Desired/Minimum/Maximum size** = `2` → **Next**.
4. **Specify networking:** selecciona las **2 subredes públicas**; deja el acceso remoto desactivado → **Next** → **Create**.
5. Espera a que el grupo pase a **Active** (3-5 min).

## PASO 6 — Crear los 3 repositorios ECR (CONSOLA)

1. Buscador → **ECR** → **Elastic Container Registry** → **Repositories**.
2. **Create repository** → **Visibility** `Private` → **Repository name** `products-service` → **Create**.
3. Repite para `inventory-service` y `orders-service`.

> Anota la URI de cualquiera: tiene la forma `<ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/products-service`. El pipeline subirá las imágenes a estos repos.

---

# FASE B — CI/CD de la aplicación con GitHub Actions

Ahora automatizamos la entrega de la app. Estos archivos se crean en el repo (en VS Code, `code .`).

## PASO 7 — Crear el manifiesto del LoadBalancer y el workflow

### 7.1 El LoadBalancer: `orders-service-lb.yaml`

> RUTA: crea este archivo en la RAÍZ del repo (`C:\Users\TU-USUARIO\micro-servicios-k8s\orders-service-lb.yaml`). Es un manifiesto de Kubernetes (el pipeline lo aplicará).

```yaml
apiVersion: v1
kind: Service
metadata:
  name: orders-service-lb
  labels:
    app: orders-service
spec:
  type: LoadBalancer       # al aplicarlo, AWS crea un balanceador publico (ELB)
  selector:
    app: orders-service    # apunta a los pods de orders-service
  ports:
    - name: http
      protocol: TCP
      port: 80             # puerto publico
      targetPort: 8003     # puerto del contenedor
```

### 7.2 El workflow: `.github/workflows/deploy.yml`

> RUTA: crea la carpeta `.github/workflows/` en la raíz del repo y dentro `deploy.yml`.

Este workflow NO crea infraestructura (eso ya lo hiciste en la consola): solo construye, sube y despliega. Contenido:

```yaml
name: Desplegar microservicios en EKS (CI/CD)

on:
  push:
    branches: [ main ]
  workflow_dispatch:        # tambien se lanza a mano desde la pestana Actions

env:
  AWS_REGION: us-east-1
  CLUSTER_NAME: microservicios-eks

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: 1. Descargar el codigo del repo
        uses: actions/checkout@v4

      - name: 2. Configurar credenciales de AWS (temporales del lab)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-session-token: ${{ secrets.AWS_SESSION_TOKEN }}
          aws-region: ${{ env.AWS_REGION }}

      - name: 3. Login en Amazon ECR
        id: ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: 4. Construir y subir las 3 imagenes (los repos ya existen en ECR)
        env:
          REGISTRY: ${{ steps.ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          for svc in products-service inventory-service orders-service; do
            docker build -t "$REGISTRY/$svc:$IMAGE_TAG" -t "$REGISTRY/$svc:latest" "./$svc"
            docker push "$REGISTRY/$svc:$IMAGE_TAG"
            docker push "$REGISTRY/$svc:latest"
          done

      - name: 5. Instalar kubectl en el runner
        run: |
          curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
          chmod +x kubectl
          sudo mv kubectl /usr/local/bin/kubectl

      - name: 6. Conectar kubectl al cluster
        run: aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION"

      - name: 7. Desplegar la app y el LoadBalancer
        env:
          IMAGE_TAG: ${{ github.sha }}
        run: |
          ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
          for svc in products-service inventory-service orders-service; do
            sed -i "s|<ACCOUNT_ID>|$ACCOUNT_ID|g; s|<REGION>|$AWS_REGION|g; s|:latest|:$IMAGE_TAG|g" "$svc/k8s/deployment.yaml"
            kubectl apply -f "$svc/k8s/deployment.yaml"
            kubectl apply -f "$svc/k8s/service.yaml"
          done
          kubectl apply -f orders-service-lb.yaml

      - name: 8. Esperar al rollout y mostrar el resultado
        run: |
          kubectl rollout status deployment/products-service --timeout=180s
          kubectl rollout status deployment/inventory-service --timeout=180s
          kubectl rollout status deployment/orders-service --timeout=180s
          kubectl get pods -o wide
          echo "URL publica del LoadBalancer (tarda 2-3 min en responder):"
          kubectl get svc orders-service-lb -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'; echo
```

Qué hace cada paso del workflow:

| Paso | Qué hace |
| --- | --- |
| 1 | Descarga tu código en la máquina del runner (`git clone` automático). |
| 2 | Carga las credenciales temporales del lab desde los secrets (incluye `aws-session-token`). |
| 3 | Inicia sesión en ECR; expone la dirección del registro en `steps.ecr.outputs.registry`. |
| 4 | Construye las 3 imágenes (cada una desde su carpeta) y las sube a ECR, etiquetadas con el SHA del commit y con `latest`. Los repos ya existen (los creaste en el Paso 6). |
| 5 | Instala `kubectl` (no viene en el runner). |
| 6 | Apunta `kubectl` a tu clúster con `aws eks update-kubeconfig`. |
| 7 | Sustituye los marcadores `<ACCOUNT_ID>` / `<REGION>` y la etiqueta de imagen, y aplica los 3 servicios MÁS el LoadBalancer. |
| 8 | Espera el rollout y muestra los pods y la URL pública. |

> ¿Por qué etiquetar con el SHA del commit (`${{ github.sha }}`)? Porque identifica de forma única el código exacto desplegado (trazabilidad), mejor que un `latest` ambiguo.

---

# PASO 8 — Primer despliegue automático

### 8.1 Sube todo a GitHub (TERMINAL, en la raíz del repo)

```powershell
git add .
git commit -m "Agrega workflow CI/CD y manifiesto del LoadBalancer"
git push origin main
```

> Qué hacen: `git add .` marca los archivos nuevos; `git commit -m "..."` los registra; `git push origin main` los sube a `main`, lo que DISPARA el workflow. (En macOS / Linux son los mismos comandos.)

### 8.2 Mira la ejecución (NAVEGADOR)

1. En tu repo, pestaña **Actions** → abre la ejecución "Desplegar microservicios en EKS (CI/CD)".
2. Despliega cada paso para ver sus logs. Si algo falla, el paso se marca en rojo con el motivo.

> Para volver a ejecutarlo sin un commit, usa el botón **Run workflow** (gracias a `workflow_dispatch`).

### 8.3 Verifica el resultado

El último paso imprime la URL del LoadBalancer. Pruébala (espera 2-3 min a que responda):

**Windows (PowerShell):**

```powershell
curl.exe http://PEGA-AQUI-LA-URL-DEL-LOADBALANCER/health
```

**macOS / Linux:**

```bash
curl http://PEGA-AQUI-LA-URL-DEL-LOADBALANCER/health
```

> Qué hace: pide `/health` a través del balanceador público. Debe responder `{"status":"ok","service":"orders-service"}`. (En PowerShell usa `curl.exe`, no `curl`.)

---

# PASO 9 — Programar rutas personalizadas de liveness y readiness en Python

Kubernetes vigila tus pods con dos sondas. En este lab vas a PROGRAMAR las dos como rutas propias (no reutilizamos `/health`): una de **liveness** (`/live`) y una de **readiness** (`/ready`). Así practicas un poco de Python en el backend.

- **Liveness** (`/live`): "¿el proceso está vivo?" Si falla, Kubernetes REINICIA el pod. Debe ser un chequeo simple que NO dependa de servicios externos (si dependiera, un fallo ajeno reiniciaría tu pod sin razón).
- **Readiness** (`/ready`): "¿puede recibir tráfico ahora?" Si falla, Kubernetes lo SACA del tráfico sin reiniciarlo. Aquí mide el uso real de recursos con `psutil`.

> `/health` se queda como está (lo usa Docker Compose para pruebas locales). Las sondas de Kubernetes apuntarán a tus rutas nuevas `/live` y `/ready`.

### 9.1 Parte A — observa los ejemplos YA RESUELTOS (products e inventory)

> RUTA: abre `products-service/app/main.py` e `inventory-service/app/main.py` en VS Code.

En esos dos servicios, las DOS rutas ya vienen hechas como modelo. Arriba del archivo están los import:

```python
import time
import psutil

INICIO = time.time()   # momento en que arranco el proceso (para el uptime)
```

Y junto al `/health` ya existente, estos dos endpoints:

```python
@app.get("/live")
def live():
    """
    Liveness: el proceso esta vivo y respondiendo. NO depende de nadie externo.
    Devolvemos OK y desde hace cuantos segundos esta arriba (uptime).
    """
    return {"alive": True, "uptime_segundos": round(time.time() - INICIO, 1)}


@app.get("/ready")
def ready():
    """Readiness: listo solo si NO esta saturado de memoria (uso real con psutil)."""
    memoria_usada = psutil.virtual_memory().percent
    if memoria_usada > 90:
        raise HTTPException(status_code=503, detail={"ready": False, "memoria_%": memoria_usada})
    return {"ready": True, "memoria_%": memoria_usada, "service": "products-service"}
```

> Un *endpoint* es una ruta (`@app.get("/live")`) más su función (el "controlador"); si devuelves un diccionario, FastAPI lo vuelve JSON. `products` e `inventory` ya tienen `psutil` en su `requirements.txt`.

### 9.2 Parte B — TU TAREA: programa /live y /ready en orders-service

> RUTA: edita `orders-service/requirements.txt` y `orders-service/app/main.py`.

1. En `orders-service/requirements.txt`, agrega una línea: `psutil`.
2. En `orders-service/app/main.py`, arriba (junto a los otros import), agrega `import time`, `import psutil` y una variable `INICIO = time.time()`.
3. Programa la **liveness** `GET /live`: devuelve `{"alive": true, "uptime_segundos": ...}`, donde el uptime son los segundos desde `INICIO`. No debe llamar a otros servicios.
4. Programa la **readiness** `GET /ready`: lee CPU con `psutil.cpu_percent(interval=0.1)` y memoria con `psutil.virtual_memory().percent`; toma el umbral de la variable de entorno `READY_MAX_MEM_PERCENT` (por defecto `90`); devuelve `{"ready": true, ...}` si la memoria está bajo el umbral, o lanza `HTTPException` 503 si lo supera.

> Pistas: `orders-service` ya importa `FastAPI`, `HTTPException` y `os`. Para el uptime: `round(time.time() - INICIO, 1)`. Para la variable: `os.getenv("READY_MAX_MEM_PERCENT", "90")` (conviértela con `float(...)`).

<details>
<summary>Solución de referencia (ábrela solo para comparar)</summary>

`orders-service/requirements.txt`: agrega `psutil`

`orders-service/app/main.py` (arriba, con los demás import, y los dos endpoints):

```python
import time
import psutil

INICIO = time.time()
READY_MAX_MEM_PERCENT = float(os.getenv("READY_MAX_MEM_PERCENT", "90"))


@app.get("/live")
def live():
    """Liveness: el proceso esta vivo (no depende de nadie externo)."""
    return {"alive": True, "uptime_segundos": round(time.time() - INICIO, 1)}


@app.get("/ready")
def ready():
    """Readiness basada en el uso real de CPU y memoria."""
    cpu = psutil.cpu_percent(interval=0.1)
    memoria = psutil.virtual_memory().percent
    if memoria > READY_MAX_MEM_PERCENT:
        raise HTTPException(
            status_code=503,
            detail={"ready": False, "cpu_%": cpu, "memoria_%": memoria, "umbral_%": READY_MAX_MEM_PERCENT},
        )
    return {"ready": True, "cpu_%": cpu, "memoria_%": memoria}
```

</details>

### 9.3 Conecta tus dos rutas con Kubernetes (las dos sondas)

> RUTA: edita los 3 archivos `*/k8s/deployment.yaml`.

En cada uno, apunta la `livenessProbe` a `/live` y la `readinessProbe` a `/ready` (antes ambas usaban `/health`). Solo cambian las dos líneas `path`:

```yaml
          livenessProbe:
            httpGet:
              path: /live           # antes /health
              port: 8001            # (8001 products, 8002 inventory, 8003 orders)
            initialDelaySeconds: 5
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready          # antes /health
              port: 8001
            initialDelaySeconds: 3
            periodSeconds: 5
```

---

# PASO 10 — Segundo despliegue (con tu cambio)

Aquí ves el valor del CI/CD: tu cambio llega a la nube con un `git push`.

### 10.1 Sube los cambios (TERMINAL, en la raíz del repo)

```powershell
git add .
git commit -m "Agrega readiness /ready (uso real de recursos)"
git push origin main
```

> Recuerda: si entraste en una sesión nueva del lab, primero actualiza los 3 secrets (Paso 2).

### 10.2 Verifica (NAVEGADOR / TERMINAL)

1. Pestaña **Actions**: la nueva ejecución termina en verde en pocos minutos.
2. Opcional, desde tu máquina:

```powershell
aws eks update-kubeconfig --name microservicios-eks --region us-east-1
kubectl get pods
```

> Qué hacen: el primero apunta `kubectl` a tu clúster; el segundo lista los pods (deben estar `Running`, con tu código nuevo).

---

# PASO 11 — Verifica que quedó LISTO para la Actividad 3.3 (HPA)

La Actividad 3.3 necesita: clúster activo, nodos `Ready`, la app desplegada y el LoadBalancer. Compruébalo (PowerShell, conectado al clúster):

```powershell
kubectl get nodes
kubectl get deployments
kubectl get svc orders-service-lb
```

> Qué verifican: `get nodes` → 2 nodos `Ready`; `get deployments` → los 3 servicios listos; `get svc orders-service-lb` → el LoadBalancer con su `EXTERNAL-IP`. Si los tres responden bien, ya puedes empezar la 3.3 (solo te faltará instalar metrics-server, su Paso 1).

---

# PASO 12 — Limpieza por CONSOLA (cuida el presupuesto)

Cuando NO sigas trabajando (o termines la 3.3), borra los recursos. El orden importa.

1. **Borra el LoadBalancer** (libera el balanceador). Desde una terminal conectada al clúster:

```powershell
kubectl delete svc orders-service-lb
```

> Qué hace: borra el Service de tipo LoadBalancer, y con él AWS elimina el balanceador. Hazlo ANTES de borrar el clúster.

2. **Consola EKS** → tu clúster → pestaña **Compute** → selecciona `nodos-microservicios` → **Delete**. Espera a que desaparezca.
3. **Consola EKS** → **Clusters** → `microservicios-eks` → **Delete cluster**.
4. **Consola ECR** → selecciona los 3 repos → **Delete**.
5. **Consola VPC** → **Your VPCs** → `microservicios-vpc-vpc` → **Actions → Delete VPC** (borra subredes, IGW y tablas de rutas).
6. **End Lab** en AWS Academy.

> Si vas a hacer la 3.3 ahora mismo, NO borres todavía: hazlo al terminar la 3.3.

---

# 13. Problemas comunes y cómo resolverlos

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `ExpiredToken` / `InvalidClientTokenId` en Actions | Secrets con credenciales caducadas. | Actualiza los 3 secrets (Paso 2) y reejecuta. |
| `name unknown` / `repository does not exist` al hacer push a ECR | Faltó crear algún repo en la consola. | Crea los 3 repos (Paso 6) con los nombres exactos. |
| `Unauthorized` al hacer `kubectl` en el workflow | El clúster lo creó otra identidad distinta a la de los secrets. | Usa los secrets del MISMO lab donde creaste el clúster. |
| Pods en `ImagePullBackOff` | La imagen no se subió, o el Account ID/región del `deployment.yaml` quedó mal. | Revisa el paso 4 del workflow y que el paso 7 sustituyó los marcadores. |
| `EXTERNAL-IP` del LoadBalancer en `<pending>` | Faltan las etiquetas de subred o el balanceador tarda. | Verifica el Paso 3.1 y espera ~5 min. |
| El workflow no arranca tras el push | Actions no habilitado en el fork, o ruta del archivo mal. | Habilita Actions (Paso 1.2) y revisa `.github/workflows/deploy.yml`. |
| `LabRole` no aparece al crear clúster/nodos | El permiso del lab varía. | Avisa a tu docente. |
| Error "Invalid workflow file" | YAML mal indentado. | Copia el bloque tal cual; usa espacios, no tabuladores. |

---

# 14. Checklist de la actividad

- [ ] **Paso 1:** Fork con Actions habilitado y clonado localmente.
- [ ] **Paso 2:** Creé los 3 secrets de AWS.
- [ ] **Paso 3:** Creé la VPC con 2 subredes públicas y las etiqueté para el LoadBalancer.
- [ ] **Paso 4:** Creé el clúster EKS con `LabRole` (Active).
- [ ] **Paso 5:** Creé el grupo de nodos con `LabRole` (Active).
- [ ] **Paso 6:** Creé los 3 repositorios ECR.
- [ ] **Paso 7-8:** Creé el workflow y el manifiesto del LoadBalancer; el push desplegó y `curl` a la URL responde.
- [ ] **Paso 9:** Programé las rutas `/live` (liveness) y `/ready` (readiness) en `orders-service`, agregué `psutil`, y apunté la `livenessProbe` a `/live` y la `readinessProbe` a `/ready` en los 3 deployment.yaml.
- [ ] **Paso 10:** El segundo push redesplegó automáticamente.
- [ ] **Paso 11:** Verifiqué que quedó listo para la Actividad 3.3.
- [ ] **Paso 12:** Sé cómo limpiar todo por consola.

---

# 15. Glosario

| Término | Qué significa |
| --- | --- |
| **CI/CD** | Automatizar build, prueba y despliegue para que baste un `git push`. |
| **GitHub Actions / workflow / job / step / runner** | Sistema de automatización de GitHub; el workflow (`.yml`) define jobs con steps que corren en un runner. |
| **Secret** | Valor sensible cifrado en el repo (credenciales). Nunca va en el código. |
| **Consola de AWS** | La interfaz web para crear y administrar recursos de AWS con clics. |
| **VPC / subred / IGW** | La red privada, sus porciones por zona, y la puerta a Internet. |
| **`LabRole`** | Rol IAM pre-creado de AWS Academy; lo eliges como rol del clúster y de los nodos. |
| **ECR** | Registro privado de imágenes Docker dentro de tu cuenta AWS. |
| **SHA del commit** | Identificador único de un cambio; lo usamos como etiqueta de imagen. |
| **LoadBalancer (Service)** | Tipo de Service de Kubernetes que hace que AWS cree un balanceador público. |
| **Liveness (`/live`) / Readiness (`/ready`)** | Sondas de salud (rutas que programas): liveness reinicia el pod si falla; readiness lo saca del tráfico sin reiniciarlo. |
| **psutil** | Librería de Python que lee el uso real de CPU y memoria. |

---

> Documento de apoyo docente — ISY1101 Introducción a Herramientas DevOps, Módulo 3, Actividad 3.2 (CI/CD con GitHub Actions; infraestructura creada en la consola de AWS). Pasos de consola y comandos verificados contra la documentación oficial de Amazon EKS, Amazon ECR, AWS CLI y las actions `aws-actions/configure-aws-credentials@v4` y `aws-actions/amazon-ecr-login@v2`. Adaptado a AWS Academy Learner Lab (rol `LabRole`, OIDC deshabilitado, región us-east-1). El resultado deja el clúster, los nodos, la app y el LoadBalancer listos para la Actividad 3.3 (HPA).
