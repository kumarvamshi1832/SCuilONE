"""Shared pytest fixtures for SCuilONE real estate lifecycle E2E and edge-case tests.

Supports PostgreSQL when TEST_DATABASE_URL is set, and falls back to an isolated
SQLite database with PostgreSQL UUID/JSONB type compilation adapters for fast local runs.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Callable

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool


# Enable PostgreSQL JSONB and UUID columns to compile cleanly on SQLite during local test runs.
@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(element, compiler, **kw):
    return "JSON"


@compiles(PG_UUID, "sqlite")
def _compile_uuid_sqlite(element, compiler, **kw):
    return "CHAR(36)"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@pytest.fixture(scope="function")
def db_engine():
    from app.database.connection import Base
    from app.worker import load_all_models

    load_all_models()
    test_url = os.getenv("TEST_DATABASE_URL", "").strip()
    if test_url:
        engine = create_engine(test_url, future=True)
    else:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            future=True,
        )

        @event.listens_for(engine, "connect")
        def _set_sqlite_pragma(dbapi_connection, _connection_record):
            cursor = dbapi_connection.cursor()
            dbapi_connection.create_function(
                "btrim",
                1,
                lambda s: s.strip() if s is not None else None,
                deterministic=True,
            )
            cursor.execute("PRAGMA foreign_keys=OFF")
            cursor.close()

    Base.metadata.create_all(bind=engine)
    try:
        yield engine
    finally:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture(scope="function")
def db_session(db_engine) -> Session:
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=db_engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="function")
def seed_world(db_session: Session):
    """Create two isolated tenants with staff users, roles, accounts, contacts, leads, and portal users."""
    from app.models.account import Account
    from app.models.contact import Contact
    from app.models.customer_portal import CustomerPortalUser
    from app.models.lead import Lead
    from app.models.role import Role
    from app.models.tenant import Tenant
    from app.models.user import User
    from app.models.user_role import UserRole

    def _build_tenant(name: str, email_prefix: str):
        tenant = Tenant(
            id=uuid.uuid4(),
            name=name,
            industry="Real Estate",
            status="Active",
        )
        db_session.add(tenant)
        db_session.flush()

        owner_role = db_session.query(Role).filter(Role.name == "Tenant Owner").first()
        if not owner_role:
            owner_role = Role(id=uuid.uuid4(), name="Tenant Owner")
            db_session.add(owner_role)
        agent_role = db_session.query(Role).filter(Role.name == "Sales Agent").first()
        if not agent_role:
            agent_role = Role(id=uuid.uuid4(), name="Sales Agent")
            db_session.add(agent_role)
        db_session.flush()

        staff = User(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            full_name=f"{name} Admin",
            email=f"admin.{email_prefix}@example.com",
            password="hashed_password_placeholder",
            status="Active",
        )
        agent = User(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            full_name=f"{name} Agent",
            email=f"agent.{email_prefix}@example.com",
            password="hashed_password_placeholder",
            status="Active",
        )
        db_session.add_all([staff, agent])
        db_session.flush()
        db_session.add_all([
            UserRole(user_id=staff.id, role_id=owner_role.id),
            UserRole(user_id=agent.id, role_id=agent_role.id),
        ])

        account = Account(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            name=f"{name} Customer Account",
            email=f"acct.{email_prefix}@example.com",
            created_by=staff.id,
        )
        db_session.add(account)
        db_session.flush()

        contact = Contact(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            account_id=account.id,
            full_name=f"{name} Portal Buyer",
            email=f"buyer.{email_prefix}@example.com",
            phone="+919876543210",
            created_by=staff.id,
        )
        walkin_contact = Contact(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            account_id=account.id,
            full_name=f"{name} Walkin Customer",
            email=f"walkin.{email_prefix}@example.com",
            phone="+919876500000",
            created_by=staff.id,
        )
        db_session.add_all([contact, walkin_contact])
        db_session.flush()

        portal_user = CustomerPortalUser(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            account_id=account.id,
            contact_id=contact.id,
            email=contact.email,
            password_hash="hashed_portal_password",
            status="Active",
        )
        db_session.add(portal_user)

        lead_portal = Lead(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            full_name=contact.full_name,
            email=contact.email,
            phone=contact.phone,
            status="Qualified",
            account_id=account.id,
            assigned_to=staff.id,
            created_by=staff.id,
        )
        lead_walkin = Lead(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            full_name=walkin_contact.full_name,
            email=walkin_contact.email,
            phone=walkin_contact.phone,
            status="Qualified",
            account_id=account.id,
            assigned_to=staff.id,
            created_by=staff.id,
        )
        db_session.add_all([lead_portal, lead_walkin])
        db_session.commit()

        return {
            "tenant": tenant,
            "staff": staff,
            "agent": agent,
            "account": account,
            "contact": contact,
            "walkin_contact": walkin_contact,
            "portal_user": portal_user,
            "lead_portal": lead_portal,
            "lead_walkin": lead_walkin,
            "staff_ctx": {
                "tenant_id": str(tenant.id),
                "user_id": str(staff.id),
                "email": staff.email,
                "roles": ["Tenant Owner"],
            },
            "agent_ctx": {
                "tenant_id": str(tenant.id),
                "user_id": str(agent.id),
                "email": agent.email,
                "roles": ["Sales Agent"],
            },
            "portal_ctx": {
                "tenant_id": tenant.id,
                "portal_user_id": portal_user.id,
                "contact_id": contact.id,
                "account_id": account.id,
                "email": portal_user.email,
            },
        }

    t1 = _build_tenant("Alpha Realty", "alpha")
    t2 = _build_tenant("Beta Realty", "beta")
    return {"t1": t1, "t2": t2}


@pytest.fixture(scope="function")
def api_client_factory(db_session: Session):
    """Build a FastAPI TestClient wired to the test DB session with configurable staff/portal auth."""
    from fastapi.testclient import TestClient
    from app.core import dependencies as core_deps
    from app.core import industry_modules as core_modules
    from app.main import app
    from app.routes import customer_portal as portal_route

    def _override_db():
        yield db_session

    # Collect every get_db, permission_checker, and check_module dependency across all routes once.
    base_overrides: dict = {
        core_deps.get_db: _override_db,
        core_modules.get_db: _override_db,
    }
    for route in app.routes:
        for dep_obj in getattr(route, "dependencies", []) or []:
            fn = getattr(dep_obj, "dependency", None)
            name = getattr(fn, "__name__", "")
            if name == "get_db":
                base_overrides[fn] = _override_db
            elif name in ("permission_checker", "check_module", "module_checker"):
                base_overrides[fn] = lambda: True

        dependant = getattr(route, "dependant", None)
        if not dependant:
            continue
        stack = list(dependant.dependencies)
        while stack:
            dep = stack.pop()
            fn = dep.call
            name = getattr(fn, "__name__", "")
            if name == "get_db":
                base_overrides[fn] = _override_db
            elif name in ("permission_checker", "check_module", "module_checker"):
                base_overrides[fn] = lambda: True
            stack.extend(dep.dependencies)

    class _ScopedClient:
        """Applies this client's exact auth/DB overrides right before each request."""

        def __init__(self, overrides: dict):
            self._overrides = overrides
            self._client = TestClient(app)

        def _apply(self):
            app.dependency_overrides.clear()
            app.dependency_overrides.update(self._overrides)

        def request(self, method: str, url: str, **kwargs):
            self._apply()
            return self._client.request(method, url, **kwargs)

        def get(self, url: str, **kwargs):
            return self.request("GET", url, **kwargs)

        def post(self, url: str, **kwargs):
            return self.request("POST", url, **kwargs)

        def put(self, url: str, **kwargs):
            return self.request("PUT", url, **kwargs)

        def patch(self, url: str, **kwargs):
            return self.request("PATCH", url, **kwargs)

        def delete(self, url: str, **kwargs):
            return self.request("DELETE", url, **kwargs)

    def _make_client(*, staff_ctx: dict | None = None, portal_ctx: dict | None = None):
        overrides = dict(base_overrides)
        if staff_ctx is not None:
            overrides[core_deps.require_active_user] = lambda: staff_ctx
        if portal_ctx is not None:
            overrides[portal_route.require_portal_user] = lambda: portal_ctx
        return _ScopedClient(overrides)

    yield _make_client
    app.dependency_overrides.clear()