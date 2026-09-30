export type Role =
  | "Tenant Owner"
  | "Tenant Admin"
  | "Manager"
  | "Sales User"
  | "Operations User"
  | "Support User"
  | "Read Only"
  | "Read-only / Auditor"
  | string;



export interface User {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  role: string;
  status: string;
  created_at?: string;
}
