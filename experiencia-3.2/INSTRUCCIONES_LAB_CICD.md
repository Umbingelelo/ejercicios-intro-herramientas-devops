# Laboratorio: CI/CD completo con GitHub Actions (infraestructura desde cero)

### Actividad 3.2 — ISY1101 Introducción a Herramientas DevOps · Módulo 3

> **Repositorio base:** `https://github.com/Umbingelelo/micro-servicios-k8s`
> **Entorno:** AWS Academy — Learner Lab
> **Tiempo estimado:** la PRIMERA ejecución del pipeline tarda ~20-25 min (crea el clúster); las siguientes, ~5 min.
> **Este laboratorio es AUTÓNOMO:** el pipeline crea TODA la infraestructura desde cero (red/VPC, clúster EKS, nodos, ECR), construye y despliega la app, y publica el LoadBalancer. Al terminar, el sistema queda listo para empezar la **Actividad 3.3 (HPA)**.
> **Sistema operativo:** escrito pensando primero en **Windows (PowerShell)**; cada comando local aparece primero para Windows y debajo para macOS / Linux.

---

## 0. Qué vas a hacer en este laboratorio (lee esto primero)

En la Actividad 3.1 creaste todo a mano desde la consola. Aquí harás que **un solo `git push` cree y despliegue TODO automáticamente**: la red, el clúster de Kubernetes, los nodos, los repositorios de imágenes, las imágenes y el balanceador de carga. Eso es **CI/CD** (Integración y Entrega Continuas) aplicado también a la infraestructura.

Al terminar habrás:

1. Tenido tu propia copia del repositorio (fork) con GitHub Actions habilitado.
2. Guardado tus credenciales de AWS Academy como **secrets** de GitHub.
3. Agregado al repo: una plantilla de red (**CloudFormation**), el manifiesto del **LoadBalancer**, y dos **workflows** (uno que crea/despliega todo, otro que destruye todo).
4. Lanzado el **pipeline completo**: con un `git push`, GitHub Actions crea la VPC, el clúster EKS, los nodos, los repos ECR, sube las imágenes, despliega la app y publica el LoadBalancer.
5. **Programado en Python** una ruta `/ready` (readiness) que mide el uso real de recursos.
6. Hecho un **segundo despliegue** automático con tu cambio (esta vez rápido, porque la infraestructura ya existe).
7. Dejado todo **listo para la Actividad 3.3 (HPA)** y aprendido a **destruirlo** con otro workflow para cuidar el presupuesto.

### El pipeline que vas a construir

```
   git push  (a la rama main de TU repo)
       |
       v
 +--------------------- GitHub Actions (servidor en la nube) ---------------------+
 |  INFRAESTRUCTURA (solo la 1a vez tarda; luego se omite si ya existe)            |
 |   1. credenciales AWS        2. red/VPC con CloudFormation                      |
 |   3. crear cluster EKS (~15 min)   4. crear grupo de nodos (~4 min)             |
 |                                                                                 |
 |  APLICACION (en cada push)                                                      |
 |   5. login ECR   6. build + push de 3 imagenes   7. kubectl apply + LoadBalancer|
 +-------------------------------------|-------------------------------------------+
                                       v
   Amazon CloudFormation (red)  +  Amazon EKS (cluster + nodos)  +  Amazon ECR (imagenes)
                                       |
                                       v
                      Aplicacion corriendo + LoadBalancer publico
                      => LISTO para la Actividad 3.3 (HPA)
```

> Sobre la idea de "todo automatizado": la primera vez, el pipeline crea el clúster (eso tarda ~15-20 min y bloquea esa corrida). En los pushes siguientes, detecta que el clúster YA existe y se salta esa parte, así que solo construye y despliega (rápido). Crear infraestructura con código se llama **Infraestructura como Código (IaC)**.

---

## 1. Convenciones: RUTA de trabajo y TERMINALES

> Casi todo este laboratorio ocurre en la web de GitHub y en AWS. Las pocas cosas locales (clonar, crear archivos, `git push`) se hacen en una terminal ubicada en la carpeta del repo.

### 1.1 La carpeta del repositorio (tu ruta de trabajo)

Cuando clones tu fork, tendrás una carpeta `micro-servicios-k8s`. Esa es tu **ruta de trabajo**: todas las terminales locales deben estar dentro de ella y todos los archivos que crees van ahí.

