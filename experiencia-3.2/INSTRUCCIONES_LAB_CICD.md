# Laboratorio: CI/CD con GitHub Actions para los microservicios en EKS

### Actividad 3.2 — ISY1101 Introducción a Herramientas DevOps · Módulo 3

> **Continúa la Actividad 3.1** (despliegue manual en Amazon EKS desde la consola).
> **Repositorio base:** `https://github.com/Umbingelelo/micro-servicios-k8s`
> **Entorno:** AWS Academy — Learner Lab
> **Tiempo estimado:** 90 – 150 minutos.
> **Nivel:** Haber completado la Actividad 3.1. Conocimientos básicos de Git, Docker y Python.

---

## 0. Qué vas a hacer en este laboratorio (lee esto primero)

En la Actividad 3.1 hiciste TODO a mano: construiste las imágenes, las subiste a ECR y desplegaste en EKS desde tu terminal y la consola. Funciona, pero es lento y se repite en cada cambio de código. En este laboratorio vas a **automatizar ese trabajo con GitHub Actions**: cada vez que hagas `git push`, una "fábrica" en la nube construirá las imágenes, las subirá a ECR y actualizará el despliegue en EKS por ti. Eso es **CI/CD** (Integración y Entrega Continuas).

Además, vas a **programar un poco de Python**: añadirás una ruta de *readiness* a un microservicio, y comprobarás cómo ese cambio llega a producción solo con hacer `git push`.

Al terminar habrás:

1. Tenido tu propia copia del repositorio en GitHub (fork) con GitHub Actions habilitado.
2. Guardado tus credenciales de AWS Academy como **secrets** de GitHub.
3. Creado un **workflow** (`.github/workflows/deploy.yml`) que automatiza build + push + deploy.
4. Lanzado tu **primer despliegue automático** (la app tal como está).
5. **Programado en Python** una ruta `/ready` (readiness) en `orders-service` (en `products` e `inventory` ya viene hecha, como ejemplo).
6. Cambiado las *probes* de Kubernetes para usar `/ready` y lanzado un **segundo despliegue automático** con `git push`.
7. Demostrado la diferencia entre *liveness* y *readiness* en la práctica.

### El pipeline que vas a construir

```
   git push  (a la rama main de TU repo)
       |
       v
 +------------------- GitHub Actions (servidor en la nube) -------------------+
 |  1. checkout (descarga tu codigo)                                          |
 |  2. configura credenciales de AWS (secrets)                                |
 |  3. login en Amazon ECR                                                    |
 |  4. docker build + push de las 3 imagenes (etiqueta = SHA del commit)      |
 |  5. instala kubectl   6. update-kubeconfig   7. kubectl apply              |
 +------------------------------------|---------------------------------------+
                                      v
                  Amazon ECR  ----->  Amazon EKS  (rolling update)
                  (imagenes)          los pods nuevos reemplazan a los viejos
```

> Importante sobre el alcance: el pipeline automatiza la **entrega de la aplicación** (lo que se repite en cada cambio: construir, subir y desplegar). La **infraestructura** (la VPC, el clúster EKS y el grupo de nodos) la creaste UNA vez en la Actividad 3.1 desde la consola; no se recrea en cada push. Esa separación —infraestructura que cambia poco vs. aplicación que cambia mucho— es una buena práctica real de DevOps.

---

## 1. Recordatorio de AWS Academy (clave para que el pipeline funcione)

| Limitación | Qué significa aquí | Qué hacer |
| --- | --- | --- |
| **Credenciales temporales que rotan** | Las claves de AWS Academy caducan al cerrar el lab (~3-4 h) y cambian cada vez que haces **Start Lab**. | Cada sesión debes **actualizar los 3 secrets** de GitHub con las credenciales nuevas (Paso 2). |
| **OIDC deshabilitado** | No puedes usar el método moderno (OIDC) que conecta GitHub con AWS sin claves. | Por eso guardamos las credenciales temporales como **secrets** y las refrescamos a mano. |
| **Región obligatoria** | Solo `us-east-1`. | El workflow ya fija `us-east-1`. |
| **El clúster debe existir** | El pipeline despliega EN un clúster que ya debe estar `Active`. | Antes de empezar, ten el clúster `microservicios-eks` de la Actividad 3.1 creado y con su grupo de nodos. |
| **Presupuesto limitado** | Clúster, nodos y LoadBalancer cuestan por hora. | Apaga/limpia al terminar (sección 8). |

