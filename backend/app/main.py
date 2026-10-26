from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.routes.auth import router as auth_router
# from app.routes.test import router as test_router
from app.routes.users import router as user_router
from app.routes.leads import router as lead_router
from app.routes.contacts import router as contact_router
from app.routes.accounts import router as account_router
from app.routes import deals
from app.routes.activities import router as activities_router
from app.routes.pipelines import router as pipelines_router
from app.routes.form_templates import router as form_templates_router
from app.routes.workflows import router as workflows_router
from app.routes.notifications import router as notifications_router
from app.routes.dashboard import router as dashboard_router
from app.routes.reports import router as reports_router
from app.routes.documents import router as documents_router
from app.routes.search import router as search_router
from app.routes.import_export import router as import_export_router
from app.routes.import_export_extended import router as import_export_extended_router
from app.routes.audit_logs import router as audit_logs_router
from app.routes.properties import router as properties_router
from app.routes.property_images import router as property_images_router
from app.routes.projects import router as projects_router
from app.routes.buildings import router as bulidings_router
from app.routes.building_images import router as building_images_router
from app.routes.buyer_requirements import router as buyer_requirements_router
from app.routes.property_matches import router as property_matches_router
from app.routes.site_visits import router as site_visits_router
from app.routes.bookings import router as bookings_router
from app.routes.payments import router as payments_router
from app.routes.payment_refunds import router as payment_refunds_router
from app.routes.payment_plans import router as payment_plans_router


from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.rate_limiter import limiter

app = FastAPI()

from fastapi.openapi.utils import get_openapi


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema

    schema = get_openapi(
        title=app.title,
        version=app.version,
        openapi_version=app.openapi_version,
        description=app.description,
        routes=app.routes,
    )

    for path, path_item in schema.get("paths", {}).items():
        if path.endswith("/images") and "post" in path_item:
            operation = path_item["post"]
            request_body = operation.get("requestBody", {})
            content = request_body.get("content", {})
            multipart = content.get("multipart/form-data", {})
            schema_ref = multipart.get("schema", {}).get("$ref")

            if schema_ref:
                schema_name = schema_ref.rsplit("/", 1)[-1]
                body_schema = schema.get("components", {}).get(
                    "schemas", {}
                ).get(schema_name, {})

                files_schema = body_schema.get("properties", {}).get("files", {})
                if files_schema.get("type") == "array":
                    files_schema["items"] = {
                        "type": "string",
                        "format": "binary",
                    }

    app.openapi_schema = schema
    return app.openapi_schema


app.openapi = custom_openapi

app.state.limiter = limiter
app.add_exception_handler(
    RateLimitExceeded,
    _rate_limit_exceeded_handler,
)

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
    "http://localhost:5176",
    "http://127.0.0.1:5176",
    "http://localhost:3000",
    "http://127.0.0.1:3000",

    "https://s-cuil-one.vercel.app",
    "https://s-cuil-one-git-backend-vamshi-kumarvamshi1832-7668s-projects.vercel.app",
    "https://s-cuil-gg9u5e3ah-kumarvamshi1832-7668s-projects.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
# app.include_router(test_router)
app.include_router(user_router)
app.include_router(lead_router)
app.include_router(contact_router)
app.include_router(account_router)
app.include_router(deals.router)
app.include_router(activities_router)
app.include_router(pipelines_router)
app.include_router(form_templates_router)
app.include_router(workflows_router)
app.include_router(notifications_router)
app.include_router(dashboard_router)
app.include_router(reports_router)
app.include_router(documents_router)
app.include_router(search_router)
app.include_router(import_export_router)
app.include_router(import_export_extended_router)
app.include_router(audit_logs_router)
app.include_router(properties_router)
app.include_router(property_images_router)
app.include_router(projects_router)
app.include_router(bulidings_router)
app.include_router(building_images_router)
app.include_router(buyer_requirements_router)
app.include_router(property_matches_router)
app.include_router(site_visits_router)
app.include_router(bookings_router)
app.include_router(payments_router)
app.include_router(payment_refunds_router)
app.include_router(payment_plans_router)


from fastapi.responses import FileResponse
from pathlib import Path

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

@app.get("/uploads/{file_path:path}")
def serve_uploaded_file(file_path: str):
    safe_path = (UPLOAD_DIR / file_path).resolve()
    if not str(safe_path).startswith(str(UPLOAD_DIR.resolve())) or not safe_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(safe_path)

@app.get("/")
def home():
    return {
        "message": "SCuilONE CRM Backend Running"
    }