# Laboratorio integrador (preparación del Examen Final Transversal)

### Actividad 3.4 — ISY1101 Introducción a Herramientas DevOps · Módulo 3

> **Objetivo:** practicar de punta a punta TODO lo que pide el EFT (Caso VidalCasino 3.0) pero usando los **repositorios de laboratorio** (`micro-servicios-k8s`, 3 microservicios FastAPI). Al terminar tendrás un sistema desplegado en EKS, con **pruebas que corren en el pipeline y frenan el deploy si fallan**, y con **observabilidad (Prometheus + Grafana)**.
> **Repositorio:** `https://github.com/Umbingelelo/micro-servicios-k8s`
> **Entorno:** AWS Academy — Learner Lab.
> **Regla de AWS del curso:** toda la infraestructura de AWS se crea por la **consola**; GitHub Actions solo hace el CI/CD de la aplicación.
> **Sistema operativo:** primero **Windows (PowerShell)**; debajo macOS / Linux.

> Nota de equivalencia con el EFT: el examen real tiene un *frontend* Angular público y varios *backends*. En este lab, con los 3 servicios de práctica, el rol del "servicio público" lo cumple **orders-service** (expuesto por LoadBalancer) y el de "backends internos" lo cumplen **products-service** e **inventory-service** (ClusterIP). El concepto evaluado es el mismo.

---

## 0. Qué vas a hacer y cómo se relaciona con la evaluación

Este es el laboratorio "definitivo": junta lo de las Actividades 3.1 (despliegue en EKS por consola), 3.2 (CI/CD con GitHub Actions) y 3.3 (monitoreo + HPA), y agrega las dos piezas nuevas del EFT: **pruebas en el pipeline** y **observabilidad con Grafana/Prometheus**.

Fases del lab:

```
   FASE A  Infraestructura por CONSOLA (VPC, cluster EKS, nodos, ECR)
   FASE B  Correr las pruebas unitarias (YA vienen en el repo) localmente
   FASE C  Pipeline build -> TEST -> push -> deploy  (el test FRENA el deploy si falla)
   FASE D  Observabilidad: instalar Prometheus + Grafana y ver datos reales
   FASE E  HPA + sondas liveness/readiness (autoescalado y autorecuperación)
   FASE F  Verificación end-to-end + evidencias para informe y video
```

Mapa rápido a los indicadores del EFT (al final hay un mapeo completo): FASE A/E → IE4 (despliegue, HPA); FASE B/C → IE3 (pipeline con pruebas); FASE D → IE5 (observabilidad); sondas → IE8; todo junto → IE2/IE9.

### Arquitectura objetivo

```
                       Internet
                          |
                  Service LoadBalancer (ELB) -> URL publica
                          |
                  +-------------------+
                  |  orders-service   |  (8003)  "servicio publico / orquestador"
                  +---------+---------+
                     HTTP   |   HTTP   (DNS interno del cluster)
              +------------+   +-------------+
              v                              v
   +----------------------+      +------------------------+
   |  products-service    |8001  |  inventory-service     |8002   (ClusterIP, internos)
   +----------------------+      +------------------------+

   Cada Deployment: liveness (/live) + readiness (/ready) · HPA por CPU · imagenes desde Amazon ECR
   Pipeline: build -> TEST (pytest) -> push ECR -> deploy EKS
   Observabilidad: Prometheus (scrape) -> metricas de pods/nodos -> Grafana (dashboards base)
```

---

## 1. Convenciones: RUTA de trabajo y TERMINALES

Lo de AWS se hace en la consola (navegador). Lo local (clonar, crear archivos, `git push`, correr pytest, Helm, kubectl) en una terminal ubicada en la carpeta del repo.

### 1.1 La carpeta del repositorio (tu ruta de trabajo)

Al clonar tu fork tendrás la carpeta `micro-servicios-k8s`. Toda terminal local debe estar DENTRO de ella; los archivos que crees van ahí.

- En **Windows**: `C:\Users\TU-USUARIO\micro-servicios-k8s`
- En **macOS / Linux**: `~/micro-servicios-k8s`

