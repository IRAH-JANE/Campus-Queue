# Campus Queue

Campus Queue is a campus appointment and queue management web app. Students can find campus services, request an appointment, check in on the appointment day, and follow their queue status. Staff can manage office hours, review appointments, and serve tickets for assigned offices and counters. Administrators manage offices, services, counters, and staff assignments.

This project is intended as a learning/demo project. It has not been deployed or independently security-reviewed for production use.

## Features

- Student registration and sign-in. Public registration always creates a student account.
- Appointment availability based on an office's weekly hours, service duration, and closed dates.
- Appointment requests, staff approval, student check-in, and appointment history.
- Queue sessions and numbered tickets with staff controls to call, serve, complete, skip, or mark no-show.
- Staff office/counter assignments and role-protected administrator setup.
- HTTP-only session cookie managed through the Next.js server-side API proxy.
- Campus timezone configuration (defaults to `Asia/Manila`).

## Project layout

```text
campus-queue/
├── backend/   NestJS API, Prisma schema/migrations, and local database scripts
└── frontend/  Next.js web application and same-origin API proxy
```

## Requirements

- Node.js and npm (use a current Node.js LTS release)
- Docker Desktop, for the local PostgreSQL development database

## Run locally (Windows PowerShell)

### 1. Start PostgreSQL

Start the disposable development container if it is not already running. Use a local-only password of your choice; do not commit it or paste it into chat.

```powershell
docker run --name campus-queue-test-db `
  -e POSTGRES_USER=campus_queue `
  -e POSTGRES_PASSWORD='choose-a-local-password' `
  -e POSTGRES_DB=campus_queue_test `
  -p 127.0.0.1:5433:5432 `
  -d postgres:17-alpine
```

If the container already exists, start it with `docker start campus-queue-test-db` instead of creating another one. Keep this database disposable; never point the local helper scripts at production data.

### 2. Configure and migrate the backend

```powershell
Set-Location .\backend
Copy-Item .env.example .env
```

Edit `backend/.env` and set `JWT_SECRET` to a long, random value. The local PowerShell scripts supply the database URL from the Docker container without printing its password. Install and prepare the backend:

```powershell
npm install
.\scripts\migrate-local-db.ps1
```

The migration helper is guarded for the named local Docker database. It checks the existing schema and applies only the repository migrations it determines are needed. Do not use `prisma migrate reset` on an existing database.

### 3. Run the backend

In the backend terminal:

```powershell
.\scripts\start-local-backend.ps1
```

Keep this terminal open. The API listens on port `3001` by default.

### 4. Run the frontend

Open a second terminal:

```powershell
Set-Location ..\frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The frontend API proxy uses `CAMPUS_API_URL`, defaulting to `http://localhost:3001`. If you change it, set that variable in `frontend/.env.local` (see `frontend/.env.example`) and restart the frontend.

## Local administrator account

Public registration cannot create administrators. For local development only, use the guarded provisioning helper from `backend`:

```powershell
.\scripts\provision-local-admin.ps1
```

The script asks for confirmation and prompts for a password without displaying it. Keep the password in a password manager. See [`backend/scripts/README-admin.md`](backend/scripts/README-admin.md) for details. Do not use this helper to provision an administrator in a hosted database.

## Environment variables

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Backend/Prisma | PostgreSQL connection string. Keep it private. |
| `JWT_SECRET` | Backend | Required signing secret for authentication tokens. Keep it private and unique per environment. |
| `PORT` | Backend | API listen port; defaults to `3001`. |
| `CAMPUS_TIME_ZONE` | Backend | Campus timezone for scheduling and daily queue sessions; defaults to `Asia/Manila`. |
| `CAMPUS_API_URL` | Frontend server | Backend origin used by the Next.js API proxy; defaults to `http://localhost:3001`. |

Use the `.env.example` files as templates. Never commit `.env`, `.env.local`, production connection strings, JWT secrets, or account passwords.

## Useful commands

Backend (from `backend/`):

```powershell
npm run build
npm test
npx prisma migrate status
```

Frontend (from `frontend/`):

```powershell
npm run build
npm run lint
```

## Deployment overview

The application is split into two deployable services: the Next.js frontend and the NestJS API. A hosted PostgreSQL database is also required. One possible arrangement is Vercel for `frontend/`, Render for `backend/`, and a managed PostgreSQL provider. Configure the frontend's `CAMPUS_API_URL` to the deployed API URL. Configure the backend's `DATABASE_URL`, `JWT_SECRET`, `PORT`, and `CAMPUS_TIME_ZONE` as private service environment variables. Set a strong, unique production `JWT_SECRET`.

Before deploying, create a production database and apply the checked-in Prisma migrations using `npx prisma migrate deploy` from `backend/`. Do not run local database helper scripts or `migrate reset` against production. Keep database credentials out of GitHub and deployment logs.

This codebase has not been deployed yet. Hosting choices, account access, environment variables, and production database setup must be completed for the target accounts before there is a live URL.

## License

No license has been selected yet. Unless a license is added, others do not automatically receive permission to reuse, modify, or redistribute the project.
