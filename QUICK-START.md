# Invect - Quick Start for Development

## 🚀 Interactive Development Setup

The easiest way to get started:

```bash
pnpm dev
```

This launches an interactive menu where you can choose:

1. **Express + Drizzle Example** (Backend API)
2. **Vite + React Frontend** (Frontend UI)
3. **Full Stack** (Both backend + frontend)
4. **Watch All Packages** (Manual example start)
5. **Build All** (One-time build)

The script automatically sets up watch modes and hot-reloading! 🎉

## Manual Development (Advanced)

### Backend Development

```bash
# Terminal 1: Watch core + express packages
pnpm dev:express-example

# Terminal 2: Run express server
cd examples/express-drizzle
pnpm dev
```

Server runs at: http://localhost:3000

### Frontend Development

```bash
# Terminal 1: Watch core + frontend packages
pnpm dev:vite-example

# Terminal 2: Run vite dev server
cd examples/vite-react-frontend
pnpm dev
```

Frontend runs at: http://localhost:5173

### Full Stack Development

```bash
# Terminal 1: Watch all packages
pnpm dev:all

# Terminal 2: Run backend
cd examples/express-drizzle
pnpm dev

# Terminal 3: Run frontend
cd examples/vite-react-frontend
pnpm dev
```

## How Hot-Reloading Works

```
Edit file in pkg/core/src/
    ↓
tsdown detects change → rebuilds
    ↓
pnpm workspace link updates
    ↓
tsx watch restarts express server
    ↓
Your changes are live! ✨
```

## Credentials System Setup

```bash
# Interactive setup
pnpm setup:credentials

# Or manually:
# 1. Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 2. Add to .env
echo "INVECT_ENCRYPTION_KEY=<your-key>" >> .env

# 3. Run migrations
cd pkg/core
pnpm db:generate
pnpm db:migrate
```

## Available Commands

### Root Level
```bash
pnpm build              # Build all packages
pnpm dev                # Interactive development menu
pnpm dev:all            # Watch all packages
pnpm dev:express-example # Watch core + express
pnpm dev:vite-example   # Watch core + frontend
pnpm clean              # Clean all dist/ folders
pnpm test               # Run all tests
pnpm lint               # Lint all packages
```

### Credentials
```bash
pnpm setup:credentials  # Interactive credentials setup
```

## Project Structure

```
flow-backend/
├── pkg/                       # Monorepo packages
│   ├── core/                  # Core workflow engine
│   │   ├── src/
│   │   │   ├── services/
│   │   │   │   └── credentials/  # ✅ Credentials system
│   │   │   └── api/
│   │   │       └── credentials.routes.ts  # ✅ API endpoints
│   │   └── dist/              # Built output (auto-generated)
│   ├── frontend/              # React components
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   └── credentials.tsx  # ✅ Credentials UI
│   │   │   └── components/
│   │   │       └── credentials/     # ✅ Modals
│   │   └── dist/              # Built output (auto-generated)
│   └── express/               # Express integration
│       ├── src/
│       └── dist/              # Built output (auto-generated)
│
├── examples/                  # Example applications
│   ├── express-drizzle/       # Express API example
│   │   ├── index.ts          # Server entry point
│   │   └── dev.db            # SQLite database
│   └── vite-react-frontend/   # React UI example
│       └── src/main.tsx      # App entry point
│
└── scripts/                   # Development scripts
    ├── dev.sh                # Interactive dev menu
    └── setup-credentials.sh  # Credentials setup
```

## Accessing Features

### Credentials Management

1. Start the development servers
2. Open http://localhost:5173
3. Click "**Credentials**" button on home page
4. Create, edit, test, and delete credentials

API endpoints:
- `GET /api/credentials` - List credentials
- `POST /api/credentials` - Create credential
- `GET /api/credentials/:id` - Get credential
- `PATCH /api/credentials/:id` - Update credential
- `DELETE /api/credentials/:id` - Delete credential
- `POST /api/credentials/:id/test` - Test credential

### Flow Management

- View flows: http://localhost:5173/invect
- Edit flow: Click "Edit" on any flow
- View executions: Click "History" or "View All Executions"

## Troubleshooting

### Changes not reflecting?

1. Ensure watch mode is running (Terminal 1)
2. Check for TypeScript errors
3. Try restarting the example (Ctrl+C, then `pnpm dev`)

### Port already in use?

```bash
# Kill processes on ports
lsof -ti:3000 | xargs kill -9  # Express
lsof -ti:5173 | xargs kill -9  # Vite
```

### Build errors?

```bash
# Clean and rebuild
pnpm clean
pnpm build
```

## Documentation

- **[DEVELOPMENT-GUIDE.md](./DEVELOPMENT-GUIDE.md)** - Comprehensive development guide
- **[CREDENTIALS-SYSTEM-DESIGN.md](./CREDENTIALS-SYSTEM-DESIGN.md)** - Credentials system design
- **[CREDENTIALS-IMPLEMENTATION-STATUS.md](./CREDENTIALS-IMPLEMENTATION-STATUS.md)** - Backend implementation
- **[CREDENTIALS-FRONTEND-IMPLEMENTATION.md](./CREDENTIALS-FRONTEND-IMPLEMENTATION.md)** - Frontend implementation

## What's Implemented

✅ **Complete Credentials System**:
- Encryption service (AES-256-GCM)
- CRUD operations
- RESTful API endpoints
- React management UI
- Test functionality
- 7 auth types supported

✅ **Hot-Reloading Development**:
- Watch mode for all packages
- Auto-restart for Express
- HMR for React
- Workspace dependency links

✅ **Examples**:
- Express + Drizzle backend
- Vite + React frontend
- Full integration

## Next Steps

1. Start development: `pnpm dev`
2. Explore the credentials UI
3. Create a flow using credentials
4. Build amazing workflows! 🚀

---

**Need help?** Check the [DEVELOPMENT-GUIDE.md](./DEVELOPMENT-GUIDE.md) for detailed information.
