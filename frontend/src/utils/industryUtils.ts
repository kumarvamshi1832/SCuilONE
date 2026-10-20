export type SupportedIndustry =
  | 'real-estate'
  | 'education-consulting'
  | 'training-institute'
  | 'digital-marketing-agency'
  | 'software-company'
  | 'insurance-agency';

/**
 * Checks if a string corresponds to any recognized industry in any variation.
 */
export function isKnownIndustry(rawIndustry?: string | null): boolean {
  if (!rawIndustry || typeof rawIndustry !== 'string') return false;
  const cleaned = rawIndustry
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');

  return (
    cleaned === 'insurance-agency' ||
    cleaned === 'insurance_agency' ||
    cleaned === 'insuranceagency' ||
    cleaned === 'insurance' ||
    cleaned === 'digital-marketing-agency' ||
    cleaned === 'digital_marketing_agency' ||
    cleaned === 'digitalmarketingagency' ||
    cleaned === 'digital-marketing' ||
    cleaned === 'digital_marketing' ||
    cleaned === 'digitalmarketing' ||
    cleaned === 'marketing-agency' ||
    cleaned === 'marketing' ||
    cleaned === 'training-institute' ||
    cleaned === 'training_institute' ||
    cleaned === 'traininginstitute' ||
    cleaned === 'training' ||
    cleaned === 'education-consulting' ||
    cleaned === 'education_consulting' ||
    cleaned === 'educationconsulting' ||
    cleaned === 'education' ||
    cleaned === 'software-company' ||
    cleaned === 'software_company' ||
    cleaned === 'softwarecompany' ||
    cleaned === 'software-development' ||
    cleaned === 'software_development' ||
    cleaned === 'softwaredevelopment' ||
    cleaned === 'software' ||
    cleaned === 'real-estate' ||
    cleaned === 'real_estate' ||
    cleaned === 'realestate' ||
    cleaned === 'real'
  );
}

/**
 * Normalizes industry strings from various representations into canonical slug form.
 * Handles spaces, underscores, casing variations, and URL slug format.
 */
export function normalizeIndustry(rawIndustry?: string | null): SupportedIndustry {
  if (!rawIndustry) return 'real-estate';

  const cleaned = rawIndustry
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');

  if (
    cleaned === 'insurance-agency' ||
    cleaned === 'insurance_agency' ||
    cleaned === 'insuranceagency' ||
    cleaned === 'insurance'
  ) {
    return 'insurance-agency';
  }

  if (
    cleaned === 'digital-marketing-agency' ||
    cleaned === 'digital_marketing_agency' ||
    cleaned === 'digitalmarketingagency' ||
    cleaned === 'digital-marketing' ||
    cleaned === 'digital_marketing' ||
    cleaned === 'digitalmarketing' ||
    cleaned === 'marketing-agency' ||
    cleaned === 'marketing'
  ) {
    return 'digital-marketing-agency';
  }

  if (
    cleaned === 'training-institute' ||
    cleaned === 'training_institute' ||
    cleaned === 'traininginstitute' ||
    cleaned === 'training'
  ) {
    return 'training-institute';
  }

  if (
    cleaned === 'education-consulting' ||
    cleaned === 'education_consulting' ||
    cleaned === 'educationconsulting' ||
    cleaned === 'education'
  ) {
    return 'education-consulting';
  }

  if (
    cleaned === 'software-company' ||
    cleaned === 'software_company' ||
    cleaned === 'softwarecompany' ||
    cleaned === 'software-development' ||
    cleaned === 'software_development' ||
    cleaned === 'softwaredevelopment' ||
    cleaned === 'software'
  ) {
    return 'software-company';
  }

  if (
    cleaned === 'real-estate' ||
    cleaned === 'real_estate' ||
    cleaned === 'realestate' ||
    cleaned === 'real'
  ) {
    return 'real-estate';
  }

  return 'real-estate';
}

/**
 * Formats a normalized industry identifier or raw string into user-friendly display text.
 */
export function getIndustryDisplayName(industry?: string | null): string {
  const norm = normalizeIndustry(industry);
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
    default:
      return 'Real Estate';
  }
}