> Regla de oro de este lab: si el workflow falla en un paso de AWS con un error de credenciales (`ExpiredToken`, `InvalidClientTokenId`), casi siempre es porque los secrets caducaron. Actualízalos (Paso 2) y vuelve a ejecutar el workflow.

---

## 2. Requisitos previos

1. **El clúster de la Actividad 3.1 debe estar disponible**: clúster `microservicios-eks` en `us-east-1`, con su grupo de nodos `Active`. Si lo borraste en la limpieza, vuelve a crearlo siguiendo la Actividad 3.1 (Pasos 3 a 5). Los repositorios de ECR NO necesitas crearlos a mano: el workflow los crea si no existen.
2. **Una cuenta de GitHub** (gratuita).
3. **Herramientas locales** (las mismas de la 3.1): `git`, y un editor como **Visual Studio Code**. Para este lab NO necesitas Docker ni kubectl en tu máquina (todo eso corre en el servidor de GitHub Actions), aunque tenerlos no estorba.

Verifica Git:

```bash
git --version
```

---

## 3. Conceptos clave antes de empezar

### 3.1 ¿Qué es CI/CD?

- **CI (Integración Continua):** cada cambio de código se construye y prueba automáticamente.
- **CD (Entrega/Despliegue Continuo):** ese cambio, si todo va bien, se despliega solo al entorno (aquí, EKS).

La meta: que pasar de "escribí código" a "está corriendo en la nube" sea **un solo `git push`**, sin pasos manuales.

### 3.2 Vocabulario de GitHub Actions

- **Workflow:** un archivo `.yml` dentro de `.github/workflows/` que describe la automatización.
- **Trigger (disparador):** qué hace que el workflow se ejecute (aquí: un `push` a `main`, o el botón "Run workflow").
- **Job:** un conjunto de pasos que corren en una máquina temporal.
- **Step (paso):** un comando o una *action* reutilizable.
- **Runner:** la máquina en la nube (aquí `ubuntu-latest`) donde corre el job.
- **Secret:** un valor sensible (como tus credenciales de AWS) guardado de forma cifrada en el repo. Nunca se escribe en el código.

### 3.3 Liveness vs. Readiness (la parte de programación)

Kubernetes vigila tus pods con dos tipos de *probes* (sondas), que llaman a una URL de tu app:

```
   LIVENESS  (GET /health)                     READINESS (GET /ready)
   "¿el proceso sigue vivo?"                    "¿puede recibir trafico AHORA?"
   ---------------------------------            ---------------------------------
   Si falla  -> Kubernetes REINICIA el pod      Si falla -> Kubernetes lo SACA del
   (lo mata y lo vuelve a crear)                Service: deja de enviarle trafico,
                                                pero NO lo reinicia. Cuando vuelve a
                                                responder OK, lo reincorpora.
```

Ejemplos de cuándo un pod está "vivo" pero "no listo":
- Aún está calentando/cargando datos al arrancar.
- Una dependencia de la que necesita (otra API, una base de datos) está caída.

En este repo, la **liveness** ya está hecha: es el endpoint `GET /health` (devuelve `{"status": "ok", ...}`). Tu trabajo será crear la **readiness**: el endpoint `GET /ready`.

---

# PASO 1 — Tener tu propia copia del repositorio en GitHub

Necesitas tu PROPIO repositorio porque vas a guardar secrets y a hacer `push` (no puedes hacerlo sobre el repo del profesor).

### 1.1 Haz un fork (CONSOLA / NAVEGADOR)

1. Entra a `https://github.com/Umbingelelo/micro-servicios-k8s`.
2. Arriba a la derecha, haz clic en **Fork** y créalo en tu cuenta. Un *fork* es una copia del repo bajo tu usuario.
3. Quedarás en `https://github.com/TU-USUARIO/micro-servicios-k8s`.

### 1.2 Habilita GitHub Actions en tu fork (NAVEGADOR)

En los forks, Actions viene desactivado por seguridad.

1. En tu fork, entra a la pestaña **Actions**.
2. Haz clic en **I understand my workflows, go ahead and enable them**.

### 1.3 Clona tu fork en tu computador (TERMINAL)

Reemplaza `TU-USUARIO` por tu usuario de GitHub.

