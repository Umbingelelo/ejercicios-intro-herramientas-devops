# Laboratorio: Monitoreo por comandos, distribución en nodos, pruebas de carga y autoescalado (HPA)

### Actividad 3.3 — ISY1101 Introducción a Herramientas DevOps · Módulo 3

> **Continúa las Actividades 3.1 (despliegue en EKS) y 3.2 (CI/CD).**
> **Repositorio base:** `https://github.com/Umbingelelo/micro-servicios-k8s`
> **Entorno:** AWS Academy — Learner Lab
> **Tiempo estimado:** 100 – 160 minutos.
> **Importante:** este laboratorio NO usa CloudWatch. Todo el monitoreo se hace con comandos (`kubectl`).
> **Sistema operativo:** este documento está escrito pensando primero en **Windows (PowerShell)**. Cada comando aparece primero para Windows y, debajo, para macOS / Linux.

---

## 0. Qué vas a hacer en este laboratorio (lee esto primero)

Tu aplicación ya corre en EKS. Ahora vas a aprender a **observar cómo se comporta bajo presión** y a hacer que **se adapte sola** al tráfico. La idea: simular que de repente llegan MUCHOS usuarios y ver qué hace Kubernetes.

Al terminar habrás:

1. Instalado **metrics-server** (la fuente de métricas de CPU/memoria del clúster).
2. Armado un **tablero de monitoreo por terminal** (`kubectl top`, `kubectl get hpa -w`, etc.), sin CloudWatch.
3. Visto **cómo se reparten los pods entre los nodos** (para que no corran todos en una sola máquina).
4. Creado un **HPA** (Horizontal Pod Autoscaler) que añade o quita pods según la carga.
5. Hecho una **prueba de carga** que simula alto tráfico de personas.
6. **Observado en vivo** cómo Kubernetes escala los pods hacia arriba cuando sube la CPU y hacia abajo cuando baja.
7. **Ajustado el HPA** usando la fórmula de la **función techo**, para ver que el resultado depende de los valores que TÚ eliges.

### El experimento en una imagen

```
   Muchos usuarios (prueba de carga: k6 o generador interno)
            |
            |  miles de peticiones HTTP
            v
   +----------------------+        sube la CPU de los pods
   |  orders-service      | ---------------------------------+
   |  (2 pods al inicio)  |                                   |
   +----------------------+                                   v
            ^                                       +---------------------+
            |  metrics-server mide CPU/memoria ---> |  metrics-server     |
            |                                       +----------+----------+
            |                                                  |
            |                                 cada 15s reporta uso real
            |                                                  v
            |                                       +---------------------+
            +-- crea/borra pods <------------------ |  HPA                |
               (repartidos entre los 2 nodos)       |  "si CPU > 50%,     |
                                                     |   agrega pods"      |
                                                     +---------------------+
```

---

## 1. Convenciones de este documento: RUTA de trabajo y TERMINALES

> Lee esta sección con calma: te ahorrará la mayoría de los errores. Aquí definimos DÓNDE se ejecuta todo.

### 1.1 La carpeta del repositorio (tu "ruta de trabajo")

En la Actividad 3.2 clonaste el repositorio con `git clone`. Esa carpeta se llama `micro-servicios-k8s` y es tu **ruta de trabajo**. Salvo que se diga lo contrario, **toda terminal de este laboratorio debe estar ubicada dentro de esa carpeta**, y **todos los archivos que crees van dentro de ella**.

- En **Windows**, si la clonaste en tu carpeta de usuario, la ruta completa es algo como:
  `C:\Users\TU-USUARIO\micro-servicios-k8s`
- En **macOS / Linux**, algo como:
  `/Users/TU-USUARIO/micro-servicios-k8s` (o `~/micro-servicios-k8s`)

### 1.2 Cómo abrir la terminal en la ruta correcta (hazlo SIEMPRE al empezar)

**Windows (PowerShell):**

1. Abre el menú Inicio, escribe **PowerShell** y ábrelo.
2. Ubícate en la carpeta del repo con este comando (ajusta la ruta si lo clonaste en otro lugar):

```powershell
cd $env:USERPROFILE\micro-servicios-k8s
```

> Qué hace: `cd` (change directory) cambia la carpeta actual de la terminal. `$env:USERPROFILE` es una variable de Windows que vale `C:\Users\TU-USUARIO`, así que el comando entra a `C:\Users\TU-USUARIO\micro-servicios-k8s`.

3. Confirma que estás en el lugar correcto:

```powershell
Get-Location
Get-ChildItem
```

> Qué hacen: `Get-Location` imprime la carpeta actual (debe terminar en `\micro-servicios-k8s`). `Get-ChildItem` lista los archivos; debes ver `docker-compose.yml`, `README.md` y las carpetas `products-service`, `inventory-service`, `orders-service`. Si NO los ves, no estás en la carpeta correcta: revisa el `cd`.

**macOS / Linux:**

```bash
cd ~/micro-servicios-k8s
pwd
ls
```

> `cd ~/micro-servicios-k8s` entra a la carpeta. `pwd` ("print working directory") muestra la ruta actual. `ls` lista los archivos (debes ver `docker-compose.yml` y las 3 carpetas de servicios).

### 1.3 Truco: abrir el repo en Visual Studio Code

Para crear y editar archivos cómodamente, desde la terminal ya ubicada en el repo:

```powershell
code .
```