### 1.2 Abrir la terminal en la ruta correcta (hazlo al iniciar cada terminal)

**Windows (PowerShell):**

```powershell
cd $env:USERPROFILE\micro-servicios-k8s
Get-Location
Get-ChildItem
```

> Qué hacen: `cd` cambia de carpeta (`$env:USERPROFILE` es `C:\Users\TU-USUARIO`). `Get-Location` confirma dónde estás (debe terminar en `\micro-servicios-k8s`). `Get-ChildItem` lista los archivos (debes ver `README.md`, `docker-compose.yml` y las carpetas de los 3 servicios).

**macOS / Linux:**

```bash
cd ~/micro-servicios-k8s
pwd
ls
```

> Para crear/editar archivos cómodamente: `code .` abre Visual Studio Code en la carpeta actual.

---

## 2. Recordatorio de AWS Academy

| Punto | Qué significa aquí |
| --- | --- |
| **Credenciales temporales que rotan** | Caducan al cerrar el lab y cambian en cada **Start Lab**. Actualiza los **secrets** de GitHub cada sesión. |
| **No puedes crear roles IAM** | Usa el rol pre-creado **`LabRole`** para el clúster y los nodos. |
| **OIDC deshabilitado** | Por eso las credenciales van como secrets, no por OIDC. |
| **Región** | Solo `us-east-1`. |
| **Capacidad** | 2 nodos `t3.small`. Prometheus/Grafana y el HPA deben caber: por eso instalaremos el stack de observabilidad recortado. |
| **Presupuesto** | Clúster, nodos y LoadBalancer cuestan por hora. Limpia al terminar (sección final). |

---

## 3. Requisitos previos

### 3.1 Herramientas locales

| Herramienta | Para qué | Verificar |
| --- | --- | --- |
| **Git** | Clonar y hacer push | `git --version` |
| **Python 3.12** | Correr las pruebas localmente | `python --version` |
| **Docker** | (Opcional local) construir imágenes | `docker --version` |
| **AWS CLI v2** | Conectar `kubectl`, ECR | `aws --version` |
| **kubectl** | Operar el clúster | `kubectl version --client` |
| **Helm** | Instalar Prometheus + Grafana | `helm version` |

Instalar Helm (si no lo tienes):

**Windows (PowerShell):**

```powershell
winget install -e --id Helm.Helm
```

**macOS:**

```bash
brew install helm
```

> Qué hace: instala Helm, el "gestor de paquetes" de Kubernetes (instala aplicaciones completas en el clúster con un comando). Verifica con `helm version`. En Windows, reabre PowerShell tras instalar.

### 3.2 Tu fork con Actions habilitado

1. Entra a `https://github.com/Umbingelelo/micro-servicios-k8s` y haz **Fork** a tu cuenta.
2. En tu fork → pestaña **Actions** → **I understand my workflows, go ahead and enable them**.
3. Clónalo (PowerShell):

```powershell
cd $env:USERPROFILE
git clone https://github.com/TU-USUARIO/micro-servicios-k8s.git
cd micro-servicios-k8s
```

> Qué hace: `git clone` descarga tu fork; `cd` entra a la carpeta (tu ruta de trabajo).

---

# FASE A — Infraestructura por consola

Crea esto UNA vez en la consola de AWS (mismos pasos de las Actividades 3.1 y 3.2; aquí va el resumen). Verifica que la región sea **us-east-1**.

1. **VPC** (servicio VPC → **Create VPC** → **VPC and more**): nombre `microservicios-vpc`, `10.0.0.0/16`, **2 AZ**, **2 subredes públicas**, **0 privadas**, **NAT gateways: None**, DNS activado. Luego, en **Subnets**, etiqueta las 2 subredes públicas con `kubernetes.io/role/elb = 1`.
2. **Clúster EKS** (servicio EKS → **Create cluster** → **Custom configuration**, desactiva **EKS Auto Mode**): nombre `microservicios-eks`, **Cluster service role = `LabRole`**, red = tu VPC + las 2 subredes públicas, **endpoint Public**. Espera a **Active** (~15 min).
3. **Grupo de nodos** (clúster → **Compute** → **Add node group**): nombre `nodos-microservicios`, **Node IAM role = `LabRole`**, AMI Amazon Linux 2023, **t3.small**, desired/min/max = **2**, subredes públicas. Espera a **Active**.
4. **Repositorios ECR** (servicio ECR → **Create repository**, Private): crea `products-service`, `inventory-service` y `orders-service`.

