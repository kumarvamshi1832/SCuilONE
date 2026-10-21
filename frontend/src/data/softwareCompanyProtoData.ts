/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  PROTOTYPE DATA — FRONTEND ONLY                                     ║
 * ║                                                                      ║
 * ║  This file contains placeholder data for Software Company Dashboard  ║
 * ║  widgets where no backend API or data model exists yet.              ║
 * ║                                                                      ║
 * ║  Replace each export with real API calls when the corresponding      ║
 * ║  backend service becomes available.                                  ║
 * ║                                                                      ║
 * ║  Widgets using REAL API data (not from this file):                   ║
 * ║    - Active Clients  → accountService.getAccounts()                  ║
 * ║    - Open Tasks      → activityService.getActivities()              ║
 * ║    - Team Members    → userService.getUsers()                        ║
 * ║    - Revenue         → dealService.getDeals()                        ║
 * ║    - Recent Clients  → accountService.getAccounts()                  ║
 * ║    - Tasks & Activities → activityService.getActivities()            ║
 * ║    - Leads           → leadService.getLeads()                        ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

/* ─── Missing API: Projects ───
 * The CRM does not currently have a Projects module, API, or data model.
 * The following prototype data simulates project records.
 * Required backend: POST/GET /api/v1/projects/
 */

export interface ProtoProject {
  id: string;
  name: string;
  client: string;
  status: "Active" | "Planning" | "On Hold" | "Completed";
  progress: number; // 0–100
  deadline: string;
  projectManager: string;
}

export const protoProjects: ProtoProject[] = [
  {
    id: "proj-001",
    name: "E-Commerce Platform Redesign",
    client: "RetailMax India",
    status: "Active",
    progress: 72,
    deadline: "2026-12-15",
    projectManager: "Arjun Mehta",
  },
  {
    id: "proj-002",
    name: "Mobile Banking App",
    client: "FinServ Corp",
    status: "Active",
    progress: 45,
    deadline: "2027-02-28",
    projectManager: "Priya Sharma",
  },
  {
    id: "proj-003",
    name: "HR Management System",
    client: "TalentBridge",
    status: "Planning",
    progress: 10,
    deadline: "2027-04-30",
    projectManager: "Rohan Gupta",
  },
  {
    id: "proj-004",
    name: "IoT Dashboard",
    client: "SmartFactory Ltd",
    status: "On Hold",
    progress: 30,
    deadline: "2027-01-20",
    projectManager: "Sneha Reddy",
  },
  {
    id: "proj-005",
    name: "CRM Integration Suite",
    client: "GlobalTech Solutions",
    status: "Completed",
    progress: 100,
    deadline: "2026-09-30",
    projectManager: "Arjun Mehta",
  },
  {
    id: "proj-006",
    name: "Supply Chain Analytics",
    client: "LogiPrime Inc",
    status: "Active",
    progress: 58,
    deadline: "2027-03-15",
    projectManager: "Priya Sharma",
  },
];

/* ─── Missing API: Team Workload ───
 * No endpoint exists for aggregated team workload.
 * This data would normally be derived from project-task assignments.
 */
export interface ProtoTeamWorkload {
  name: string;
  tasks: number;
}

export const protoTeamWorkload: ProtoTeamWorkload[] = [
  { name: "Arjun", tasks: 12 },
  { name: "Priya", tasks: 9 },
  { name: "Rohan", tasks: 7 },
  { name: "Sneha", tasks: 11 },
  { name: "Vikram", tasks: 5 },
  { name: "Ananya", tasks: 8 },
];