> Qué hace: `code` abre Visual Studio Code y el `.` significa "la carpeta actual". Así ves todo el repo en el explorador de archivos de VS Code y puedes crear archivos en la ruta exacta que te indiquemos.

> A lo largo del lab, cuando digamos "crea el archivo `orders-service\k8s\hpa.yaml`", la ruta es **relativa a la carpeta del repo**. Su ruta completa en Windows sería `C:\Users\TU-USUARIO\micro-servicios-k8s\orders-service\k8s\hpa.yaml`.

---

## 2. Recordatorio de AWS Academy

| Punto | Qué significa aquí |
| --- | --- |
| **metrics-server NO viene en EKS** | Hay que instalarlo (Paso 1) o `kubectl top` y el HPA no funcionan. |
| **Sin CloudWatch** | Todo el monitoreo es por comandos. Es a propósito: aprendes a "ver" el clúster con `kubectl`. |
| **Capacidad de nodos limitada** | Tienes 2 nodos `t3.small`. El HPA no puede crear pods infinitos: si no caben, quedan en `Pending`. Por eso usaremos un máximo modesto. |
| **Credenciales temporales** | Si `kubectl` da error de credenciales, vuelve a la Actividad 3.1 (Paso 2) y reconfigúralas. |
| **Presupuesto** | El clúster, los nodos y el LoadBalancer cuestan por hora. Limpia al terminar (sección 9). |

---

## 3. Requisitos previos

> Abre PowerShell en la ruta del repo (sección 1.2) y ejecuta estos comandos de verificación.

1. **El clúster de la Actividad 3.1 está `Active`** con su grupo de nodos y la app desplegada:

```powershell
kubectl get nodes
kubectl get deployments
kubectl get pods
```

> Qué hacen:
> - `kubectl get nodes`: lista las máquinas (nodos) del clúster. Debes ver **2 nodos** en estado `Ready`.
> - `kubectl get deployments`: lista los despliegues. Debes ver `products-service`, `inventory-service` y `orders-service`.
> - `kubectl get pods`: lista los pods (las copias en ejecución). Debes ver 6 pods en estado `Running`.
>
> Si falta la aplicación, vuelve a desplegarla (Actividad 3.1, Paso 8, o ejecuta tu pipeline de la 3.2).

2. **Los deployments tienen `requests` de CPU** (obligatorio para el HPA: calcula el porcentaje de uso CONTRA ese valor). En este repo ya viene puesto en cada `deployment.yaml`:

```yaml
resources:
  requests:
    cpu: "50m"      # el HPA mide el uso real CONTRA estos 50 milicores
  limits:
    cpu: "250m"
```

> `50m` = 50 milicores = 0,05 de un núcleo de CPU. Si el HPA apunta a 50%, su objetivo es 25m por pod en promedio.

3. **`kubectl` conectado al clúster** (Actividad 3.1, Paso 6). El comando `kubectl get nodes` de arriba ya lo confirma.

---

## 4. Conceptos clave

### 4.1 Observabilidad por comandos

"Monitorear" es responder: ¿cuántos recursos consume cada cosa? y ¿qué está pasando? Con `kubectl` lo ves así:

- `kubectl top nodes` / `kubectl top pods`: cuánta CPU y memoria usan AHORA los nodos y los pods (uso real).
- `kubectl get hpa`: qué decide el autoescalador (uso actual vs. objetivo, cuántos pods).
- `kubectl get pods -o wide`: cuántos pods hay, su estado y **en qué nodo** corre cada uno.
- `kubectl describe ...` y `kubectl get events`: el "por qué" (decisiones, errores, eventos).

### 4.2 Distribución de pods entre nodos

Kubernetes intenta repartir las copias (pods) de un servicio entre los distintos nodos, para que si una máquina falla, el servicio siga vivo en la otra. En este lab lo verás con tus propios ojos y aprenderás a forzarlo.

### 4.3 Prueba de carga (load testing)

Es enviar muchas peticiones a propósito para simular tráfico real y ver cómo aguanta el sistema.

### 4.4 HPA (Horizontal Pod Autoscaler)

El HPA ajusta el **número de pods** de un Deployment según una métrica (aquí, % de CPU). Necesita metrics-server (Paso 1) y `requests` de CPU (Requisito 2). Su fórmula exacta la verás en el Paso 8.

---

# PASO 1 — Instalar metrics-server (la fuente de métricas)

> Terminal: PowerShell ubicada en la raíz del repo (sección 1.2). En este paso la ruta no es crítica porque no leemos archivos locales, pero acostúmbrate a estar siempre ahí.

EKS no trae metrics-server. Sin él, `kubectl top` y el HPA no tienen datos.

### 1.1 Instálalo

