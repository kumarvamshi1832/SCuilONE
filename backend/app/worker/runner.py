import argparse
import logging
import sys
import time
from datetime import date

from sqlalchemy import text

from app.database.connection import SessionLocal, engine
from app.worker import load_all_models
from app.worker.jobs import JOBS

load_all_models()

logger = logging.getLogger("scuilone.worker")

# Only one worker may run the jobs at a time (cron overlap, two instances...).
ADVISORY_LOCK_KEY = 727_001


def run_once(
    job_names: list[str] | None = None,
    dry_run: bool = False,
    today: date | None = None,
) -> dict:
    """Run the selected jobs. Returns {"skipped": True} if another worker is running."""
    today = today or date.today()
    selected = job_names or list(JOBS)
    unknown = [name for name in selected if name not in JOBS]

    if unknown:
        raise ValueError(f"Unknown job(s): {', '.join(unknown)}. Available: {', '.join(JOBS)}")

    lock_connection = engine.connect()

    try:
        got_lock = lock_connection.execute(
            text("SELECT pg_try_advisory_lock(:key)"), {"key": ADVISORY_LOCK_KEY}
        ).scalar()

        if not got_lock:
            logger.warning("Another worker is already running; skipping this run.")
            return {"skipped": True}

        results: dict = {"skipped": False, "date": today.isoformat(), "dry_run": dry_run, "jobs": {}}

        for name in selected:
            db = SessionLocal()
            started = time.monotonic()
            db.info["dry_run"] = dry_run
            if dry_run:
                # Jobs commit in batches. In a dry run, "commit" only flushes, so
                # the work is visible inside this transaction and then rolled back.
                db.commit = db.flush  # type: ignore[method-assign]
            try:
                summary = JOBS[name](db, today)

                if dry_run:
                    db.rollback()

                summary["seconds"] = round(time.monotonic() - started, 2)
                summary["ok"] = True
                logger.info("job=%s %s", name, summary)
            except Exception as exc:
                db.rollback()
                summary = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
                logger.exception("job=%s failed", name)
            finally:
                db.close()

            results["jobs"][name] = summary

        return results

    finally:
        try:
            lock_connection.execute(
                text("SELECT pg_advisory_unlock(:key)"), {"key": ADVISORY_LOCK_KEY}
            )
        finally:
            lock_connection.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.worker",
        description="Run SCuilONE background jobs.",
    )
    parser.add_argument("--once", action="store_true", help="run the jobs one time and exit (use with cron)")
    parser.add_argument("--loop", action="store_true", help="keep running forever")
    parser.add_argument("--interval", type=int, default=3600, help="seconds between runs in --loop mode (default 3600)")
    parser.add_argument("--jobs", default="", help=f"comma-separated subset of: {', '.join(JOBS)}")
    parser.add_argument("--dry-run", action="store_true", help="do the work, then roll everything back")
    parser.add_argument("--list", action="store_true", help="list available jobs and exit")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        stream=sys.stdout,
    )

    if args.list:
        for name in JOBS:
            print(name)
        return 0

    if args.once == args.loop:
        parser.error("choose exactly one of --once or --loop")

    names = [n.strip() for n in args.jobs.split(",") if n.strip()] or None

    if args.once:
        result = run_once(names, dry_run=args.dry_run)
        failed = [n for n, r in result.get("jobs", {}).items() if not r.get("ok")]
        return 1 if failed else 0

    logger.info("Worker started; running every %s seconds.", args.interval)
    while True:
        try:
            run_once(names, dry_run=args.dry_run)
        except Exception:
            logger.exception("Worker cycle failed")
        time.sleep(max(args.interval, 60))
