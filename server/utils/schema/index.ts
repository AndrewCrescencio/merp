// Registry do schema Drizzle. Consumido por db.ts, shared/auth.ts (Better
// Auth), tasks e repositories das features. Preserva a API de
// server/utils/schema.ts original — nenhum import externo muda.
export * from './identity'
export * from './company'
export * from './invite'
export * from './security'
export * from './email'
