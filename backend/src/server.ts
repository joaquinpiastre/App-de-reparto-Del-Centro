import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { pool } from './db/client.js';
import { authRouter } from './routes/auth.js';
import { adminPedidosRouter } from './routes/adminPedidos.js';
import { clientesRouter } from './routes/clientes.js';
import { entregasRouter } from './routes/entregas.js';
import { gpsRouter } from './routes/gps.js';
import { healthRouter } from './routes/health.js';
import { pedidosCalleRouter } from './routes/pedidosCalle.js';

const app = express();

app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '2mb' }));

app.use(healthRouter);
app.use(authRouter);
app.use(adminPedidosRouter);
app.use(clientesRouter);
app.use(gpsRouter);
app.use(pedidosCalleRouter);
app.use(entregasRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

const server = app.listen(config.port, () => {
  console.log(`API Del Centro listening on :${config.port}`);
});

process.on('SIGINT', async () => {
  server.close();
  await pool.end();
});
