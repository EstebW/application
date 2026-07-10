#!/bin/bash
# Déploie la Edge Function generate (Nano Banana 2 via kie.ai, sans bucket Supabase)
# Prérequis : npx supabase login
set -e
cd "$(dirname "$0")/.."
npx supabase functions deploy generate --project-ref glgizfydsqsomrixgdyx
