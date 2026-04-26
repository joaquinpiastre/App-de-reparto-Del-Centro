# Del Centro Backend (Railway)

## Variables
Copiá `.env.example` a `.env`.

## Scripts
- `npm run dev`: servidor local.
- `npm run db:schema`: aplica `src/db/schema.sql` sobre `DATABASE_URL`.

## Endpoints base
- `GET /health`
- `POST /auth/login`
- `POST /gps/update`
- `GET /gps/live`
- `GET /pedidos-calle`
- `POST /pedidos-calle`
- `PATCH /pedidos-calle/:id/estado`