- En **Windows**, si la clonas en tu carpeta de usuario: `C:\Users\TU-USUARIO\micro-servicios-k8s`
- En **macOS / Linux**: `~/micro-servicios-k8s`

### 1.2 Cómo abrir la terminal en la ruta correcta

**Windows (PowerShell):**

```powershell
cd $env:USERPROFILE\micro-servicios-k8s
Get-Location
Get-ChildItem
```

> Qué hacen: `cd` entra a la carpeta (`$env:USERPROFILE` es `C:\Users\TU-USUARIO`). `Get-Location` muestra la carpeta actual (debe terminar en `\micro-servicios-k8s`). `Get-ChildItem` lista los archivos; debes ver `docker-compose.yml` y las carpetas de los servicios.

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

> Qué hace: abre VS Code en la carpeta actual (`.`). Así creas los archivos en la ruta exacta que te indicaremos. Cuando digamos "crea `infra/eks-vpc.yaml`", la ruta es relativa al repo: su ruta completa en Windows sería `C:\Users\TU-USUARIO\micro-servicios-k8s\infra\eks-vpc.yaml`.

---

## 2. Recordatorio de AWS Academy (clave para que funcione)

| Punto | Qué significa aquí |
| --- | --- |
| **Credenciales temporales que rotan** | Caducan al cerrar el lab y cambian en cada **Start Lab**. Debes **actualizar los 3 secrets** de GitHub cada sesión (Paso 2). |
| **OIDC deshabilitado** | No puedes usar el método "sin claves". Por eso guardamos credenciales temporales como secrets. |
| **No puedes crear roles IAM** | Existe el rol pre-creado **`LabRole`**. El pipeline lo usa para el clúster y los nodos (no crea roles nuevos). |
| **Región** | Solo `us-east-1`. El pipeline ya la fija. |
| **Presupuesto** | El clúster, los nodos y el LoadBalancer cuestan por hora. Usa el workflow de destrucción (Paso 8) cuando termines. |
| **La 1a ejecución tarda** | Crear el clúster toma ~15-20 min. Es normal; no canceles. |

---

## 3. Conceptos clave

- **CI/CD:** automatizar construir, probar y desplegar para que un `git push` baste.
- **GitHub Actions:** la automatización vive en archivos `.yml` dentro de `.github/workflows/`.
  - **Workflow:** el archivo que define la automatización. **Job:** grupo de pasos. **Step:** un comando o una *action*. **Runner:** la máquina temporal donde corre. **Secret:** valor cifrado (credenciales).
- **Infraestructura como Código (IaC):** describir la infraestructura en archivos (aquí, una plantilla **CloudFormation** para la red) en vez de crearla a mano.
- **`LabRole`:** rol IAM pre-creado de AWS Academy, con permisos amplios. Lo usamos como rol del clúster y de los nodos.
- **Liveness vs. readiness:** dos chequeos de salud. La *liveness* (`/health`, ya existe): si falla, Kubernetes REINICIA el pod. La *readiness* (`/ready`, la programarás): si falla, lo SACA del tráfico sin reiniciarlo.

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

> Qué hacen: `cd $env:USERPROFILE` te lleva a `C:\Users\TU-USUARIO`. `git clone <url>` descarga tu fork (crea la carpeta `micro-servicios-k8s`). `cd micro-servicios-k8s` entra a ella: esta es tu ruta de trabajo.

**macOS / Linux:**

```bash
cd ~
git clone https://github.com/TU-USUARIO/micro-servicios-k8s.git
cd micro-servicios-k8s
```

---

# PASO 2 — Guardar tus credenciales de AWS como secrets

### 2.1 Copia las credenciales del lab (NAVEGADOR)

1. En AWS Academy, **Start Lab** y espera el círculo verde.
2. **AWS Details → AWS CLI → Show**. Verás `aws_access_key_id`, `aws_secret_access_key` y `aws_session_token`.

### 2.2 Crea los 3 secrets en tu repo (NAVEGADOR)

1. En tu fork: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Crea estos tres (el nombre debe ser EXACTO):

