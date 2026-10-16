import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Railway inyecta PORT en runtime. Lo leemos aqui en vez de por --port en el
// comando de arranque, porque el startCommand de railway.json no expande $PORT.
const port = Number(process.env.PORT) || 8080

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // `vite preview` sirve el build en Railway. allowedHosts:true permite el dominio
  // *.up.railway.app; host:true expone en 0.0.0.0 para que Railway lo alcance.
  preview: {
    host: true,
    allowedHosts: true,
    port,
  },
})
