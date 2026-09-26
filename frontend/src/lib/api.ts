export type CampusUser = {
  userId: string;
  id?: string;
  fullName?: string;
  email: string;
  role: "STUDENT" | "STAFF" | "ADMIN";
};

export type CampusNotification = {
  id: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};

export type Office = {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  isActive: boolean;
};

export type OfficeDayHours = { dayOfWeek: number; isClosed: boolean; openTime: string | null; closeTime: string | null };
export type OfficeClosedDate = { id: string; closedDate: string; reason?: string | null };
export type AppointmentAvailability = { date: string; timeZone: string; message?: string | null; office: { id: string; name: string }; service: { id: string; name: string; durationMinutes: number }; slots: string[] };
export type AppointmentCalendar = {
  month: string;
  timeZone: string;
  office: { id: string; name: string };
  service: { id: string; name: string; durationMinutes: number };
  hours: OfficeDayHours[];
  closedDates: { closedDate: string; reason?: string | null }[];
};

export type CampusService = {
  id: string;
  name: string;
  description?: string | null;
  durationMinutes: number;
  officeId: string;
  office: Office;
};

export type Appointment = {
  id: string;
  appointmentDate: string;
  appointmentTime: string;
  status: string;
  queueNumber?: string | null;
  purpose?: string | null;
  office: Office;
  service: CampusService;
  queueTicket?: { id: string; status: string; queueNumber: string } | null;
  user?: { id: string; fullName: string; studentId?: string | null };
};

export type QueueTicket = {
  id: string;
  queueNumber: string;
  status: string;
  peopleAhead: number;
  position: number;
  estimatedWaitMinutes: number;
  session: { office: Office; service: CampusService };
  counter?: { name: string; code: string } | null;
};

export type DeskTicket = {
  id: string;
  queueNumber: string;
  status: string;
  priority: number;
  checkedInAt: string;
  calledAt?: string | null;
  servingStartedAt?: string | null;
  user: { id: string; fullName: string; studentId?: string | null };
  counter?: { id: string; name: string; code: string } | null;
};

export type QueueCounter = {
  id: string;
  officeId: string;
  name: string;
  code: string;
  isActive?: boolean;
  staffAssignments?: { user: StaffUser }[];
};

export type QueueSession = {
  id: string;
  status: "OPEN" | "PAUSED" | "CLOSED";
  sessionDate: string;
  office: Office;
  service: CampusService;
  waitingCount: number;
  currentTickets: {
    id: string;
    queueNumber: string;
    status: string;
    counterId?: string | null;
  }[];
  counters: QueueCounter[];
};

export type StaffUser = {
  id: string;
  fullName: string;
  email: string;
  employeeId?: string | null;
};

export type OfficeAssignment = {
  officeId: string;
  userId: string;
  user: StaffUser;
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/backend${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(payload?.message)
      ? payload.message.join(" ")
      : payload?.message ||
        payload?.error ||
        "Something went wrong. Please try again.";
    throw new Error(message);
  }
  return payload as T;
}

function announceSessionChange() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      "campus_queue_session_changed",
      `${Date.now()}-${Math.random()}`,
    );
  } catch {
    // The current tab can still update its own session if storage is disabled.
  }
}

export async function signIn(email: string, password: string) {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload?.message ||
        "Unable to sign in. Check your details and try again.",
    );
  }
  announceSessionChange();
  return payload as { user: CampusUser; message: string };
}

export async function signUp(values: {
  fullName: string;
  email: string;
  password: string;
  studentId?: string;
}) {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload?.message || "Unable to create your account. Please try again.",
    );
  }
  return payload as { message: string };
}

export async function signOut() {
  const response = await fetch("/api/auth/session", { method: "DELETE" });
  if (response.ok) announceSessionChange();
}

export function localDate(date: string) {
  return new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function statusLabel(status: string) {
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