| Name | Value |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | el valor de `aws_access_key_id` |
| `AWS_SECRET_ACCESS_KEY` | el valor de `aws_secret_access_key` |
| `AWS_SESSION_TOKEN` | el valor de `aws_session_token` (cadena larga) |

> LO MÁS IMPORTANTE: estas credenciales caducan. Cada sesión nueva del lab, vuelve aquí y **actualiza los 3 secrets** con los valores nuevos, o el pipeline fallará al hablar con AWS.

---

# PASO 3 — Agregar al repo los archivos que automatizan todo

Vas a crear 4 archivos en tu repo (con VS Code, `code .`). Te indico la ruta EXACTA de cada uno.

### 3.1 La red: `infra/eks-vpc.yaml` (CloudFormation)

> RUTA: crea la carpeta `infra` en la raíz del repo y dentro el archivo `eks-vpc.yaml`.
> Ruta completa en Windows: `C:\Users\TU-USUARIO\micro-servicios-k8s\infra\eks-vpc.yaml`.

Esta plantilla describe una red sencilla y económica para EKS: una VPC con 2 subredes públicas en 2 zonas de disponibilidad, una puerta a Internet (IGW) y las etiquetas que necesita el LoadBalancer. Contenido:

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: Red (VPC publica) para el cluster EKS - lab ISY1101

Resources:
  VPC:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: 10.0.0.0/16
      EnableDnsHostnames: true       # EKS exige DNS en la VPC
      EnableDnsSupport: true
      Tags:
        - { Key: Name, Value: microservicios-vpc }

  IGW:
    Type: AWS::EC2::InternetGateway

  IGWAttach:
    Type: AWS::EC2::VPCGatewayAttachment
    Properties:
      VpcId: !Ref VPC
      InternetGatewayId: !Ref IGW

  PublicRouteTable:
    Type: AWS::EC2::RouteTable
    Properties:
      VpcId: !Ref VPC

  PublicRoute:
    Type: AWS::EC2::Route
    DependsOn: IGWAttach
    Properties:
      RouteTableId: !Ref PublicRouteTable
      DestinationCidrBlock: 0.0.0.0/0   # todo el trafico externo sale por el IGW
      GatewayId: !Ref IGW

  PublicSubnet1:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      CidrBlock: 10.0.1.0/24
      AvailabilityZone: !Select [0, !GetAZs ""]
      MapPublicIpOnLaunch: true        # los nodos reciben IP publica (para bajar imagenes sin NAT)
      Tags:
        - { Key: Name, Value: microservicios-public-1 }
        - { Key: kubernetes.io/role/elb, Value: "1" }   # marca la subred para LoadBalancer

  PublicSubnet2:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      CidrBlock: 10.0.2.0/24
      AvailabilityZone: !Select [1, !GetAZs ""]
      MapPublicIpOnLaunch: true
      Tags:
        - { Key: Name, Value: microservicios-public-2 }
        - { Key: kubernetes.io/role/elb, Value: "1" }

  Subnet1RTAssoc:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      SubnetId: !Ref PublicSubnet1
      RouteTableId: !Ref PublicRouteTable

  Subnet2RTAssoc:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      SubnetId: !Ref PublicSubnet2
      RouteTableId: !Ref PublicRouteTable

Outputs:
  PublicSubnetIds:
    Description: IDs de las subredes publicas, separadas por coma
    Value: !Join [",", [!Ref PublicSubnet1, !Ref PublicSubnet2]]
  VpcId:
    Value: !Ref VPC
```

### 3.2 El LoadBalancer: `orders-service-lb.yaml`

> RUTA: crea este archivo en la RAÍZ del repo (`C:\Users\TU-USUARIO\micro-servicios-k8s\orders-service-lb.yaml`).

Expone `orders-service` a Internet. El pipeline lo aplicará automáticamente. Contenido:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: orders-service-lb
  labels:
    app: orders-service
spec:
  type: LoadBalancer       # pide a AWS un balanceador publico (Classic Load Balancer)
  selector:
    app: orders-service    # apunta a los pods de orders-service
  ports:
    - name: http
      protocol: TCP
      port: 80             # puerto publico
      targetPort: 8003     # puerto del contenedor
```

### 3.3 El pipeline principal: `.github/workflows/deploy.yml`