```powershell
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

(En macOS / Linux es el mismo comando.)

> Qué hace, parte por parte:
> - `kubectl apply` crea o actualiza recursos en el clúster.
> - `-f` ("file") indica de DÓNDE leer la definición; aquí es una URL.
> - La URL es el archivo oficial de metrics-server. El comando lo descarga e instala en el namespace `kube-system` (donde viven los componentes internos del clúster).

### 1.2 Verifica que está corriendo

```powershell
kubectl get deployment metrics-server -n kube-system
```

> Qué hace: pregunta por el deployment llamado `metrics-server`. `-n kube-system` indica el *namespace* (la "carpeta lógica" del clúster) donde se instaló. Espera a que la columna `READY` diga `1/1` (puede tardar ~1 minuto).

### 1.3 Prueba que entrega métricas

```powershell
kubectl top nodes
kubectl top pods
```

> Qué hacen:
> - `kubectl top nodes`: muestra el uso real de CPU y memoria de cada nodo (máquina).
> - `kubectl top pods`: muestra el uso real de cada pod.
> Si ves números (no errores), metrics-server funciona.

> Si tras 2-3 minutos `kubectl top` da `metrics not available` o el HPA luego muestra `<unknown>`, aplica este parche (le dice a metrics-server que no verifique el certificado TLS del kubelet) y espera 1 minuto:
>
> ```powershell
> kubectl patch deployment metrics-server -n kube-system --type='json' -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
> ```
>
> Qué hace: `kubectl patch` modifica un recurso ya existente. `--type='json'` usa el formato "JSON Patch". El contenido de `-p` agrega (`op: add`) el argumento `--kubelet-insecure-tls` a la lista de argumentos del contenedor de metrics-server.

---

# PASO 2 — Arma tu tablero de monitoreo por comandos

La idea es VER el clúster en tiempo real mientras hacemos la prueba de carga. Vas a abrir **varias terminales a la vez**, cada una "vigilando" algo distinto.

> RUTA para CADA terminal: abre una ventana NUEVA de PowerShell y, en cada una, ubícate primero en la raíz del repo:
>
> ```powershell
> cd $env:USERPROFILE\micro-servicios-k8s
> ```
>
> (En macOS / Linux: `cd ~/micro-servicios-k8s`.) Repite esto en cada terminal que abras en este paso.

### 2.1 Terminal A — el HPA en vivo

```powershell
kubectl get hpa -w
```

> Qué hace: `kubectl get hpa` lista los autoescaladores. La bandera `-w` ("watch", vigilar) deja el comando ENCENDIDO: cada vez que algo cambia, imprime una línea nueva. Aquí verás subir el % de uso y crecer el número de réplicas. (El HPA lo crearemos en el Paso 4; por ahora puede aparecer vacío. Deja esta terminal abierta.)

### 2.2 Terminal B — los pods y su nodo, en vivo

```powershell
kubectl get pods -o wide -w
```

> Qué hace: lista los pods con columnas extra (`-o wide`, "output wide"), entre ellas **NODE** (el nodo donde corre cada pod) e **IP**. Con `-w` se queda vigilando: verás aparecer pods nuevos cuando el HPA escale y en qué nodo caen.

### 2.3 Terminal C — el consumo de CPU/memoria

`kubectl top` no tiene modo "watch", así que lo repetimos en un bucle:

**Windows (PowerShell):**

```powershell
while ($true) { Clear-Host; kubectl top pods; Start-Sleep -Seconds 3 }
```

> Qué hace: `while ($true) { ... }` repite para siempre lo de adentro. `Clear-Host` limpia la pantalla. `kubectl top pods` muestra el consumo. `Start-Sleep -Seconds 3` espera 3 segundos antes de repetir. Para detenerlo: `Ctrl + C`.

**macOS / Linux:**

```bash
while true; do clear; kubectl top pods; sleep 3; done
```

> Mismo efecto: `clear` limpia la pantalla y `sleep 3` espera 3 segundos.

### 2.4 (Opcional) El uso real que reporta tu propio endpoint /ready

Si hiciste la Actividad 3.2, `orders-service` tiene `/ready`, que reporta su uso real de CPU y memoria. Es otra forma de monitorear con comandos:

```powershell
kubectl exec deploy/orders-service -- python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8003/ready').read())"
```

> Qué hace: `kubectl exec` ejecuta un comando DENTRO de un pod. `deploy/orders-service` elige un pod del deployment. Lo que va después de `--` es el comando que corre dentro: un mini-script de Python que pide `/ready` y muestra la respuesta (algo como `{"ready": true, "cpu_%": 12.5, "memoria_%": 38.4}`).

---

# PASO 3 — Observa la distribución actual de pods entre los nodos

Antes de meter carga, mira cómo están repartidos los pods ahora.

> Terminal: una PowerShell en la raíz del repo. (Puedes usar una nueva, además de las del tablero.)

### 3.1 Mira en qué nodo está cada pod

```powershell
kubectl get pods -o wide
```

> Qué hace: lista los pods con la columna **NODE**. Fíjate en `orders-service`: sus 2 réplicas deberían estar en **nodos distintos** (por ejemplo `ip-10-0-1-23...` y `ip-10-0-2-45...`). Kubernetes reparte por defecto para tener tolerancia a fallos.

### 3.2 Cuenta cuántos pods hay por nodo (vista ordenada)

```powershell
kubectl get pods -o wide --sort-by=.spec.nodeName
```

> Qué hace: el mismo listado, pero ordenado por el nombre del nodo (`--sort-by=.spec.nodeName`). Así ves agrupados los pods de cada nodo y compruebas que no estén todos en la misma máquina.

### 3.3 Mira la "capacidad" y carga de cada nodo

```powershell
kubectl top nodes
kubectl describe nodes
```

> Qué hacen:
> - `kubectl top nodes`: uso real de CPU/memoria por nodo.
> - `kubectl describe nodes`: información detallada de cada nodo; al final de cada uno, la sección **Non-terminated Pods** lista qué pods corren ahí y cuánta CPU/memoria tienen reservada. Es la vista más completa del reparto.

> Si por casualidad las 2 réplicas de `orders-service` están en el MISMO nodo, no te preocupes: en el Paso 6 forzaremos el reparto de forma explícita.

---

# PASO 4 — Crear el HPA sobre orders-service

`orders-service` es el punto de entrada (recibe el tráfico de los usuarios), así que es el que autoescalaremos.

> Terminal: PowerShell en la raíz del repo.

### 4.1 Forma rápida (un comando)

```powershell
kubectl autoscale deployment orders-service --cpu-percent=50 --min=2 --max=6
```

(En macOS / Linux es el mismo comando.)

> Qué hace, bandera por bandera:
> - `kubectl autoscale deployment orders-service`: crea un HPA para el deployment `orders-service`.
> - `--cpu-percent=50`: el objetivo es mantener la CPU promedio en 50% del `request` (es decir, 25m de los 50m solicitados).
> - `--min=2`: nunca menos de 2 pods.
> - `--max=6`: nunca más de 6 pods. Elegimos 6 porque en 2 nodos `t3.small` caben cómodamente; subir más arriesga dejar pods en `Pending`.

Verifícalo:

```powershell
kubectl get hpa
```

> Qué hace: lista los HPA. Salida de ejemplo (sin carga):
>
> ```
> NAME             REFERENCE                   TARGETS    MINPODS   MAXPODS   REPLICAS   AGE
> orders-service   Deployment/orders-service   2%/50%     2         6         2          20s
> ```
>
> `TARGETS` muestra `uso_actual / objetivo`. Si ves `<unknown>/50%`, metrics-server aún no entrega datos: espera 1-2 min o aplica el parche del Paso 1.3.

### 4.2 Forma recomendada (archivo declarativo, `autoscaling/v2`)

En vez del comando, guarda el HPA como archivo para versionarlo y ajustarlo.

> RUTA DEL ARCHIVO: créalo en `orders-service\k8s\hpa.yaml` dentro del repo.
> (Ruta completa en Windows: `C:\Users\TU-USUARIO\micro-servicios-k8s\orders-service\k8s\hpa.yaml`.)
> La forma más fácil: con el repo abierto en VS Code (`code .`), clic derecho sobre la carpeta `orders-service/k8s` → **New File** → nómbralo `hpa.yaml` → pega el contenido.

Contenido de `orders-service/k8s/hpa.yaml`:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: orders-service
spec:
  scaleTargetRef:                 # a QUE deployment se le aplica
    apiVersion: apps/v1
    kind: Deployment
    name: orders-service
  minReplicas: 2                  # nunca menos de 2 pods
  maxReplicas: 6                  # nunca mas de 6 pods
  metrics:
    - type: Resource
      resource:
        name: cpu                 # metrica: CPU
        target:
          type: Utilization
          averageUtilization: 50  # objetivo: 50% del request de CPU
```

