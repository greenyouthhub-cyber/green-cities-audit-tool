# Green Cities Audit Tool Starter

## Qué incluye
- Next.js starter
- conexión a Supabase
- flujo MVP básico
- subida de imágenes a Storage bucket `audit-images`
- guardado en tablas:
  - submissions
  - submission_means
  - block_responses
  - media_evidence

## 1. Instalar dependencias
```bash
npm install
```

## 2. Crear archivo .env.local
Copia `.env.example` a `.env.local` y rellena:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY

## 3. Ejecutar localmente
```bash
npm run dev
```

## 4. Subir a GitHub
Crea un repositorio y sube estos archivos.

## 5. Publicar en Vercel
- Import Project desde GitHub
- En Settings > Environment Variables añade:
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