> El detalle paso a paso de cada clic está en la Actividad 3.1 (VPC, clúster, nodos) y 3.2 (ECR). Aquí lo damos resumido para no repetir.

Conecta `kubectl` y verifica:

```powershell
aws eks update-kubeconfig --name microservicios-eks --region us-east-1
kubectl get nodes
```

> Qué hacen: el primero apunta `kubectl` a tu clúster; el segundo debe mostrar **2 nodos `Ready`**.

---

# FASE B — Correr las pruebas unitarias (YA vienen en el repo)

> Las pruebas NO hay que escribirlas: el repo ya las trae. Tu trabajo es ejecutarlas y entenderlas (luego, en la FASE C, las integras al pipeline).

### B.1 Qué hay en el repo

Cada servicio trae una carpeta `tests/` con `test_main.py`, un `pytest.ini` y un `requirements-dev.txt`. Resumen real (verificado en `main`):

| Servicio | Nº de tests | Qué prueban | Dependencias de test |
| --- | --- | --- | --- |
| `products-service` | 4 | `/health`, listado, producto por id (200 y 404) | `pytest`, `pytest-cov`, `httpx` |
| `inventory-service` | 7 | `/health`, stock, reservar (200, 404, 409, 422) | `pytest`, `pytest-cov`, `httpx` |
| `orders-service` | 9 | `/health`, `/config`, crear pedido y errores (404, 409, 503) **mockeando** products/inventory con `respx` | `pytest`, `pytest-cov`, `httpx`, `respx` |

El `pytest.ini` de cada servicio es:

```ini
[pytest]
pythonpath = .
testpaths = tests
addopts = --cov=app --cov-report=term-missing --cov-fail-under=70
```

> Qué significa: `pythonpath = .` hace que `app/main.py` se importe como `app.main`. `testpaths = tests` corre solo la carpeta `tests/`. `addopts` mide la **cobertura** del paquete `app` y **falla si baja del 70%** (`--cov-fail-under=70`). Por eso basta con ejecutar `pytest` (la configuración ya está puesta).

> Dato técnico interesante: `orders-service` se prueba de forma **unitaria de verdad** sin levantar a los otros dos. Usa la librería `respx`, que intercepta las llamadas HTTP salientes de `httpx` y devuelve respuestas simuladas (200, 404, 409, e incluso una caída de red para verificar el 503). Las peticiones del test HACIA la app (vía TestClient) no se interceptan; solo las que la app hace HACIA products/inventory.

### B.2 Ejecuta las pruebas de cada servicio

Hazlo desde DENTRO de la carpeta de cada servicio (el `pytest.ini` es relativo a esa carpeta). Recomendado usar un entorno virtual para no ensuciar tu Python.

**Windows (PowerShell) — ejemplo con products-service:**

```powershell
cd $env:USERPROFILE\micro-servicios-k8s\products-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt -r requirements-dev.txt
pytest
```

**macOS / Linux:**

```bash
cd ~/micro-servicios-k8s/products-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
pytest
```

> Qué hacen, línea por línea:
> - `cd .../products-service`: entra a la carpeta del servicio (obligatorio por el `pytest.ini`).
> - `python -m venv .venv`: crea un entorno virtual aislado en `.venv`.
> - `Activate.ps1` / `source .../activate`: activa ese entorno.
> - `pip install -r requirements.txt -r requirements-dev.txt`: instala las dependencias de ejecución (FastAPI, uvicorn...) y las de prueba (pytest, pytest-cov, httpx, y en orders también respx). El `TestClient` de FastAPI necesita `httpx`, por eso está en dev.
> - `pytest`: corre las pruebas y, gracias al `pytest.ini`, mide cobertura y falla si baja del 70%.

