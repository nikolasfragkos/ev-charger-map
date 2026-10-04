<h1 align="center" style="font-size: 80px; margin: 0;">⚡🚗</h1>

<h1 align="center">EV Charger Map</h1>
<h3 align="center"><em>Find, reserve, and charge — all in one place.</em></h3>

<p align="center">
  A full-stack EV charging station management platform with interactive maps, real-time reservations, live charging sessions, Stripe payments, and dynamic energy pricing.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Frontend-Next.js%2016-black?logo=next.js" alt="Next.js"/>
  <img src="https://img.shields.io/badge/Backend-Express%205-000000?logo=express" alt="Express"/>
  <img src="https://img.shields.io/badge/Database-PostgreSQL-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL"/>
  <img src="https://img.shields.io/badge/Cache-Redis-DC382D?logo=redis&logoColor=white" alt="Redis"/>
  <img src="https://img.shields.io/badge/Payments-Stripe-635BFF?logo=stripe&logoColor=white" alt="Stripe"/>
  <img src="https://img.shields.io/badge/Language-TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Infra-Docker-2496ED?logo=docker&logoColor=white" alt="Docker"/>
</p>

---

## 📖 About

**EV Charger Map** is a web application for managing a network of electric vehicle charging stations. Users can locate chargers on an interactive map, reserve time slots, start and monitor charging sessions in real time, and pay seamlessly via Stripe. The platform also features a dynamic pricing engine that factors in time-of-day adjustments and wholesale energy prices from the ENTSO-E API.

The project was built as a full software engineering exercise — covering requirements analysis, UML-based design, a RESTful API with OpenAPI documentation, a CLI client, automated testing, and a responsive React frontend accessible on both desktop and mobile.

---

## ✨ Highlights

| Aspect | Details |
|---|---|
| 🗺️ **Interactive Map** | Clustered charger pins color-coded by status (available, charging, reserved, malfunction, offline) with real-time updates |
| ⚡ **Live Charging Sessions** | Start/stop sessions with live kWh and cost tracking; battery-aware auto-stop based on your EV's specs |
| 🔒 **Atomic Reservations** | Redis + Lua scripts prevent double-booking; expired reservations are cleaned up by a background job every 60 s |
| 💳 **Stripe Payments** | Full pre-authorization → capture flow; automatic release of unused hold amounts |
| 📊 **Dynamic Pricing** | Configurable pricing profiles with time-of-day windows, power tiers, and wholesale energy price integration (ENTSO-E) |
| 🚗 **200+ EV Catalog** | Select your vehicle from a catalog of 200+ EV models with accurate battery specs and charging curves |
| 📱 **Responsive Design** | Full mobile-optimized UI — access from any smartphone on the same Wi-Fi network |
| 🖥️ **CLI Client** | Scriptable command-line interface for all core operations, supporting both JSON and CSV output |

---

## 🏗️ Architecture

```
┌─────────────────────────┐       ┌─────────────────────────┐
│    Next.js Frontend     │──────▶│    Express Backend      │
│    (Port 3000)          │       │    (Port 9876)          │
│                         │       │                         │
│  • Interactive Map      │       │  • RESTful API          │
│  • Charger Details      │       │  • JWT Authentication   │
│  • Billing & Stats      │       │  • Stripe Payments      │
│  • Vehicle Management   │       │  • Dynamic Pricing      │
│  • Mobile Responsive    │       │  • Redis Sync           │
└─────────────────────────┘       └──────┬──────────┬───────┘
                                         │          │
                                  ┌──────▼───┐  ┌───▼──────┐
                                  │PostgreSQL│  │  Redis   │
                                  │  (5432)  │  │  (6379)  │
                                  │          │  │          │
                                  │ Users    │  │ Locks    │
                                  │ Chargers │  │ Status   │
                                  │ Sessions │  │ Reserv.  │
                                  │ Payments │  │ Cleanup  │
                                  │ Vehicles │  │          │
                                  └──────────┘  └──────────┘
```

---

## ⚡ Features

### For Users

- **Map View** — interactive map with clustered charger pins, color-coded by real-time status
- **Charger Details** — view charger specs, current status, pricing, and connector type
- **Reservations** — reserve a charger for up to 60 minutes with automatic expiry and countdown timer
- **Charging Sessions** — start/stop sessions with live kWh tracking, cost calculation, and battery-aware auto-stop
- **Stripe Payments** — pre-authorization holds at session start, automatic capture on completion, unused amount released
- **Billing History** — monthly and yearly spending summaries with custom date-range statistics
- **Vehicle Management** — select your EV from a catalog of 200+ models with accurate battery and charging specs
- **Problem Reporting** — report charger issues directly through the app
- **Profile & Preferences** — manage your account details, payment methods, and notification preferences

### For Admins

- **Dashboard** — manage users, chargers, and system health from a central admin panel
- **Pricing Profiles** — create and assign dynamic pricing rules with time-of-day windows and power tiers
- **Wholesale Integration** — real-time energy price data from ENTSO-E feeds into the pricing engine
- **Bulk Operations** — import/reset charger data from JSON datasets or CSV files
- **Health Monitoring** — system health check endpoint with database connectivity and charger status summary

