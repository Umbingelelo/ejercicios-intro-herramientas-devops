#!/bin/bash
# =============================================================
# instalar-docker.sh
# Instalacion rapida de Docker en Amazon Linux 2023
# Experiencia 3 - Introduccion a Herramientas DevOps
#
# Uso (ejecutar dentro de la instancia EC2 por SSH):
#   chmod +x instalar-docker.sh
#   ./instalar-docker.sh
# =============================================================

set -e

echo "=============================================="
echo "  Docker Install - Amazon Linux 2023"
echo "=============================================="

echo "[1/5] Actualizando paquetes..."
sudo dnf update -y

echo "[2/5] Instalando Docker y Docker Compose plugin..."
sudo dnf install docker docker-compose-plugin -y

echo "[3/5] Iniciando Docker y habilitando arranque automatico..."
sudo systemctl start docker
sudo systemctl enable docker

echo "[4/5] Agregando ec2-user al grupo docker..."
sudo usermod -aG docker ec2-user

echo "[5/5] Configurando swap de 1 GB..."
if [ ! -f /swapfile ]; then
    sudo dd if=/dev/zero of=/swapfile bs=128M count=8
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo "  Swap creado correctamente."
else
    echo "  Swap ya existe, omitiendo."
fi

echo ""
echo "=============================================="
echo "  Verificacion:"
echo "=============================================="
docker --version && echo "  Docker:         OK" || echo "  Docker:         ERROR"
docker compose version && echo "  Docker Compose: OK" || echo "  Docker Compose: ERROR"
free -h | grep -i "^swap"

echo ""
echo "=============================================="
echo "  IMPORTANTE: cierra esta sesion SSH y vuelve"
echo "  a conectarte para aplicar el grupo docker."
echo "  Luego ejecuta: docker ps   (sin sudo)"
echo "=============================================="
