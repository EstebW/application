import Link from 'next/link'
import LegalLayout from '@/components/LegalLayout'

export default function CguPage() {
  return (
    <LegalLayout title="Conditions générales d’utilisation">
      <p className="text-[#808080] text-sm">
        Dernière mise à jour : août 2026 · Éditeur : StarFusion
      </p>

      <h2 className="text-white font-bold text-base pt-2">1. Objet</h2>
      <p>
        StarFusion propose un service en ligne d’analyse de ressemblance et de génération
        d’images à partir de photos fournies par l’utilisateur, à des fins de divertissement.
      </p>

      <h2 className="text-white font-bold text-base pt-2">2. Compte et accès</h2>
      <p>
        Certaines fonctionnalités (génération d’images, historique) nécessitent la création
        d’un compte. L’utilisateur est responsable de la confidentialité de ses identifiants.
      </p>

      <h2 className="text-white font-bold text-base pt-2">3. Crédits et paiements</h2>
      <p>
        Les générations d’images consomment des crédits achetés via Stripe (paiement unique ou
        abonnement). Les prix affichés au moment du paiement font foi. Les abonnements se
        renouvellent jusqu’à résiliation via le portail client Stripe.
      </p>

      <h2 className="text-white font-bold text-base pt-2">4. Contenu et usage</h2>
      <p>
        Les résultats sont générés par intelligence artificielle et peuvent être imparfaits.
        L’utilisateur s’engage à ne pas utiliser le service à des fins illégales, diffamatoires,
        trompeuses ou portant atteinte aux droits de tiers (y compris le droit à l’image).
      </p>

      <h2 className="text-white font-bold text-base pt-2">5. Propriété intellectuelle</h2>
      <p>
        StarFusion et ses éléments (marque, interface, logiciels) restent la propriété de
        l’éditeur. Les photos uploadées restent la propriété de l’utilisateur ; ce dernier
        accorde une licence limitée nécessaire au traitement du service.
      </p>

      <h2 className="text-white font-bold text-base pt-2">6. Disponibilité</h2>
      <p>
        Le service est fourni « en l’état ». Des interruptions (maintenance, fournisseurs IA
        ou paiement) peuvent survenir sans que cela ouvre droit à indemnité hors cadre légal
        applicable.
      </p>

      <h2 className="text-white font-bold text-base pt-2">7. Documents liés</h2>
      <p>
        Voir aussi nos pages{' '}
        <Link href="/legal/confidentialite" className="text-[#D4AF37] hover:underline">
          confidentialité
        </Link>{' '}
        et{' '}
        <Link href="/legal/remboursement" className="text-[#D4AF37] hover:underline">
          remboursement
        </Link>
        .
      </p>
    </LegalLayout>
  )
}
