# Experiencia 2 – Docker en local

> **Asignatura:** Introduccion a Herramientas DevOps

---

## Descripcion

Esta experiencia introduce los fundamentos de **Docker** y **Docker Compose**
a traves de la construccion y orquestacion de una aplicacion web completa
(backend Node.js + frontend Angular) en el entorno local del estudiante.

Se divide en dos sub-experiencias:

- **2.1 – Fundamentos de Docker:** imagenes, contenedores, Dockerfile,
  `docker build`, `docker run`, publicacion de puertos y comandos de
  inspeccion.
- **2.2 – Volumenes, redes y Docker Compose:** persistencia con volumenes,
  redes personalizadas para comunicacion entre contenedores y orquestacion
  de multiples servicios con `docker compose`.

---

## Estructura de la carpeta

```
experiencia2-docker/
|
+-- README.md                        <-- este archivo (descripcion general)
|
+-- actividad-docker/                <-- actividad practica
    +-- README.md                    <-- guia paso a paso (90 min)
    +-- backend/                     <-- API Node.js / Express
    +-- frontend/                    <-- App Angular 17
    +-- docker-compose.yml
    +-- .env.example
    +-- .gitignore
    +-- imagenes/
```

---

## Como empezar

1. Asegurate de tener instalado **Git** y **Docker Desktop** (Windows/macOS)
   o **Docker Engine + Docker Compose** (Linux).
2. Entra a la carpeta de la actividad:

   ```bash
   cd actividad-docker
   ```

3. Abre el [README de la actividad](./actividad-docker/README.md) y sigue
   la guia paso a paso.

---

## Herramientas requeridas

- **Git** (para clonar el repositorio). En Windows instala tambien
  **Git Bash**, la terminal recomendada.
- **Docker Desktop** en Windows/macOS, o **Docker Engine + Docker Compose**
  en Linux.
- Un **editor de codigo** (se recomienda VS Code).
- Un **navegador** moderno.

> Las guias estan escritas y verificadas para **Windows 10/11 con Docker
> Desktop**. Tambien funcionan en macOS y Linux; las diferencias se indican
> en la guia de la actividad.

---

## Duracion estimada

90 minutos (trabajo autonomo en local, sin necesidad de nube).

---

> (c) Curso **Introduccion a Herramientas DevOps** -- material con fines educativos.
