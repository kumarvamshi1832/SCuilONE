from fastapi import FastAPI
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

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.rate_limiter import limiter

app = FastAPI()

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

    "https://s-cuil-one.vercel.app",
    "https://s-cuil-one-git-backend-vamshi-kumarvamshi1832-7668s-projects.vercel.app",
    "https://s-cuil-gg9u5e3ah-kumarvamshi1832-7668s-projects.vercel.app",

]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept", "Origin"],
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

@app.get("/")
def home():
    return {
        "message": "SCuilONE CRM Backend Running"
    }