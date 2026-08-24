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

  ![CI](https://github.com/UditSinghChauhan/CareerRadar/actions/workflows/ci.yml/badge.svg)
  ![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
  ![AI Powered](https://img.shields.io/badge/AI-Gemini_Powered-4285F4?style=for-the-badge&logo=google&logoColor=white)

  </p>

  <p>
    <a href="https://careerradar-34ec.onrender.com/"><strong>🌐 Live Demo</strong></a> ·
    <a href="#features"><strong>Features</strong></a> ·
    <a href="#tech-stack"><strong>Tech Stack</strong></a> ·
    <a href="#getting-started"><strong>Getting Started</strong></a>
  </p>
</div>

---

## 📸 Screenshots

<div align="center">

### Landing Page
<img src="docs/screenshots/landing.png" alt="CareerRadar Landing Page" width="800" />

### Dashboard
<img src="docs/screenshots/dashboard.png" alt="Dashboard — stats, recommendations, closing deadlines" width="800" />

### Jobs Explorer
<img src="docs/screenshots/jobs.png" alt="Jobs Explorer — filters, search, job cards" width="800" />

### Profile
<img src="docs/screenshots/profile.png" alt="Profile — academic details, skills, resume" width="800" />

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
- **🤖 AI Matching** — Powered by Gemini to intelligently match your profile against job descriptions
- **🔐 Auth** — Secure sign-in/sign-up via Clerk (Google OAuth, Email/Password)
- **🌙 Dark Mode** — Full light/dark theme support via `next-themes`
- **📱 Responsive** — Mobile-first UI built with Radix UI + shadcn/ui components + Tailwind CSS v4

---

## 🏗️ Architecture

```mermaid
graph LR
    A[Frontend UI\nReact/Vite] -->|React Query| B(API Server\nExpress)
    B --> C[(Data Layer\nPostgreSQL + Drizzle)]
    D[Sync Engine\nScheduler] -->|Fetches Listings| C
    D -->|Calls| E[External APIs]
    B -->|Auth| F[Clerk]
```

---

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, Vite, Wouter, Radix UI, shadcn/ui, Tailwind CSS v4, React Query |
| **Backend** | Express 5, Node.js, TypeScript |
| **Database** | PostgreSQL 16, Drizzle ORM |
| **Auth & Security** | Clerk (Google OAuth, Email/Password, RBAC), Helmet, CORS |
| **AI Integration** | Google Gemini API for smart job matching |
| **Testing** | Vitest, React Testing Library, jsdom |
| **CI/CD** | GitHub Actions (Lint, Typecheck, Test, Build), Replit Deployments |
| **API Contract** | OpenAPI 3.1 YAML → Orval codegen (Zod validators + React Query hooks) |

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

Copy `.env.example` to `.env` or create a `.env` file in the root:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/careerradar

# Clerk Auth
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...

# AI
GEMINI_API_KEY=AIzaSy...

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

## 📖 API Documentation

API documentation is generated using OpenAPI and Swagger UI. When running the development server, you can view the interactive docs at:

`http://localhost:8080/api/docs`

---

## 🌐 Deployment

This project is deployed on **Render** for always-on hosting.

**Live URL:** [careerradar-34ec.onrender.com](https://careerradar-34ec.onrender.com/)

---

## 🤝 Contributing

We welcome contributions! 
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

MIT © [Udit Singh Chauhan](https://github.com/UditSinghChauhan)
