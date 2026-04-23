#!/bin/bash
# =============================================================
# instalar-docker.sh
# Script de instalacion de Docker para Amazon Linux 2023
# Experiencia 3 – Introduccion a Herramientas DevOps
#
# Uso:
#   chmod +x instalar-docker.sh
#   ./instalar-docker.sh
# =============================================================

set -e  # Detiene el script si cualquier comando falla

echo "============================================="
echo " Instalacion de Docker - Amazon Linux 2023"
echo "============================================="

# 1. Actualizar paquetes
echo "[1/6] Actualizando paquetes del sistema..."
sudo dnf update -y

# 2. Instalar Docker
echo "[2/6] Instalando Docker..."
sudo dnf install docker -y

# 3. Instalar Docker Compose plugin
echo "[3/6] Instalando Docker Compose plugin..."
sudo dnf install docker-compose-plugin -y

# 4. Iniciar y habilitar Docker
echo "[4/6] Iniciando Docker y habilitandolo al arranque..."
sudo systemctl start docker
sudo systemctl enable docker

# 5. Agregar usuario al grupo docker
echo "[5/6] Agregando ec2-user al grupo docker..."
sudo usermod -aG docker ec2-user

# 6. Agregar swap (1 GB)
echo "[6/6] Configurando swap de 1 GB..."
if [ ! -f /swapfile ]; then
    sudo dd if=/dev/zero of=/swapfile bs=128M count=8
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo "Swap creado correctamente."
else
    echo "Swap ya existe, omitiendo."
fi

# Verificaciones finales
echo ""
echo "============================================="
echo " Verificacion final"
echo "============================================="
docker --version && echo "Docker: OK" || echo "Docker: ERROR"
docker compose version && echo "Docker Compose: OK" || echo "Docker Compose: ERROR"
free -h | grep -i swap

echo ""
echo "============================================="
echo " Instalacion completada."
echo " IMPORTANTE: cierra esta sesion SSH y vuelve"
echo " a conectarte para aplicar el grupo docker."
echo " Luego ejecuta: docker ps (sin sudo)"
echo "============================================="
