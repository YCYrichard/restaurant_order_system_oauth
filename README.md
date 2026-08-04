# Restaurant Order System OAuth Starter

This package includes:
- Flutter Web starter
- Node.js backend starter
- MySQL schema
- Google, Facebook, and LINE OAuth starter routes
- Local setup instructions

## Quick start

### 1) MySQL
Create a database named `restaurant_order_system` and import `database/schema.sql`.

### 2) Backend
```bash
cd backend
npm install
npm run dev
```

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
