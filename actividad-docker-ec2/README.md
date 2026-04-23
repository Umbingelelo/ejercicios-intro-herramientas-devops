# Experiencia 3 – Despliegue de Contenedores en AWS EC2

> **Asignatura:** Introduccion a Herramientas DevOps
> **Unidad:** 2.3 – Contenedores en la Nube
> **Duracion estimada:** 2 horas
> **Modalidad:** Trabajo autonomo con acceso a AWS Academy / Learner Lab
> **Prerequisito:** haber completado la **Experiencia 2** (Docker en local)
> **Sistema de referencia:** Amazon Linux 2023 en EC2 (los pasos para Ubuntu se indican cuando difieren)

---

## Tabla de contenidos

1. [Objetivos de aprendizaje](#-objetivos-de-aprendizaje)
2. [Que desplegaremos?](#-que-desplegaremos)
3. [Conceptos clave antes de empezar](#-conceptos-clave-antes-de-empezar)
4. [Planificacion de las 2 horas](#-planificacion-de-las-2-horas)
5. [Parte 1 – Repaso y preparacion local](#-parte-1--repaso-y-preparacion-local-20-min)
6. [Parte 2 – Crear la instancia EC2 en AWS](#-parte-2--crear-la-instancia-ec2-en-aws-25-min)
7. [Parte 3 – Conectarse a EC2 por SSH](#-parte-3--conectarse-a-ec2-por-ssh-10-min)
8. [Parte 4 – Instalar Docker en EC2](#-parte-4--instalar-docker-en-ec2-15-min)
9. [Parte 5 – Clonar el proyecto y configurarlo](#-parte-5--clonar-el-proyecto-y-configurarlo-15-min)
10. [Parte 6 – Levantar el stack con Docker Compose](#-parte-6--levantar-el-stack-con-docker-compose-15-min)
11. [Parte 7 – Probar la aplicacion desde internet](#-parte-7--probar-la-aplicacion-desde-internet-10-min)
12. [Cuestionario de autoevaluacion](#-cuestionario-de-autoevaluacion)
13. [Reto opcional – Arquitectura 3 capas](#-reto-opcional--arquitectura-3-capas)
14. [Solucion de problemas](#-solucion-de-problemas)
15. [Entregables y rubrica](#-entregables-y-rubrica)
16. [Limpieza final (obligatoria)](#-limpieza-final-obligatoria)
17. [Glosario](#-glosario)

---

## Objetivos de aprendizaje

Al terminar esta experiencia el estudiante sera capaz de:

- Lanzar y configurar una instancia **Amazon EC2** desde la consola de AWS.
- Configurar **Security Groups** aplicando el principio de minimo privilegio.
- Conectarse a una instancia remota via **SSH** desde Windows, macOS o Linux.
- Instalar y habilitar **Docker** en Amazon Linux 2023 / Ubuntu.
- Transferir un proyecto al servidor remoto mediante **Git clone**.
- Desplegar un stack multi-contenedor con **Docker Compose** en la nube.
- **Verificar** que la aplicacion es accesible desde internet usando la IP publica de EC2.
- Identificar las diferencias entre ejecutar contenedores en **local vs. en la nube**.

---

## Que desplegaremos?

La misma aplicacion de **gestion de tareas** de la Experiencia 2 (backend Node.js + frontend Angular), pero ahora corriendo en una **instancia EC2 de AWS**, accesible desde internet.

```
INTERNET
    |
    v  HTTP :4200 y :3000
+-------------------+
|   EC2 (tu servidor)|
|                   |
|  +-------------+  |
|  | tareas-     |  |
|  | frontend    |  |  <-- Angular, puerto 4200
|  | :4200       |  |
|  +------+------+  |
|         | red-devops (Docker bridge)
|  +------v------+  |
|  | tareas-     |  |
|  | backend     |  |  <-- Node.js/Express, puerto 3000
|  | :3000       |  |
|  +------+------+  |
|         |          |
|  +------v------+  |
|  | volumen:    |  |
|  | datos-tareas|  |  <-- datos.json persistente
|  +-------------+  |
+-------------------+
```

> **Diferencia clave respecto a la Experiencia 2:** en local accedias con
> `http://localhost:XXXX`. En EC2 accedes con `http://<IP-PUBLICA-EC2>:XXXX`.
> El codigo y los Dockerfiles son exactamente los mismos.

---

## Conceptos clave antes de empezar

| Concepto | Idea central | Donde aparece en esta experiencia |
|---|---|---|
| **EC2 (Elastic Compute Cloud)** | Servidor virtual en la nube de AWS | Donde corren los contenedores |
| **AMI (Amazon Machine Image)** | Plantilla del SO del servidor | Amazon Linux 2023 que elegiremos |
| **Key Pair (.pem)** | Certificado para autenticar la conexion SSH | Lo creamos en AWS y lo usamos en la terminal |
| **Security Group** | Firewall virtual de la instancia EC2 | Abriremos puertos 22, 3000 y 4200 |
| **IP Publica** | Direccion de internet asignada a tu EC2 | La usaras en el navegador para ver la app |
| **SSH** | Protocolo de conexion remota segura | `ssh -i clave.pem ec2-user@IP` |
| **docker compose up** | Levanta todos los servicios del YAML | El mismo comando que usaste en local |

> **Repaso rapido:** en la Experiencia 2 construiste imagenes y las corriste en
> tu laptop. Ahora haces exactamente lo mismo pero en un servidor Linux remoto.
> Docker no sabe ni le importa si esta en tu maquina o en la nube.

---

## Planificacion de las 2 horas

| Parte | Duracion | Actividad |
|---|---|---|
| 1 | 20 min | Repaso conceptual + verificar fork del repositorio |
| 2 | 25 min | Crear instancia EC2 y configurar Security Group |
| 3 | 10 min | Conectarse a EC2 por SSH |
| 4 | 15 min | Instalar Docker en EC2 |
| 5 | 15 min | Clonar el proyecto y configurar .env |
| 6 | 15 min | Levantar el stack con docker compose |
| 7 | 10 min | Probar desde el navegador y tomar evidencias |
| Cierre | 10 min | Cuestionario de autoevaluacion + limpieza |
| **Total** | **120 min** | |

---

# Parte 1 – Repaso y preparacion local (20 min)

## Paso 1.1 – Repaso conceptual (10 min)

Antes de tocar AWS, responde mentalmente estas preguntas. Las mismas
aparecen en el cuestionario final.

> **Pregunta A:** Si tu `docker-compose.yml` funciona en Windows, ¿funcionara
> en un servidor Linux sin cambios? ¿Por que?
>
> **Pregunta B:** ¿Que diferencia hay entre `-p 3000:3000` en `docker run`
> local y en una instancia EC2?
>
> **Pregunta C:** ¿Por que un Security Group es importante para la seguridad?
> ¿Que pasaria si dejas todos los puertos abiertos al mundo?

---

## Paso 1.2 – Verificar que tienes un fork del repositorio (10 min)

Esta experiencia asume que ya tienes un **fork** del repositorio de la
Experiencia 2 en tu cuenta de GitHub. Si no lo hiciste, hazlo ahora:

1. Ve a la URL del repositorio original (indicada por el profesor).
2. Haz clic en **Fork** (esquina superior derecha de GitHub).
3. Asegurate de que tu fork contiene la carpeta `experiencia2-docker/actividad-docker/`.

Verifica que tu fork tenga el archivo `docker-compose.yml`:

```
https://github.com/<TU-USUARIO>/<NOMBRE-REPO>/blob/main/experiencia2-docker/actividad-docker/docker-compose.yml
```

> **Si no hiciste la Experiencia 2:** pide al profesor la URL del repositorio
> base y haz el fork desde ahi. Tendras todos los archivos necesarios.

**Copia la URL HTTPS de tu fork**, la necesitaras en el Paso 5.1:

```
https://github.com/<TU-USUARIO>/<NOMBRE-REPO>.git
```

---

# Parte 2 – Crear la instancia EC2 en AWS (25 min)

> Abre la **Consola de AWS** en tu navegador. Si usas AWS Academy, inicia tu
> Learner Lab y haz clic en **AWS** para abrir la consola.

## Paso 2.1 – Ir al servicio EC2

1. En la barra de busqueda superior escribe **EC2** y haz clic en el servicio.
2. Asegurate de estar en la region **us-east-1 (N. Virginia)** o la que
   indique tu profesor (esquina superior derecha de la consola).
3. Haz clic en **Launch instance** (boton naranja).

---

## Paso 2.2 – Configurar la instancia

Completa cada campo del wizard de lanzamiento:

### Nombre
Escribe un nombre descriptivo para identificar tu instancia:
```
devops-tareas-<TU-NOMBRE>
```
Ejemplo: `devops-tareas-juan-perez`

### AMI (Sistema Operativo)
- Selecciona **Amazon Linux 2023 AMI** (aparece por defecto, marcada como
  "Free tier eligible").
- Arquitectura: **64-bit (x86)**.

> **¿Por que Amazon Linux 2023?** Es la distribucion oficial de AWS,
> optimizada para EC2, con `yum`/`dnf` como gestor de paquetes y soporte
> oficial de Docker.

### Tipo de instancia
- Selecciona **t2.micro** (1 vCPU, 1 GB RAM) – esta dentro del Free Tier.

> **Aviso:** t2.micro tiene 1 GB de RAM. El frontend Angular (`ng serve`)
> consume bastante al compilar. Si el proceso muere, es normal; el Paso 4
> incluye una solucion con swap.

### Key Pair (par de claves SSH)

> **Esta es la clave para conectarte al servidor. Si la pierdes, no podras
> entrar.**

- Haz clic en **Create new key pair**.
- Nombre: `devops-key-<TU-NOMBRE>` (ejemplo: `devops-key-juan`)
- Tipo: **RSA**
- Formato:
  - **Windows:** `.ppk` si usas PuTTY, o **`.pem`** si usas Git Bash / PowerShell
  - **macOS / Linux:** `.pem`
- Haz clic en **Create key pair** → el archivo se descarga automaticamente.

**Guarda el archivo `.pem` en un lugar seguro**, por ejemplo en tu carpeta
de usuario: `C:\Users\TuNombre\` (Windows) o `~/` (macOS/Linux).

### Network settings (Configuracion de red)

Haz clic en **Edit** para expandir las opciones:

- **VPC:** deja la VPC por defecto.
- **Subnet:** cualquiera (deja la seleccionada).
- **Auto-assign public IP:** **Enable** (necesario para acceder desde internet).

**Security Group:** Selecciona **Create security group** y configura asi:

| Tipo | Protocolo | Puerto | Origen | Descripcion |
|---|---|---|---|---|
| SSH | TCP | 22 | My IP | Acceso SSH solo desde tu IP |
| Custom TCP | TCP | 3000 | 0.0.0.0/0 | API backend (Node.js) |
| Custom TCP | TCP | 4200 | 0.0.0.0/0 | Frontend Angular |

> **Concepto DevOps – Principio de minimo privilegio:**
> El puerto SSH (22) lo restringimos a **tu IP** para que nadie mas pueda
> intentar conectarse por fuerza bruta. Los puertos de la aplicacion (3000,
> 4200) se abren al mundo porque son los que los usuarios finales necesitan.

Nombre del security group: `sg-devops-tareas`

### Configure storage (Almacenamiento)

- Deja el valor por defecto: **8 GiB gp3**.
- Es suficiente para esta actividad.

### Summary y lanzamiento

Revisa el resumen a la derecha:
- AMI: Amazon Linux 2023
- Instance type: t2.micro
- Key pair: el que creaste
- Security group: sg-devops-tareas

Haz clic en **Launch instance**. AWS tardara 1-2 minutos en iniciar la VM.

---

## Paso 2.3 – Obtener la IP publica

1. En el panel de EC2, ve a **Instances** (menu izquierdo).
2. Espera a que el **Instance state** diga **Running** y el **Status check**
   diga **2/2 checks passed** (puede tardar 1-2 minutos).
3. Haz clic en tu instancia y copia la **Public IPv4 address**.

```
Ejemplo: 54.234.12.88
```

> **Importante:** la IP publica cambia cada vez que detienes y reinicias la
> instancia. Para esta experiencia no es problema, pero en produccion real
> se usa una **Elastic IP** (IP fija) o un nombre de dominio.

---

# Parte 3 – Conectarse a EC2 por SSH (10 min)

## Paso 3.1 – Preparar la clave .pem

Antes de conectarte debes proteger el archivo `.pem`. SSH rechaza claves con
permisos demasiado abiertos.

**Git Bash / macOS / Linux:**

```bash
# Mueve la clave a tu carpeta home (si no esta ahi)
# Ajusta la ruta al lugar donde descargaste el .pem
chmod 400 ~/devops-key-<TU-NOMBRE>.pem
```

**PowerShell (Windows):**

```powershell
# Ajusta la ruta real de tu archivo .pem
icacls "C:\Users\TuNombre\devops-key-TuNombre.pem" /inheritance:r /grant:r "$($env:USERNAME):(R)"
```

> **¿Que hace `chmod 400`?** Le dice al sistema que solo el dueno del archivo
> puede leerlo, y nadie puede escribir ni ejecutarlo. SSH exige esto por
> seguridad.

---

## Paso 3.2 – Conectarse por SSH

**Git Bash / macOS / Linux:**

```bash
ssh -i ~/devops-key-<TU-NOMBRE>.pem ec2-user@<IP-PUBLICA-EC2>
```

Ejemplo:

```bash
ssh -i ~/devops-key-juan.pem ec2-user@54.234.12.88
```

**PowerShell (Windows 10/11):**

```powershell
ssh -i "C:\Users\TuNombre\devops-key-TuNombre.pem" ec2-user@<IP-PUBLICA-EC2>
```

La primera vez veras un mensaje como:

```
The authenticity of host '54.234.12.88 (54.234.12.88)' can't be established.
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

Escribe `yes` y presiona Enter.

Si la conexion es exitosa veras el prompt de Amazon Linux:

```
   ,     #_
   ~\_  ####_        Amazon Linux 2023
  ~~  \_#####\
  ~~     \###|       https://aws.amazon.com/linux/amazon-linux-2023
  ~~       \#/ ___
   ~~       V~' '->
    ~~~         /
      ~~._.   _/
         _/ _/
       _/m/'

[ec2-user@ip-172-31-XX-XX ~]$
```

> **Checkpoint 3:** ves el prompt de Amazon Linux? Perfecto, estas dentro
> de tu servidor en la nube.

---

# Parte 4 – Instalar Docker en EC2 (15 min)

> Todos los comandos siguientes se ejecutan **dentro de la sesion SSH**
> (en el servidor EC2), no en tu computador local.

## Paso 4.1 – Actualizar el sistema

```bash
sudo dnf update -y
```

> `dnf` es el gestor de paquetes de Amazon Linux 2023 (sucesor de `yum`).
> El flag `-y` responde "si" a todas las confirmaciones automaticamente.

---

## Paso 4.2 – Instalar Docker

```bash
sudo dnf install docker -y
```

Verifica la instalacion:

```bash
docker --version
```

Deberia mostrar algo como: `Docker version 25.x.x, build ...`

---

## Paso 4.3 – Iniciar Docker y habilitarlo al arranque

```bash
sudo systemctl start docker
sudo systemctl enable docker
sudo systemctl status docker
```

La salida de `status` debe mostrar **active (running)** en verde.

> **Concepto DevOps – `systemctl enable`:** este comando hace que Docker
> arranque automaticamente si la instancia EC2 se reinicia. Sin esto,
> despues de cada reinicio tendrias que iniciar Docker manualmente.

---

## Paso 4.4 – Agregar tu usuario al grupo docker

Por defecto, los comandos Docker requieren `sudo`. Para no escribirlo en
cada comando, agrega tu usuario al grupo `docker`:

```bash
sudo usermod -aG docker ec2-user
```

Cierra la sesion SSH y vuelve a entrar para que el cambio tome efecto:

```bash
exit
```

Vuelve a conectarte con el mismo comando SSH del Paso 3.2. Luego verifica:

```bash
docker ps
```

Si responde sin error (lista vacia `[]`), ya no necesitas `sudo`.

---

## Paso 4.5 – Instalar Docker Compose plugin

Amazon Linux 2023 no incluye Docker Compose por defecto. Instalalo con:

```bash
sudo dnf install docker-compose-plugin -y
```

Verifica:

```bash
docker compose version
```

Deberia mostrar: `Docker Compose version v2.x.x`

---

## Paso 4.6 – Agregar swap (memoria virtual)

t2.micro tiene solo 1 GB de RAM. `ng serve` (frontend Angular) puede
necesitar mas durante el build. Creamos 1 GB de swap como seguro:

```bash
sudo dd if=/dev/zero of=/swapfile bs=128M count=8
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

Verifica:

```bash
free -h
```

Deberia mostrar ~1 GB en la fila `Swap`.

> **Que es swap?** Es espacio en disco que el sistema operativo usa como
> memoria RAM adicional cuando la RAM fisica se agota. Es mas lento que RAM
> real pero evita que los procesos mueran por falta de memoria.

---

# Parte 5 – Clonar el proyecto y configurarlo (15 min)

## Paso 5.1 – Instalar Git y clonar el repositorio

Git ya viene instalado en Amazon Linux 2023. Verificalo:

```bash
git --version
```

Clona tu fork del repositorio (usa la URL HTTPS que copiaste en el Paso 1.2):

```bash
git clone https://github.com/<TU-USUARIO>/<NOMBRE-REPO>.git proyecto-devops
```

Entra a la carpeta de la actividad:

```bash
cd proyecto-devops/experiencia2-docker/actividad-docker
```

Verifica que estes en la carpeta correcta:

```bash
ls
```

Deberias ver: `backend  docker-compose.yml  frontend  .env.example  README.md`

---

## Paso 5.2 – Configurar las variables de entorno

Crea el archivo `.env` a partir del ejemplo:

```bash
cp .env.example .env
```

Edita el archivo con `nano`:

```bash
nano .env
```

El contenido por defecto es:

```
PORT=3000
MENSAJE_BIENVENIDA=API de Tareas corriendo en Docker
```

Puedes personalizar el `MENSAJE_BIENVENIDA` para identificar que es tu
instancia en la nube. Por ejemplo:

```
PORT=3000
MENSAJE_BIENVENIDA=API de Tareas - Desplegada en AWS EC2 por Juan Perez
```

Guarda con `Ctrl+O`, Enter, y sal con `Ctrl+X`.

---

## Paso 5.3 – Verificar el docker-compose.yml para produccion

El `docker-compose.yml` que usaste en local **funciona sin cambios** en EC2.
Solo hay una diferencia que debes entender:

En local accedias con `http://localhost:4200`.
En EC2 accederas con `http://<IP-PUBLICA-EC2>:4200`.

Sin embargo, el frontend Angular esta configurado para que la API apunte a
`http://localhost:3000`. Esto funciona porque el navegador del usuario corre
en su computador local y conecta directamente a la IP de EC2 tanto para el
frontend (`:4200`) como para el backend (`:3000`).

Verifica que el archivo `.env` este bien y que el `docker-compose.yml` exista:

```bash
cat .env
cat docker-compose.yml | head -20
```

---

# Parte 6 – Levantar el stack con Docker Compose (15 min)

## Paso 6.1 – Construir e iniciar todos los servicios

Desde la carpeta `actividad-docker/`:

```bash
docker compose up --build -d
```

La primera vez este comando:

1. **Descarga** la imagen base `node:20-alpine` de Docker Hub (puede tardar
   1-2 min segun la velocidad de internet de EC2).
2. **Construye** la imagen del backend (`tareas-backend:1.0`).
3. **Construye** la imagen del frontend (`tareas-frontend:1.0`) con `npm install`,
   que puede tardar 2-4 minutos en t2.micro.
4. **Crea** la red `red-devops` y el volumen `datos-tareas`.
5. **Arranca** los dos contenedores en segundo plano (`-d`).

> **Si el build del frontend se cuelga o el proceso muere** por falta de
> memoria, espera 1 minuto y vuelve a ejecutar `docker compose up --build -d`.
> El swap del Paso 4.6 deberia evitar este problema.

---

## Paso 6.2 – Verificar que los contenedores estan corriendo

```bash
docker compose ps
```

Deberias ver algo asi:

```
NAME               IMAGE                  COMMAND                  SERVICE    STATUS    PORTS
tareas-backend     tareas-backend:1.0     "docker-entrypoint.s…"   backend    running   0.0.0.0:3000->3000/tcp
tareas-frontend    tareas-frontend:1.0    "docker-entrypoint.s…"   frontend   running   0.0.0.0:4200->4200/tcp
```

Ambos servicios deben aparecer en estado **running**.

---

## Paso 6.3 – Ver los logs para confirmar que arranc

```bash
docker compose logs --tail=20
```

Para el backend deberias ver:

```
tareas-backend  | [INFO] API de Tareas - Desplegada en AWS EC2 por Juan Perez
tareas-backend  | [INFO] API escuchando en http://0.0.0.0:3000
```

Para el frontend, espera hasta ver algo como:

```
tareas-frontend | ** Angular Live Development Server is listening on 0.0.0.0:4200 **
tareas-frontend | ✔ Compiled successfully.
```

> **Puede tomar 2-3 minutos** hasta que Angular termine de compilar. Puedes
> seguir los logs en tiempo real con:
>
> ```bash
> docker compose logs -f frontend
> ```
>
> Presiona `Ctrl+C` para salir sin detener los contenedores.

---

# Parte 7 – Probar la aplicacion desde internet (10 min)

## Paso 7.1 – Verificar el backend desde EC2

Desde la misma terminal SSH, prueba que el backend responde:

```bash
curl http://localhost:3000
curl http://localhost:3000/api/tareas
```

Deberias recibir el mensaje de bienvenida y el listado de tareas en JSON.

---

## Paso 7.2 – Abrir la aplicacion en tu navegador

Abre tu navegador y escribe la URL con la IP publica de tu EC2:

```
http://<IP-PUBLICA-EC2>:4200
```

Ejemplo:

```
http://54.234.12.88:4200
```

Deberias ver la aplicacion de gestion de tareas cargando desde la nube.

> **Si la pagina no carga:**
> 1. Verifica que el frontend termino de compilar (`docker compose logs -f frontend`).
> 2. Confirma que el Security Group tiene abierto el puerto 4200 (Paso 2.2).
> 3. Asegurate de usar `http://` (no `https://`).

Tambien prueba el backend directamente desde el navegador:

```
http://<IP-PUBLICA-EC2>:3000/api/tareas
```

---

## Paso 7.3 – Probar las funcionalidades

Desde el navegador, usando tu IP publica:

1. **Crea al menos 2 tareas nuevas** desde la interfaz.
2. **Marca una tarea como completada** (deberia aparecer tachada).
3. **Elimina una tarea** y verifica que desaparece.
4. **Destruye y recrea los contenedores** para verificar que los datos
   persisten gracias al volumen:

   ```bash
   # En la terminal SSH:
   docker compose down
   docker compose up -d
   ```

   Espera que el frontend compile y recarga la pagina: las tareas deben
   seguir ahi.

> **Checkpoint 7:** la aplicacion corre en AWS y es accesible desde tu
> navegador por IP publica. Esto es un despliegue real en la nube.

---

## Cuestionario de autoevaluacion

Crea el archivo `respuestas_exp3.md` dentro de `actividad-docker/` y
responde:

```bash
nano respuestas_exp3.md
```

Responde las siguientes preguntas:

1. ¿Que diferencia notaste entre ejecutar `docker compose up` en local versus
   en EC2? Menciona al menos dos diferencias.

2. ¿Por que el archivo `docker-compose.yml` no necesito ningun cambio para
   funcionar en EC2?

3. Explica con tus palabras para que sirve un **Security Group** en AWS.
   ¿Que habria pasado si no hubieras abierto el puerto 4200?

4. ¿Por que se agrego swap en el Paso 4.6? ¿Que pasa si no lo haces con
   una instancia t2.micro?

5. ¿Que pasaria con los datos de las tareas si ejecutas `docker compose down -v`?
   ¿Y si ejecutas solo `docker compose down`?

6. ¿Que comando usarias para ver los logs solo del backend en tiempo real
   desde EC2?

7. La IP publica de EC2 cambia cada vez que detienes y reinicias la instancia.
   ¿Que servicio de AWS usarias para tener siempre la misma IP?

8. ¿En que se diferencia la arquitectura que usaste (todo en una EC2) de
   la arquitectura de 3 capas vista en clases? ¿Cual usarias para una
   aplicacion en produccion real y por que?

---

## Reto opcional – Arquitectura 3 capas

> **Tiempo estimado adicional:** 30-45 min
> **Solo si terminaste todo lo anterior y queda tiempo.**

En clases viste la arquitectura de 3 capas donde cada servicio (frontend,
backend, BD) corre en una EC2 separada. En esta experiencia usaste una sola
EC2 con Docker Compose por simplicidad. El reto es implementar la separacion:

### Reto A – Segunda EC2 solo para el backend

1. Lanza una segunda instancia EC2 (t2.micro, Amazon Linux 2023).
2. Instala Docker (repite el Parte 4).
3. Clona el mismo repositorio.
4. Ejecuta **solo el backend**:
   ```bash
   cd proyecto-devops/experiencia2-docker/actividad-docker
   docker build -t tareas-backend:1.0 ./backend
   docker run -d \
     --name tareas-backend \
     -p 3000:3000 \
     -v datos-tareas:/data \
     tareas-backend:1.0
   ```
5. Modifica el archivo de configuracion del frontend en tu primera EC2 para
   que apunte al backend de la segunda EC2 (IP privada de AWS):
   - Edita `frontend/src/app/services/tareas.service.ts` y cambia
     `localhost` por la IP privada de la EC2 del backend.
6. Reconstruye el frontend y levantalo.

### Reto B – Usar variables de entorno para la URL del backend

Actualmente la URL del backend esta fija en el codigo del frontend. Un mejor
enfoque en DevOps es usar variables de entorno. Investiga como configurar
una variable de entorno en Angular (`environment.ts`) para que la URL sea
configurable sin recompilar el codigo.

---

## Solucion de problemas

| Sintoma | Causa probable | Solucion |
|---|---|---|
| `Permission denied (publickey)` al hacer SSH | Permisos del .pem incorrectos o usuario equivocado | Ejecuta `chmod 400 clave.pem`; asegurate de usar `ec2-user` (no `ubuntu` ni `root`) |
| `Connection timed out` al hacer SSH | El Security Group no tiene el puerto 22 abierto o usa la IP incorrecta | Verifica las reglas inbound del SG y la IP publica de la instancia |
| `Cannot connect to the Docker daemon` | Docker no esta corriendo | `sudo systemctl start docker` |
| `docker: command not found` | Docker no esta instalado o no reconectaste la sesion SSH | Repite el Paso 4.2; si acabas de instalar, cierra y reabre la sesion SSH |
| El build del frontend falla o se cuelga | Falta de memoria RAM en t2.micro | Verifica que el swap este activo (`free -h`); repite el Paso 4.6 si es necesario |
| La pagina en el navegador no carga | Puerto no abierto en Security Group o frontend aun compilando | Verifica los inbound rules del SG y espera a que Angular compile (`docker compose logs -f frontend`) |
| `curl: (7) Failed to connect` desde EC2 | El contenedor no esta corriendo | Verifica con `docker compose ps`; reinicia con `docker compose up -d` |
| Los datos no persisten tras `docker compose down` | Se uso `docker compose down -v` (borra volumenes) | Usa solo `docker compose down` para conservar el volumen `datos-tareas` |
| `Killed` durante `npm install` | Sin memoria ni swap | Agrega swap (Paso 4.6) y reintenta el build |
| `git clone` falla con error de autenticacion | HTTPS requiere credenciales para repos privados | Usa SSH de Git o un token personal de GitHub |

---

## Entregables y rubrica

El entregable es tu fork en GitHub con los siguientes archivos nuevos dentro
de `experiencia2-docker/actividad-docker/`:

- `respuestas_exp3.md` — cuestionario respondido.
- `evidencias/` — carpeta con las siguientes capturas de pantalla:
  1. La consola de AWS mostrando tu instancia EC2 en estado **Running** con
     la IP publica visible.
  2. El Security Group con las reglas de entrada configuradas.
  3. La terminal SSH mostrando `docker compose ps` con ambos contenedores
     en estado **running**.
  4. El navegador con la aplicacion abierta en `http://<IP>:4200` mostrando
     al menos 2 tareas creadas por ti.
  5. La terminal SSH mostrando `curl http://localhost:3000/api/tareas` con
     el JSON de respuesta.

Entrega la **URL de tu fork** y/o **URL del commit** en el sistema indicado
por el profesor.

### Rubrica (100 pts)

| Criterio | Puntos |
|---|---|
| Instancia EC2 creada correctamente (AMI, tipo, SG) | 15 |
| Docker instalado y corriendo en EC2 | 15 |
| Stack levantado con docker compose en EC2 | 20 |
| Aplicacion accesible desde el navegador por IP publica | 20 |
| Persistencia de datos verificada tras `docker compose down` / `up` | 10 |
| Cuestionario `respuestas_exp3.md` respondido | 10 |
| Evidencias (capturas) entregadas y completas | 10 |

---

## Limpieza final (obligatoria)

> **Muy importante en AWS Academy:** las instancias EC2 consumen creditos
> aunque esten detenidas. Al terminar la experiencia debes eliminar los
> recursos creados.

### Paso 1 – Detener los contenedores (desde la terminal SSH)

```bash
cd ~/proyecto-devops/experiencia2-docker/actividad-docker
docker compose down -v
```

### Paso 2 – Salir del SSH

```bash
exit
```

### Paso 3 – Terminar la instancia EC2 (desde la consola de AWS)

1. Ve a **EC2 → Instances**.
2. Selecciona tu instancia `devops-tareas-<TU-NOMBRE>`.
3. Haz clic en **Instance state → Terminate instance**.
4. Confirma la terminacion.

> **Diferencia entre Stop y Terminate:**
> - **Stop:** detiene la instancia pero la conserva (sigue generando costos
>   de almacenamiento). La IP publica cambia al reiniciarla.
> - **Terminate:** elimina la instancia definitivamente, incluyendo el disco.
>   Usa esto al finalizar la experiencia.

### Paso 4 – Eliminar el Security Group y el Key Pair (opcional)

- **Security Groups:** EC2 → Security Groups → selecciona `sg-devops-tareas`
  → Actions → Delete.
- **Key Pairs:** EC2 → Key Pairs → selecciona tu key → Actions → Delete.

---

## Glosario

- **EC2:** Elastic Compute Cloud; servicio de VMs en la nube de AWS.
- **AMI:** Amazon Machine Image; plantilla del SO de la instancia.
- **Key Pair:** par de claves criptograficas para autenticar conexiones SSH.
- **Security Group:** firewall virtual que controla el trafico de red a nivel de instancia.
- **Inbound rule:** regla que permite trafico entrante a la instancia.
- **SSH:** Secure Shell; protocolo para conectarse de forma segura a servidores remotos.
- **IP publica:** direccion de internet asignada a la instancia (cambia al reiniciar).
- **IP privada:** direccion interna de la red de AWS (no accesible desde internet).
- **Elastic IP:** IP publica fija que no cambia al reiniciar la instancia.
- **Swap:** espacio en disco usado como extension de RAM cuando la memoria fisica se agota.
- **dnf:** gestor de paquetes de Amazon Linux 2023 (sucesor de yum).
- **systemctl:** herramienta para gestionar servicios del sistema en Linux.

---

> **Felicitaciones.** Desplegaste una aplicacion multi-contenedor en la nube
> de AWS. Exactamente el mismo flujo se usa en proyectos reales: construir
> localmente, probar, y desplegar en un servidor en la nube.
>
> Vuelve al [README del repositorio](../../README.md) para ver las proximas
> experiencias del semestre.
