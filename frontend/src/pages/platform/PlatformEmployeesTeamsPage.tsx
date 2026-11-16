import React, { useEffect, useState } from "react";
import { Pagination } from "../../components/common/Pagination";
import {
  EditIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  UsersIcon,
  XIcon,
} from "../../components/common/SupportPortalIcons";
import { hasPlatformPermission } from "../../services/platformApiClient";
import {
  extractApiErrorMessage,
  platformService,
} from "../../services/platformService";
import type {
  PlatformEmployee,
  PlatformIndustryTeam,
  PlatformRoleDefinition,
} from "../../types/platform";
import "./PlatformPages.css";

const FALLBACK_INDUSTRY_ROLES = [
  "Team Admin",
  "Team Manager",
  "Industry Support",
  "Industry Technical Support",
  "Industry Sales",
  "Industry Finance",
  "Industry Auditor",
  "Team Analyst",
];

const AVAILABILITY_OPTIONS = ["Available", "Busy", "Offline", "On Leave"];
const EMPLOYEE_STATUS_OPTIONS = ["Active", "Inactive", "Suspended"];

export default function PlatformEmployeesTeamsPage() {
  const [activeTab, setActiveTab] = useState<"employees" | "teams">(
    hasPlatformPermission("platform.employees.view") ? "employees" : "teams"
  );

  // Employees state
  const [employees, setEmployees] = useState<PlatformEmployee[]>([]);
  const [empSearch, setEmpSearch] = useState("");
  const [empScopeFilter, setEmpScopeFilter] = useState("");
  const [empIndustryFilter, setEmpIndustryFilter] = useState("");
  const [empRoleFilter, setEmpRoleFilter] = useState("");
  const [empStatusFilter, setEmpStatusFilter] = useState("");
  const [empPage, setEmpPage] = useState(1);

  // Teams & Roles catalog
  const [teams, setTeams] = useState<PlatformIndustryTeam[]>([]);
  const [teamFilterIndustry, setTeamFilterIndustry] = useState("");
  const [centralRoles, setCentralRoles] = useState<PlatformRoleDefinition[]>(
    []
  );
  const [industryRoles, setIndustryRoles] = useState<PlatformRoleDefinition[]>(
    []
  );
  const [selectedTeamDetail, setSelectedTeamDetail] =
    useState<PlatformIndustryTeam | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Add employee modal
  const [addEmpOpen, setAddEmpOpen] = useState(false);
  const [empName, setEmpName] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [empTempPass, setEmpTempPass] = useState("");
  const [empRole, setEmpRole] = useState("Industry Support");
  const [empIndustry, setEmpIndustry] = useState("real-estate");
  const [empPhone, setEmpPhone] = useState("");
  const [empDept, setEmpDept] = useState("");
  const [empMaxLoad, setEmpMaxLoad] = useState(25);

  // Edit employee modal
  const [editEmp, setEditEmp] = useState<PlatformEmployee | null>(null);
  const [editEmpName, setEditEmpName] = useState("");
  const [editEmpRole, setEditEmpRole] = useState("");
  const [editEmpIndustry, setEditEmpIndustry] = useState("");
  const [editEmpStatus, setEditEmpStatus] = useState("Active");
  const [editEmpAvail, setEditEmpAvail] = useState("Available");
  const [editEmpMaxLoad, setEditEmpMaxLoad] = useState(25);
  const [editEmpDept, setEditEmpDept] = useState("");

  // Create / Edit Industry Team modal
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [editingTeamKey, setEditingTeamKey] = useState<string | null>(null);
  const [teamKey, setTeamKey] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamDesc, setTeamDesc] = useState("");
  const [teamActive, setTeamActive] = useState(true);
  const [teamMaxMembers, setTeamMaxMembers] = useState(7);
  const [teamSlaResp, setTeamSlaResp] = useState(60);
  const [teamSlaRes, setTeamSlaRes] = useState(24);
  const [teamBudget, setTeamBudget] = useState(0);

  const canViewEmployees = hasPlatformPermission("platform.employees.view");
  const canManageEmployees = hasPlatformPermission("platform.employees.manage");
  const canViewTeams = hasPlatformPermission("platform.teams.view");
  const canManageIndustries = hasPlatformPermission(
    "platform.industries.manage"
  );

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [empRes, teamRes, rolesRes] = await Promise.all([
        canViewEmployees
          ? platformService.listEmployees({
              role_scope: empScopeFilter || undefined,
              industry_type: empIndustryFilter || undefined,
              role: empRoleFilter || undefined,
              status: empStatusFilter || undefined,
              search: empSearch || undefined,
            })
          : Promise.resolve({ items: [], total: 0 }),
        canViewTeams
          ? platformService.listIndustryTeams({
              industry_type: teamFilterIndustry || undefined,
            })
          : Promise.resolve({
              items: [],
              total: 0,
              reusable_industry_roles: [],
            }),
        platformService.listRoles().catch(() => null),
      ]);
      setEmployees(empRes.items || []);
      setTeams(teamRes.items || []);
      if (rolesRes) {
        setCentralRoles(rolesRes.central_platform_roles || []);
        setIndustryRoles(rolesRes.reusable_industry_roles || []);
      } else if (
        Array.isArray(teamRes.reusable_industry_roles) &&
        teamRes.reusable_industry_roles.length > 0
      ) {
        setIndustryRoles(teamRes.reusable_industry_roles);
      }
      setEmpPage(1);
    } catch (err) {
      setError(
        extractApiErrorMessage(err, "Failed to load employees and teams.")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [
    empScopeFilter,
    empIndustryFilter,
    empRoleFilter,
    empStatusFilter,
    teamFilterIndustry,
  ]);

  const allRoleNames = [
    ...centralRoles.map((r) => r.name),
    ...(industryRoles.length > 0
      ? industryRoles.map((r) => r.name)
      : FALLBACK_INDUSTRY_ROLES),
  ].filter((v, idx, arr) => arr.indexOf(v) === idx);

  const industryRoleNameSet = new Set(
    (industryRoles.length > 0
      ? industryRoles.map((r) => r.name)
      : FALLBACK_INDUSTRY_ROLES)
  );

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (empTempPass.length < 15) {
      setError("Temporary password must be at least 15 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await platformService.createEmployee({
        employee_name: empName.trim(),
        email: empEmail.trim(),
        temporary_password: empTempPass,
        role: empRole,
        industry_type: industryRoleNameSet.has(empRole)
          ? empIndustry || undefined
          : undefined,
        phone: empPhone.trim() || undefined,
        department: empDept.trim() || undefined,
        max_ticket_load: empMaxLoad,
      });
      setSuccess(`Added platform employee ${empName.trim()}.`);
      setAddEmpOpen(false);
      setEmpName("");
      setEmpEmail("");
      setEmpTempPass("");
      setEmpPhone("");
      setEmpDept("");
      await loadData();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to create employee."));
    } finally {
      setSubmitting(false);
    }
  };

  const openEditEmployee = (emp: PlatformEmployee) => {
    setEditEmp(emp);
    setEditEmpName(emp.full_name || "");
    setEditEmpRole(emp.role || "");
    setEditEmpIndustry(emp.industry_key || "");
    setEditEmpStatus(emp.status || "Active");
    setEditEmpAvail(emp.availability_status || "Available");
    setEditEmpMaxLoad(emp.max_ticket_load || 25);
    setEditEmpDept(emp.department || "");
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEmp) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const targetId = editEmp.employee_id || editEmp.id || editEmp.user_id;
      await platformService.updateEmployee(targetId, {
        full_name: editEmpName.trim() || undefined,
        role: editEmpRole || undefined,
        industry_type: industryRoleNameSet.has(editEmpRole)
          ? editEmpIndustry || undefined
          : undefined,
        status: editEmpStatus,
        availability_status: editEmpAvail,
        max_ticket_load: editEmpMaxLoad,
        department: editEmpDept.trim() || undefined,
      });
      setSuccess(`Updated employee ${editEmpName.trim()}.`);
      setEditEmp(null);
      await loadData();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to update employee."));
    } finally {
      setSubmitting(false);
    }
  };

  const openCreateTeam = () => {
    setEditingTeamKey(null);
    setTeamKey("");
    setTeamName("");
    setTeamDesc("");
    setTeamActive(true);
    setTeamMaxMembers(7);
    setTeamSlaResp(60);
    setTeamSlaRes(24);
    setTeamBudget(0);
    setTeamModalOpen(true);
  };

  const openEditTeam = (team: PlatformIndustryTeam) => {
    setEditingTeamKey(team.industry_key);
    setTeamKey(team.industry_key);
    setTeamName(team.name);
    setTeamDesc(team.description || "");
    setTeamActive(Boolean(team.is_active));
    setTeamMaxMembers(team.max_members || 7);
    setTeamSlaResp(team.sla_response_minutes || 60);
    setTeamSlaRes(team.sla_resolution_hours || 24);
    setTeamBudget(Number(team.allocated_budget || 0));
    setTeamModalOpen(true);
  };

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      if (editingTeamKey) {
        await platformService.updateIndustryTeam(editingTeamKey, {
          name: teamName.trim(),
          description: teamDesc.trim(),
          is_active: teamActive,
          max_members: teamMaxMembers,
          sla_response_minutes: teamSlaResp,
          sla_resolution_hours: teamSlaRes,
          allocated_budget: teamBudget,
        });
        setSuccess(`Updated industry team "${teamName.trim()}".`);
      } else {
        await platformService.createIndustryTeam({
          industry_key: teamKey.trim() || undefined,
          name: teamName.trim(),
          description: teamDesc.trim(),
          is_active: teamActive,
          max_members: teamMaxMembers,
          sla_response_minutes: teamSlaResp,
          sla_resolution_hours: teamSlaRes,
          allocated_budget: teamBudget,
        });
        setSuccess(`Created industry team "${teamName.trim()}".`);
      }
      setTeamModalOpen(false);
      await loadData();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to save industry team."));
    } finally {
      setSubmitting(false);
    }
  };

  const empPageSize = 10;
  const pagedEmployees = employees.slice(
    (empPage - 1) * empPageSize,
    empPage * empPageSize
  );

  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <h2>Employees & 10 Industry Teams</h2>
          <p>
            Manage central platform staff, reusable industry-team employees,
            role slot vacancies, SLAs, and budgets.
          </p>
        </div>
        <div className="platform-actions-row">
          <button
            type="button"
            className="platform-btn"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshIcon size={15} />
            <span>Refresh</span>
          </button>
          {canManageEmployees && (
            <button
              type="button"
              className="platform-btn primary"
              onClick={() => setAddEmpOpen(true)}
            >
              <PlusIcon size={15} />
              <span>Add Employee</span>
            </button>
          )}
          {canManageIndustries && activeTab === "teams" && (
            <button
              type="button"
              className="platform-btn primary"
              onClick={openCreateTeam}
            >
              <PlusIcon size={15} />
              <span>Create Team</span>
            </button>
          )}
        </div>
      </div>

      {error && <div className="platform-alert error">{error}</div>}
      {success && <div className="platform-alert success">{success}</div>}

      <div className="platform-tabs">
        {canViewEmployees && (
          <button
            type="button"
            className={`platform-tab ${
              activeTab === "employees" ? "active" : ""
            }`}
            onClick={() => setActiveTab("employees")}
          >
            Platform & Team Employees ({employees.length})
          </button>
        )}
        {canViewTeams && (
          <button
            type="button"
            className={`platform-tab ${activeTab === "teams" ? "active" : ""}`}
            onClick={() => setActiveTab("teams")}
          >
            Industry Teams ({teams.length})
          </button>
        )}
      </div>

      {activeTab === "employees" && canViewEmployees && (
        <>
          <form
            className="platform-filter-bar"
            onSubmit={(e) => {
              e.preventDefault();
              loadData();
            }}
          >
            <input
              className="platform-input"
              style={{ flex: 1, minWidth: 180 }}
              placeholder="Search name, email, EMP code..."
              value={empSearch}
              onChange={(e) => setEmpSearch(e.target.value)}
            />
            <select
              className="platform-select"
              value={empScopeFilter}
              onChange={(e) => setEmpScopeFilter(e.target.value)}
            >
              <option value="">All Scopes</option>
              <option value="platform">Central Platform</option>
              <option value="industry_team">Industry Team</option>
            </select>
            <select
              className="platform-select"
              value={empIndustryFilter}
              onChange={(e) => setEmpIndustryFilter(e.target.value)}
            >
              <option value="">All Industries</option>
              {teams.map((t) => (
                <option key={t.industry_key} value={t.industry_key}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              className="platform-select"
              value={empRoleFilter}
              onChange={(e) => setEmpRoleFilter(e.target.value)}
            >
              <option value="">All Roles</option>
              {allRoleNames.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select
              className="platform-select"
              value={empStatusFilter}
              onChange={(e) => setEmpStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              {EMPLOYEE_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button type="submit" className="platform-btn primary sm">
              <SearchIcon size={14} />
              <span>Search</span>
            </button>
          </form>

          <div className="platform-card">
            {loading ? (
              <div className="platform-empty">Loading employees...</div>
            ) : employees.length === 0 ? (
              <div className="platform-empty">No employees match filters.</div>
            ) : (
              <>
                <div className="platform-table-wrap">
                  <table className="platform-table">
                    <thead>
                      <tr>
                        <th>Code & Name</th>
                        <th>Role & Scope</th>
                        <th>Industry Team</th>
                        <th>Status & Availability</th>
                        <th>Ticket Load</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedEmployees.map((emp) => (
                        <tr key={emp.employee_id || emp.user_id}>
                          <td>
                            <strong>{emp.full_name}</strong>
                            <div style={{ fontSize: 12, color: "var(--plat-muted)" }}>
                              {emp.employee_code} • {emp.email}
                            </div>
                          </td>
                          <td>
                            <span className="platform-badge indigo">
                              {emp.role}
                            </span>
                            <div style={{ fontSize: 12, color: "var(--plat-muted)", marginTop: 4 }}>
                              {emp.role_scope}
                              {emp.department ? ` • ${emp.department}` : ""}
                            </div>
                          </td>
                          <td>
                            {emp.industry_team_name ||
                              emp.industry_key ||
                              "Central Platform"}
                          </td>
                          <td>
                            <span
                              className={`platform-badge ${
                                emp.status === "Active" ? "green" : "red"
                              }`}
                            >
                              {emp.status}
                            </span>{" "}
                            <span className="platform-badge">
                              {emp.availability_status}
                            </span>
                          </td>
                          <td>
                            {emp.active_ticket_load ??
                              emp.current_ticket_load ??
                              0}{" "}
                            / {emp.max_ticket_load}
                          </td>
                          <td>
                            {canManageEmployees && (
                              <button
                                type="button"
                                className="platform-btn sm"
                                onClick={() => openEditEmployee(emp)}
                              >
                                <EditIcon size={13} />
                                <span>Edit</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  currentPage={empPage}
                  totalItems={employees.length}
                  pageSize={empPageSize}
                  onPageChange={setEmpPage}
                  entityName="employees"
                />
              </>
            )}
          </div>
        </>
      )}

      {activeTab === "teams" && canViewTeams && (
        <>
          <div className="platform-filter-bar">
            <UsersIcon size={16} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Filter Industry:</span>
            <select
              className="platform-select"
              value={teamFilterIndustry}
              onChange={(e) => setTeamFilterIndustry(e.target.value)}
            >
              <option value="">All 10 Official Industries</option>
              {teams.map((t) => (
                <option key={t.industry_key} value={t.industry_key}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="platform-grid-2">
            {teams.map((team) => (
              <div key={team.id || team.industry_key} className="platform-card">
                <div className="platform-card-title">
                  <span>{team.name}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span
                      className={`platform-badge ${
                        team.is_active ? "green" : "red"
                      }`}
                    >
                      {team.is_active ? "Active" : "Inactive"}
                    </span>
                    <button
                      type="button"
                      className="platform-btn sm"
                      onClick={() => setSelectedTeamDetail(team)}
                    >
                      Role Slots
                    </button>
                    {canManageIndustries && (
                      <button
                        type="button"
                        className="platform-btn sm"
                        onClick={() => openEditTeam(team)}
                      >
                        <EditIcon size={13} />
                      </button>
                    )}
                  </div>
                </div>
                <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--plat-muted)" }}>
                  {team.description || team.industry_key}
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 8,
                    fontSize: 12.5,
                  }}
                >
                  <div>
                    <div style={{ color: "var(--plat-muted)" }}>Capacity</div>
                    <strong>
                      {team.active_members_count} / {team.max_members}
                    </strong>{" "}
                    ({team.vacancies_count} open)
                  </div>
                  <div>
                    <div style={{ color: "var(--plat-muted)" }}>Tenants / Tickets</div>
                    <strong>
                      {team.registered_companies_count} cos •{" "}
                      {team.open_tickets_workload} tickets
                    </strong>
                  </div>
                  <div>
                    <div style={{ color: "var(--plat-muted)" }}>SLA & Budget</div>
                    <strong>
                      {team.sla_response_minutes}m / {team.sla_resolution_hours}h
                    </strong>
                    <div>₹{team.allocated_budget}</div>
                  </div>
                </div>
                {team.vacant_roles?.length > 0 && (
                  <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11.5, color: "var(--plat-muted)" }}>
                      Vacant:
                    </span>
                    {team.vacant_roles.map((r) => (
                      <span key={r} className="platform-badge yellow">
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Team Role Slots Detail Modal */}
      {selectedTeamDetail && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <h3>{selectedTeamDetail.name} — Role Slots & Members</h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setSelectedTeamDetail(null)}
              >
                <XIcon size={15} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {selectedTeamDetail.members.length === 0 ? (
                <div className="platform-empty">No assigned members yet.</div>
              ) : (
                selectedTeamDetail.members.map((m) => (
                  <div
                    key={m.user_id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 12px",
                      border: "1px solid var(--plat-border)",
                      borderRadius: 8,
                    }}
                  >
                    <div>
                      <strong>{m.full_name}</strong> ({m.employee_code})
                      <div style={{ fontSize: 12, color: "var(--plat-muted)" }}>
                        {m.email}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <span className="platform-badge indigo">{m.role}</span>
                      <span className="platform-badge green">{m.status}</span>
                    </div>
                  </div>
                ))
              )}
              {selectedTeamDetail.vacant_roles.length > 0 && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                    Vacant Industry Roles
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {selectedTeamDetail.vacant_roles.map((vr) => (
                      <span key={vr} className="platform-badge yellow">
                        {vr}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {addEmpOpen && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <h3>Add Platform / Industry Team Employee</h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setAddEmpOpen(false)}
              >
                <XIcon size={15} />
              </button>
            </div>
            <form
              onSubmit={handleAddEmployee}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="platform-form-grid">
                <div className="platform-field">
                  <label>Employee Name</label>
                  <input
                    className="platform-input"
                    required
                    minLength={2}
                    value={empName}
                    onChange={(e) => setEmpName(e.target.value)}
                  />
                </div>
                <div className="platform-field">
                  <label>Work Email</label>
                  <input
                    className="platform-input"
                    type="email"
                    required
                    value={empEmail}
                    onChange={(e) => setEmpEmail(e.target.value)}
                  />
                </div>
                <div className="platform-field">
                  <label>Temporary Password (min 15 chars)</label>
                  <input
                    className="platform-input"
                    type="password"
                    required
                    minLength={15}
                    value={empTempPass}
                    onChange={(e) => setEmpTempPass(e.target.value)}
                  />
                </div>
                <div className="platform-field">
                  <label>Role</label>
                  <select
                    className="platform-select"
                    value={empRole}
                    onChange={(e) => setEmpRole(e.target.value)}
                  >
                    {allRoleNames.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                {industryRoleNameSet.has(empRole) && (
                  <div className="platform-field">
                    <label>Industry Team (required for industry roles)</label>
                    <select
                      className="platform-select"
                      value={empIndustry}
                      onChange={(e) => setEmpIndustry(e.target.value)}
                    >
                      {teams.map((t) => (
                        <option key={t.industry_key} value={t.industry_key}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="platform-field">
                  <label>Max Ticket Load</label>
                  <input
                    className="platform-input"
                    type="number"
                    min={1}
                    max={500}
                    value={empMaxLoad}
                    onChange={(e) => setEmpMaxLoad(Number(e.target.value))}
                  />
                </div>
                <div className="platform-field">
                  <label>Phone (optional)</label>
                  <input
                    className="platform-input"
                    value={empPhone}
                    onChange={(e) => setEmpPhone(e.target.value)}
                  />
                </div>
                <div className="platform-field">
                  <label>Department (optional)</label>
                  <input
                    className="platform-input"
                    value={empDept}
                    onChange={(e) => setEmpDept(e.target.value)}
                  />
                </div>
              </div>
              <div className="platform-actions-row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="platform-btn"
                  onClick={() => setAddEmpOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="platform-btn primary"
                  disabled={submitting}
                >
                  {submitting ? "Creating..." : "Create Employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {editEmp && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <h3>Edit Employee: {editEmp.full_name}</h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setEditEmp(null)}
              >
                <XIcon size={15} />
              </button>
            </div>
            <form
              onSubmit={handleUpdateEmployee}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="platform-form-grid">
                <div className="platform-field">
                  <label>Full Name</label>
                  <input
                    className="platform-input"
                    required
                    value={editEmpName}
                    onChange={(e) => setEditEmpName(e.target.value)}
                  />
                </div>
                <div className="platform-field">
                  <label>Role</label>
                  <select
                    className="platform-select"
                    value={editEmpRole}
                    onChange={(e) => setEditEmpRole(e.target.value)}
                  >
                    {allRoleNames.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                {industryRoleNameSet.has(editEmpRole) && (
                  <div className="platform-field">
                    <label>Industry Team</label>
                    <select
                      className="platform-select"
                      value={editEmpIndustry}
                      onChange={(e) => setEditEmpIndustry(e.target.value)}
                    >
                      {teams.map((t) => (
                        <option key={t.industry_key} value={t.industry_key}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="platform-field">
                  <label>Account Status</label>
                  <select
                    className="platform-select"
                    value={editEmpStatus}
                    onChange={(e) => setEditEmpStatus(e.target.value)}
                  >
                    {EMPLOYEE_STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="platform-field">
                  <label>Availability</label>
                  <select
                    className="platform-select"
                    value={editEmpAvail}
                    onChange={(e) => setEditEmpAvail(e.target.value)}
                  >
                    {AVAILABILITY_OPTIONS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="platform-field">
                  <label>Max Ticket Load</label>
                  <input
                    className="platform-input"
                    type="number"
                    min={1}
                    max={500}
                    value={editEmpMaxLoad}
                    onChange={(e) => setEditEmpMaxLoad(Number(e.target.value))}
                  />
                </div>
                <div className="platform-field">
                  <label>Department</label>
                  <input
                    className="platform-input"
                    value={editEmpDept}
                    onChange={(e) => setEditEmpDept(e.target.value)}
                  />
                </div>
              </div>
              <div className="platform-actions-row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="platform-btn"
                  onClick={() => setEditEmp(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="platform-btn primary"
                  disabled={submitting}
                >
                  {submitting ? "Saving..." : "Save Employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Industry Team Modal */}
      {teamModalOpen && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <h3>
                {editingTeamKey
                  ? `Edit Industry Team: ${editingTeamKey}`
                  : "Create Industry Team"}
              </h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setTeamModalOpen(false)}
              >
                <XIcon size={15} />
              </button>
            </div>
            <form
              onSubmit={handleSaveTeam}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="platform-form-grid">
                {!editingTeamKey && (
                  <div className="platform-field">
                    <label>Industry Key</label>
                    <input
                      className="platform-input"
                      value={teamKey}
                      onChange={(e) => setTeamKey(e.target.value)}
                      placeholder="e.g. healthcare"
                    />
                  </div>
                )}
                <div className="platform-field">
                  <label>Team Name</label>
                  <input
                    className="platform-input"
                    required
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                  />
                </div>
                <div className="platform-field">
                  <label>Max Members</label>
                  <input
                    className="platform-input"
                    type="number"
                    min={1}
                    max={50}
                    value={teamMaxMembers}
                    onChange={(e) => setTeamMaxMembers(Number(e.target.value))}
                  />
                </div>
                <div className="platform-field">
                  <label>SLA Response (minutes)</label>
                  <input
                    className="platform-input"
                    type="number"
                    min={5}
                    value={teamSlaResp}
                    onChange={(e) => setTeamSlaResp(Number(e.target.value))}
                  />
                </div>
                <div className="platform-field">
                  <label>SLA Resolution (hours)</label>
                  <input
                    className="platform-input"
                    type="number"
                    min={1}
                    value={teamSlaRes}
                    onChange={(e) => setTeamSlaRes(Number(e.target.value))}
                  />
                </div>
                <div className="platform-field">
                  <label>Allocated Budget</label>
                  <input
                    className="platform-input"
                    type="number"
                    min={0}
                    value={teamBudget}
                    onChange={(e) => setTeamBudget(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="platform-field">
                <label>Description</label>
                <textarea
                  className="platform-textarea"
                  rows={2}
                  value={teamDesc}
                  onChange={(e) => setTeamDesc(e.target.value)}
                />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={teamActive}
                  onChange={(e) => setTeamActive(e.target.checked)}
                />
                Team Active
              </label>
              <div className="platform-actions-row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="platform-btn"
                  onClick={() => setTeamModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="platform-btn primary"
                  disabled={submitting}
                >
                  {submitting ? "Saving..." : "Save Team"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
