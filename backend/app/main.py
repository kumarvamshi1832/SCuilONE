from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.auth import router as auth_router
from app.routes.test import router as test_router
from app.routes.users import router as user_router
from app.routes.leads import router as lead_router
from app.routes.contacts import router as contact_router
from app.routes.accounts import router as account_router
from app.routes import deals
from app.routes.activities import router as activities_router

app = FastAPI()

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
app.include_router(test_router)
app.include_router(user_router)
app.include_router(lead_router)
app.include_router(contact_router)
app.include_router(account_router)
app.include_router(deals.router)
app.include_router(activities_router)

@app.get("/")
def home():
    return {
        "message": "SCuilONE CRM Backend Running"
    }