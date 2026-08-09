import Link from 'next/link'
import LegalLayout from '@/components/LegalLayout'

export default function RemboursementPage() {
  return (
    <LegalLayout title="Politique de remboursement">
      <p className="text-[#808080] text-sm">
        Dernière mise à jour : août 2026
      </p>

      <h2 className="text-white font-bold text-base pt-2">1. Crédits consommés</h2>
      <p>
        Les crédits déjà utilisés pour une génération réussie ne sont en principe pas
        remboursables : le service numérique a été pleinement exécuté.
      </p>

      <h2 className="text-white font-bold text-base pt-2">2. Échec technique</h2>
      <p>
        Si une génération échoue côté serveur après débit, le crédit est normalement
        rétabli automatiquement. Si ce n’est pas le cas, contactez-nous avec l’heure et
        l’email du compte.
      </p>

      <h2 className="text-white font-bold text-base pt-2">3. Abonnements</h2>
      <p>
        Vous pouvez résilier un abonnement à tout moment via « Gérer mon abonnement »
        (portail Stripe). La résiliation prend effet à la fin de la période déjà payée ;
        les crédits restants restent utilisables jusqu’à cette date selon les règles du
        produit.
      </p>

      <h2 className="text-white font-bold text-base pt-2">4. Droit de rétractation</h2>
      <p>
        Conformément au droit applicable aux contenus numériques fournis immédiatement,
        vous reconnaissez qu’en lançant une génération après achat vous demandez
        l’exécution immédiate du service, ce qui peut limiter le droit de rétractation
        pour les crédits déjà consommés.
      </p>

      <h2 className="text-white font-bold text-base pt-2">5. Demande</h2>
      <p>
        Contactez l’éditeur via les coordonnées indiquées sur le site, en précisant l’email
        du compte et la preuve de paiement Stripe. Voir aussi les{' '}
        <Link href="/legal/cgu" className="text-[#D4AF37] hover:underline">
          CGU
        </Link>
        .
      </p>
    </LegalLayout>
  )
}