Repite cambiando `products-service` por `inventory-service` y `orders-service`.

> Salida esperada: una línea verde tipo `7 passed` y una tabla de cobertura (`TOTAL ... 100%`). Si ves `Required test coverage of 70% not reached`, falta cubrir código (no debería pasar con los tests que trae el repo).

---

# FASE C — Pipeline: build → TEST → push → deploy

Ahora automatizamos: cada `git push` correrá las pruebas y, **solo si pasan**, construirá, subirá y desplegará. Si una prueba falla, el deploy NO se ejecuta.

### C.1 Guarda tus credenciales como secrets (NAVEGADOR)

En tu fork → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Crea (con las credenciales del lab, **AWS Details → AWS CLI → Show**):

| Name | Value |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | `aws_access_key_id` |
| `AWS_SECRET_ACCESS_KEY` | `aws_secret_access_key` |
| `AWS_SESSION_TOKEN` | `aws_session_token` |

> Caducan cada sesión: actualízalos cada vez que reinicies el lab.

### C.2 Crea el manifiesto del LoadBalancer

> RUTA: en la RAÍZ del repo, crea `orders-service-lb.yaml`.

```yaml
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
```

### C.3 Crea el workflow

> RUTA: crea `.github/workflows/deploy.yml` (la carpeta `.github/workflows/` va en la raíz del repo).

```yaml
name: EFT - test, build, push y deploy a EKS

on:
  push:
    branches: [ main ]
  workflow_dispatch:

env:
  AWS_REGION: us-east-1
  CLUSTER_NAME: microservicios-eks

jobs:
  # ===========================================================
  # ETAPA 1 - PRUEBAS (obligatoria). Si falla, NO se despliega.
  # ===========================================================
  test:
    name: Pruebas unitarias (pytest)
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false                 # corre los 3 servicios aunque uno falle
      matrix:
        service: [products-service, inventory-service, orders-service]
    steps:
      - name: Checkout del codigo
        uses: actions/checkout@v4

      - name: Configurar Python 3.12
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Instalar dependencias y correr pytest
        working-directory: ${{ matrix.service }}
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt -r requirements-dev.txt
          pytest

  # ===========================================================
  # ETAPA 2 - BUILD + PUSH + DEPLOY. Solo si 'test' fue exitoso.
  # ===========================================================
  deploy:
    name: Build, push y deploy a EKS
    runs-on: ubuntu-latest
    needs: test                        # <-- COMPUERTA: si 'test' falla, esto NO corre
    steps:
      - name: Checkout del codigo
        uses: actions/checkout@v4

      - name: Configurar credenciales de AWS
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-session-token: ${{ secrets.AWS_SESSION_TOKEN }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login en Amazon ECR
        id: ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Construir y subir las 3 imagenes
        env:
          REGISTRY: ${{ steps.ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          for svc in products-service inventory-service orders-service; do
            docker build -t "$REGISTRY/$svc:$IMAGE_TAG" -t "$REGISTRY/$svc:latest" "./$svc"
            docker push "$REGISTRY/$svc:$IMAGE_TAG"
            docker push "$REGISTRY/$svc:latest"
          done

      - name: Instalar kubectl
        run: |
          curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
          chmod +x kubectl
          sudo mv kubectl /usr/local/bin/kubectl

      - name: Conectar kubectl al cluster
        run: aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION"

      - name: Desplegar la app y el LoadBalancer
        env:
          IMAGE_TAG: ${{ github.sha }}
        run: |
          ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
          for svc in products-service inventory-service orders-service; do
            sed -i "s|<ACCOUNT_ID>|$ACCOUNT_ID|g; s|<REGION>|$AWS_REGION|g; s|$svc:latest|$svc:$IMAGE_TAG|g" "$svc/k8s/deployment.yaml"
            kubectl apply -f "$svc/k8s/deployment.yaml"
            kubectl apply -f "$svc/k8s/service.yaml"
          done
          kubectl apply -f orders-service-lb.yaml

      - name: Esperar al rollout y mostrar la URL
        run: |
          kubectl rollout status deployment/products-service --timeout=180s
          kubectl rollout status deployment/inventory-service --timeout=180s
          kubectl rollout status deployment/orders-service --timeout=180s
          echo "URL publica del LoadBalancer:"
          kubectl get svc orders-service-lb -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'; echo
```