Aplícalo (la terminal DEBE estar en la raíz del repo para que la ruta relativa funcione):

```powershell
kubectl apply -f orders-service/k8s/hpa.yaml
```

> Qué hace: `kubectl apply -f orders-service/k8s/hpa.yaml` crea/actualiza el HPA leyendo ESE archivo. La ruta es relativa: si no estás en la raíz del repo, dará "no such file". Por eso insistimos en la ruta de la terminal.

> NOTA sobre `replicas`: cuando un HPA controla un Deployment, el HPA manda sobre el número de réplicas. Para evitar peleas, no fijes `replicas:` en `orders-service/k8s/deployment.yaml` mientras uses HPA.

---

# PASO 5 — Prueba de carga (simular alto tráfico)

Vamos a generar mucho tráfico hacia `orders-service`. Elige UN método (o prueba ambos). Ten abiertas las terminales del tablero (Paso 2) para ver el efecto.

## Método A (recomendado): k6 desde tu máquina (simula usuarios reales)

> Terminal: PowerShell en la raíz del repo. El archivo `load.js` también irá en la raíz del repo.

### 5.A.1 Instala k6

**Windows (PowerShell):**

```powershell
winget install k6 --source winget
```

> Qué hace: `winget` es el instalador de paquetes de Windows. `install k6` baja e instala k6. `--source winget` indica el catálogo oficial. Tras instalar, CIERRA y reabre PowerShell (y vuelve a hacer `cd` a la ruta del repo) para que reconozca el comando `k6`.

**macOS:**

```bash
brew install k6
```

Verifica (en ambos):

```powershell
k6 version
```

> Qué hace: imprime la versión instalada de k6. Si responde, está listo.

### 5.A.2 Asegúrate de tener el LoadBalancer de orders-service

k6 pega a la URL pública del servicio.

```powershell
kubectl get svc orders-service-lb
```

> Qué hace: muestra el Service de tipo LoadBalancer creado en la Actividad 3.1. Mira la columna `EXTERNAL-IP`: debe tener una dirección `...elb.amazonaws.com`.
>
> Si NO existe el servicio, créalo (es el mismo archivo de la Actividad 3.1, que está en la raíz del repo). Desde la raíz del repo:
>
> ```powershell
> kubectl apply -f orders-service-lb.yaml
> ```
>
> Espera 2-5 min a que aparezca el `EXTERNAL-IP`.

Guarda la dirección en una variable de la terminal:

**Windows (PowerShell):**

```powershell
$env:LB_URL = (kubectl get svc orders-service-lb -o jsonpath="{.status.loadBalancer.ingress[0].hostname}")
echo $env:LB_URL
```

