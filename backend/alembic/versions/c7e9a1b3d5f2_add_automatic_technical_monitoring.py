"""add automatic technical monitoring, error logs, health checks, and worker heartbeats

Revision ID: c7e9a1b3d5f2
Revises: b4c8d2e6f1a9
Create Date: 2026-11-09 15:55:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "c7e9a1b3d5f2"
down_revision: Union[str, Sequence[str], None] = "b4c8d2e6f1a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Extend platform_technical_incidents table for automatic incident detection & deduplication
    op.add_column(
        "platform_technical_incidents",
        sa.Column("environment", sa.String(length=40), server_default="production", nullable=False),
    )
    op.add_column(
        "platform_technical_incidents",
        sa.Column("error_fingerprint", sa.String(length=160), nullable=True),
    )
    op.add_column(
        "platform_technical_incidents",
        sa.Column("detection_source", sa.String(length=30), server_default="manual", nullable=False),
    )
    op.add_column(
        "platform_technical_incidents",
        sa.Column("first_occurrence_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "platform_technical_incidents",
        sa.Column("last_occurrence_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "platform_technical_incidents",
        sa.Column("occurrence_count", sa.Integer(), server_default="1", nullable=False),
    )
    op.add_column(
        "platform_technical_incidents",
        sa.Column("affected_endpoint", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "platform_technical_incidents",
        sa.Column("affected_tenant_count", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "platform_technical_incidents",
        sa.Column(
            "affected_tenant_ids_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
    )
    op.add_column(
        "platform_technical_incidents",
        sa.Column(
            "diagnostics_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
    )
    op.add_column(
        "platform_technical_incidents",
        sa.Column("consecutive_healthy_checks", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "platform_technical_incidents",
        sa.Column("recovery_detected_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "platform_technical_incidents",
        sa.Column(
            "recovery_evidence_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
    )
    op.add_column(
        "platform_technical_incidents",
        sa.Column("last_notified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "platform_technical_incidents",
        sa.Column("last_notified_severity", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "platform_technical_incidents",
        sa.Column("notification_count", sa.Integer(), server_default="0", nullable=False),
    )
    op.create_index(
        "ix_platform_technical_incidents_error_fingerprint",
        "platform_technical_incidents",
        ["error_fingerprint"],
        unique=False,
    )
    op.create_index(
        "ix_platform_technical_incidents_service_name",
        "platform_technical_incidents",
        ["service_name"],
        unique=False,
    )
    op.create_index(
        "ix_platform_technical_incidents_status",
        "platform_technical_incidents",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_platform_tech_incidents_fingerprint_status",
        "platform_technical_incidents",
        ["service_name", "error_fingerprint", "environment", "status"],
        unique=False,
    )

    # 2. Create platform_error_logs table
    op.create_table(
        "platform_error_logs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("event_code", sa.String(length=60), nullable=False),
        sa.Column("service_name", sa.String(length=80), server_default="API Gateway", nullable=False),
        sa.Column("environment", sa.String(length=40), server_default="production", nullable=False),
        sa.Column("endpoint", sa.String(length=255), nullable=True),
        sa.Column("http_method", sa.String(length=16), nullable=True),
        sa.Column("http_status_code", sa.Integer(), nullable=True),
        sa.Column("exception_type", sa.String(length=120), nullable=False),
        sa.Column("error_fingerprint", sa.String(length=160), nullable=False),
        sa.Column("safe_message", sa.Text(), nullable=False),
        sa.Column("redacted_stack_trace", sa.Text(), nullable=True),
        sa.Column("correlation_id", sa.String(length=80), nullable=True),
        sa.Column("tenant_id", sa.UUID(), nullable=True),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("occurrence_count", sa.Integer(), server_default="1", nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("related_incident_id", sa.UUID(), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["related_incident_id"], ["platform_technical_incidents.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_code"),
    )
    op.create_index("ix_platform_error_logs_service_name", "platform_error_logs", ["service_name"], unique=False)
    op.create_index("ix_platform_error_logs_endpoint", "platform_error_logs", ["endpoint"], unique=False)
    op.create_index("ix_platform_error_logs_http_status_code", "platform_error_logs", ["http_status_code"], unique=False)
    op.create_index("ix_platform_error_logs_error_fingerprint", "platform_error_logs", ["error_fingerprint"], unique=False)
    op.create_index("ix_platform_error_logs_correlation_id", "platform_error_logs", ["correlation_id"], unique=False)
    op.create_index("ix_platform_error_logs_tenant_id", "platform_error_logs", ["tenant_id"], unique=False)
    op.create_index("ix_platform_error_logs_service_fp", "platform_error_logs", ["service_name", "error_fingerprint"], unique=False)
    op.create_index("ix_platform_error_logs_last_seen", "platform_error_logs", ["last_seen_at"], unique=False)

    # 3. Create platform_service_health_checks table
    op.create_table(
        "platform_service_health_checks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("service_name", sa.String(length=80), nullable=False),
        sa.Column("environment", sa.String(length=40), server_default="production", nullable=False),
        sa.Column("status", sa.String(length=30), server_default="Healthy", nullable=False),
        sa.Column("latency_ms", sa.Numeric(precision=10, scale=2), server_default="0.00", nullable=False),
        sa.Column("details_json", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_platform_service_health_checks_service_name", "platform_service_health_checks", ["service_name"], unique=False)
    op.create_index("ix_platform_service_health_checks_status", "platform_service_health_checks", ["status"], unique=False)
    op.create_index("ix_platform_service_health_checks_checked_at", "platform_service_health_checks", ["checked_at"], unique=False)
    op.create_index(
        "ix_platform_health_checks_service_checked",
        "platform_service_health_checks",
        ["service_name", "checked_at"],
        unique=False,
    )

    # 4. Create platform_worker_heartbeats table
    op.create_table(
        "platform_worker_heartbeats",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("worker_name", sa.String(length=100), nullable=False),
        sa.Column("hostname", sa.String(length=150), nullable=True),
        sa.Column("pid", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=30), server_default="Active", nullable=False),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_job_name", sa.String(length=100), nullable=True),
        sa.Column("last_job_status", sa.String(length=30), nullable=True),
        sa.Column("last_job_finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("consecutive_failures", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("metrics_json", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("worker_name"),
    )
    op.create_index("ix_platform_worker_heartbeats_worker_name", "platform_worker_heartbeats", ["worker_name"], unique=True)
    op.create_index("ix_platform_worker_heartbeats_last_heartbeat_at", "platform_worker_heartbeats", ["last_heartbeat_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_platform_worker_heartbeats_last_heartbeat_at", table_name="platform_worker_heartbeats")
    op.drop_index("ix_platform_worker_heartbeats_worker_name", table_name="platform_worker_heartbeats")
    op.drop_table("platform_worker_heartbeats")

    op.drop_index("ix_platform_health_checks_service_checked", table_name="platform_service_health_checks")
    op.drop_index("ix_platform_service_health_checks_checked_at", table_name="platform_service_health_checks")
    op.drop_index("ix_platform_service_health_checks_status", table_name="platform_service_health_checks")
    op.drop_index("ix_platform_service_health_checks_service_name", table_name="platform_service_health_checks")
    op.drop_table("platform_service_health_checks")

    op.drop_index("ix_platform_error_logs_last_seen", table_name="platform_error_logs")
    op.drop_index("ix_platform_error_logs_service_fp", table_name="platform_error_logs")
    op.drop_index("ix_platform_error_logs_tenant_id", table_name="platform_error_logs")
    op.drop_index("ix_platform_error_logs_correlation_id", table_name="platform_error_logs")
    op.drop_index("ix_platform_error_logs_error_fingerprint", table_name="platform_error_logs")
    op.drop_index("ix_platform_error_logs_http_status_code", table_name="platform_error_logs")
    op.drop_index("ix_platform_error_logs_endpoint", table_name="platform_error_logs")
    op.drop_index("ix_platform_error_logs_service_name", table_name="platform_error_logs")
    op.drop_table("platform_error_logs")

    op.drop_index("ix_platform_tech_incidents_fingerprint_status", table_name="platform_technical_incidents")
    op.drop_index("ix_platform_technical_incidents_status", table_name="platform_technical_incidents")
    op.drop_index("ix_platform_technical_incidents_service_name", table_name="platform_technical_incidents")
    op.drop_index("ix_platform_technical_incidents_error_fingerprint", table_name="platform_technical_incidents")
    op.drop_column("platform_technical_incidents", "notification_count")
    op.drop_column("platform_technical_incidents", "last_notified_severity")
    op.drop_column("platform_technical_incidents", "last_notified_at")
    op.drop_column("platform_technical_incidents", "recovery_evidence_json")
    op.drop_column("platform_technical_incidents", "recovery_detected_at")
    op.drop_column("platform_technical_incidents", "consecutive_healthy_checks")
    op.drop_column("platform_technical_incidents", "diagnostics_json")
    op.drop_column("platform_technical_incidents", "affected_tenant_ids_json")
    op.drop_column("platform_technical_incidents", "affected_tenant_count")
    op.drop_column("platform_technical_incidents", "affected_endpoint")
    op.drop_column("platform_technical_incidents", "occurrence_count")
    op.drop_column("platform_technical_incidents", "last_occurrence_at")
    op.drop_column("platform_technical_incidents", "first_occurrence_at")
    op.drop_column("platform_technical_incidents", "detection_source")
    op.drop_column("platform_technical_incidents", "error_fingerprint")
    op.drop_column("platform_technical_incidents", "environment")
