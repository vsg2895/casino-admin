import type { SpecialOffer } from '@shared/types/specialOffer'

export interface CasinoOption {
  label: string
  value: number | null
}

/**
 * The "filter by casino" options, built from a loaded offers list: "All
 * casinos" (null) first, then every casino with at least one offer, by name.
 * Needs no request of its own. Shared by Special Offers and Bonus Categories.
 */
export function casinoOptionsFromOffers(offers: readonly SpecialOffer[]): CasinoOption[] {
  const byId = new Map<number, string>()
  for (const o of offers) {
    if (!byId.has(o.casino_id)) byId.set(o.casino_id, o.casino?.name ?? `Casino #${o.casino_id}`)
  }
  return [
    { label: 'All casinos', value: null },
    ...[...byId.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ label, value })),
  ]
}