> Qué hace: ejecuta `kubectl get svc ...` pidiendo SOLO el nombre DNS del balanceador (`-o jsonpath=...` extrae ese campo del resultado) y lo guarda en la variable `$env:LB_URL`. `echo` la imprime para confirmar.

**macOS / Linux:**

```bash
export LB_URL=$(kubectl get svc orders-service-lb -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "$LB_URL"
```

### 5.A.3 Crea el script de carga

> RUTA DEL ARCHIVO: crea `load.js` en la RAÍZ del repo (`C:\Users\TU-USUARIO\micro-servicios-k8s\load.js`). En VS Code: clic derecho sobre la carpeta raíz `micro-servicios-k8s` → **New File** → `load.js`.

Contenido de `load.js`:

```javascript
import http from "k6/http";

// 50 usuarios virtuales golpeando el servicio durante 5 minutos.
export const options = {
  vus: 50,
  duration: "5m",
};

export default function () {
  // La URL del LoadBalancer se pasa por variable de entorno -e LB=...
  http.get(`http://${__ENV.LB}/health`);
}
```

### 5.A.4 Lanza la carga (desde la raíz del repo, donde está load.js)

**Windows (PowerShell):**

```powershell
k6 run -e LB=$env:LB_URL load.js
```

**macOS / Linux:**

```bash
k6 run -e LB=$LB_URL load.js
```

> Qué hace: `k6 run load.js` ejecuta el script. `-e LB=...` pasa la dirección del LoadBalancer como variable de entorno (la que el script lee con `__ENV.LB`). Como `load.js` está en la carpeta actual, se referencia solo por su nombre. k6 enviará miles de peticiones; déjalo correr y mira el tablero. Para más presión, sube `vus` a 100 y vuelve a ejecutar.

## Método B (sin instalar nada): generador de carga dentro del clúster

Si no quieres instalar k6, genera carga desde dentro del clúster con `busybox`. Como pega por el nombre interno, ni necesitas el LoadBalancer.

> RUTA DEL ARCHIVO: crea `load-generator.yaml` en la RAÍZ del repo.

Contenido de `load-generator.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: load-generator
spec:
  replicas: 3                    # 3 generadores en paralelo (sube este numero para mas carga)
  selector:
    matchLabels:
      app: load-generator
  template:
    metadata:
      labels:
        app: load-generator
    spec:
      containers:
        - name: load
          image: busybox:1.28
          command:
            - /bin/sh
            - -c
            - "while true; do wget -q -O- http://orders-service:8003/health >/dev/null 2>&1; done"
```

Aplícalo (desde la raíz del repo):

```powershell
kubectl apply -f load-generator.yaml
```

> Qué hace: crea el deployment generador. Cada réplica pide `/health` lo más rápido posible (`wget` en un bucle infinito).

Sube o baja la carga a voluntad:

```powershell
kubectl scale deployment/load-generator --replicas=10
```

> Qué hace: `kubectl scale` cambia el número de réplicas. Con `--replicas=10` tienes 10 generadores (más carga). Para frenar: `kubectl scale deployment/load-generator --replicas=0`.

---

# PASO 6 — Observa el escalado y el reparto entre nodos, en vivo

Con la carga corriendo (Paso 5) y el tablero abierto (Paso 2), esto es lo que verás durante 1-3 minutos:

1. **Terminal C (`top pods`):** la CPU de los pods de `orders-service` sube de unos pocos `m` a decenas o cientos de `m`.
2. **Terminal A (`get hpa -w`):** `TARGETS` pasa de `2%/50%` a algo como `300%/50%`, y `REPLICAS` empieza a crecer.

   ```
   NAME             REFERENCE                   TARGETS     MINPODS   MAXPODS   REPLICAS   AGE
   orders-service   Deployment/orders-service   312%/50%    2         6         2          3m
   orders-service   Deployment/orders-service   312%/50%    2         6         4          3m
   orders-service   Deployment/orders-service   180%/50%    2         6         6          4m
   ```

3. **Terminal B (`get pods -o wide -w`):** aparecen pods nuevos de `orders-service` y, en la columna **NODE**, verás que caen en **ambos nodos**, no en uno solo.

Para una foto del reparto en este momento, en una terminal aparte (en la raíz del repo):

```powershell
kubectl get pods -o wide --sort-by=.spec.nodeName
```

> Qué hace: lista los pods ordenados por nodo. Cuenta cuántos pods de `orders-service` hay en cada nodo: deberían estar repartidos (por ejemplo 3 y 3, o 4 y 2).

Y para ver POR QUÉ el HPA tomó sus decisiones:

```powershell
kubectl describe hpa orders-service
```

> Qué hace: muestra el detalle del HPA. Al final, en `Events`, verás líneas como `New size: 4; reason: cpu resource utilization (percentage of request) above target`. Es el HPA explicando su decisión.

> Si algún pod nuevo queda en `Pending`: los 2 nodos `t3.small` se quedaron sin espacio. Baja `maxReplicas`, o aumenta el grupo de nodos a 3 desde la consola (Actividad 3.1, Paso 5) — más nodos = más costo.

---

# PASO 7 — Forzar el reparto de pods entre nodos (topologySpreadConstraints)

Kubernetes reparte "por defecto", pero puedes EXIGIR un reparto parejo. Útil para que, si un nodo se cae, siempre quede al menos una copia en el otro.

> RUTA DEL ARCHIVO: vas a EDITAR el archivo existente `orders-service\k8s\deployment.yaml` (dentro del repo). Ábrelo en VS Code.

### 7.1 Agrega la regla de reparto al deployment

Dentro de `orders-service/k8s/deployment.yaml`, en la sección `spec.template.spec` (el mismo nivel donde está `containers:`), agrega el bloque `topologySpreadConstraints`. Debe quedar así:

```yaml
spec:
  template:
    spec:
      # ---- NUEVO: reparte los pods entre nodos distintos ----
      topologySpreadConstraints:
        - maxSkew: 1                              # diferencia maxima de pods entre nodos
          topologyKey: kubernetes.io/hostname     # "topologia" = por nodo (hostname)
          whenUnsatisfiable: ScheduleAnyway       # si no se puede repartir perfecto, igual lo agenda
          labelSelector:
            matchLabels:
              app: orders-service                 # aplica a los pods de orders-service
      containers:
        - name: orders-service
          # ... (lo que ya existe, no lo borres)
