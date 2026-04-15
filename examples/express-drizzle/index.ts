import 'dotenv/config';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import cors from 'cors';
import { createInvectRouter } from '@invect/express';
import { startExternalApiMocks, stopExternalApiMocks } from './mock-external-apis';
import { invectConfig } from './invect.config';

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

if (process.env.INVECT_MOCK_EXTERNAL_APIS === 'true') {
  startExternalApiMocks();
}

// Middleware
const corsOptions: cors.CorsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'], // Allow both dev server and production
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-ID', 'x-user-id'],
};

app.use(cors(corsOptions));
app.use(express.json());

// Mount Invect routes under /invect (or a path of your choice)
const invectRouter = await createInvectRouter(invectConfig);
app.use('/invect', (req, res, next) => invectRouter(req, res, next));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'invect-express-simple',
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Hello from Express!',
  });
});

// Global error handler
const globalErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  console.error('Global error handler caught:', error);

  // If response was already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(error);
  }

  // Return generic error response
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
  });
};

app.use(globalErrorHandler);

// Start server
app.listen(port, () => {
  console.log(`🚀 Express server running on http://localhost:${port}`);
});

process.on('SIGINT', () => {
  stopExternalApiMocks();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopExternalApiMocks();
  process.exit(0);
});
