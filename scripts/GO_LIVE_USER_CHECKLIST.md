# À faire de ton côté (après les fixes code)

## 1. SQL dans Supabase (SQL Editor → Run)

Dans cet ordre si pas déjà fait :

1. `scripts/add-stripe-schema.sql` (si pas encore)
2. `scripts/add-user-roles.sql` (si pas encore)
3. `scripts/consume-credit-rpc.sql` **(nouveau — obligatoire)**
4. `scripts/harden-rls.sql` **(nouveau — obligatoire)**

## 2. Redéployer les Edge Functions

```bash
./scripts/deploy-functions.sh
```

Ou Dashboard : redéployer au minimum `generate`, `account`, `register`, `payment`.

## 3. Vercel / env Production

- `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` **live**
- `STRIPE_PRICE_ONCE` / `WEEKLY` / `MONTHLY` (price_… live)
- `STRIPE_WEBHOOK_SECRET` (endpoint prod `/api/stripe/webhook`)
- `NEXT_PUBLIC_APP_URL=https://starfusion.online`
- `SUPABASE_SERVICE_ROLE_KEY`
- `KIE_API_KEY` (secret edge Supabase aussi)

## 4. Stripe Dashboard

- Customer Portal activé : https://dashboard.stripe.com/settings/billing/portal
- Webhook live qui reçoit bien les events

## 5. Support email

Les pages légales pointent vers `contact@starfusion.online` — crée cette boîte (ou change l’adresse dans les pages `/legal/*`).

## 6. Relire / adapter les textes légaux

CGU, confidentialité, remboursement sont des bases — fais-les valider si besoin (avocat).

## 7. Push / redeploy Vercel

Commit + push du code, puis vérifier un parcours payant test (petit montant) en live.
