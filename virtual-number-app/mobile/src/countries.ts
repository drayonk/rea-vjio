export interface Country {
  code: string;
  name: string;
  dial: string;
  flag: string;
  areaCodeHint?: string;
}

/**
 * Countries where local SMS+voice numbers are commonly available to buy via
 * the API. Some (GB, DE, FR, AU…) require regulatory bundles on the carrier
 * account before purchase succeeds.
 */
export const COUNTRIES: Country[] = [
  { code: "US", name: "United States", dial: "1", flag: "🇺🇸", areaCodeHint: "e.g. 212" },
  { code: "CA", name: "Canada", dial: "1", flag: "🇨🇦", areaCodeHint: "e.g. 416" },
  { code: "GB", name: "United Kingdom", dial: "44", flag: "🇬🇧" },
  { code: "AU", name: "Australia", dial: "61", flag: "🇦🇺" },
  { code: "DE", name: "Germany", dial: "49", flag: "🇩🇪" },
  { code: "FR", name: "France", dial: "33", flag: "🇫🇷" },
  { code: "NL", name: "Netherlands", dial: "31", flag: "🇳🇱" },
];

export const countryByCode = (code: string) => COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0]!;