```

> Qué significa cada campo:
> - `maxSkew: 1`: la diferencia de cantidad de pods entre el nodo más lleno y el más vacío no debe pasar de 1 (reparto parejo).
> - `topologyKey: kubernetes.io/hostname`: la "dimensión" del reparto es el nodo (cada nodo tiene una etiqueta `kubernetes.io/hostname`).
> - `whenUnsatisfiable: ScheduleAnyway`: si no se puede cumplir exactamente (por capacidad), Kubernetes igual coloca el pod (no lo deja `Pending`). Es la opción segura para un clúster pequeño.
> - `labelSelector`: a qué pods aplica la regla (los que tienen la etiqueta `app: orders-service`).

### 7.2 Aplica el cambio y observa

Desde la raíz del repo:

```powershell
kubectl apply -f orders-service/k8s/deployment.yaml
```

> Qué hace: vuelve a aplicar el deployment con la nueva regla. Kubernetes recreará los pods respetando el reparto entre nodos.

Espera a que termine el redespliegue y mira:

```powershell
kubectl rollout status deployment/orders-service
kubectl get pods -o wide --sort-by=.spec.nodeName
```

> Qué hacen:
> - `kubectl rollout status deployment/orders-service`: espera y avisa cuando el redespliegue terminó (todos los pods nuevos listos).
> - `kubectl get pods -o wide --sort-by=.spec.nodeName`: confirma que las réplicas de `orders-service` quedaron repartidas entre los 2 nodos.

> Reto rápido: vuelve a lanzar la carga (Paso 5) y verifica que, al escalar a 6 pods, el HPA + la regla de reparto mantienen los pods balanceados (3 y 3) en vez de amontonarlos.

---

# PASO 8 — Detén la carga y observa el scale-in (reducción)

1. Detén la prueba de carga:
   - **k6 (Método A):** termina solo al cumplir la duración, o presiona `Ctrl + C` en su terminal.
   - **Generador interno (Método B):**

     ```powershell
     kubectl scale deployment/load-generator --replicas=0
     ```

     > Qué hace: pone el generador en 0 réplicas, así deja de mandar tráfico (sin borrarlo).

2. Observa la terminal A (`get hpa -w`): la CPU bajará a un valor pequeño (`2%/50%`).

3. **Ten paciencia:** por defecto, el HPA espera **5 minutos** (ventana de estabilización) antes de reducir pods, para no achicar el sistema ante una bajada momentánea. Pasado ese tiempo, `REPLICAS` vuelve de 6 a 2.

> Esto es a propósito: subir conviene hacerlo rápido (para no caerse); bajar, con calma (por si el tráfico vuelve). En el Paso 9 verás cómo cambiar ese tiempo.

---

# PASO 9 — Ajusta el HPA: la función techo y cómo depende de TI

Aquí decides la política de escalado y compruebas que el número de pods sale de una fórmula que TÚ controlas.

> RUTA: editarás `orders-service\k8s\hpa.yaml` y `orders-service\k8s\deployment.yaml`. Tras cada cambio, aplica desde la raíz del repo con `kubectl apply -f <ruta>`.

### 9.1 La fórmula del HPA: la función techo (`ceil`)

El número de pods NO es arbitrario: sale de una fórmula que usa la **función techo** (`ceil`, que redondea SIEMPRE hacia arriba):

```
   pods_deseados = ceil( pods_actuales x ( uso_actual% / objetivo% ) )

   donde:   uso_actual% = ( CPU_real_por_pod / request_de_CPU ) x 100
```

`ceil` redondea hacia arriba: `ceil(4.0)=4`, `ceil(4.1)=5`, `ceil(2.4)=3`. Por eso el HPA prefiere que SOBRE un pod antes que falte. El resultado se recorta al rango `[minReplicas, maxReplicas]`.

En la fórmula entran DOS valores que tú controlas:
- el **`request` de CPU** (en el `deployment.yaml`): es el divisor del uso%. Si lo BAJAS, el uso% sube y salen MÁS pods.
- el **`objetivo%`** (`averageUtilization` del HPA): si lo BAJAS, el cociente sube y salen MÁS pods.

Ejemplo trabajado: 2 pods, cada uno usando 60m de CPU real, `request` 50m, objetivo 50%:

```
   uso_actual% = (60 / 50) x 100 = 120%
   pods_deseados = ceil( 2 x (120 / 50) ) = ceil(4.8) = 5
