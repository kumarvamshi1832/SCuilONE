import unittest
from app.core.industry_registry import INDUSTRY_REGISTRY, normalize_industry_key, list_industries


class IndustryRegistryTests(unittest.TestCase):
    def test_exactly_ten_official_industries(self):
        expected = {
            "real_estate": "Real Estate",
            "education_consulting": "Education Consulting",
            "training_institutes": "Training Institutes",
            "digital_marketing_agencies": "Digital Marketing Agencies",
            "software_companies": "Software Companies",
            "insurance_agencies": "Insurance Agencies",
            "automobile_dealers": "Automobile Dealers",
            "interior_designers": "Interior Designers",
            "travel_companies": "Travel Companies",
            "b2b_sales": "B2B Sales",
        }
        self.assertEqual(len(INDUSTRY_REGISTRY), 10)
        self.assertEqual({k: v["name"] for k, v in INDUSTRY_REGISTRY.items()}, expected)
        self.assertEqual(len(list_industries()), 10)

    def test_each_industry_has_module_configuration_and_pack(self):
        for key, item in INDUSTRY_REGISTRY.items():
            self.assertEqual(item["industry_key"], key)
            self.assertTrue(item["modules"])
            self.assertTrue(item["module_pack_key"])

    def test_existing_real_estate_and_software_names_map_safely(self):
        self.assertEqual(normalize_industry_key("Real Estate"), "real_estate")
        self.assertEqual(normalize_industry_key("Software"), "software_companies")
        self.assertEqual(normalize_industry_key("IT & Software"), "software_companies")
        self.assertEqual(normalize_industry_key("Software Services / IT Consulting"), "software_companies")

    def test_ambiguous_legacy_industries_are_not_reclassified(self):
        self.assertEqual(normalize_industry_key("Finance & Insurance"), "finance_&_insurance")
        self.assertEqual(normalize_industry_key("Professional Services"), "professional_services")
        self.assertEqual(normalize_industry_key("Construction"), "construction")
        self.assertEqual(normalize_industry_key("Education"), "education")


if __name__ == "__main__":
    unittest.main()
