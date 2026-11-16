import asyncio
import unittest
from decimal import Decimal

from app.core.ai_config import (
    DEFAULT_OLLAMA_MODEL,
    validate_ollama_base_url,
    validate_ollama_model_tag,
)
from app.services.ollama_service import (
    OllamaServiceError,
    check_ollama_health,
    extract_real_estate_heuristics,
    extract_software_heuristics,
    parse_json_safely,
    run_ollama_extraction,
    set_ollama_test_hook,
)


class Phase3AIIntegrationTests(unittest.TestCase):
    def tearDown(self):
        set_ollama_test_hook(None)

    def test_ollama_url_loopback_security(self):
        self.assertEqual(
            validate_ollama_base_url("http://localhost:11434/"),
            "http://localhost:11434",
        )
        self.assertEqual(
            validate_ollama_base_url("http://127.0.0.1:11434"),
            "http://127.0.0.1:11434",
        )
        self.assertEqual(
            validate_ollama_base_url("http://[::1]:11434"),
            "http://[::1]:11434",
        )
        for forbidden_url in (
            "http://192.168.1.50:11434",
            "http://10.0.0.12:11434",
            "https://api.openai.com",
            "http://user:pass@localhost:11434",
            "ftp://localhost:11434",
            "http://localhost:11434/api/pull",
        ):
            with self.assertRaises(ValueError):
                validate_ollama_base_url(forbidden_url)

    def test_default_model_tag_is_llama3_2_1b(self):
        self.assertEqual(validate_ollama_model_tag(None), "llama3.2:1b")
        self.assertEqual(DEFAULT_OLLAMA_MODEL, "llama3.2:1b")
        with self.assertRaises(ValueError):
            validate_ollama_model_tag("llama3.2:1b; rm -rf /")

    def test_real_estate_heuristics_extraction(self):
        msg = (
            "I want to buy a 3 BHK flat in Hyderabad near Gachibowli, "
            "budget 80 lakhs to 1.2 crore, area 1500 to 2000 sqft, "
            "ready to move, with gym and swimming pool, and 2 covered parking."
        )
        heuristics = extract_real_estate_heuristics(msg)
        self.assertEqual(heuristics["buy_or_rent"], "Buy")
        self.assertEqual(heuristics["property_type"], "Apartment")
        self.assertEqual(heuristics["city"], "Hyderabad")
        self.assertEqual(heuristics["locality"], "Gachibowli")
        self.assertEqual(heuristics["bedrooms"], 3)
        self.assertEqual(heuristics["min_area"], "1500")
        self.assertEqual(heuristics["max_area"], "2000")
        self.assertEqual(heuristics["area_unit"], "sqft")
        self.assertEqual(heuristics["amenities"], ["Gym", "Swimming Pool"])
        self.assertEqual(heuristics["parking"], "2 covered parking")

    def test_software_heuristics_extraction(self):
        msg = (
            "We need a web application for 500 concurrent users on Web and iOS "
            "with budget 15 lakhs to 25 lakhs in 4 months."
        )
        heuristics = extract_software_heuristics(msg)
        self.assertEqual(heuristics["project_type"], "Web Application")
        self.assertEqual(heuristics["platforms"], "Web, iOS")
        self.assertEqual(heuristics["min_budget"], "15 lakhs")
        self.assertEqual(heuristics["max_budget"], "25 lakhs")
        self.assertEqual(heuristics["currency"], "INR")
        self.assertEqual(heuristics["timeline"], "4 months")
        self.assertEqual(heuristics["expected_users"], "500 concurrent users")

    def test_pydantic_validation_and_inverted_ranges(self):
        try:
            from app.schemas.ai_conversation import (
                build_follow_up_reply,
                build_requirement_summary,
                parse_timeline_to_target_date,
                validate_and_analyze_extracted_data,
            )
        except Exception:
            self.skipTest("Pydantic v2 runtime required for schema validators")

        msg = (
            "I want to buy a 3 BHK flat in Hyderabad near Gachibowli, "
            "budget 80 lakhs to 1.2 crore, area 1500 to 2000 sqft, "
            "ready to move, with gym and swimming pool, and 2 covered parking."
        )
        heuristics = extract_real_estate_heuristics(msg)
        validated, missing, unclear = validate_and_analyze_extracted_data("real_estate", heuristics)
        self.assertEqual(Decimal(validated["min_budget"]), Decimal("8000000.00"))
        self.assertEqual(Decimal(validated["max_budget"]), Decimal("12000000.00"))
        self.assertEqual(missing, [])
        self.assertEqual(unclear, [])

        summary = build_requirement_summary("real_estate", validated, revision_number=1)
        self.assertIn("Apartment", summary)
        self.assertIn("Hyderabad, Gachibowli", summary)

        inverted = dict(validated)
        inverted["min_budget"] = "20000000"
        inverted["max_budget"] = "10000000"
        _, _, unclear_inv = validate_and_analyze_extracted_data("real_estate", inverted)
        self.assertEqual(len(unclear_inv), 1)
        reply = build_follow_up_reply("real_estate", inverted, [], unclear_inv, None)
        self.assertIn("inconsistency", reply)
        self.assertIsNone(parse_timeline_to_target_date("4 months"))
        self.assertIsNone(parse_timeline_to_target_date("in 2 weeks"))
        self.assertEqual(
            parse_timeline_to_target_date("2027-03-15"),
            __import__("datetime").date(2027, 3, 15),
        )
        self.assertEqual(
            parse_timeline_to_target_date("15 March 2027"),
            __import__("datetime").date(2027, 3, 15),
        )

        # Optional preferences must not block requirement confirmation.
        minimal_re = {
            "buy_or_rent": "Buy",
            "city": "Hyderabad",
            "property_type": "Plot",
        }
        _, missing_minimal_re, unclear_minimal_re = validate_and_analyze_extracted_data(
            "real_estate", minimal_re
        )
        self.assertEqual(missing_minimal_re, [])
        self.assertEqual(unclear_minimal_re, [])

        minimal_sw = {
            "project_type": "Web Application",
            "business_objective": "Manage customer orders",
        }
        _, missing_minimal_sw, unclear_minimal_sw = validate_and_analyze_extracted_data(
            "software", minimal_sw
        )
        self.assertEqual(missing_minimal_sw, [])
        self.assertEqual(unclear_minimal_sw, [])

    def test_malformed_ai_json_and_ollama_unavailable_fallback(self):
        self.assertEqual(parse_json_safely("Not valid JSON at all"), {})
        self.assertEqual(
            parse_json_safely('```json\n{"extracted": {"city": "Pune"}, "reply": "Got it"}\n```'),
            {"extracted": {"city": "Pune"}, "reply": "Got it"},
        )

        def failing_hook(method, path, payload):
            raise OllamaServiceError("Simulated Ollama offline")

        set_ollama_test_hook(failing_hook)
        delta, ai_reply, model_tag, latency = asyncio.run(
            run_ollama_extraction(
                industry_type="real_estate",
                current_data={},
                missing_fields=["buy_or_rent", "city", "property_type"],
                user_message="I want to buy a 2 BHK apartment in Pune",
                recent_history=[],
            )
        )
        self.assertEqual(delta.get("buy_or_rent"), "Buy")
        self.assertEqual(delta.get("property_type"), "Apartment")
        self.assertEqual(delta.get("bedrooms"), 2)
        self.assertEqual(delta.get("city"), "Pune")
        self.assertIsNone(ai_reply)
        self.assertEqual(model_tag, "llama3.2:1b")

    def test_mocked_ollama_health_check(self):
        def healthy_hook(method, path, payload):
            if path == "/api/version":
                return {"version": "0.40.16"}
            if path == "/api/tags":
                return {"models": [{"name": "llama3.2:1b", "model": "llama3.2:1b"}]}
            return {}

        set_ollama_test_hook(healthy_hook)
        health = asyncio.run(check_ollama_health())
        self.assertTrue(health["available"])
        self.assertTrue(health["model_present"])
        self.assertEqual(health["ollama_version"], "0.40.16")
        self.assertEqual(health["configured_model"], "llama3.2:1b")

    def test_real_estate_unspecified_optional_values_remain_null(self):
        from app.schemas.ai_conversation import (
            RealEstateExtractedRequirement,
            validate_and_analyze_extracted_data,
            build_requirement_summary,
        )

        validated, missing, unclear = validate_and_analyze_extracted_data(
            "real_estate",
            {
                "buy_or_rent": "Buy",
                "city": "Hyderabad",
                "locality": "Miyapur",
                "property_type": "Apartment",
                "min_area": "0",
                "max_area": "N/A",
                "parking": "N/A",
                "additional_preferences": "None",
                "amenities": ["None", "N/A"],
            },
        )
        self.assertIsNone(validated["min_area"])
        self.assertIsNone(validated["max_area"])
        self.assertIsNone(validated["parking"])
        self.assertIsNone(validated["additional_preferences"])
        self.assertEqual(validated["amenities"], [])
        self.assertEqual(missing, [])
        self.assertEqual(unclear, [])

        summary = build_requirement_summary("real_estate", validated, revision_number=1)
        self.assertIn("- Area Range: N/A to N/A sqft\n", summary)
        self.assertNotIn("0.00 to N/A sqft", summary)

    def test_extracted_delta_uses_same_normalization_as_requirement(self):
        from app.schemas.ai_conversation import normalize_extracted_delta

        normalized = normalize_extracted_delta(
            "real_estate",
            {
                "min_area": "0.00",
                "parking": "N/A",
                "additional_preferences": "None",
                "amenities": ["None", "N/A"],
                "city": "Hyderabad",
            },
        )
        self.assertIsNone(normalized["min_area"])
        self.assertIsNone(normalized["parking"])
        self.assertIsNone(normalized["additional_preferences"])
        self.assertEqual(normalized["amenities"], [])
        self.assertEqual(normalized["city"], "Hyderabad")
        self.assertNotIn("max_area", normalized)
        self.assertNotIn("area_unit", normalized)

    def test_real_estate_fallback_extracts_in_locality_and_next_month(self):
        heuristics = extract_real_estate_heuristics(
            "I want to buy a 3BHK apartment in Miyapur, Hyderabad. "
            "My budget is from 80 lakhs to 1 crore INR. I want to purchase next month."
        )
        self.assertEqual(heuristics.get("city"), "Hyderabad")
        self.assertEqual(heuristics.get("locality"), "Miyapur")
        self.assertEqual(heuristics.get("possession_timeline"), "next month")


