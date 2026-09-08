import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import * as countriesApi from '@/api/countries'
import type { Continent, Country, UpsertCountryPayload } from '@shared/types/country'

/**
 * A store rather than local state, because two screens need the same list: the
 * Countries manager and the casino form's "Countries" multi-select.
 *
 * The backend already returns countries in grid order (continent position, then
 * country position, then name), so nothing here re-sorts the whole list — only
 * a newly created row is placed, to avoid a refetch.
 */
export const useCountriesStore = defineStore('countries', () => {
  const countries = ref<Country[]>([])
  const continents = ref<Continent[]>([])
  const loading = ref(false)

  /** The list grouped for display, in the same order the public grid uses. */
  const byContinent = computed<{ continent: Continent; countries: Country[] }[]>(() =>
    continents.value
      .map((continent) => ({
        continent,
        countries: countries.value.filter((c) => c.continent_id === continent.id),
      }))
      .filter((group) => group.countries.length > 0),
  )

  async function fetchCountries(): Promise<void> {
    loading.value = true
    try {
      const [list, groups] = await Promise.all([
        countriesApi.listCountries(),
        countriesApi.listContinents(),
      ])
      countries.value = list.data
      continents.value = groups.data
    } finally {
      loading.value = false
    }
  }

  /** Load once — for screens that only consume the list, like the casino form. */
  async function ensureLoaded(): Promise<void> {
    if (countries.value.length > 0 || loading.value) return
    await fetchCountries()
  }

  async function add(payload: UpsertCountryPayload): Promise<Country> {
    const response = await countriesApi.createCountry(payload)
    countries.value.push(response.data)
    sortInPlace()
    return response.data
  }

  async function save(id: number, payload: UpsertCountryPayload): Promise<Country> {
    const response = await countriesApi.updateCountry(id, payload)
    const index = countries.value.findIndex((c) => c.id === id)
    if (index !== -1) countries.value[index] = response.data
    sortInPlace()
    return response.data
  }

  async function remove(id: number): Promise<void> {
    await countriesApi.deleteCountry(id)
    countries.value = countries.value.filter((c) => c.id !== id)
  }

  /** Reproduces the backend's ordering so a local edit lands where a refetch would put it. */
  function sortInPlace(): void {
    const continentPosition = new Map(continents.value.map((c) => [c.id, c.position]))
    countries.value.sort(
      (a, b) =>
        (continentPosition.get(a.continent_id) ?? 0) - (continentPosition.get(b.continent_id) ?? 0) ||
        a.position - b.position ||
        a.name.localeCompare(b.name),
    )
  }

  return { countries, continents, byContinent, loading, fetchCountries, ensureLoaded, add, save, remove }
})