Cómo funciona la compuerta de pruebas (lo más importante del EFT):

| Pieza | Qué hace |
| --- | --- |
| Job `test` (matriz) | Corre `pytest` para los 3 servicios en paralelo. Si UNO falla, el job `test` falla. |
| `needs: test` en `deploy` | El job `deploy` NO arranca hasta que `test` termine, y solo arranca si `test` fue **exitoso**. Si `test` falla, `deploy` queda *skipped*: no se construye, no se sube ni se despliega nada. |

> Esto es exactamente la regla del caso: "Nada llega a producción sin pasar las pruebas". El bug del bono doble nunca habría llegado a producción.

### C.4 Primer despliegue (TERMINAL, raíz del repo)

```powershell
git add .
git commit -m "ci: pipeline test->build->push->deploy + LoadBalancer"
git push origin main
```

> Qué hacen: registran y suben tus archivos a `main`, lo que dispara el workflow. En la pestaña **Actions** verás primero el job `test` (los 3 servicios) y, si pasan, el job `deploy`. El último paso imprime la URL pública.

Verifica (espera 2-3 min a que el LoadBalancer responda):

**Windows (PowerShell):**

```powershell
curl.exe http://PEGA-LA-URL-DEL-LOADBALANCER/health
```

**macOS / Linux:**

```bash
curl http://PEGA-LA-URL-DEL-LOADBALANCER/health
```

> Debe responder `{"status":"ok","service":"orders-service"}`. (En PowerShell usa `curl.exe`, no `curl`.)

### C.5 Demuestra que un test rojo FRENA el deploy (evidencia clave del EFT)

1. Rompe a propósito un test: en `products-service/tests/test_main.py`, cambia un valor esperado (por ejemplo, en `test_health` pon `"service": "ROTO"`). Guarda.
2. Sube el cambio:

```powershell
git add .
git commit -m "test: romper a proposito para demostrar la compuerta"
git push origin main
```

3. En **Actions**: el job `test` saldrá en **rojo** y el job `deploy` quedará **skipped** (no se desplegó nada). Toma captura: es la evidencia de que el pipeline frena.
4. Revierte el cambio (deja el test como estaba), commitea y vuelve a hacer push: ahora `test` pasa y `deploy` corre.

---

# FASE D — Observabilidad: Prometheus + Grafana

Vas a instalar el stack de monitoreo en el clúster con Helm y ver, en los dashboards base, las métricas reales de tus pods/nodos. (Acceso por port-forward, no público.)

### D.1 Instala kube-prometheus-stack (TERMINAL)

```powershell
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
```

> Qué hacen: `helm repo add` registra el repositorio oficial de la comunidad Prometheus; `helm repo update` baja el índice de versiones.

Instálalo en el namespace `monitoring`, **recortado para que quepa en 2 nodos t3.small** (multilínea con backtick en PowerShell):

**Windows (PowerShell):**

```powershell
helm install monitoring prometheus-community/kube-prometheus-stack `
  --namespace monitoring --create-namespace `
  --set alertmanager.enabled=false `
  --set prometheus.prometheusSpec.retention=2h `
  --set prometheus.prometheusSpec.storageSpec=null `
  --set prometheus.prometheusSpec.resources.requests.cpu=150m `
  --set prometheus.prometheusSpec.resources.requests.memory=300Mi `
  --set prometheus.prometheusSpec.resources.limits.memory=600Mi `
  --set grafana.resources.requests.cpu=50m `
  --set grafana.resources.requests.memory=80Mi `
  --set 'grafana.adminPassword=Admin123!'
```