**macOS / Linux:**

```bash
git clone https://github.com/TU-USUARIO/micro-servicios-k8s.git
cd micro-servicios-k8s
```

**Windows (PowerShell):**

```powershell
git clone https://github.com/TU-USUARIO/micro-servicios-k8s.git
cd micro-servicios-k8s
```

> Alternativa sin terminal: puedes editar y crear archivos directamente en la web de GitHub (botón de lápiz "Edit" y "Add file"). Si te sientes cómodo con Git, trabajar local con VS Code es más cómodo.

---

# PASO 2 — Guardar tus credenciales de AWS como secrets de GitHub

El workflow necesita autenticarse en AWS. Le daremos las credenciales temporales del lab de forma segura (cifradas), nunca en el código.

### 2.1 Copia las credenciales del lab (NAVEGADOR)

1. En AWS Academy, **Start Lab** y espera el círculo verde.
2. **AWS Details → AWS CLI → Show**. Verás el bloque con `aws_access_key_id`, `aws_secret_access_key` y `aws_session_token`.

### 2.2 Crea los 3 secrets en tu repo (NAVEGADOR)

1. En tu fork, ve a **Settings** (del repositorio) → menú izquierdo **Secrets and variables** → **Actions**.
2. Botón **New repository secret**. Crea estos tres, uno por uno (copia cada valor del bloque de AWS Details):

| Name (exactamente así) | Value |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | el valor de `aws_access_key_id` |
| `AWS_SECRET_ACCESS_KEY` | el valor de `aws_secret_access_key` |
| `AWS_SESSION_TOKEN` | el valor de `aws_session_token` (la cadena larga) |

> ADVERTENCIA (lo más importante de este lab): estas credenciales **caducan**. Cada vez que reinicies el lab en otra sesión, vuelve aquí y **actualiza los 3 secrets** con los valores nuevos (puedes editar cada secret y pegar el valor nuevo). Si no, el workflow fallará al hablar con AWS.

---

# PASO 3 — Crear el workflow de GitHub Actions

Vas a crear el archivo `.github/workflows/deploy.yml`. Ese archivo ES la automatización.

### 3.1 Crea el archivo (TERMINAL o NAVEGADOR)

**macOS / Linux:**

```bash
mkdir -p .github/workflows
code .github/workflows/deploy.yml     # o usa: nano .github/workflows/deploy.yml
```

**Windows (PowerShell):**

```powershell
New-Item -ItemType Directory -Force -Path ".github/workflows" | Out-Null
code .github/workflows/deploy.yml
```

> En la web de GitHub: **Add file → Create new file**, y escribe como nombre `.github/workflows/deploy.yml` (las barras crean las carpetas).

### 3.2 Pega este contenido

