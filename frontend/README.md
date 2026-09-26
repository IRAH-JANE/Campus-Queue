# Campus Queue frontend

Student-facing campus portal built with Next.js 16 and React 19. It includes
student registration and sign-in, appointment requests and check-in, queue
status, staff appointment review, and basic admin office/service setup.

## Run locally

1. Start the NestJS backend from `../backend` on port `3001` and apply its
   pending Prisma migration before using appointment or queue features.
2. Copy `.env.example` to `.env.local` if the backend is not at
   `http://localhost:3001`, then set `CAMPUS_API_URL` to its server URL.
3. Install dependencies with `npm install` and run `npm run dev`.
4. Open `http://localhost:3000`.

The browser talks to same-origin Next.js route handlers. The Next server forwards
requests to the backend and keeps the JWT in an HTTP-only session cookie rather
than browser storage. The backend URL is server-only.

## Current backend boundaries

Staff can review appointments and manage today’s queue sessions for offices and
counters they’re assigned to. Admin setup includes offices, services, counters,
and staff-to-office/counter assignments. Queue sessions appear after the first
student joins that service on the current campus day.
