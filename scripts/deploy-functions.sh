#!/bin/bash
# Déploie les Edge Functions sur Supabase
# Prérequis : npx supabase login
# Secrets requis :
#   GEMINI_API_KEY (analyse faciale — Edge Function analyze)
#   KIE_API_KEY (génération Nano Banana — Edge Function generate)
set -e
cd "$(dirname "$0")/.."
PROJECT_REF=glgizfydsqsomrixgdyx

# `payment` volontairement exclu (legacy mint crédits sans Stripe — désactivé).
for fn in session register analyze generate account payment; do
  echo "Déploiement $fn..."
  npx supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
done

echo "✅ Edge Functions déployées."