> RUTA: crea la carpeta `.github/workflows/` en la raíz del repo y dentro `deploy.yml`.
> Ruta completa en Windows: `C:\Users\TU-USUARIO\micro-servicios-k8s\.github\workflows\deploy.yml`.

Este archivo crea TODO. Contenido:

```yaml
name: Crear infraestructura y desplegar (CI/CD completo)

on:
  push:
    branches: [ main ]
  workflow_dispatch:        # tambien se puede lanzar a mano desde la pestana Actions

env:
  AWS_REGION: us-east-1
  CLUSTER_NAME: microservicios-eks
  NODEGROUP_NAME: nodos-microservicios
  VPC_STACK: microservicios-vpc

jobs:
  ci-cd:
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

      - name: 3. Obtener el ARN del rol LabRole
        run: |
          LAB_ROLE_ARN=$(aws iam get-role --role-name LabRole --query 'Role.Arn' --output text)
          echo "LAB_ROLE_ARN=$LAB_ROLE_ARN" >> "$GITHUB_ENV"
          echo "Rol que se usara: $LAB_ROLE_ARN"

      - name: 4. Crear/actualizar la red (VPC) con CloudFormation
        run: |
          aws cloudformation deploy \
            --stack-name "$VPC_STACK" \
            --template-file infra/eks-vpc.yaml \
            --region "$AWS_REGION" \
            --no-fail-on-empty-changeset
          SUBNET_IDS=$(aws cloudformation describe-stacks --stack-name "$VPC_STACK" \
            --query "Stacks[0].Outputs[?OutputKey=='PublicSubnetIds'].OutputValue" \
            --output text --region "$AWS_REGION")
          echo "SUBNET_IDS=$SUBNET_IDS" >> "$GITHUB_ENV"
          echo "Subredes: $SUBNET_IDS"

      - name: 5. Crear el cluster EKS si no existe (la 1a vez tarda 10-15 min)
        run: |
          if aws eks describe-cluster --name "$CLUSTER_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
            echo "El cluster ya existe; se omite la creacion."
          else
            echo "Creando el cluster..."
            aws eks create-cluster --name "$CLUSTER_NAME" --region "$AWS_REGION" \
              --role-arn "$LAB_ROLE_ARN" \
              --resources-vpc-config "subnetIds=$SUBNET_IDS"
          fi
          echo "Esperando a que el cluster este ACTIVE..."
          aws eks wait cluster-active --name "$CLUSTER_NAME" --region "$AWS_REGION"

      - name: 6. Crear el grupo de nodos si no existe (tarda 3-5 min)
        run: |
          if aws eks describe-nodegroup --cluster-name "$CLUSTER_NAME" --nodegroup-name "$NODEGROUP_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
            echo "El grupo de nodos ya existe; se omite la creacion."
          else
            echo "Creando el grupo de nodos..."
            aws eks create-nodegroup --cluster-name "$CLUSTER_NAME" --nodegroup-name "$NODEGROUP_NAME" \
              --region "$AWS_REGION" --node-role "$LAB_ROLE_ARN" \
              --subnets $(echo "$SUBNET_IDS" | tr ',' ' ') \
              --scaling-config minSize=2,maxSize=2,desiredSize=2 \
              --instance-types t3.small
          fi
          echo "Esperando a que los nodos esten ACTIVE..."
          aws eks wait nodegroup-active --cluster-name "$CLUSTER_NAME" --nodegroup-name "$NODEGROUP_NAME" --region "$AWS_REGION"

      - name: 7. Conectar kubectl al cluster
        run: aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION"

      - name: 8. Instalar kubectl en el runner
        run: |
          curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
          chmod +x kubectl
          sudo mv kubectl /usr/local/bin/kubectl

      - name: 9. Login en Amazon ECR
        id: ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: 10. Crear repos ECR, construir y subir las 3 imagenes
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

      - name: 11. Desplegar la app y el LoadBalancer
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

      - name: 12. Esperar a que el despliegue termine
        run: |
          kubectl rollout status deployment/products-service --timeout=240s
          kubectl rollout status deployment/inventory-service --timeout=240s
          kubectl rollout status deployment/orders-service --timeout=240s

      - name: 13. Mostrar el resultado
        run: |
          kubectl get pods -o wide
          echo "URL publica del LoadBalancer (puede tardar 2-3 min en responder):"
          kubectl get svc orders-service-lb -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'; echo
```

