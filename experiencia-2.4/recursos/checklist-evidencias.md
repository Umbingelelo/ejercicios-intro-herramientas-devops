# Checklist de evidencias - Experiencia 4

Usa esta lista mientras avanzas para no olvidar nada.
Las capturas se guardan en `evidencias/` dentro de tu fork.

## Parte 1 - Dockerfiles mejorados
- [ ] Captura de `docker images` mostrando el tamano de la imagen multi-stage del backend (debe ser menor que la single-stage).
- [ ] Captura de `docker images` mostrando el tamano del frontend con Nginx.
- [ ] Captura de `docker exec <contenedor> whoami` -> debe responder `node` (backend) o `nginx` (frontend), NO `root`.

## Parte 2 - Docker Hub
- [ ] Captura de tu repositorio publico en hub.docker.com con los tags `v1.0.0` y `latest`.
- [ ] Captura de `docker pull <usuario>/tareas-backend:v1.0.0` desde una terminal limpia.

## Parte 3 - Amazon ECR
- [ ] Captura de los repositorios privados creados en la consola de ECR.
- [ ] Captura del comando `docker push` exitoso desde tu terminal local.
- [ ] Captura de los tags `v1.0.0`, `latest` y `<sha>` listados en la consola de ECR.

## Parte 4 - GitHub Actions
- [ ] Captura del archivo `.github/workflows/build-and-push-dockerhub.yml` en tu repositorio.
- [ ] Captura de la pestana "Settings -> Secrets and variables -> Actions" mostrando los secrets configurados (sin revelar valores).
- [ ] Captura del run en verde en la pestana "Actions" tras hacer push a la rama `deploy`.
- [ ] Captura del Step Summary ("### Imagen publicada") con los tres tags publicados.

## Parte 5 - Validacion
- [ ] Captura del registry mostrando que la imagen del run automatico aparece (con timestamp posterior al manual).
- [ ] Archivo `respuestas.md` con las preguntas del cuestionario contestadas.

## Entrega
- [ ] URL de tu fork con todos los archivos.
- [ ] URL del run de Actions ejecutado correctamente.