**macOS / Linux:**

```bash
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --set alertmanager.enabled=false \
  --set prometheus.prometheusSpec.retention=2h \
  --set prometheus.prometheusSpec.storageSpec=null \
  --set prometheus.prometheusSpec.resources.requests.cpu=150m \
  --set prometheus.prometheusSpec.resources.requests.memory=300Mi \
  --set prometheus.prometheusSpec.resources.limits.memory=600Mi \
  --set grafana.resources.requests.cpu=50m \
  --set grafana.resources.requests.memory=80Mi \
  --set 'grafana.adminPassword=Admin123!'
```

> Qué hace cada flag:
> - `--namespace monitoring --create-namespace`: instala todo en un namespace nuevo `monitoring`.
> - `alertmanager.enabled=false`: no instala Alertmanager (no lo necesitamos; ahorra recursos).
> - `prometheus.prometheusSpec.retention=2h`: guarda solo 2 horas de métricas (menos memoria).
> - `prometheus.prometheusSpec.storageSpec=null`: Prometheus usa almacenamiento **efímero (emptyDir)**, así NO necesita el driver de discos EBS (que un EKS recién creado puede no tener). Las métricas se pierden si el pod se reinicia: para el lab está bien.
> - `...resources...` y `grafana.resources...`: límites modestos para que quepan en los 2 nodos pequeños.
> - `'grafana.adminPassword=Admin123!'`: fija la contraseña de Grafana (usuario `admin`). Va entre comillas simples por el signo `!`.

### D.2 Verifica que quedó arriba

```powershell
kubectl get pods -n monitoring
```

> Qué hace: lista los pods del stack en el namespace `monitoring`. Espera a que estén `Running`: el operator, `prometheus-...-0`, `monitoring-grafana-...`, `node-exporter` (uno por nodo) y `kube-state-metrics`. Si alguno queda `Pending`, mira `kubectl describe pod <pod> -n monitoring` (suele ser falta de memoria: baja aún más los `requests`).

### D.3 Abre Grafana por port-forward

En una terminal (déjala abierta):

```powershell
kubectl port-forward -n monitoring svc/monitoring-grafana 3000:80
```

> Qué hace: abre un túnel desde el puerto 3000 de tu máquina hacia el servicio de Grafana (que escucha en el 80). NO expone Grafana a Internet (cumple el requisito del EFT).

Abre el navegador en `http://localhost:3000`. Usuario `admin`, contraseña `Admin123!` (la que fijaste). Para confirmar la clave desde el secret:

**Windows (PowerShell):**

```powershell
$p = kubectl get secret -n monitoring monitoring-grafana -o jsonpath="{.data.admin-password}"
[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p))
```

**macOS / Linux:**

```bash
kubectl get secret -n monitoring monitoring-grafana -o jsonpath="{.data.admin-password}" | base64 --decode ; echo
```

> Qué hace: lee la contraseña del admin desde el secret de Grafana y la decodifica (está en base64).

### D.4 Ve los dashboards base con datos reales

1. En Grafana: menú lateral → **Dashboards** → busca los que vienen incluidos, por ejemplo:
   - **Kubernetes / Compute Resources / Namespace (Pods)**
   - **Kubernetes / Compute Resources / Pod**
   - **Node Exporter / Nodes**
2. Para que se vea actividad real, genera carga sobre `orders-service` (como en la Actividad 3.3). En otra terminal:

```powershell
kubectl run -i --tty carga --rm --image=busybox:1.28 --restart=Never -- /bin/sh -c "while true; do wget -q -O- http://orders-service:8003/health >/dev/null 2>&1; done"
```

> Qué hace: lanza un pod temporal que pide `/health` en bucle, subiendo el uso de CPU de `orders-service`. En el dashboard "Compute Resources / Pod" verás subir la CPU/memoria de sus pods. Detén con `Ctrl + C`.
3. Toma capturas de los dashboards mostrando datos reales del clúster y de los servicios: es la evidencia de observabilidad del EFT (IE5).

---