```yaml
name: Desplegar microservicios en EKS

# Cuando se ejecuta este workflow:
on:
  push:
    branches: [ main ]      # cada push a la rama main
  workflow_dispatch:        # y tambien con el boton "Run workflow" (manual)

# Valores fijos para todo el workflow.
env:
  AWS_REGION: us-east-1
  CLUSTER_NAME: microservicios-eks

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest     # maquina temporal en la nube de GitHub
    steps:
      # 1) Descarga el codigo de tu repo en la maquina del runner.
      - name: Checkout del codigo
        uses: actions/checkout@v4

      # 2) Configura las credenciales de AWS a partir de los secrets.
      #    aws-session-token es lo que permite usar las credenciales TEMPORALES
      #    de AWS Academy.
      - name: Configurar credenciales de AWS
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-session-token: ${{ secrets.AWS_SESSION_TOKEN }}
          aws-region: ${{ env.AWS_REGION }}

      # 3) Inicia sesion en Amazon ECR. Expone la direccion del registro
      #    en steps.ecr.outputs.registry.
      - name: Login en Amazon ECR
        id: ecr
        uses: aws-actions/amazon-ecr-login@v2

      # 4) Crea los repos en ECR si no existen, construye y sube las 3 imagenes.
      #    Cada imagen se etiqueta con el SHA del commit (version exacta y unica)
      #    y tambien con latest.
      - name: Construir y subir imagenes a ECR
        env:
          REGISTRY: ${{ steps.ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          for svc in products-service inventory-service orders-service; do
            aws ecr describe-repositories --repository-names "$svc" --region "$AWS_REGION" >/dev/null 2>&1 \
              || aws ecr create-repository --repository-name "$svc" --region "$AWS_REGION"
            docker build -t "$REGISTRY/$svc:$IMAGE_TAG" -t "$REGISTRY/$svc:latest" "./$svc"
            docker push "$REGISTRY/$svc:$IMAGE_TAG"
            docker push "$REGISTRY/$svc:latest"
          done

      # 5) Instala kubectl en el runner (no viene por defecto).
      - name: Instalar kubectl
        run: |
          curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
          chmod +x kubectl
          sudo mv kubectl /usr/local/bin/kubectl
          kubectl version --client

      # 6) Conecta kubectl al clúster EKS (usa las credenciales del paso 2).
      - name: Conectar kubectl al clúster
        run: aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION"

      # 7) Sustituye los marcadores de los manifiestos y despliega.
      #    Cambiamos <ACCOUNT_ID>, <REGION> y la etiqueta :latest por el SHA,
      #    para desplegar EXACTAMENTE la imagen recien construida.
      - name: Desplegar en EKS
        env:
          IMAGE_TAG: ${{ github.sha }}
        run: |
          ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
          for svc in products-service inventory-service orders-service; do
            sed -i "s|<ACCOUNT_ID>|$ACCOUNT_ID|g; s|<REGION>|$AWS_REGION|g; s|:latest|:$IMAGE_TAG|g" "$svc/k8s/deployment.yaml"
            kubectl apply -f "$svc/k8s/deployment.yaml"
            kubectl apply -f "$svc/k8s/service.yaml"
          done

      # 8) Espera a que el despliegue termine correctamente.
      - name: Esperar al rollout
        run: |
          kubectl rollout status deployment/products-service --timeout=180s
          kubectl rollout status deployment/inventory-service --timeout=180s
          kubectl rollout status deployment/orders-service --timeout=180s
```

### 3.3 Qué hace cada paso (resumen)

| Paso | Acción | Equivale a lo que hiciste a mano en 3.1 |
| --- | --- | --- |
| 1 | Descarga tu código | `git clone` |
| 2 | Credenciales AWS | editar `~/.aws/credentials` |
| 3 | Login ECR | `aws ecr get-login-password \| docker login` |
| 4 | Build + push (3 imágenes) | `docker build` / `tag` / `push` |
| 5 | Instala kubectl | (ya lo tenías instalado) |
| 6 | Conecta al clúster | `aws eks update-kubeconfig` |
| 7 | Despliega | `sed` + `kubectl apply` |
| 8 | Verifica el rollout | `kubectl rollout status` |

> ¿Por qué etiquetar la imagen con el SHA del commit (`${{ github.sha }}`)? Porque `latest` es ambiguo ("la última", pero ¿cuál?). El SHA identifica de forma única el código exacto que se desplegó. Así, si algo falla, sabes qué versión está corriendo y puedes volver atrás. Es una práctica estándar de CI/CD.

---

# PASO 4 — Primer despliegue automático (la app "como está")

Antes de programar nada, comprobemos que el pipeline funciona desplegando el código tal cual.

### 4.1 Sube el workflow a GitHub (TERMINAL)

**macOS / Linux y Windows (PowerShell):**

```bash
git add .github/workflows/deploy.yml
git commit -m "Agrega workflow de CI/CD para EKS"
git push origin main
```

> El `git push` a `main` es el disparador: GitHub Actions arrancará el workflow automáticamente.

### 4.2 Mira la ejecución (NAVEGADOR)

1. En tu repo, ve a la pestaña **Actions**.
2. Verás una ejecución llamada "Desplegar microservicios en EKS" en curso. Haz clic para abrirla.
3. Despliega cada paso para ver sus logs en vivo. Si algo falla, el paso se marca en rojo y el log te dice por qué.

> Si quieres lanzarlo sin hacer un commit, usa el botón **Run workflow** (gracias a `workflow_dispatch`) en la pestaña Actions.

### 4.3 Verifica el despliegue (NAVEGADOR o TERMINAL)

En la consola de AWS (EKS → tu clúster → pestaña **Resources**) deberías ver los Deployments y Pods. O, si tienes kubectl conectado en tu máquina (Actividad 3.1, Paso 6):

```bash
kubectl get pods
```

> Deberías ver 6 pods `Running`. Acabas de desplegar a EKS sin tocar la terminal de AWS: lo hizo el pipeline.