if __name__ == "__main__":
    unittest.main()


class Phase3HardeningTests(unittest.TestCase):
    def test_buy_or_rent_ambiguity_is_left_unset(self):
        self.assertEqual(extract_real_estate_heuristics("I want to buy a flat")["buy_or_rent"], "Buy")
        self.assertEqual(extract_real_estate_heuristics("Looking to rent a flat")["buy_or_rent"], "Rent")
        self.assertNotIn("buy_or_rent", extract_real_estate_heuristics("Should I buy or rent a flat?"))
        self.assertNotIn("buy_or_rent", extract_real_estate_heuristics("I own a house in Pune"))

    def test_extra_ollama_host_only_when_allow_listed(self):
        import os
        os.environ.pop("OLLAMA_ALLOWED_HOSTS", None)
        with self.assertRaises(ValueError):
            validate_ollama_base_url("http://ollama.internal:11434")
        os.environ["OLLAMA_ALLOWED_HOSTS"] = "ollama.internal"
        try:
            self.assertEqual(
                validate_ollama_base_url("http://ollama.internal:11434"),
                "http://ollama.internal:11434",
            )
            with self.assertRaises(ValueError):
                validate_ollama_base_url("http://evil.example.com:11434")
        finally:
            os.environ.pop("OLLAMA_ALLOWED_HOSTS", None)
