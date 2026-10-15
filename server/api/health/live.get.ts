import { defineEventHandler, setResponseStatus } from 'h3'

// Liveness: sempre 200 enquanto o processo responde. Não toca em DB nem auth —
// serve para o healthcheck do Docker/restart não reiniciar o container por uma
// dependência temporariamente indisponível.
export default defineEventHandler((event) => {
  setResponseStatus(event, 200)
  return { status: 'ok' }
})
