#!/bin/bash
# Déploie les Edge Functions sur Supabase
# Prérequis : npx supabase login
# Secrets requis : KIE_API_KEY (Supabase Dashboard → Edge Functions → Secrets)
set -e
cd "$(dirname "$0")/.."
PROJECT_REF=glgizfydsqsomrixgdyx

for fn in session register analyze generate payment account; do
  echo "Déploiement $fn..."
  npx supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
done

echo "✅ Edge Functions déployées."