---

# PASO 5 — Programar la ruta de readiness (/ready) en Python

Ahora la parte de programación. Vas a comparar la *liveness* (ya hecha) con la *readiness* (la harás tú).

### 5.1 Parte A — Observa los ejemplos YA RESUELTOS

En `products-service` e `inventory-service` la ruta `/ready` **ya viene implementada**. Ábrelas y estúdialas: son tu modelo.

`products-service/app/main.py` (junto al `/health` ya existente):

```python
@app.get("/ready")
def ready():
    """
    Readiness: indica si el servicio esta LISTO para recibir trafico.
    products-service no depende de ningun otro servicio (es una 'hoja'),
    asi que en cuanto el proceso arranca ya esta listo.
    """
    return {"ready": True, "service": "products-service"}
```

`inventory-service/app/main.py`:

```python
@app.get("/ready")
def ready():
    """Readiness: inventory-service no depende de nadie; siempre esta listo."""
    return {"ready": True, "service": "inventory-service"}
```

> Fíjate en el patrón: es una función decorada con `@app.get("/ready")` que devuelve un diccionario (FastAPI lo convierte en JSON). La liveness (`/health`) y la readiness (`/ready`) son endpoints normales; lo especial es para qué los usa Kubernetes.

### 5.2 Parte B — TU TAREA: implementa /ready en orders-service

`orders-service` es el orquestador: solo tiene sentido que reciba pedidos si **puede contactar a sus dependencias** (`products-service` e `inventory-service`). Por eso su readiness es más interesante que la de una hoja.

**Especificación de lo que debes programar (en `orders-service/app/main.py`):**

- Crea un endpoint `GET /ready`.
- Debe intentar un `GET /health` a `products-service` y a `inventory-service`.
- Si **ambos** responden con código 200, devuelve `{"ready": true, ...}` (código 200).
- Si **alguno** falla o no responde, lanza un `HTTPException` con código **503** (no está listo).

**Pistas (todo lo que necesitas ya está en el archivo):**

- `orders-service` ya importa `httpx`, `FastAPI` y `HTTPException`.
- Ya existen las variables `PRODUCTS_SERVICE_URL` e `INVENTORY_SERVICE_URL` (las usa `create_order`). Reutilízalas.
- Mira cómo `create_order` hace `with httpx.Client(timeout=...) as client: client.get(...)`. Tu `/ready` hace algo parecido pero más simple.
- Para devolver 503: `raise HTTPException(status_code=503, detail=...)`.

Intenta resolverlo tú antes de mirar la solución.

<details>
<summary>Solución de referencia (ábrela solo para comparar)</summary>

```python
@app.get("/ready")
def ready():
    """
    Readiness de orders-service (el orquestador).
    orders solo esta LISTO si puede contactar a sus dos dependencias.
    Si alguna no responde, devolvemos 503 y Kubernetes deja de enviarnos trafico.
    """
    dependencias = {}
    with httpx.Client(timeout=2.0) as client:
        for nombre, url in (("products", PRODUCTS_SERVICE_URL), ("inventory", INVENTORY_SERVICE_URL)):
            try:
                resp = client.get(f"{url}/health")
                dependencias[nombre] = (resp.status_code == 200)
            except httpx.RequestError:
                dependencias[nombre] = False
    if not all(dependencias.values()):
        raise HTTPException(status_code=503, detail={"ready": False, "dependencias": dependencias})
    return {"ready": True, "dependencias": dependencias}
```

</details>

> Nota: el bloque `<details>...</details>` es HTML; en la vista de GitHub aparece como un desplegable "Solución de referencia". Si tu editor no lo despliega, simplemente lee el código que contiene.

### 5.3 Conecta tu /ready con Kubernetes (cambiar la readinessProbe)

Ahora mismo, en los 3 archivos `k8s/deployment.yaml`, la `readinessProbe` apunta a `/health`. Cámbiala a `/ready` en los **tres** servicios. Busca este bloque:

```yaml
          readinessProbe:
            httpGet:
              path: /health      # <-- CAMBIAR
              port: 8001         # (8001 products, 8002 inventory, 8003 orders)
```

y déjalo así (solo cambia la línea `path`):

```yaml
          readinessProbe:
            httpGet:
              path: /ready
              port: 8001
```