### Technical

- **Atomic Reservations** — Redis Lua scripts for race-condition-free charger locking
- **Dual-State Sync** — database + Redis keep charger status consistent across API calls
- **Background Cleanup** — expired reservations automatically released every 60 seconds
- **JWT Auth + RBAC** — role-based access control (User / Admin) with JWT tokens
- **OpenAPI 3.0** — full API specification available in the `/documentation` folder
- **Webhook Subscriptions** — third-party apps can subscribe to charger status change events

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | [Next.js 16](https://nextjs.org/) + [React 19](https://react.dev/) | Server-side rendered React application |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com/) | Utility-first CSS framework |
| **UI Components** | [Radix UI](https://www.radix-ui.com/) + [shadcn/ui](https://ui.shadcn.com/) | Accessible, composable component library |
| **Maps** | [Pigeon Maps](https://pigeon-maps.js.org/) | Lightweight OpenStreetMap-based map component |
| **Charts** | [Recharts](https://recharts.org/) | Composable charting library for billing stats |
| **Backend** | [Express 5](https://expressjs.com/) + TypeScript | RESTful API server |
| **ORM** | [Prisma](https://www.prisma.io/) | Type-safe database access and migrations |
| **Database** | [PostgreSQL 15](https://www.postgresql.org/) | Primary relational data store |
| **Cache** | [Redis 7](https://redis.io/) | Reservation locks, charger status, and background jobs |
| **Payments** | [Stripe](https://stripe.com/) | Payment intents, pre-authorization, and capture |
| **Energy Data** | [ENTSO-E API](https://transparency.entsoe.eu/) | Wholesale electricity prices for dynamic pricing |
| **CLI** | [Commander.js](https://github.com/tj/commander.js) | Command-line interface framework |
| **Validation** | [Zod](https://zod.dev/) | Runtime schema validation |
| **Infrastructure** | [Docker Compose](https://docs.docker.com/compose/) | PostgreSQL + Redis container orchestration |

---

## 📁 Repository Structure

```
ev-charger-map/
├── front-end/                      Next.js React application
│   ├── src/
│   │   ├── app/                    Page routes (map, signin, signup, billing, profile, vehicles)
│   │   ├── components/             React components (MapView, ChargerDetails, FilterMenu, etc.)
│   │   ├── hooks/                  Custom React hooks
│   │   ├── utils/                  API client utilities
│   │   ├── types/                  TypeScript type definitions
│   │   └── styles/                 Global styles
│   └── .env.local                  Frontend environment config
│
├── back-end/                       Express REST API
│   ├── src/
│   │   ├── routes/                 API endpoint handlers (points, reserve, charging, sessions, etc.)
│   │   ├── controllers/            Business logic (payments, auth)
│   │   ├── middleware/             JWT auth, error handling
│   │   ├── services/               Redis operations
│   │   ├── pricing/                Dynamic pricing engine
│   │   ├── redis/                  Redis client & Lua scripts
│   │   ├── scripts/                Seed scripts (cars, demo data)
│   │   └── data/                   Demo datasets (chargers JSON/CSV)
│   ├── prisma/
│   │   ├── schema.prisma           Database schema (14 models, 6 enums)
│   │   └── seed.ts                 Initial seed (admin user)
│   └── .env                        Backend environment config
│
├── cli-client/                     CLI tool (se2502)
│   └── se2502.js                   CLI executable
│
├── documentation/                  Project documentation
│   ├── openapi.yaml                OpenAPI 3.0 specification
│   └── srs-softeng25-02.zip        Software Requirements Specification
│
├── tests/                          Integration tests
│   ├── postman_script.json         Postman API test collection
│   └── cli.test.ts                 CLI functional tests
│
├── docker-compose.yml              PostgreSQL + Redis containers
├── setup.sh / setup.ps1            One-command dev environment setup
└── reset-for-testing.sh/.ps1       Reset to fresh state for testing
```

---

## 🔌 API Reference

**Base URL:** `https://{{host}}:9876/api`

Full [OpenAPI 3.0 specification](documentation/openapi.yaml) available in the `documentation/` folder.

### Admin Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/admin/healthcheck` | System health check — database connectivity, charger counts |
| `POST` | `/admin/resetpoints` | Reset charger data from default JSON dataset |
| `POST` | `/admin/addpoints` | Bulk-add chargers via CSV upload (`multipart/form-data`) |

### Core Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/points` | List all chargers (optional `?status=` filter) |
| `GET` | `/point/:id` | Get charger details (status, pricing, reservation info) |
| `POST` | `/reserve/:id/:minutes` | Reserve a charger (default 30 min, max 60 min) |
| `POST` | `/updpoint/:id` | Update charger status and/or kWh price |
| `POST` | `/newsession` | Record a charging session event |
| `GET` | `/sessions/:id/:from/:to` | List charging sessions for a charger within a date range |
| `GET` | `/pointstatus/:id/:from/:to` | List status change history for a charger |

### Auth & User Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/signup` | Register new user |
| `POST` | `/auth/signin` | Login — returns JWT |
| `GET` | `/me` | Get authenticated user profile |
| `GET` | `/payments/history` | Billing history |
| `GET` | `/cars` | Browse EV catalog |

> All responses are returned in **JSON** (default) or **CSV** format via the `?format=json|csv` query parameter.

---

## 💻 CLI Client

The CLI mirrors all REST API operations and is available as `se2502` after setup:

```bash
# System health check
se2502 healthcheck

# Reset charger database
se2502 resetpoints

# List chargers (CSV output by default)
se2502 points --status available --format json

# Get charger details
se2502 point --id 123

# Reserve a charger for 45 minutes
se2502 reserve --id 123 --minutes 45

# Update charger status and price
se2502 updpoint --id 123 --status available --price 0.35

# Record a charging session
se2502 newsession --id 1510 --starttime "2025-11-10 19:00" --endtime "2025-11-10 22:00" \
  --startsoc 20 --endsoc 40 --totalkwh 10.00 --kwhprice 0.50 --amount 5.00

# List charging sessions for a charger within a date range
se2502 sessions --id 3 --from 20251101 --to 20251130 --format json

# List charger status changes
se2502 pointstatus --id 3 --from 20251101 --to 20251130

# Add new chargers from CSV file
se2502 addpoints --source new_chargers.csv
```

---

## 🚀 Getting Started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — for PostgreSQL and Redis
- [Node.js](https://nodejs.org/) v20+ and npm

### One-Command Setup

**macOS / Linux:**
```bash
chmod +x setup.sh
./setup.sh
```

**Windows (PowerShell):**
```powershell
.\setup.ps1
```

The setup script will:
1. Start PostgreSQL and Redis via Docker Compose
2. Install all dependencies (backend, frontend, CLI)
3. Create `.env` files with default configuration
4. Initialize the database schema and run Prisma migrations
5. Seed the admin user and load the EV catalog (200+ models)
6. Import demo charger locations
7. Auto-detect your LAN IP for smartphone access

### Running the App

After setup, start both services in separate terminals:

**Terminal 1 — Backend:**
```bash
cd back-end && npm run dev
```

**Terminal 2 — Frontend:**
```bash
cd front-end && npm run dev
```

Open **http://localhost:3000** in your browser.

### 📱 Phone Access

The frontend runs on `0.0.0.0:3000`. To access from a phone on the same Wi-Fi network:

1. Find your LAN IP (printed during setup, or check `front-end/.env.local`)
2. Open `http://<YOUR_LAN_IP>:3000` on your phone
3. The backend API URL in `.env.local` already points to your LAN IP

---

## 🔑 Default Credentials

| Role | Email | Password |
|---|---|---|
| Admin | `admin@ev.local` | `admin123` |

---

## ⚙️ Environment Variables

### Backend (`back-end/.env`)

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@localhost:5432/ev_app` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `JWT_SECRET` | `supersecretkey` | JWT signing secret |
| `PORT` | `9876` | API server port |
| `STRIPE_SECRET_KEY` | `sk_test_...` | Stripe secret key (test mode) |
| `ENTSOE_TOKEN` | `...` | ENTSO-E energy price API token |
| `ENABLE_PRICING` | `1` | Enable dynamic pricing engine |

### Frontend (`front-end/.env.local`)

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://<LAN_IP>:9876/api/v1` | Backend API URL |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` | Stripe publishable key |
| `NEXT_PUBLIC_WEB3FORMS_KEY` | `...` | Contact form service key |
| `NEXT_PUBLIC_ENABLE_MOCK_SESSION` | `0` | Enable mock session button for testing |

---

## 🧪 Testing

### API Functional Tests

A Postman collection is included for automated API testing:

```bash
# Import the collection into Postman
tests/postman_script.json
```

### CLI Tests

```bash
# Run CLI functional tests
npx tsx tests/cli.test.ts
```

### Reset for Testing

To wipe the entire environment and start fresh:

```bash
# macOS / Linux
./reset-for-testing.sh

# Windows (PowerShell)
.\reset-for-testing.ps1
```

---

## 👨‍💻 Team — Group 02

| Name | Registration Number |
|---|---|
| Fragkos Nikolaos-Dionysios | el22028 |
| Mantzaris Konstantinos | el22406 |
| Ntontos Stergios | el23406 |
| Pallis Georgios | el22144 |
| Stamatopoulos Grigorios | el22039 |
| Zakynthinos Iason | el23408 |

---

## 🎓 Academic Context

This project was developed as the semester project for the **Software Engineering (Τεχνολογία Λογισμικού)** course at the **School of Electrical and Computer Engineering (ECE)**, **National Technical University of Athens (NTUA)** — Winter Semester 2025–2026.

**Instructor:** Prof. V. Vescoukis
