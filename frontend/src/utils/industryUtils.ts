export type SupportedIndustry =
  | 'real-estate'
  | 'education-consulting'
  | 'training-institute'
  | 'digital-marketing-agency'
  | 'software-company'
  | 'insurance-agency'
  | 'automobile-dealer'
  | 'interior-designer'
  | 'travel-company'
  | 'b2b-sales';

export const KNOWN_INDUSTRY_SLUGS: readonly SupportedIndustry[] = [
  'real-estate',
  'education-consulting',
  'training-institute',
  'digital-marketing-agency',
  'software-company',
  'insurance-agency',
  'automobile-dealer',
  'interior-designer',
  'travel-company',
  'b2b-sales',
];

function cleanIndustryString(rawIndustry: string): string {
  return rawIndustry
    .trim()
    .toLowerCase()
    .replace(/[/\\&]+/g, '-')
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Strictly normalizes a recognized industry string into its canonical slug.
 * Returns null if the industry is missing, platform-internal, or unrecognized.
 * Never falls back to 'real-estate' for unknown or empty values.
 */
export function tryNormalizeIndustry(
  rawIndustry?: string | null
): SupportedIndustry | null {
  if (!rawIndustry || typeof rawIndustry !== 'string') return null;

  const cleaned = cleanIndustryString(rawIndustry);
  if (!cleaned) return null;

  if (
    cleaned === 'insurance-agency' ||
    cleaned === 'insurance-agencies' ||
    cleaned === 'insuranceagency' ||
    cleaned === 'insuranceagencies' ||
    cleaned === 'insurance'
  ) {
    return 'insurance-agency';
  }

  if (
    cleaned === 'digital-marketing-agency' ||
    cleaned === 'digital-marketing-agencies' ||
    cleaned === 'digitalmarketingagency' ||
    cleaned === 'digitalmarketingagencies' ||
    cleaned === 'digital-marketing' ||
    cleaned === 'digitalmarketing' ||
    cleaned === 'marketing-agency' ||
    cleaned === 'marketing'
  ) {
    return 'digital-marketing-agency';
  }

  if (
    cleaned === 'training-institute' ||
    cleaned === 'training-institutes' ||
    cleaned === 'traininginstitute' ||
    cleaned === 'traininginstitutes' ||
    cleaned === 'training'
  ) {
    return 'training-institute';
  }

  if (
    cleaned === 'education-consulting' ||
    cleaned === 'educationconsulting' ||
    cleaned === 'education'
  ) {
    return 'education-consulting';
  }

  if (
    cleaned === 'software-company' ||
    cleaned === 'software-companies' ||
    cleaned === 'softwarecompany' ||
    cleaned === 'softwarecompanies' ||
    cleaned === 'software-development' ||
    cleaned === 'softwaredevelopment' ||
    cleaned === 'software-services' ||
    cleaned === 'softwareservices' ||
    cleaned === 'software-services-it-consulting' ||
    cleaned.startsWith('software-services') ||
    cleaned === 'it-consulting' ||
    cleaned === 'itconsulting' ||
    cleaned === 'it-services' ||
    cleaned === 'itservices' ||
    cleaned === 'it-software' ||
    cleaned === 'tech-consulting' ||
    cleaned === 'software'
  ) {
    return 'software-company';
  }

  if (
    cleaned === 'real-estate' ||
    cleaned === 'realestate' ||
    cleaned === 'real'
  ) {
    return 'real-estate';
  }

  if (
    cleaned === 'automobile-dealer' ||
    cleaned === 'automobile-dealers' ||
    cleaned === 'automobiledealer' ||
    cleaned === 'automobiledealers' ||
    cleaned === 'automobile'
  ) {
    return 'automobile-dealer';
  }

  if (
    cleaned === 'interior-designer' ||
    cleaned === 'interior-designers' ||
    cleaned === 'interiordesigner' ||
    cleaned === 'interiordesigners' ||
    cleaned === 'interior-design' ||
    cleaned === 'interior'
  ) {
    return 'interior-designer';
  }

  if (
    cleaned === 'travel-company' ||
    cleaned === 'travel-companies' ||
    cleaned === 'travelcompany' ||
    cleaned === 'travelcompanies' ||
    cleaned === 'travel'
  ) {
    return 'travel-company';
  }

  if (
    cleaned === 'b2b-sales' ||
    cleaned === 'b2bsales' ||
    cleaned === 'b2b'
  ) {
    return 'b2b-sales';
  }

  return null;
}

/**
 * Checks if a string corresponds to any recognized CRM industry.
 */
export function isKnownIndustry(rawIndustry?: string | null): boolean {
  return tryNormalizeIndustry(rawIndustry) !== null;
}

/**
 * Normalizes industry strings into canonical slug form when recognized,
 * or returns an empty string when missing/unknown (never defaults to 'real-estate').
 */
export function normalizeIndustry(rawIndustry?: string | null): string {
  return tryNormalizeIndustry(rawIndustry) ?? '';
}

/**
 * Formats a normalized industry identifier or raw string into user-friendly display text.
 */
export function getIndustryDisplayName(industry?: string | null): string {
  if (!industry || typeof industry !== 'string' || !industry.trim()) {
    return '';
  }

  const norm = tryNormalizeIndustry(industry);
  switch (norm) {
    case 'insurance-agency':
      return 'Insurance Agency';
    case 'digital-marketing-agency':
      return 'Digital Marketing Agency';
    case 'training-institute':
      return 'Training Institute';
    case 'education-consulting':
      return 'Education Consulting';
    case 'software-company':
      return 'Software Company';
    case 'real-estate':
      return 'Real Estate';
    case 'automobile-dealer':
      return 'Automobile Dealer';
    case 'interior-designer':
      return 'Interior Designer';
    case 'travel-company':
      return 'Travel Company';
    case 'b2b-sales':
      return 'B2B Sales';
    default:
      return industry
        .trim()
        .replace(/[/\\&_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
  }
}