# FASE E — HPA y sondas (autoescalado y autorecuperación)

> Detalle completo en la Actividad 3.3. Aquí el resumen para dejarlo operativo y demostrable.

### E.1 metrics-server (lo necesita el HPA y `kubectl top`)

```powershell
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl top nodes
```

> Qué hacen: instala metrics-server y muestra el uso de CPU/memoria de los nodos (confirma que entrega métricas). Si tarda o falla, revisa el parche `--kubelet-insecure-tls` de la Actividad 3.3.

### E.2 HPA sobre orders-service

```powershell
kubectl autoscale deployment orders-service --cpu-percent=50 --min=2 --max=6
kubectl get hpa
```

> Qué hacen: crea un autoescalador que mantiene la CPU promedio en 50% (entre 2 y 6 pods), y lo lista. Genera carga (FASE D.4) y observa cómo crecen las réplicas con `kubectl get hpa -w`.

### E.3 Sondas liveness/readiness

Tus `deployment.yaml` ya usan `livenessProbe` en `/live` y `readinessProbe` en `/ready` (los programaste en la Actividad 3.2). Verifica:

```powershell
kubectl describe deployment orders-service | findstr /i "Liveness Readiness"
```

> Qué hace: muestra las dos sondas configuradas. En macOS/Linux usa `grep -i` en vez de `findstr /i`. La liveness reinicia el pod si el proceso muere; la readiness lo saca de tráfico si no está listo, sin reiniciarlo.

---

# FASE F — Verificación end-to-end y evidencias

Comprueba el flujo completo y junta las evidencias que pide el EFT.

```powershell
kubectl get nodes
kubectl get pods -o wide
kubectl get svc
kubectl get hpa
kubectl get pods -n monitoring
```

> Qué verificar: 2 nodos `Ready`; los 6 pods de la app `Running` repartidos en los 2 nodos (columna NODE); `orders-service-lb` con `EXTERNAL-IP`; el HPA activo; el stack de monitoreo `Running`.

Evidencias sugeridas (para el informe y el video ≤5 min):

- Pestaña **Actions** con el job de **test en verde** y el de **deploy** después (y el run donde un test rojo **bloqueó** el deploy, FASE C.5).
- `curl` a la URL pública del LoadBalancer respondiendo.
- `kubectl get hpa` y `kubectl get pods` mostrando el autoescalado bajo carga.
- **Grafana** con un dashboard base mostrando CPU/memoria reales de los pods del casino (FASE D.4).
- El video corto: `push -> test verde -> push ECR -> deploy EKS -> app por URL -> Grafana con datos -> HPA escalando`.

---

# Limpieza (cuando termines)

> El clúster, los nodos, el LoadBalancer y el stack de monitoreo cuestan por hora. Limpia en este orden.

1. Desinstala el monitoreo:

```powershell
helm uninstall monitoring -n monitoring
kubectl delete namespace monitoring
```

2. Borra el HPA y el LoadBalancer:

```powershell
kubectl delete hpa orders-service
kubectl delete svc orders-service-lb
```

3. Por **consola**: EKS → **Compute** → borra el grupo de nodos; luego **Delete cluster**. ECR → borra los 3 repos. VPC → **Delete VPC**.
4. **End Lab** en AWS Academy.

> Nota: tras `helm uninstall`, los CRDs del operador no se borran solos; si quieres dejar el clúster impecable antes de borrarlo, no es necesario (vas a borrar el clúster completo de todas formas).

---

# Mapeo a los indicadores del EFT