Explicación de los pasos clave del workflow:

| Paso | Qué hace |
| --- | --- |
| 2 | Carga las credenciales temporales del lab desde los secrets (incluye `aws-session-token`). |
| 3 | Busca el ARN del rol `LabRole` para usarlo como rol del clúster y de los nodos. |
| 4 | `aws cloudformation deploy` crea (o actualiza) la red descrita en `infra/eks-vpc.yaml`. `--no-fail-on-empty-changeset` evita error si no hay cambios. Luego lee los IDs de subred de los *outputs*. |
| 5 | Si el clúster no existe, lo crea con `aws eks create-cluster` usando `LabRole` y las subredes. `aws eks wait cluster-active` espera (bloquea) hasta que esté listo. |
| 6 | Igual para el grupo de nodos: `create-nodegroup` con `LabRole`, 2 nodos `t3.small`. Espera con `wait nodegroup-active`. |
| 7-8 | Conecta `kubectl` al clúster e instala `kubectl` en el runner. |
| 9-10 | Inicia sesión en ECR, crea los repos si faltan, y construye/sube las 3 imágenes (etiquetadas con el SHA del commit). |
| 11 | Sustituye los marcadores de los manifiestos y aplica los 3 servicios MÁS el LoadBalancer. |
| 12-13 | Espera el rollout y muestra los pods y la URL pública. |

### 3.4 El workflow de destrucción: `.github/workflows/destroy.yml`

> RUTA: en la misma carpeta `.github/workflows/`, crea `destroy.yml`.

Borra TODO en el orden correcto. Solo se ejecuta a mano (no con `push`). Contenido:

```yaml
name: Destruir toda la infraestructura

on:
  workflow_dispatch:        # SOLO manual, desde la pestana Actions

env:
  AWS_REGION: us-east-1
  CLUSTER_NAME: microservicios-eks
  NODEGROUP_NAME: nodos-microservicios
  VPC_STACK: microservicios-vpc

jobs:
  destroy:
    runs-on: ubuntu-latest
    steps:
      - name: Configurar credenciales de AWS
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-session-token: ${{ secrets.AWS_SESSION_TOKEN }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Instalar kubectl
        run: |
          curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
          chmod +x kubectl && sudo mv kubectl /usr/local/bin/kubectl

      - name: 1. Borrar el LoadBalancer (libera el ELB) si el cluster existe
        run: |
          if aws eks describe-cluster --name "$CLUSTER_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
            aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION"
            kubectl delete svc orders-service-lb --ignore-not-found
            echo "Esperando 30s a que AWS elimine el balanceador..."
            sleep 30
          fi

      - name: 2. Borrar el grupo de nodos
        run: |
          if aws eks describe-nodegroup --cluster-name "$CLUSTER_NAME" --nodegroup-name "$NODEGROUP_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
            aws eks delete-nodegroup --cluster-name "$CLUSTER_NAME" --nodegroup-name "$NODEGROUP_NAME" --region "$AWS_REGION"
            aws eks wait nodegroup-deleted --cluster-name "$CLUSTER_NAME" --nodegroup-name "$NODEGROUP_NAME" --region "$AWS_REGION"
          fi

      - name: 3. Borrar el cluster
        run: |
          if aws eks describe-cluster --name "$CLUSTER_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
            aws eks delete-cluster --name "$CLUSTER_NAME" --region "$AWS_REGION"
            aws eks wait cluster-deleted --name "$CLUSTER_NAME" --region "$AWS_REGION"
          fi

      - name: 4. Borrar la red (CloudFormation)
        run: |
          aws cloudformation delete-stack --stack-name "$VPC_STACK" --region "$AWS_REGION"
          aws cloudformation wait stack-delete-complete --stack-name "$VPC_STACK" --region "$AWS_REGION"

      - name: 5. Borrar los repositorios de ECR
        run: |
          for svc in products-service inventory-service orders-service; do
            aws ecr delete-repository --repository-name "$svc" --region "$AWS_REGION" --force || true
          done
```

> Por qué este orden: primero el LoadBalancer (para liberar el balanceador de AWS), luego los nodos, luego el clúster, luego la red (la VPC no se puede borrar si quedan recursos dentro), y por último los repos de ECR.

