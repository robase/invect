import 'dotenv/config';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import cors from 'cors';
import { createInvectRouter } from '@invect/express';
import { userAuth } from '@invect/user-auth';
import { rbacPlugin } from '@invect/rbac';
import { webhooksPlugin } from '@invect/webhooks';
import { startExternalApiMocks, stopExternalApiMocks } from './mock-external-apis';

// Create Express app
const app = express();
const port = process.env.PORT || 3000;
const sqliteConnectionString = process.env.DB_FILE_NAME || 'file:./dev.db';
const webhookBaseUrl = process.env.INVECT_WEBHOOK_BASE_URL || `http://localhost:${port}/invect`;

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
// Explicitly handle preflight requests for all routes
app.options('*', cors(corsOptions));
app.use(express.json());

// Mount Invect routes under /invect (or a path of your choice)
app.use(
  '/invect',
  createInvectRouter({
    baseDatabaseConfig: {
      id: 'my-db-name',
      type: 'sqlite', // Example, adjust based on your setup
      connectionString: sqliteConnectionString,
    },
    logging: {
      level: 'debug', // Default to info level, use 'debug' for verbose logging
      scopes: {
        // Uncomment to enable debug logging for specific areas:
        execution: 'debug',
        node: 'debug',
        ai: 'debug',
      },
    },
    defaultCredentials: [
      ...(process.env.SEED_ANTHROPIC_API_KEY
        ? [
            {
              name: 'Anthropic API Key',
              type: 'llm',
              authType: 'apiKey',
              config: { apiKey: process.env.SEED_ANTHROPIC_API_KEY },
              description: 'Anthropic Claude API credential for AI model nodes',
              isShared: true,
              metadata: { provider: 'anthropic' },
            },
          ]
        : []),
      ...(process.env.SEED_LINEAR_CLIENT_ID && process.env.SEED_LINEAR_CLIENT_SECRET
        ? [
            {
              name: 'Linear OAuth2',
              type: 'http-api',
              authType: 'oauth2',
              config: {
                clientId: process.env.SEED_LINEAR_CLIENT_ID,
                clientSecret: process.env.SEED_LINEAR_CLIENT_SECRET,
                oauth2Provider: 'linear',
              },
              description: 'Linear OAuth2 credential for issue tracking',
              isShared: true,
              metadata: { provider: 'linear' },
            },
          ]
        : []),
    ],
    // Note: Don't pass `logger: console` - use the built-in scoped logger
    // which respects log levels. The console logger ignores log levels.
    plugins: [
      userAuth({
        onSessionError: 'continue',
        globalAdmins: [
          {
            email: process.env.INVECT_ADMIN_EMAIL,
            pw: process.env.INVECT_ADMIN_PASSWORD,
            name: 'Admin',
          },
        ],
      }),
      rbacPlugin({
        useFlowAccessTable: true,
      }),
      webhooksPlugin({
        webhookBaseUrl,
      }),
    ],
  }),
);

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
