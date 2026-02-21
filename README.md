# 🎾 Padel CVA — Torneos Americanos

Sistema de gestión para torneos de pádel en formato americano (parejas rotativas).

## Características

- Crear torneos femeninos y masculinos
- Gestión de jugadores
- Generación automática de rondas con parejas aleatorias
- Sistema de banca justa (18 jugadores / 4 canchas → 2 en banca rotando)
- Carga de resultados con control de games por jugador
- Clasificación individual con podio

## Reglas implementadas

| Torneo | Jugadores | Canchas | Banca / ronda |
|--------|-----------|---------|---------------|
| Femenino | 16 | 4 | 0 |
| Masculino | 18 | 4 | 2 (rotan equitativamente) |

Cada partido: **4 games** o **10 minutos** (lo que ocurra primero).

## Deploy en Railway

1. Crear un proyecto en [Railway](https://railway.app)
2. Agregar un servicio **PostgreSQL**
3. Agregar un servicio desde este repo (GitHub)
4. Railway inyecta `DATABASE_URL` automáticamente
5. El servidor inicializa las tablas al arrancar

## Desarrollo local

```bash
# Instalar dependencias
npm install

# Configurar .env
cp .env.example .env
# Editar DATABASE_URL con tu PostgreSQL local

# Iniciar servidor de desarrollo
npm run dev
```

La app queda en `http://localhost:3000`
