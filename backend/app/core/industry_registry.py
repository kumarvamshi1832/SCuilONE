"""Canonical SCuilONE industry catalogue. Industry identity is distinct from support teams and module packs."""
from copy import deepcopy

INDUSTRY_REGISTRY = {
    "real_estate": {"industry_key": "real_estate", "name": "Real Estate", "description": "SCuilONE Real Estate industry", "module_pack_key": "real_estate", "modules": ['Properties', 'Projects', 'Units', 'Buyer/Seller Requirements', 'Site Visits', 'Bookings', 'Brokers', 'Commissions']},
    "education_consulting": {"industry_key": "education_consulting", "name": "Education Consulting", "description": "SCuilONE Education Consulting industry", "module_pack_key": "education_consulting", "modules": ['Students', 'Parents', 'Institutions', 'Countries', 'Courses', 'Applications', 'Documents', 'Offers', 'Visa/Admission Tracking']},
    "training_institutes": {"industry_key": "training_institutes", "name": "Training Institutes", "description": "SCuilONE Training Institutes industry", "module_pack_key": "training_institutes", "modules": ['Courses', 'Batches', 'Trainers', 'Demos', 'Admissions', 'Fees', 'Attendance', 'Assessments', 'Certificates', 'Placement']},
    "digital_marketing_agencies": {"industry_key": "digital_marketing_agencies", "name": "Digital Marketing Agencies", "description": "SCuilONE Digital Marketing Agencies industry", "module_pack_key": "digital_marketing_agencies", "modules": ['Clients', 'Services', 'Proposals', 'Campaigns', 'Retainers', 'Deliverables', 'Projects', 'Renewals']},
    "software_companies": {"industry_key": "software_companies", "name": "Software Companies", "description": "SCuilONE Software Companies industry", "module_pack_key": "software", "modules": ['Requirements', 'Proposals', 'Quotations', 'Projects', 'Contracts', 'AMC', 'Renewals', 'Support']},
    "insurance_agencies": {"industry_key": "insurance_agencies", "name": "Insurance Agencies", "description": "SCuilONE Insurance Agencies industry", "module_pack_key": "insurance_agencies", "modules": ['Policies', 'Products', 'Premiums', 'Renewals', 'Claims', 'Agents', 'Commissions', 'Documents']},
    "automobile_dealers": {"industry_key": "automobile_dealers", "name": "Automobile Dealers", "description": "SCuilONE Automobile Dealers industry", "module_pack_key": "automobile_dealers", "modules": ['Vehicles', 'Models', 'Enquiries', 'Test Drives', 'Quotations', 'Bookings', 'Finance', 'Insurance', 'Delivery', 'Service']},
    "interior_designers": {"industry_key": "interior_designers", "name": "Interior Designers", "description": "SCuilONE Interior Designers industry", "module_pack_key": "interior_designers", "modules": ['Projects', 'Requirements', 'Site Visits', 'Measurements', 'Designs', 'BOQ', 'Vendors', 'Materials', 'Milestones', 'Payments']},
    "travel_companies": {"industry_key": "travel_companies", "name": "Travel Companies", "description": "SCuilONE Travel Companies industry", "module_pack_key": "travel_companies", "modules": ['Destinations', 'Packages', 'Enquiries', 'Itineraries', 'Quotations', 'Bookings', 'Hotels', 'Visa', 'Payments']},
    "b2b_sales": {"industry_key": "b2b_sales", "name": "B2B Sales", "description": "SCuilONE B2B Sales industry", "module_pack_key": "b2b_sales", "modules": ['Accounts', 'Contacts', 'Products/Services', 'Opportunities', 'Proposals', 'Contracts', 'Orders', 'Renewals']},
}

INDUSTRY_ALIASES = {
    'real estate': 'real_estate',
    'realestate': 'real_estate',
    'real_estate': 'real_estate',
    'education consulting': 'education_consulting',
    'education_consulting': 'education_consulting',
    'training institutes': 'training_institutes',
    'training_institutes': 'training_institutes',
    'digital marketing agencies': 'digital_marketing_agencies',
    'digital_marketing_agencies': 'digital_marketing_agencies',
    'software companies': 'software_companies',
    'software_companies': 'software_companies',
    'insurance agencies': 'insurance_agencies',
    'insurance_agencies': 'insurance_agencies',
    'automobile dealers': 'automobile_dealers',
    'automobile_dealers': 'automobile_dealers',
    'interior designers': 'interior_designers',
    'interior_designers': 'interior_designers',
    'travel companies': 'travel_companies',
    'travel_companies': 'travel_companies',
    'b2b sales': 'b2b_sales',
    'b2b_sales': 'b2b_sales',
    'software': 'software_companies',
    'software services': 'software_companies',
    'software services / it consulting': 'software_companies',
    'interior design': 'interior_designers',
    'it & software': 'software_companies',
    'it consulting': 'software_companies',
    'travel': 'travel_companies',
}

def normalize_industry_key(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(value.strip().lower().replace("-", " ").split())
    if not cleaned:
        return None
    if cleaned in INDUSTRY_ALIASES:
        return INDUSTRY_ALIASES[cleaned]
    key = cleaned.replace(" ", "_")
    return key

def list_industries() -> list[dict]:
    return [deepcopy(item) for item in INDUSTRY_REGISTRY.values()]

def get_industry(industry_key: str) -> dict | None:
    item = INDUSTRY_REGISTRY.get(industry_key)
    return deepcopy(item) if item else None