| Indicador del EFT | Dónde lo practicas en este lab |
| --- | --- |
| **IE1** Versiones y arquitectura (ramas, diagrama con observabilidad) | Fork + ramas; diagrama de la sección 0 (incluye Prometheus/Grafana) |
| **IE2** Contenerización y manifiestos k8s (probes, config por env) | Dockerfiles del repo; `deployment.yaml` + `service.yaml` + sondas; URLs por variables de entorno |
| **IE3** Pipeline CI/CD con pruebas que bloquean | FASE C (build → **test** → push → deploy con `needs:`), y la demo del test rojo (C.5) |
| **IE4** Despliegue en EKS (ECR, LoadBalancer público, ClusterIP, HPA, autorecuperación) | FASE A + FASE C (deploy + LB) + FASE E (HPA + sondas) |
| **IE5** Observabilidad (Grafana + Prometheus, dashboards base con datos reales) | FASE D |
| **IE6 / IE9 / IE11** Verificación funcional, video y documentación | FASE F (evidencias y video); README del repo |
| **IE8** Fundamentos de orquestación y observabilidad (defensa) | Entender todo lo anterior para explicarlo en la defensa |

> Recuerda: en el EFT real se reutiliza tu entrega de la EA3 (frontend Angular + backends), no este repo de práctica. Este lab te entrena en los MISMOS conceptos y comandos para que la defensa individual te sea fácil.

---

# Problemas comunes

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `pytest`: `Required test coverage of 70% not reached` | Modificaste o rompiste un test/código. | Revisa el cambio; con los tests del repo la cobertura es alta. |
| Job `test` rojo y `deploy` skipped | Es el comportamiento esperado cuando un test falla. | Arregla el test/código y vuelve a hacer push (FASE C.5). |
| `ExpiredToken` en Actions | Secrets con credenciales caducadas. | Actualiza los 3 secrets (C.1) y reejecuta. |
| Pod de Prometheus/Grafana en `Pending` | Falta memoria en los 2 nodos. | Baja más los `requests` del `helm install` (D.1) o agrega un nodo (consola). |
| PVC de Prometheus en `Pending` | Se definió `storageSpec` (PVC) y no hay EBS CSI. | Usa `--set prometheus.prometheusSpec.storageSpec=null` (emptyDir), como en D.1. |
| Grafana no abre en `localhost:3000` | El `port-forward` se cerró o el puerto está ocupado. | Reabre el `port-forward`; o usa `3001:80`. |
| Pods nuevos del HPA en `Pending` | Capacidad de los 2 nodos. | Baja `maxReplicas` o agrega un nodo. |

---

# Glosario

| Término | Qué significa |
| --- | --- |
| **pytest / pytest-cov** | Framework de pruebas de Python y su medidor de cobertura. |
| **Cobertura (`--cov-fail-under=70`)** | % del código ejecutado por las pruebas; el repo exige al menos 70%. |
| **respx** | Librería que simula (mockea) las llamadas HTTP de `httpx`, para probar orders-service sin levantar los otros. |
| **`needs:` (GitHub Actions)** | Hace que un job dependa de otro; si el primero falla, el segundo no se ejecuta (la "compuerta"). |
| **Helm** | Gestor de paquetes de Kubernetes; instala apps completas (como el stack de monitoreo) con un comando. |
| **kube-prometheus-stack** | Paquete de Helm que instala Prometheus + Grafana + exportadores con dashboards base. |
| **Prometheus** | Recolecta (hace *scrape*) métricas de pods/nodos/servicios. |
| **Grafana** | Visualiza esas métricas en dashboards. |
| **emptyDir** | Almacenamiento efímero de un pod (se pierde al reiniciarse); evita depender de discos EBS. |
| **HPA / metrics-server / sondas** | Autoescalado por CPU / fuente de métricas / chequeos de salud (liveness/readiness). |

---

> Documento de apoyo docente — ISY1101 Introducción a Herramientas DevOps, Módulo 3, Actividad 3.4 (Laboratorio integrador de preparación del EFT). Usa los repositorios de laboratorio `Umbingelelo/micro-servicios-k8s`. Tests, dependencias (`pytest`, `pytest-cov`, `httpx`, `respx`), instalación de Prometheus/Grafana (Helm `kube-prometheus-stack`) y versiones de GitHub Actions verificados con subagentes contra el repositorio real y la documentación oficial. Infraestructura de AWS creada por consola (rol `LabRole`); pipeline solo para CI/CD de la aplicación; observabilidad por comandos/Helm (sin CloudWatch). Windows (PowerShell) como sistema principal.
