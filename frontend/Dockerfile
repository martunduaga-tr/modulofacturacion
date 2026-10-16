# Node 22 (>=22.12) satisface el engine de Vite 8 / rolldown. Nixpacks solo
# alcanzaba Node 20.18 / 22.11 y npm omitia el binario nativo
# @rolldown/binding-linux-x64-gnu (engine no satisfecho) -> build roto.
FROM node:22-alpine
WORKDIR /app

# Sin lockfile (excluido por .railwayignore): npm install resuelve el binario
# nativo de rolldown para linux-x64 en esta plataforma.
COPY package.json ./
RUN npm install

COPY . .
# Railway pasa las variables de servicio como build args en builds Dockerfile.
# VITE_API_URL debe estar en el entorno del `npm run build` para hornearse en el
# bundle (si no, el frontend cae al fallback http://localhost:3000/api).
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# El start real lo fija railway.json (vite preview con $PORT). Este CMD es respaldo.
EXPOSE 8080
CMD ["sh","-c","npm run preview -- --host 0.0.0.0 --port ${PORT:-8080}"]
