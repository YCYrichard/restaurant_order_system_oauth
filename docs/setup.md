# Local setup

## Database
1. Create an empty MySQL database matching `DB_NAME` in your `.env`.
2. From `backend/`, run `npm run migrate` to apply everything under `database/migrations/`.
   - `database/schema.sql` and `database/schema_orders.sql` are kept only as historical
     reference for what originally shipped — they are no longer applied directly and may
     not match the current schema. `database/migrations/` is the source of truth; add a
     new migration file for every future schema change instead of editing those `.sql`
     files or the database by hand.
   - To roll back the most recent migration: `npm run migrate:down`.
   - To create a new migration: `npm run migrate:create -- <name>`.

## Backend
1. Copy `.env.example` to `.env`.
2. Fill Google, Facebook, and LINE client IDs and secrets.
3. Run:
   - `npm install`
   - `npm run migrate`
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
2. Run `npm run migrate` (see Database section above).
3. Start backend.
4. Start Flutter Web.
5. Click a social login button.
6. Finish provider login.
7. You should return to `/#/auth-success?token=...`
