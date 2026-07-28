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
    <a href="https://career-radar--uditcodes.replit.app/"><strong>🌐 Live Demo</strong></a> ·
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
│   ├── career-radar/             # React 18 + Vite frontend
│   │   └── src/
│   │       ├── App.tsx           # Router root (Wouter)
│   │       ├── pages/            # Dashboard, Applications, Catalog, etc.
│   │       └── components/       # Radix UI + shadcn/ui components
│   └── api-server/               # Express 5 API server
│       └── src/
│           ├── routes/           # REST endpoints (applications, jobs, catalog…)
│           ├── middlewares/      # Clerk auth, proxy
│           └── providers/        # Scheduler service
├── lib/
│   ├── api-spec/                 # OpenAPI YAML (single source of truth)
│   ├── api-client-react/         # Generated React Query hooks (Orval)
│   ├── api-zod/                  # Generated Zod schemas for server validation
│   └── db/                       # Drizzle ORM schema + migrations
├── .replit                       # Replit deployment config
└── railway.json                  # Alternative Railway deployment config
```

---

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, Vite, Wouter, Radix UI, shadcn/ui, Tailwind CSS v4, React Query |
| **Backend** | Express 5, Node.js, TypeScript |
| **Database** | PostgreSQL 16, Drizzle ORM |
| **Auth** | Clerk (Google OAuth, Email/Password, RBAC) |
| **API Contract** | OpenAPI 3.1 YAML → Orval codegen (Zod validators + React Query hooks) |
| **Deployment** | Replit Deployments (primary), Railway (alternative) |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 9+
- PostgreSQL instance (local or [Neon](https://neon.tech)/[Supabase](https://supabase.com) free tier)
- [Clerk](https://clerk.com) account (free tier)

### Installation

```bash
git clone https://github.com/UditSinghChauhan/CareerRadar.git
cd CareerRadar
pnpm install
```

### Environment Variables

Create a `.env` file in the root:

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

### Run Locally

```bash
# Terminal 1: API server (port 8080)
pnpm --filter @workspace/api-server run dev

# Terminal 2: Frontend (port 5173)
pnpm --filter @workspace/career-radar run dev
```

---

## 🌐 Deployment

This project is deployed on **Replit Deployments** for always-on hosting.

**Live URL:** [career-radar--uditcodes.replit.app](https://career-radar--uditcodes.replit.app/)

### Alternative: Railway

A `railway.json` config is also included for deploying on [Railway](https://railway.app):

1. Fork this repo
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add a PostgreSQL addon
4. Set environment variables:
   - `DATABASE_URL` (auto-filled by Railway PostgreSQL addon)
   - `CLERK_SECRET_KEY`
   - `CLERK_PUBLISHABLE_KEY`
   - `VITE_CLERK_PUBLISHABLE_KEY`
5. Deploy! Railway auto-deploys on every `git push` to `main`.

---

## 📂 Key Files

| File | Description |
|---|---|
| [`lib/api-spec/openapi.yaml`](lib/api-spec/openapi.yaml) | OpenAPI 3.1 spec — single source of truth |
| [`lib/db/src/schema/`](lib/db/src/schema) | Drizzle ORM schema & migrations |
| [`artifacts/career-radar/src/App.tsx`](artifacts/career-radar/src/App.tsx) | Frontend router root |
| [`artifacts/api-server/src/routes/`](artifacts/api-server/src/routes) | Express REST route handlers |

---

## 📄 License

MIT © [Udit Singh Chauhan](https://github.com/UditSinghChauhan)
