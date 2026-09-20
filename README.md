# Bous Lakay — Production Starter

This is a production-ready, mobile-first Bous Lakay starter for a Bous Lakay web app.

IMPORTANT:
- The included demo uses a Node.js/Express API and SQLite for development.
- Payment deposits are manual verification only. No fake transaction verification is implemented.
- MonCash/NatCash credentials are NOT included. Add real provider credentials through environment variables after obtaining an approved merchant/business account and official API access.
- Withdrawals are recorded as pending requests and must be processed/approved by an authorized administrator.
- Do not advertise guaranteed profits or false affiliations with third parties.

## Run locally

1. Install Node.js 20+.
2. Copy `.env.example` to `.env`.
3. Run:
   npm install
   npm start
4. Open http://localhost:3000

Demo admin:
- Username: admin
- Password: change-this-password

Change the admin password before deployment.

## Production deployment

Use a Node.js-capable host. Set environment variables from `.env.example`.
For production, replace SQLite with PostgreSQL or another managed database, enable HTTPS, configure backups, and use a proper authentication/session strategy.

## Payment integration

The code intentionally does NOT invent or simulate provider APIs. To connect MonCash/NatCash:
1. Obtain the appropriate merchant/business account.
2. Obtain official API documentation and credentials.
3. Implement server-side payment creation and webhook/callback verification.
4. Credit balances only after server-side verification of the provider transaction.

## Security checklist

- Set a strong ADMIN_PASSWORD.
- Set a random SESSION_SECRET.
- Use HTTPS.
- Use a managed production database.
- Add rate limiting and CSRF protection before public launch.
- Keep provider/API secrets only in environment variables.
- Enable database backups.

## VIP
No VIP tiers are included in this version.