```

Para no calcularlo a mano, usa esta función techo de ejemplo en Python (la MISMA fórmula del HPA). Córrela desde cualquier terminal:

```powershell
python -c "import math; uso=(60/50)*100; print(max(2, min(6, math.ceil(2*(uso/50)))))"
```

> Qué hace: `python -c "..."` ejecuta el código Python entre comillas. Calcula `uso` (el % de uso), aplica la fórmula con `math.ceil` (la función techo) y recorta el resultado a `[2, 6]`. Imprime `5`. (En macOS / Linux usa `python3` en vez de `python`.)

### 9.2 Experimento A — cambia el `request` y predice con la función techo

Con el MISMO tráfico, el número de pods cambia solo porque cambiaste el `request`. Primero PREDICE (uso real 60m por pod, objetivo 50%, min 2, max 6):

| `request` de CPU | uso% = (60/request)x100 | `ceil(2 x uso%/50)` | recortado a [2,6] |
| --- | --- | --- | --- |
| `100m` | 60% | ceil(2.4) = 3 | **3** |
| `50m` (actual) | 120% | ceil(4.8) = 5 | **5** |
| `25m` | 240% | ceil(9.6) = 10 | **6** (tope) |

> El mismo consumo real (60m) da 3, 5 o 6 pods según el `request` que ELIGES.

Ahora compruébalo: en `orders-service/k8s/deployment.yaml` cambia el `request` (por ejemplo a `100m`):

```yaml
resources:
  requests:
    cpu: "100m"      # antes 50m
  limits:
    cpu: "250m"
```

Aplica (desde la raíz del repo) y repite la prueba de carga (Paso 5) mirando el HPA:

```powershell
kubectl apply -f orders-service/k8s/deployment.yaml
kubectl get hpa -w
```

> Compara los pods reales con tu predicción (debería coincidir dentro de 1 pod). Repite con `25m` y verás que escala mucho más rápido.

### 9.3 Experimento B — cambia el objetivo del HPA y predice

Deja el `request` en `50m` y cambia solo el `averageUtilization` en `orders-service/k8s/hpa.yaml`. Para uso real 60m (uso% = 120%), 2 pods, max 6:

| `objetivo%` | `ceil(2 x 120/objetivo)` | recortado a [2,6] |
| --- | --- | --- |
| `80` | ceil(3.0) = 3 | **3** |
| `50` | ceil(4.8) = 5 | **5** |
| `30` | ceil(8.0) = 8 | **6** (tope) |

Aplica (`kubectl apply -f orders-service/k8s/hpa.yaml`), repite la carga y compara con tu predicción.

> Conclusión: el autoescalado no es magia. El número de pods sale de una fórmula con función techo, y tú controlas dos de sus variables (el `request` y el `objetivo%`). Elegir bien esos valores ES "configurar el HPA según convenga".

### 9.4 Otros ajustes útiles

| Parámetro | Qué hace | Si lo SUBES | Si lo BAJAS |
| --- | --- | --- | --- |
| `averageUtilization` (objetivo CPU %) | Umbral que dispara el escalado | Escala más tarde; menos pods (más barato, más riesgo) | Escala antes; más pods (más holgura, más costo) |
| `minReplicas` | Piso de pods | Más disponibilidad en reposo (más costo) | Menos costo (arranque más lento ante picos) |
| `maxReplicas` | Techo de pods | Aguanta más tráfico (ojo capacidad/costo) | Protege costo y capacidad, pero puede saturarse |

Para acelerar el scale-in (y no esperar 5 min en clase), agrega un bloque `behavior` al `spec` del HPA:

```yaml
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 60   # reduce pods tras 60s de calma (en vez de 300s)
    scaleUp:
      stabilizationWindowSeconds: 0    # sube de inmediato
