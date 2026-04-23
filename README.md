# ejercicios-intro-herramientas-devops

Repositorio de actividades practicas para la asignatura
**Introduccion a Herramientas DevOps (ISY1101)**.

Cada carpeta es una experiencia de laboratorio autocontenida con su propia guia paso a paso.

---

## Repositorios de la aplicacion

Las actividades usan esta aplicacion de gestion de tareas como base:

| Servicio | Repositorio | Stack |
|---|---|---|
| **Backend** | [backend_intro_devops](https://github.com/Umbingelelo/backend_intro_devops) | Node.js 20 + Express |
| **Frontend** | [frontend_intro_devops](https://github.com/Umbingelelo/frontend_intro_devops) | Angular 17 |

---

## Como empezar

Clona este repositorio de ejercicios:

```bash
git clone https://github.com/Umbingelelo/ejercicios-intro-herramientas-devops.git
```

Luego clona los repositorios de la aplicacion:

```bash
# Backend
git clone https://github.com/Umbingelelo/backend_intro_devops.git

# Frontend
git clone https://github.com/Umbingelelo/frontend_intro_devops.git
```

Luego abre el README de la experiencia que estes cursando y sigue la guia.

---

## Experiencias disponibles

| # | Carpeta | Tema | Duracion |
|---|---|---|---|
| 2 | [actividad-docker/](./actividad-docker/README.md) | Fundamentos de Docker + Docker Compose (2.1 y 2.2) | 90 min |
| 3 | [experiencia3-ec2-docker/](./experiencia3-ec2-docker/README.md) | Contenedores en AWS: ECR + EC2 por capas (2.3) | 120 min |

---

## Herramientas requeridas

- **Git** — para clonar los repositorios
- **Docker Desktop** (Windows/macOS) o Docker Engine + plugin Compose (Linux)
- **AWS Academy / Learner Lab** — para las experiencias con EC2 y ECR
- **Editor de codigo** — se recomienda VS Code
