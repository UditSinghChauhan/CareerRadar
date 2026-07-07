<div align="center">
  <h1>🎯 CareerRadar</h1>
  <p><strong>Personal Placement OS for CS Students</strong></p>
  <p>Track SE internships & fresher jobs with a full-stack TypeScript dashboard</p>

  <p>
    <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
    <img src="https://img.shields.io/badge/Express-5-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express" />
    <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
    <img src="https://img.shields.io/badge/Clerk-Auth-6C47FF?style=for-the-badge&logo=clerk&logoColor=white" alt="Clerk" />
    <img src="https://img.shields.io/badge/Drizzle-ORM-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black" alt="Drizzle ORM" />
  </p>

  <p>
    <a href="https://careerradar.up.railway.app"><strong>🌐 Live Demo</strong></a> ·
    <a href="#features"><strong>Features</strong></a> ·
    <a href="#tech-stack"><strong>Tech Stack</strong></a> ·
    <a href="#getting-started"><strong>Getting Started</strong></a>
  </p>
</div>

---

## 📌 What is CareerRadar?

CareerRadar is a **personal placement operating system** designed for Indian CS students navigating internship & fresher job seasons. Instead of juggling spreadsheets, it gives you a centralized, real-time dashboard to track applications, sync job listings, manage bookmarks, and analyze your placement pipeline — all in one place.

> Built as a full-stack TypeScript monorepo with production-grade architecture: type-safe API contracts (OpenAPI → codegen), schema-first DB modeling (Drizzle ORM), and role-based auth (Clerk).

---

## ✨ Features

- **📊 Application Tracker** — Log, categorize, and track every job application with status updates (Applied → OA → Interview → Offer)
- **🔖 Smart Bookmarks** — Save interesting listings and revisit them with filters
- **🔍 Job Catalog** — Browse aggregated SE internship & fresher listings with role, company, CTC, and deadline info
- **🏢 Company Profiles** — Dedicated pages with placement history and application stats
- **📈 Dashboard Analytics** — Visual breakdown of your placement pipeline: response rates, stage conversion, timeline
- **⚙️ Sync Engine** — Background job scheduler to pull fresh listings from configured sources
- **🔐 Auth** — Secure sign-in/sign-up via Clerk (Google OAuth, Email/Password)
- **🌙 Dark Mode** — Full light/dark theme support via `next-themes`
- **📱 Responsive** — Mobile-first UI built with Radix UI + shadcn/ui components + Tailwind CSS v4

---

## 🏗️ Architecture

```
CareerRadar/
├── artifacts/
│   ├── career-radar/          # React 18 + Vite frontend
│   │   └── src/
│   │       ├── App.tsx        # Router root (Wouter)
│   │       ├── pages/         # Dashboard, Applications, Catalog, etc.
│   │       └── components/    # Radix UI + shadcn/ui components
│   └── api-server/            # Express 5 API server
│       └── src/
│           ├── routes/        # REST endpoints (applications, jobs, catalog…)
│           ├── middlewares/   # Clerk auth, proxy
│           └── providers/     # Scheduler service
├── lib/
│   ├── api-spec/              # OpenAPI YAML (single source of truth)
│   ├── api-client-react/      # Generated React Query hooks (Orval)
│   ├── api-zod/               # Generated Zod schemas for server validation
│   └── db/                    # Drizzle ORM schema + migrations
└── railway.json               # Deployment config
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Language** | TypeScript 5.9 (strict, full-stack) |
| **Frontend** | React 18, Vite, Tailwind CSS v4, Wouter, next-themes |
| **UI Components** | Radix UI Primitives + shadcn/ui pattern |
| **Backend** | Express 5, Node.js 24 |
| **Auth** | Clerk (`@clerk/react` + `@clerk/express`) |
| **Database** | PostgreSQL 16 + Drizzle ORM + `drizzle-zod` |
| **Validation** | Zod (`zod/v4`) |
| **API Contracts** | OpenAPI YAML → Orval codegen (React Query + Zod) |
| **Build** | Vite (frontend), esbuild (server CJS bundle) |
| **Package Manager** | pnpm workspaces |
| **Deployment** | Railway (auto-deploy from GitHub) |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 24+
- pnpm (`npm install -g pnpm`)
- PostgreSQL instance (local or [Neon](https://neon.tech)/[Supabase](https://supabase.com) free tier)
- [Clerk](https://clerk.com) account (free tier)

### 1. Clone & Install

```bash
git clone https://github.com/UditSinghChauhan/CareerRadar.git
cd CareerRadar
pnpm install
```

### 2. Environment Variables

Create a `.env` file at the root:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/careerradar

# Clerk Auth
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...

# Server
PORT=8080
NODE_ENV=development
BASE_PATH=/
```

### 3. Push Database Schema

```bash
pnpm --filter @workspace/db run push
```

### 4. Run Development Servers

```bash
# Terminal 1: API server (port 8080)
pnpm --filter @workspace/api-server run dev

# Terminal 2: Frontend (port 5173)
pnpm --filter @workspace/career-radar run dev
```

### 5. Regenerate API Client (after OpenAPI spec changes)

```bash
pnpm --filter @workspace/api-spec run codegen
```

---

## 🌐 Deployment (Railway)

This project is configured for one-click deploy on Railway:

1. Fork/clone this repo
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add a **PostgreSQL** database addon
4. Set environment variables:
   - `DATABASE_URL` (auto-filled by Railway PostgreSQL addon)
   - `CLERK_SECRET_KEY`
   - `CLERK_PUBLISHABLE_KEY`
   - `VITE_CLERK_PUBLISHABLE_KEY`
   - `NODE_ENV=production`
   - `PORT=8080`
5. Deploy! Railway auto-deploys on every `git push` to `main`.

---

## 📁 Key Files

| File | Purpose |
|------|---------|
| [`lib/api-spec/openapi.yaml`](lib/api-spec/openapi.yaml) | Single source of truth for all API contracts |
| [`lib/db/src/schema/`](lib/db/src/schema/) | Drizzle table definitions |
| [`artifacts/career-radar/src/App.tsx`](artifacts/career-radar/src/App.tsx) | Frontend router root |
| [`artifacts/api-server/src/routes/`](artifacts/api-server/src/routes/) | Express route handlers |
| [`railway.json`](railway.json) | Railway deployment config |

---

## 📄 License

MIT © [Udit Singh Chauhan](https://github.com/UditSinghChauhan)
