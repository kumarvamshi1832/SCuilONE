"""Background jobs for SCuilONE (run with: python -m app.worker --once)."""
import importlib
import pkgutil


def load_all_models() -> None:
    """Import every model so SQLAlchemy can resolve relationships by name.

    The web app does this implicitly through its routes; a standalone worker
    process has to do it explicitly.
    """
    import app.models

    for module in pkgutil.iter_modules(app.models.__path__):
        importlib.import_module(f"app.models.{module.name}")
