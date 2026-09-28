from fastapi import FastAPI

from app.routes.auth import router as auth_router
from app.routes.test import router as test_router
from app.routes.users import router as user_router


app = FastAPI()

app.include_router(auth_router)
app.include_router(test_router)
app.include_router(user_router)


@app.get("/")
def home():
    return {
        "message": "SCuilONE CRM Backend Running"
    }