> NO cambies la `livenessProbe`: esa debe seguir en `/health`. Así separas las dos preguntas: "¿está vivo?" (`/health`, reinicia si falla) y "¿está listo?" (`/ready`, lo saca de tráfico si falla).

---

# PASO 6 — Segundo despliegue automático (con tu cambio)

Aquí ves el valor real del CI/CD: tu cambio de código llega a la nube con solo `git push`.

### 6.1 Sube los cambios (TERMINAL)

```bash
git add .
git commit -m "Agrega readiness /ready y actualiza las probes"
git push origin main
```

> Recuerda: si volviste a entrar al lab en una sesión nueva, primero actualiza los 3 secrets (Paso 2), porque las credenciales habrán cambiado.

### 6.2 Observa el pipeline y verifica (NAVEGADOR / TERMINAL)

1. Pestaña **Actions**: verás la nueva ejecución. Espera a que termine en verde.
2. Verifica que los pods se actualizaron y que la readiness ahora usa `/ready`:

```bash
kubectl get pods
kubectl describe deployment orders-service | grep -i readiness
```

> En la salida de `describe` deberías ver `Readiness: http-get http://:8003/ready ...`. Si los pods están `Running` y `READY 1/1`, tu nuevo código (con `/ready`) está corriendo en EKS, desplegado automáticamente.

Prueba el nuevo endpoint directamente (con `port-forward`, como en la 3.1):

```bash
kubectl port-forward svc/orders-service 8003:8003
```

En otra terminal:

**macOS / Linux:**

```bash
curl http://localhost:8003/ready
```

**Windows (PowerShell):**

```powershell
curl.exe http://localhost:8003/ready
```

> Debería responder `{"ready": true, "dependencias": {"products": true, "inventory": true}}`.

---

# PASO 7 (BONUS) — Demuestra la diferencia liveness vs. readiness

Vamos a "romper" una dependencia a propósito y ver cómo la readiness de `orders-service` reacciona, sin que el pod se reinicie.

1. Apaga `products-service` poniéndolo en 0 réplicas:

```bash
kubectl scale deployment/products-service --replicas=0
```

2. Espera ~15 segundos y mira los pods:

```bash
kubectl get pods
```

> Verás que los pods de `orders-service` pasan a `READY 0/1` (NotReady), pero siguen `Running`: NO se reiniciaron (la liveness `/health` de orders sigue OK; es la readiness `/ready` la que falla porque no alcanza a products). Kubernetes deja de enviarles tráfico.

3. Vuelve a encender products:

```bash
kubectl scale deployment/products-service --replicas=2
```

4. En ~30 segundos, los pods de `orders-service` vuelven a `READY 1/1`.

> Esto es exactamente para lo que sirve la readiness: evitar mandar tráfico a un pod que, aunque esté vivo, no puede atender bien las peticiones. Cuando termines, deja products en 2 réplicas.

---

# 8. Costos y limpieza

El clúster EKS, los nodos y cualquier LoadBalancer **siguen facturando** mientras existan. Cuando termines tu sesión:

- Si vas a seguir mañana y NO necesitas que quede corriendo, limpia como en la **Actividad 3.1, Paso 10** (borra LoadBalancer, grupo de nodos, clúster, repos ECR y VPC).
- El repositorio de GitHub y el workflow NO cuestan nada; puedes dejarlos.
- Recuerda hacer **End Lab** en AWS Academy.

> Los **secrets** de GitHub no cuestan, pero contienen credenciales temporales ya caducadas tras cerrar el lab: no son un riesgo, pero igual deberás refrescarlos la próxima sesión.

---

# 9. Problemas comunes y cómo resolverlos