```

> Qué hace: `behavior` controla la velocidad. `scaleDown.stabilizationWindowSeconds: 60` baja pods tras 60s de calma. `scaleUp.stabilizationWindowSeconds: 0` sube sin esperar.

### 9.5 Reto: encuentra la mejor configuración

Repite la carga cambiando `averageUtilization` (prueba 30, 50 y 80). ¿Con cuál escala antes? ¿Cuántos pods usa? ¿Cuál es el mejor equilibrio entre aguantar el tráfico y no gastar de más en AWS Academy? Justifica tu elección.

---

# 9b. (Opcional) Deja la app como estaba

Si cambiaste el `request` a `100m` o `25m` para los experimentos, vuelve a dejarlo en `50m` en `orders-service/k8s/deployment.yaml` y aplica de nuevo, para que los próximos laboratorios partan igual:

```powershell
kubectl apply -f orders-service/k8s/deployment.yaml
```

---

# 10. Limpieza

> Terminal: PowerShell en la raíz del repo.

1. Detén/borra el generador de carga (si usaste el Método B):

```powershell
kubectl delete -f load-generator.yaml
```

> Qué hace: borra el deployment generador definido en ese archivo.

2. Borra el HPA (si quieres dejar de autoescalar):

```powershell
kubectl delete hpa orders-service
```

3. (Opcional) Si NO seguirás con más laboratorios hoy, limpia el clúster completo como en la **Actividad 3.1, Paso 10** (LoadBalancer, grupo de nodos, clúster, ECR y VPC).

4. `End Lab` en AWS Academy.

> `metrics-server` no cuesta nada extra; puedes dejarlo instalado para los próximos laboratorios.

---

# 11. Problemas comunes y cómo resolverlos

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `kubectl ... : no such file or directory` al hacer `apply` | La terminal no está en la raíz del repo, o la ruta del archivo está mal. | Haz `cd $env:USERPROFILE\micro-servicios-k8s` y verifica con `Get-ChildItem` que ves el archivo. |
| `kubectl top` da `error: Metrics API not available` | metrics-server no instalado o aún arrancando. | Instálalo (Paso 1) y espera 1-2 min. |
| `kubectl top` falla tras 3 min, o HPA en `<unknown>/50%` | metrics-server no valida el TLS del kubelet. | Aplica el parche `--kubelet-insecure-tls` (Paso 1.3) y espera 1 min. |
| HPA muestra `TARGETS: <unknown>` | Falta metrics-server o el deployment no tiene `requests.cpu`. | Verifica metrics-server y el `requests.cpu` (Requisito 2). |
| La carga corre pero el HPA no escala | El uso de CPU no supera el objetivo. | Sube `vus` en k6 (100+) o `replicas` del generador (8-10); o baja `averageUtilization`. |
| Pods nuevos quedan en `Pending` | Los 2 nodos `t3.small` se llenaron. | Baja `maxReplicas`, o agrega un nodo (consola, Actividad 3.1, Paso 5). |
| Las 2 réplicas quedan en el mismo nodo | El scheduler las juntó por capacidad. | Aplica `topologySpreadConstraints` (Paso 7). |
| `k6` no se reconoce como comando | No instalado o PATH sin refrescar. | Reinstala (Paso 5.A.1) y reabre PowerShell (vuelve a hacer `cd` al repo). |
| Tardó "demasiado" en bajar los pods | Ventana de estabilización de 5 min. | Espera, o usa `behavior` (Paso 9.4). |

---

# 12. Checklist de la actividad

- [ ] **Paso 1:** Instalé metrics-server y `kubectl top nodes`/`top pods` muestran datos.
- [ ] **Paso 2:** Tengo el tablero por comandos en varias terminales (todas en la ruta del repo).
- [ ] **Paso 3:** Vi en qué nodo está cada pod con `kubectl get pods -o wide`.
- [ ] **Paso 4:** Creé el HPA sobre `orders-service`.
- [ ] **Paso 5:** Generé carga con k6 o con el generador interno.
- [ ] **Paso 6:** Observé subir el `TARGETS` del HPA, aparecer pods nuevos y repartirse entre los 2 nodos.
- [ ] **Paso 7:** Apliqué `topologySpreadConstraints` y confirmé el reparto parejo entre nodos.
- [ ] **Paso 8:** Detuve la carga y vi el scale-in (tras la ventana de estabilización).
- [ ] **Paso 9:** Usé la función techo (`ceil`) para PREDECIR los pods, cambié el `request` y el objetivo del HPA, verifiqué que coincide, y justifiqué mi elección.

---

# 13. Glosario

| Término | Qué significa |
| --- | --- |
| **Ruta de trabajo** | La carpeta donde se ejecutan los comandos; aquí, la carpeta del repo `micro-servicios-k8s`. |
| **`cd`** | Comando para cambiar de carpeta en la terminal. |
| **Observabilidad** | Entender qué pasa dentro del sistema mirando sus señales (aquí, con comandos). |
| **metrics-server** | Componente que recolecta el uso de CPU/memoria de nodos y pods. |
| **`kubectl top`** | Comando que muestra el consumo real de CPU/memoria de nodos o pods. |
| **Nodo** | Una máquina (instancia EC2) del clúster donde corren los pods. |
| **`-o wide`** | Opción que agrega columnas extra a la salida, entre ellas el NODO de cada pod. |
| **topologySpreadConstraints** | Regla que reparte los pods entre nodos (o zonas) de forma pareja. |
| **`maxSkew`** | Diferencia máxima de pods permitida entre el nodo más lleno y el más vacío. |
| **Prueba de carga** | Enviar muchas peticiones a propósito para simular tráfico y medir el comportamiento. |
| **k6 / VU** | Herramienta de carga; un VU ("usuario virtual") es cada usuario simulado. |
| **HPA** | Horizontal Pod Autoscaler: ajusta el número de pods según una métrica. |
| **`requests` de CPU** | CPU base que pide un pod; el HPA mide el % de uso contra este valor. |
| **`averageUtilization`** | Objetivo de uso (%) que el HPA intenta mantener. |
| **Función techo (`ceil`)** | Redondeo hacia arriba; el HPA la usa para calcular cuántos pods necesita. |
| **Ventana de estabilización** | Tiempo que espera el HPA antes de reducir pods (por defecto 5 min). |
| **`Pending` (pod)** | Pod que no pudo agendarse porque no hay capacidad en los nodos. |

---

> Documento de apoyo docente — ISY1101 Introducción a Herramientas DevOps, Módulo 3, Actividad 3.3 (Monitoreo por comandos, distribución en nodos, pruebas de carga y HPA). Continúa las Actividades 3.1 y 3.2. Comandos verificados contra la documentación oficial de Amazon EKS (metrics-server y HPA), el walkthrough de HPA y las Pod Topology Spread Constraints de Kubernetes, y la documentación de k6. Sin CloudWatch: todo el monitoreo es por línea de comandos. Escrito con Windows (PowerShell) como sistema principal. Adaptado a AWS Academy Learner Lab (metrics-server manual, 2 nodos t3.small, región us-east-1).