---

# PASO 4 — Primer despliegue: crea y despliega TODO

### 4.1 Sube los archivos a GitHub (TERMINAL, en la raíz del repo)

```powershell
git add .
git commit -m "Pipeline CI/CD completo: infra desde cero + despliegue"
git push origin main
```

> Qué hacen: `git add .` marca todos los archivos nuevos. `git commit -m "..."` los registra con un mensaje. `git push origin main` los sube a la rama `main` de tu fork, lo que DISPARA el workflow `deploy.yml`. (En macOS / Linux son los mismos comandos.)

### 4.2 Mira la ejecución (NAVEGADOR)

1. En tu repo, pestaña **Actions** → abre la ejecución "Crear infraestructura y desplegar".
2. Despliega cada paso para ver sus logs en vivo.
3. **Ten paciencia:** el paso 5 (crear el clúster) puede tardar 15-20 min con el mensaje "Esperando a que el cluster este ACTIVE". Es normal; no canceles.

> Si prefieres no hacer un commit para volver a ejecutarlo, usa el botón **Run workflow** (gracias a `workflow_dispatch`).

### 4.3 Verifica el resultado

Cuando el workflow termine en verde, el último paso (13) imprime la URL del LoadBalancer. Pruébala (espera 2-3 min a que el balanceador responda):

**Windows (PowerShell):**

```powershell
curl.exe http://PEGA-AQUI-LA-URL-DEL-LOADBALANCER/health
```

**macOS / Linux:**

```bash
curl http://PEGA-AQUI-LA-URL-DEL-LOADBALANCER/health
```

> Qué hace: pide el endpoint `/health` del servicio a través del balanceador público. Debe responder `{"status":"ok","service":"orders-service"}`. (En PowerShell usa `curl.exe`, no `curl`, porque `curl` es un alias distinto.)

---

# PASO 5 — Programar la ruta de readiness (/ready) en Python

Ahora la parte de programación. La *liveness* (`/health`) ya existe; tú crearás la *readiness* (`/ready`), que medirá el **uso real de recursos** con la librería `psutil`.

### 5.1 Parte A — observa los ejemplos YA RESUELTOS (products e inventory)

> RUTA: abre `products-service/app/main.py` e `inventory-service/app/main.py` en VS Code.

En esos dos servicios, `/ready` ya viene hecho. Arriba del archivo está `import psutil`, y junto al `/health` existe:

```python
@app.get("/ready")
def ready():
    """
    Readiness: el servicio esta listo solo si NO esta saturado de memoria.
    psutil.virtual_memory().percent devuelve el % de memoria usada (uso real).
    """
    memoria_usada = psutil.virtual_memory().percent     # ej: 41.7
    if memoria_usada > 90:                              # umbral: 90%
        raise HTTPException(status_code=503, detail={"ready": False, "memoria_%": memoria_usada})
    return {"ready": True, "memoria_%": memoria_usada, "service": "products-service"}
```

> Un *endpoint* es una ruta (`@app.get("/ready")`) más su función (el "controlador"). Si devuelves un diccionario, FastAPI lo convierte a JSON. `products` e `inventory` ya tienen `psutil` en su `requirements.txt`.

### 5.2 Parte B — TU TAREA: programa /ready en orders-service

> RUTA: editarás `orders-service/requirements.txt` y `orders-service/app/main.py`.

`orders-service` es el orquestador, así que su readiness reporta CPU y memoria, con un umbral configurable por variable de entorno.

**Lo que debes hacer:**

1. En `orders-service/requirements.txt`, agrega una línea nueva: `psutil`.
2. En `orders-service/app/main.py`, agrega `import psutil` arriba (junto a los otros `import`).
3. Crea la ruta `GET /ready` que: lea CPU con `psutil.cpu_percent(interval=0.1)`, lea memoria con `psutil.virtual_memory().percent`, tome el umbral de la variable de entorno `READY_MAX_MEM_PERCENT` (por defecto `90`), devuelva `{"ready": true, ...}` si la memoria está por debajo del umbral, o lance `HTTPException` 503 si lo supera.

**Pistas:** `orders-service` ya importa `FastAPI`, `HTTPException` y `os`. Para leer la variable: `os.getenv("READY_MAX_MEM_PERCENT", "90")` (conviértela con `float(...)`).

