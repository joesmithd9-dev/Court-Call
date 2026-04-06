import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { publicRouter } from './routes/public';
import { registrarRouter } from './routes/registrar';
import { seedRouter } from './routes/seed';
import { startHeartbeat } from './services/sse';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

app.use(cors());
app.use(express.json());

// Routes matching frontend client.ts contract exactly
app.use('/v1/public', publicRouter);
app.use('/v1/registrar', registrarRouter);
app.use('/v1', seedRouter);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`CourtCall backend running on port ${PORT}`);
  startHeartbeat();
});

export default app;