| Síntoma (en el log de Actions) | Causa probable | Solución |
| --- | --- | --- |
| `ExpiredToken` / `InvalidClientTokenId` / `security token... expired` | Los secrets tienen credenciales caducadas (sesión anterior del lab). | Actualiza los 3 secrets con las credenciales nuevas (Paso 2) y re-ejecuta el workflow. |
| El workflow no se ejecuta tras el push | Actions no está habilitado en el fork, o el archivo no está en `.github/workflows/`. | Habilita Actions (Paso 1.2) y revisa la ruta/nombre del archivo. |
| `error: You must be logged in to the server (Unauthorized)` en `kubectl` | El clúster fue creado por una cuenta de lab distinta a la de los secrets, o el clúster no existe. | Usa los secrets del MISMO lab donde creaste el clúster; confirma que el clúster `microservicios-eks` está `Active`. |
| `repository ... does not exist` o fallo al `update-kubeconfig` | El clúster o el nombre no coinciden. | Verifica `CLUSTER_NAME: microservicios-eks` y la región `us-east-1` en el workflow. |
| Pods en `ImagePullBackOff` | Los nodos no pudieron descargar la imagen. | Confirma que el paso 4 (push) terminó OK y que las subredes de los nodos tienen salida a Internet (Actividad 3.1, Paso 3). |
| `rollout status` se queda esperando `orders-service` | La readiness de orders no alcanza a sus dependencias (products/inventory aún no listos, o tu `/ready` tiene un error). | Revisa `kubectl get pods` y `kubectl logs <pod-orders>`; verifica tu código de `/ready`. |
| Error de sintaxis del workflow ("Invalid workflow file") | El YAML está mal indentado. | El YAML usa espacios (no tabuladores) y respeta la indentación. Copia el bloque del Paso 3.2 tal cual. |

---

# 10. Checklist de la actividad

- [ ] **Paso 1:** Tengo mi fork con Actions habilitado y clonado localmente.
- [ ] **Paso 2:** Creé los 3 secrets (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`).
- [ ] **Paso 3:** Creé `.github/workflows/deploy.yml`.
- [ ] **Paso 4:** El primer push lanzó el workflow y terminó en verde; veo 6 pods `Running`.
- [ ] **Paso 5:** Programé `/ready` en `orders-service` (verifica dependencias) y cambié la `readinessProbe` a `/ready` en los 3 deployment.yaml.
- [ ] **Paso 6:** El segundo push redesplegó automáticamente; `curl .../ready` responde `ready: true`.
- [ ] **Paso 7 (bonus):** Al escalar products a 0, los pods de orders quedan `0/1` (NotReady) sin reiniciarse, y se recuperan al volver products.

---

# 11. Glosario (CI/CD)

| Término | Qué significa |
| --- | --- |
| **CI/CD** | Integración y Entrega/Despliegue Continuos: automatizar build, prueba y despliegue. |
| **GitHub Actions** | El sistema de automatización integrado en GitHub. |
| **Workflow** | Archivo `.yml` en `.github/workflows/` que define la automatización. |
| **Trigger / disparador** | Evento que ejecuta el workflow (`push`, `workflow_dispatch`, etc.). |
| **Job** | Conjunto de pasos que corren en una máquina (runner). |
| **Step / paso** | Un comando (`run:`) o una *action* (`uses:`) dentro de un job. |
| **Runner** | Máquina temporal en la nube donde corre el job (aquí `ubuntu-latest`). |
| **Action** | Componente reutilizable (p. ej. `actions/checkout`, `aws-actions/configure-aws-credentials`). |
| **Secret** | Valor sensible cifrado guardado en el repo (credenciales). Nunca va en el código. |
| **Fork** | Copia de un repositorio bajo tu propia cuenta. |
| **SHA del commit** | Identificador único de un cambio en Git; lo usamos como etiqueta de imagen. |
| **Rolling update** | Actualización gradual: Kubernetes reemplaza pods viejos por nuevos sin cortar el servicio. |
| **Liveness (`/health`)** | Sonda que pregunta si el proceso está vivo; si falla, el pod se reinicia. |
| **Readiness (`/ready`)** | Sonda que pregunta si el pod puede recibir tráfico; si falla, se le quita el tráfico (no se reinicia). |
| **Probe (sonda)** | Chequeo periódico que Kubernetes hace a una URL de tu app. |
| **OIDC** | Método moderno (sin claves) para que GitHub se autentique en AWS. Deshabilitado en AWS Academy. |

---

> Documento de apoyo docente — ISY1101 Introducción a Herramientas DevOps, Módulo 3, Actividad 3.2 (CI/CD con GitHub Actions). Continúa la Actividad 3.1. Workflow verificado contra la documentación de `aws-actions/configure-aws-credentials@v4`, `aws-actions/amazon-ecr-login@v2` y la instalación oficial de kubectl. Código de ejemplo basado en el repositorio `Umbingelelo/micro-servicios-k8s`. Adaptado a AWS Academy Learner Lab (credenciales temporales en secrets, OIDC deshabilitado, región us-east-1).