<details>
<summary>Solución de referencia (ábrela solo para comparar)</summary>

En `orders-service/requirements.txt`, una línea nueva: `psutil`

En `orders-service/app/main.py`:

```python
import psutil

# Umbral de memoria configurable por variable de entorno (texto -> numero).
READY_MAX_MEM_PERCENT = float(os.getenv("READY_MAX_MEM_PERCENT", "90"))


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

### 5.3 Conecta tu /ready con Kubernetes

> RUTA: edita los 3 archivos `*/k8s/deployment.yaml`.

En cada uno, cambia SOLO la `readinessProbe` de `/health` a `/ready` (deja la `livenessProbe` en `/health`):

```yaml
          readinessProbe:
            httpGet:
              path: /ready          # antes /health
              port: 8001            # (8001 products, 8002 inventory, 8003 orders)
```

---

# PASO 6 — Segundo despliegue (con tu cambio)

Aquí ves el valor del CI/CD: tu cambio llega a la nube con un `git push`, y esta vez es RÁPIDO porque la infraestructura ya existe (el workflow detecta que el clúster y los nodos ya están y se salta su creación).

### 6.1 Sube los cambios (TERMINAL, en la raíz del repo)

```powershell
git add .
git commit -m "Agrega readiness /ready (uso real de recursos)"
git push origin main
```

> Recuerda: si entraste en una sesión nueva del lab, primero actualiza los 3 secrets (Paso 2).

### 6.2 Verifica (NAVEGADOR / TERMINAL)

1. Pestaña **Actions**: la nueva ejecución termina en verde en pocos minutos.
2. Conecta `kubectl` en tu máquina (si quieres verificar localmente) y prueba:

**Windows (PowerShell):**

```powershell
aws eks update-kubeconfig --name microservicios-eks --region us-east-1
kubectl get pods
```

> Qué hacen: el primer comando apunta `kubectl` a tu clúster; el segundo lista los pods (deben estar `Running`, ahora con tu código nuevo).

---

# PASO 7 — Verifica que quedó LISTO para la Actividad 3.3 (HPA)

La Actividad 3.3 necesita: clúster activo, nodos `Ready`, la app desplegada con `requests` de CPU, y el LoadBalancer. Compruébalo (PowerShell, conectado al clúster):

```powershell
kubectl get nodes
kubectl get deployments
kubectl get svc orders-service-lb
```

> Qué verifican:
> - `kubectl get nodes`: 2 nodos en `Ready`.
> - `kubectl get deployments`: `products-service`, `inventory-service`, `orders-service` con sus réplicas listas.
> - `kubectl get svc orders-service-lb`: el LoadBalancer con su `EXTERNAL-IP`.
>
> Si los tres responden bien, ya puedes empezar la Actividad 3.3 (Monitoreo + HPA) directamente sobre este clúster: solo te faltará instalar metrics-server (Paso 1 de la 3.3).

---

# PASO 8 — Destruir todo al terminar (cuida el presupuesto)

Cuando NO sigas trabajando (o termines la 3.3), destruye la infraestructura:

1. En tu repo, pestaña **Actions** → workflow **Destruir toda la infraestructura** → botón **Run workflow**.
2. Espera a que termine (borra LoadBalancer, nodos, clúster, red y ECR en orden).
3. En AWS Academy, **End Lab**.

> Si vas a hacer la Actividad 3.3 ahora mismo, NO destruyas todavía: hazlo al terminar la 3.3.

---

# 9. Problemas comunes y cómo resolverlos

| Síntoma (en el log de Actions) | Causa probable | Solución |
| --- | --- | --- |
| `ExpiredToken` / `InvalidClientTokenId` | Los secrets tienen credenciales caducadas. | Actualiza los 3 secrets (Paso 2) y vuelve a ejecutar. |
| El paso "Crear cluster" tarda muchísimo | Normal: crear EKS toma 15-20 min. | Espera; no canceles. Los pushes siguientes serán rápidos. |
| `An error occurred (AccessDenied) ... assume role` o falla al crear cluster/nodos | El rol `LabRole` no es asumible por EKS/EC2 en tu permiso de lab. | Confirma con tu docente que el lab permite EKS con `LabRole` (igual que en la consola de la 3.1). |
| `Unauthorized` al hacer `kubectl` | El clúster lo creó otra identidad. | Aquí no debería pasar (el mismo workflow crea y usa). Si ocurre localmente, usa los secrets del MISMO lab que creó el clúster. |
| Pods en `ImagePullBackOff` | Falló el push, o los nodos no tienen salida a Internet. | Revisa el paso 10; confirma que las subredes son públicas con IP automática (la plantilla ya lo hace). |
| `EXTERNAL-IP` del LoadBalancer en `<pending>` | El balanceador tarda, o faltan las etiquetas de subred. | Espera 5 min; la plantilla ya pone `kubernetes.io/role/elb=1`. |
| `No changes to deploy` en CloudFormation | La red ya existe (no es error). | Ignóralo; el pipeline sigue. |
| El workflow no arranca tras el push | Actions no habilitado en el fork, o ruta del archivo mal. | Habilita Actions (Paso 1.2) y revisa que esté en `.github/workflows/deploy.yml`. |
| Error "Invalid workflow file" | YAML mal indentado. | Copia los bloques tal cual; usa espacios, no tabuladores. |

---

# 10. Checklist de la actividad

- [ ] **Paso 1:** Fork con Actions habilitado y clonado localmente.
- [ ] **Paso 2:** Creé los 3 secrets de AWS.
- [ ] **Paso 3:** Creé `infra/eks-vpc.yaml`, `orders-service-lb.yaml`, `.github/workflows/deploy.yml` y `.github/workflows/destroy.yml`.
- [ ] **Paso 4:** El primer push creó la red, el clúster, los nodos, los repos, las imágenes y el LoadBalancer; `curl` a la URL responde.
- [ ] **Paso 5:** Programé `/ready` en `orders-service` (uso real de CPU/memoria), agregué `psutil` y cambié la `readinessProbe`.
- [ ] **Paso 6:** El segundo push redesplegó automáticamente (rápido).
- [ ] **Paso 7:** Verifiqué nodos `Ready`, deployments y LoadBalancer: listo para la Actividad 3.3.
- [ ] **Paso 8:** Sé cómo destruir todo con el workflow `destroy` cuando termine.

---

# 11. Glosario

| Término | Qué significa |
| --- | --- |
| **CI/CD** | Automatizar build, prueba y despliegue para que baste un `git push`. |
| **GitHub Actions / workflow / job / step / runner** | Sistema de automatización de GitHub; el workflow (`.yml`) define jobs con steps que corren en un runner. |
| **Secret** | Valor sensible cifrado en el repo (credenciales). Nunca va en el código. |
| **Infraestructura como Código (IaC)** | Describir la infraestructura en archivos (aquí, CloudFormation) en vez de crearla a mano. |
| **CloudFormation** | Servicio de AWS que crea recursos a partir de una plantilla `.yaml`. |
| **VPC / subred / IGW** | La red privada, sus porciones por zona, y la puerta a Internet. |
| **`LabRole`** | Rol IAM pre-creado de AWS Academy; lo usamos para el clúster y los nodos. |
| **`aws eks wait`** | Comando que espera (bloquea) hasta que un recurso llegue a un estado (active/deleted). |
| **SHA del commit** | Identificador único de un cambio; lo usamos como etiqueta de imagen. |
| **Liveness (`/health`) / Readiness (`/ready`)** | Sondas de salud: liveness reinicia el pod si falla; readiness lo saca del tráfico sin reiniciarlo. |
| **psutil** | Librería de Python que lee el uso real de CPU y memoria. |

---

> Documento de apoyo docente — ISY1101 Introducción a Herramientas DevOps, Módulo 3, Actividad 3.2 (CI/CD completo con GitHub Actions, infraestructura desde cero). Workflows y plantilla verificados contra la documentación de `aws-actions/configure-aws-credentials@v4`, `aws-actions/amazon-ecr-login@v2`, AWS CLI (`eks create-cluster` / `create-nodegroup` / waiters) y CloudFormation. Adaptado a AWS Academy Learner Lab (credenciales temporales en secrets, OIDC deshabilitado, rol `LabRole`, región us-east-1). El resultado deja el clúster, los nodos, la app y el LoadBalancer listos para la Actividad 3.3 (HPA).
