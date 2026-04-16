// ============================================================
// API REST de Tareas - Experiencia 2 (DevOps)
// Express + datos en memoria (sin base de datos)
// ============================================================

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

// ---------- Configuracion via variables de entorno ----------
const PORT = process.env.PORT || 3000;
const MENSAJE_BIENVENIDA = process.env.MENSAJE_BIENVENIDA || 'API de Tareas - DevOps';

// ---------- Middlewares globales ----------
app.use(cors());                 // Permite llamadas desde el frontend Angular
app.use(express.json());         // Parsea el body JSON de las peticiones

// ---------- Persistencia simple en archivo (para ver volumenes) ----------
// Si existe /data escribimos ahi (montaremos un volumen). Si no, en memoria.
const DATA_DIR = '/data';
const DATA_FILE = path.join(DATA_DIR, 'tareas.json');

let tareas = [
  { id: 1, titulo: 'Aprender Docker', completada: false },
  { id: 2, titulo: 'Crear mi primer Dockerfile', completada: false },
  { id: 3, titulo: 'Levantar un docker-compose', completada: false }
];
let siguienteId = 4;

function cargarDesdeDisco() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const data = JSON.parse(raw);
      tareas = data.tareas || tareas;
      siguienteId = data.siguienteId || siguienteId;
      console.log(`[INFO] Datos cargados desde ${DATA_FILE}`);
    }
  } catch (err) {
    console.log(`[WARN] No se pudo leer ${DATA_FILE}: ${err.message}`);
  }
}

function guardarEnDisco() {
  try {
    if (!fs.existsSync(DATA_DIR)) return; // no hay volumen montado
    fs.writeFileSync(DATA_FILE, JSON.stringify({ tareas, siguienteId }, null, 2));
  } catch (err) {
    console.log(`[WARN] No se pudo escribir ${DATA_FILE}: ${err.message}`);
  }
}

cargarDesdeDisco();

// ---------- Rutas ----------

// Healthcheck: util para verificar que el contenedor esta vivo
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Bienvenida
app.get('/', (req, res) => {
  res.json({ mensaje: MENSAJE_BIENVENIDA, version: '1.0.0' });
});

// Listar todas las tareas
app.get('/api/tareas', (req, res) => {
  res.json(tareas);
});

// Obtener una tarea por id
app.get('/api/tareas/:id', (req, res) => {
  const tarea = tareas.find(t => t.id === Number(req.params.id));
  if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' });
  res.json(tarea);
});

// Crear una tarea
app.post('/api/tareas', (req, res) => {
  const { titulo } = req.body;
  if (!titulo || titulo.trim() === '') {
    return res.status(400).json({ error: 'El titulo es obligatorio' });
  }
  const nueva = { id: siguienteId++, titulo: titulo.trim(), completada: false };
  tareas.push(nueva);
  guardarEnDisco();
  res.status(201).json(nueva);
});

// Marcar completada / no completada
app.patch('/api/tareas/:id', (req, res) => {
  const tarea = tareas.find(t => t.id === Number(req.params.id));
  if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' });
  if (typeof req.body.completada === 'boolean') tarea.completada = req.body.completada;
  if (typeof req.body.titulo === 'string') tarea.titulo = req.body.titulo;
  guardarEnDisco();
  res.json(tarea);
});

// Eliminar
app.delete('/api/tareas/:id', (req, res) => {
  const idx = tareas.findIndex(t => t.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Tarea no encontrada' });
  const eliminada = tareas.splice(idx, 1)[0];
  guardarEnDisco();
  res.json(eliminada);
});

// ---------- Arranque ----------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[INFO] ${MENSAJE_BIENVENIDA}`);
  console.log(`[INFO] API escuchando en http://0.0.0.0:${PORT}`);
});
