import { app } from './app.js';import { env } from './config/env.js';
const server=app.listen(env.PORT,()=>console.log(`Lendly API listening on port ${env.PORT} (${env.NODE_ENV})`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
