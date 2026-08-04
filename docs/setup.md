# Local setup

## Backend
1. Copy `.env.example` to `.env`.
2. Fill Google, Facebook, and LINE client IDs and secrets.
3. Run:
   - `npm install`
   - `npm run dev`
4. Check: `http://localhost:3000/health`

## Flutter Web
1. Open `frontend/flutter_web`.
2. Run:
   - `flutter pub get`
   - `flutter run -d chrome`
3. Update `FRONTEND_URL` in backend `.env` to the exact Flutter local URL.

## Callback URLs
- Google: `http://localhost:3000/auth/google/callback`
- Facebook: `http://localhost:3000/auth/facebook/callback`
- LINE: `http://localhost:3000/auth/line/callback`

## Test flow
1. Start MySQL.
2. Import schema.
3. Start backend.
4. Start Flutter Web.
5. Click a social login button.
6. Finish provider login.
7. You should return to `/#/auth-success?token=...`
