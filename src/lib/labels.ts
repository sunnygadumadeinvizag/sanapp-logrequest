// App roles (App5 owns its own role model).
export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "App Admin",
  POC: "POC",
  USER: "User",
};

// SSO primary roles — used for category eligibility.
export const PRIMARY_ROLE_LABELS: Record<string, string> = {
  STAFF_TEACHING: "Staff – Teaching",
  STAFF_NON_TEACHING: "Staff – Non-Teaching",
  STUDENT: "Student",
  SCHOLAR: "Scholar",
  GUEST: "Guest",
};

export const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  PENDING: "Pending Info",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

export const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export function primaryRoleLabel(role: string | null | undefined): string {
  if (!role) return "Not set";
  return PRIMARY_ROLE_LABELS[role] ?? role;
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function priorityLabel(p: string): string {
  return PRIORITY_LABELS[p] ?? p;
}

export function fmtRequestNumber(n: number): string {
  return `REQ-${String(n).padStart(4, "0")}`;
}

/** Format a UTC ISO timestamp as an IST wall-clock string (YYYY-MM-DD HH:MM). */
export function fmtIstDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${ist.toISOString().slice(0, 10)} ${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())} IST`;
}

/** Format a minute count as "2 h 15 m". */
export function fmtMinutes(total: number): string {
  if (!total || total <= 0) return "0 m";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} m`;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}
