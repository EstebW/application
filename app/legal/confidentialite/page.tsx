import Link from 'next/link'
import LegalLayout from '@/components/LegalLayout'

export default function ConfidentialitePage() {
  return (
    <LegalLayout title="Politique de confidentialité">
      <p className="text-[#808080] text-sm">
        Dernière mise à jour : août 2026 · Contact :{' '}
        <a href="mailto:contact@starfusion.online" className="text-[#D4AF37] hover:underline">
          contact@starfusion.online
        </a>
      </p>

      <h2 className="text-white font-bold text-base pt-2">1. Données collectées</h2>
      <p>
        Compte (email, identifiant), données de session, historiques d’analyses / générations,
        données de paiement traitées par Stripe (nous ne stockons pas les numéros de carte),
        et photos temporairement nécessaires à l’analyse ou à la génération.
      </p>

      <h2 className="text-white font-bold text-base pt-2">2. Finalités</h2>
      <p>
        Fournir le service (analyse, génération, compte, facturation), sécuriser la plateforme,
        et répondre aux obligations légales. Pas de revente de vos photos à des tiers à des
        fins publicitaires.
      </p>

      <h2 className="text-white font-bold text-base pt-2">3. Sous-traitants</h2>
      <p>
        Supabase (hébergement / auth / base), Stripe (paiement), et le fournisseur d’IA
        utilisé pour la génération d’images. Ces acteurs traitent les données selon leurs
        propres politiques et nos instructions contractuelles.
      </p>

      <h2 className="text-white font-bold text-base pt-2">4. Conservation</h2>
      <p>
        Les photos de référence sont destinées à un usage technique temporaire. Les données
        de compte et d’historique sont conservées tant que le compte est actif, puis
        supprimées ou anonymisées sur demande dans la mesure du possible.
      </p>

      <h2 className="text-white font-bold text-base pt-2">5. Vos droits (RGPD)</h2>
      <p>
        Vous pouvez demander l’accès, la rectification, la suppression ou la portabilité de
        vos données, et vous opposer à certains traitements, en écrivant à{' '}
        <a href="mailto:contact@starfusion.online" className="text-[#D4AF37] hover:underline">
          contact@starfusion.online
        </a>
        .
      </p>

      <h2 className="text-white font-bold text-base pt-2">6. Documents liés</h2>
      <p>
        <Link href="/legal/cgu" className="text-[#D4AF37] hover:underline">
          CGU
        </Link>
        {' · '}
        <Link href="/legal/remboursement" className="text-[#D4AF37] hover:underline">
          Remboursement
        </Link>
      </p>
    </LegalLayout>
  )
}
