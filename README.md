# Restaurant Order System OAuth Starter

This package includes:
- Flutter Web starter
- Node.js backend starter
- MySQL schema
- Google, Facebook, and LINE OAuth starter routes
- Local setup instructions

## Quick start

### 1) MySQL
Create an empty database named `restaurant_order_system`.

### 2) Backend
```bash
cd backend
npm install
npm run migrate
npm run dev
```

`npm run migrate` applies everything under `database/migrations/` (the source of truth for the schema — see `docs/setup.md`). `database/schema.sql` and `database/schema_orders.sql` are historical references only and are no longer imported directly.

Backend runs at `http://localhost:3000`.

### 3) Flutter Web
```bash
cd frontend/flutter_web
flutter pub get
flutter run -d chrome
```

Flutter Web runs on a local dev URL shown by Flutter, often `http://localhost:xxxxx`.

### 4) Test login
Open the Flutter page and click:
- Continue with Google
- Continue with Facebook
- Continue with LINE

The browser will redirect to the backend OAuth route, then to the provider, then back to the backend callback.

## Important
Before login works, configure provider apps and set callback URLs in `backend/.env`.
