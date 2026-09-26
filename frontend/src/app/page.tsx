"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import calendarStyles from "./appointment-calendar.module.css";
import {
  api,
  Appointment,
  AppointmentAvailability,
  AppointmentCalendar,
  CampusNotification,
  CampusService,
  CampusUser,
  DeskTicket,
  OfficeAssignment,
  localDate,
  Office,
  OfficeDayHours,
  OfficeClosedDate,
  QueueCounter,
  QueueSession,
  QueueTicket,
  signIn,
  signOut,
  signUp,
  StaffUser,
  statusLabel,
} from "@/lib/api";

type View = "overview" | "appointments" | "queue" | "manage" | "hours";

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  const paths: Record<string, React.ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
        <path d="m9 15 2 2 4-4" />
      </>
    ),
    ticket: (
      <>
        <path d="M4 5h16v4a3 3 0 0 0 0 6v4H4v-4a3 3 0 0 0 0-6V5Z" />
        <path d="M13 8v2m0 4v2" />
      </>
    ),
    building: (
      <>
        <path d="M3 21h18M5 21V6l7-3 7 3v15M9 9h1m4 0h1m-6 4h1m4 0h1m-5 8v-4h4v4" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </>
    ),
    logout: (
      <>
        <path d="M10 17l5-5-5-5M15 12H3" />
        <path d="M12 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z" />
        <path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" />
      </>
    ),
    menu: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
  };
  return <svg {...common}>{paths[name] || paths.spark}</svg>;
}

function initials(user: CampusUser) {
  const label = user.fullName || user.email;
  return label
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function todayString() {
  const today = new Date();
  const local = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

type AppointmentListView = "review" | "upcoming" | "history";
const OFFICE_DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function appointmentDay(appointment: Appointment) {
  return appointment.appointmentDate.slice(0, 10);
}

function appointmentDateParts(appointment: Appointment) {
  const date = new Date(`${appointmentDay(appointment)}T00:00:00`);
  return {
    day: new Intl.DateTimeFormat("en", { day: "2-digit" }).format(date),
    month: new Intl.DateTimeFormat("en", { month: "short" }).format(date),
  };
}

function appointmentStatus(appointment: Appointment) {
  return appointment.status.toLowerCase();
}

function isPastOrClosedAppointment(appointment: Appointment) {
  return (
    ["cancelled", "canceled", "served", "completed", "skipped", "no_show", "rejected"].includes(
      appointmentStatus(appointment),
    ) || appointmentDay(appointment) < todayString()
  );
}

function sortAppointments(appointments: Appointment[]) {
  return [...appointments].sort((a, b) =>
    `${appointmentDay(a)} ${a.appointmentTime}`.localeCompare(
      `${appointmentDay(b)} ${b.appointmentTime}`,
    ),
  );
}

function AppointmentFilters({
  selected,
  onSelect,
  counts,
  labels,
}: {
  selected: AppointmentListView;
  onSelect: (view: AppointmentListView) => void;
  counts: Record<AppointmentListView, number>;
  labels: Record<AppointmentListView, string>;
}) {
  return (
    <div className="appointment-filters" role="group" aria-label="Filter appointments">
      {(["review", "upcoming", "history"] as const).map((view) => (
        <button
          key={view}
          type="button"
          className={`appointment-filter${selected === view ? " appointment-filter-active" : ""}`}
          aria-pressed={selected === view}
          onClick={() => onSelect(view)}
        >
          {labels[view]} <span>{counts[view]}</span>
        </button>
      ))}
    </div>
  );
}

export default function Home() {
  const [user, setUser] = useState<CampusUser | null>(null);
  const [offices, setOffices] = useState<Office[]>([]);
  const [services, setServices] = useState<CampusService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [notifications, setNotifications] = useState<CampusNotification[]>([]);
  const [tickets, setTickets] = useState<QueueTicket[]>([]);
  const [staffAppointments, setStaffAppointments] = useState<Appointment[]>([]);
  const [staffAppointmentsRefreshing, setStaffAppointmentsRefreshing] =
    useState(false);
  const staffAppointmentRequest = useRef(0);
  const [queueSessions, setQueueSessions] = useState<QueueSession[]>([]);
  const [deskTickets, setDeskTickets] = useState<DeskTicket[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedCounterId, setSelectedCounterId] = useState("");
  const [staffDirectory, setStaffDirectory] = useState<StaffUser[]>([]);
  const [officeAssignments, setOfficeAssignments] = useState<
    OfficeAssignment[]
  >([]);
  const [officeCounters, setOfficeCounters] = useState<QueueCounter[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [counterName, setCounterName] = useState("");
  const [counterCode, setCounterCode] = useState("");
  const [view, setView] = useState<View>("overview");
  const [officeId, setOfficeId] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(todayString().slice(0, 7));
  const [calendarInfo, setCalendarInfo] =
    useState<AppointmentCalendar | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState("");
  const [appointmentTime, setAppointmentTime] = useState("09:00");
  const [availability, setAvailability] =
    useState<AppointmentAvailability | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerStudentId, setRegisterStudentId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [officeName, setOfficeName] = useState("");
  const [officeCode, setOfficeCode] = useState("");
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceOffice, setNewServiceOffice] = useState("");

  const activeQueue = tickets[0];
  const upcomingAppointments = useMemo(
    () =>
      appointments.filter(
        (appointment) =>
          !["cancelled", "served", "skipped", "no_show"].includes(
            appointment.status,
          ),
      ),
    [appointments],
  );

  const loadPublicData = useCallback(async () => {
    setServicesLoading(true);
    setServicesError("");
    const [officeResult, serviceResult] = await Promise.allSettled([
      api<Office[]>("/offices"),
      api<CampusService[]>("/services"),
    ]);
    if (officeResult.status === "fulfilled")
      setOffices(officeResult.value.filter((office) => office.isActive));
    if (serviceResult.status === "fulfilled") setServices(serviceResult.value);
    else setServicesError("Campus services couldn’t be loaded. Check the connection and try again.");
    setServicesLoading(false);
    return {
      offices:
        officeResult.status === "fulfilled"
          ? officeResult.value.filter((office) => office.isActive)
          : [],
      services: serviceResult.status === "fulfilled" ? serviceResult.value : [],
    };
  }, []);

  const loadStudentData = useCallback(async () => {
    const [appointmentResult, ticketResult] = await Promise.allSettled([
      api<Appointment[]>("/appointments/mine"),
      api<QueueTicket[]>("/queue/mine"),
    ]);
    if (appointmentResult.status === "fulfilled")
      setAppointments(appointmentResult.value);
    if (ticketResult.status === "fulfilled") setTickets(ticketResult.value);
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      setNotifications(await api<CampusNotification[]>("/notifications/mine"));
    } catch {
      // Keep background refreshes quiet if the session expires.
    }
  }, []);

  const refreshStaffAppointments = useCallback(async () => {
    if (!user || user.role === "STUDENT" || !officeId) return;
    const requestId = ++staffAppointmentRequest.current;
    setStaffAppointmentsRefreshing(true);
    try {
      const latestAppointments = await api<Appointment[]>(
        `/appointments/office/${officeId}?date=${todayString()}`,
      );
      if (requestId === staffAppointmentRequest.current)
        setStaffAppointments(latestAppointments);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to refresh appointments.",
      );
    } finally {
      if (requestId === staffAppointmentRequest.current)
        setStaffAppointmentsRefreshing(false);
    }
  }, [officeId, user]);

  useEffect(() => {
    void (async () => {
      const publicData = await loadPublicData();
      try {
        const profile = await api<CampusUser>("/auth/profile");
        setUser(profile);
        if (profile.role === "STUDENT") await loadStudentData();
        if (profile.role === "STAFF") {
          const assignedOffices = await api<Office[]>("/offices/mine");
          setOffices(assignedOffices);
          setOfficeId(assignedOffices[0]?.id || "");
        }
        if (profile.role === "ADMIN") {
          setOfficeId(publicData.offices[0]?.id || "");
          setStaffDirectory(await api<StaffUser[]>("/users/staff"));
        }
      } catch {
        // A missing session is expected for first-time visitors.
      } finally {
        setLoading(false);
      }
    })();
  }, [loadPublicData, loadStudentData]);

  useEffect(() => {
    const handleSessionChange = (event: StorageEvent) => {
      if (event.key === "campus_queue_session_changed") {
        // Tabs on one origin share the session cookie. Reload each tab so its
        // role and API requests stay aligned with the active account.
        window.location.reload();
      }
    };
    window.addEventListener("storage", handleSessionChange);
    return () => window.removeEventListener("storage", handleSessionChange);
  }, []);

  useEffect(() => {
    if (!user) return;
    const initial = window.setTimeout(() => void loadNotifications(), 0);
    const timer = window.setInterval(() => void loadNotifications(), 15000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [user, loadNotifications]);

  useEffect(() => {
    if (!user || user.role !== "STUDENT" || !serviceId || !appointmentDate) {
      return;
    }
    let current = true;
    const request = window.setTimeout(() => {
      if (!current) return;
      setAvailabilityLoading(true);
      void api<AppointmentAvailability>(
        `/appointments/availability?serviceId=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(appointmentDate)}`,
      )
      .then((result) => {
        if (!current) return;
        setAvailability(result);
        setAppointmentTime(result.slots[0] || "");
      })
      .catch((reason: Error) => {
        if (current) {
          setAvailability(null);
          setError(reason.message);
        }
      })
      .finally(() => {
        if (current) setAvailabilityLoading(false);
      });
    }, 0);
    return () => {
      current = false;
      window.clearTimeout(request);
    };
  }, [user, serviceId, appointmentDate]);

  useEffect(() => {
    if (!user || user.role !== "STUDENT" || !serviceId) {
      return;
    }
    let current = true;
    const request = window.setTimeout(() => {
      if (!current) return;
      setCalendarLoading(true);
      setCalendarError("");
      void api<AppointmentCalendar>(
        `/appointments/calendar?serviceId=${encodeURIComponent(serviceId)}&month=${encodeURIComponent(calendarMonth)}`,
      )
      .then((result) => {
        if (current) setCalendarInfo(result);
      })
      .catch((reason: Error) => {
        if (current) {
          setCalendarInfo(null);
          setCalendarError(reason.message);
          setError(reason.message);
        }
      })
      .finally(() => {
        if (current) setCalendarLoading(false);
      });
    }, 0);
    return () => {
      current = false;
      window.clearTimeout(request);
    };
  }, [user, serviceId, calendarMonth]);

  useEffect(() => {
    if (!user || user.role === "STUDENT" || !officeId) return;
    void refreshStaffAppointments();
    if (view !== "appointments") return;
    const timer = window.setInterval(
      () => void refreshStaffAppointments(),
      15000,
    );
    return () => window.clearInterval(timer);
  }, [user, officeId, view, refreshStaffAppointments]);

  useEffect(() => {
    if (!user || user.role === "STUDENT" || !officeId) return;
    let current = true;
    api<QueueSession[]>(`/queue/sessions?officeId=${officeId}`)
      .then((sessions) => {
        if (!current) return;
        setQueueSessions(sessions);
        setSelectedSessionId((selected) =>
          sessions.some((session) => session.id === selected)
            ? selected
            : sessions[0]?.id || "",
        );
        const selectedSession =
          sessions.find((session) => session.id === selectedSessionId) ||
          sessions[0];
        setSelectedCounterId((selected) =>
          selectedSession?.counters.some((counter) => counter.id === selected)
            ? selected
            : selectedSession?.counters[0]?.id || "",
        );
      })
      .catch((reason: Error) => {
        if (current) setError(reason.message);
      });
    return () => {
      current = false;
    };
  }, [user, officeId, selectedSessionId]);

  useEffect(() => {
    if (!user || user.role === "STUDENT" || !selectedSessionId) {
      return;
    }
    let current = true;
    api<DeskTicket[]>(`/queue/sessions/${selectedSessionId}/tickets`)
      .then((items) => {
        if (current) setDeskTickets(items);
      })
      .catch((reason: Error) => {
        if (current) setError(reason.message);
      });
    return () => {
      current = false;
    };
  }, [user, selectedSessionId]);

  useEffect(() => {
    if (user?.role !== "ADMIN" || !officeId) return;
    let current = true;
    void Promise.all([
      api<OfficeAssignment[]>(`/offices/${officeId}/staff`),
      api<QueueCounter[]>(`/offices/${officeId}/counters`),
    ])
      .then(([assignments, counters]) => {
        if (!current) return;
        setOfficeAssignments(assignments);
        setOfficeCounters(counters);
      })
      .catch((reason: Error) => {
        if (current) setError(reason.message);
      });
    return () => {
      current = false;
    };
  }, [user, officeId]);

  function clearMessages() {
    setNotice("");
    setError("");
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    setBusy(true);
    try {
      if (authMode === "register") {
        const result = await signUp({
          fullName: registerName,
          email,
          password,
          ...(registerStudentId ? { studentId: registerStudentId } : {}),
        });
        setNotice(`${result.message} You can sign in now.`);
        setAuthMode("login");
        setPassword("");
      } else {
        const result = await signIn(email, password);
        setUser(result.user);
        if (result.user.role === "STUDENT") await loadStudentData();
        if (result.user.role === "STAFF") {
          const assignedOffices = await api<Office[]>("/offices/mine");
          setOffices(assignedOffices);
          setOfficeId(assignedOffices[0]?.id || "");
        }
        if (result.user.role === "ADMIN") {
          setOfficeId(offices[0]?.id || "");
          setStaffDirectory(await api<StaffUser[]>("/users/staff"));
        }
        setNotice(
          `Welcome back, ${result.user.fullName || result.user.email.split("@")[0]}.`,
        );
        setPassword("");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await signOut();
    setUser(null);
    setAppointments([]);
    setTickets([]);
    setStaffAppointments([]);
    setNotifications([]);
    setNotificationsOpen(false);
    setView("overview");
    setNotice("You have signed out.");
  }

  async function markNotificationRead(notificationId: string) {
    try {
      await api(`/notifications/${notificationId}/read`, { method: "PATCH" });
      setNotifications((current) =>
        current.map((item) =>
          item.id === notificationId ? { ...item, isRead: true } : item,
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to update notification.",
      );
    }
  }

  async function markAllNotificationsRead() {
    try {
      await api("/notifications/read-all", { method: "PATCH" });
      setNotifications((current) =>
        current.map((item) => ({ ...item, isRead: true })),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to update notifications.",
      );
    }
  }

  async function handleAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!serviceId) return setError("Choose a service first.");
    clearMessages();
    setBusy(true);
    try {
      await api<Appointment>("/appointments", {
        method: "POST",
        body: JSON.stringify({
          serviceId,
          appointmentDate,
          appointmentTime,
          purpose,
        }),
      });
      setNotice("Your appointment request has been sent.");
      setPurpose("");
      await loadStudentData();
      setView("appointments");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to request appointment.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function joinQueue(service: CampusService) {
    clearMessages();
    setBusy(true);
    try {
      const ticket = await api<QueueTicket>("/queue/join", {
        method: "POST",
        body: JSON.stringify({ serviceId: service.id }),
      });
      setNotice(`You’re in line. Your number is ${ticket.queueNumber}.`);
      await loadStudentData();
      setView("queue");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to join this queue.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancelAppointment(id: string) {
    clearMessages();
    try {
      await api(`/appointments/${id}/cancel`, { method: "PATCH" });
      setNotice("Appointment cancelled.");
      await loadStudentData();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to cancel appointment.",
      );
    }
  }

  async function rescheduleAppointment(
    id: string,
    values: {
      serviceId: string;
      appointmentDate: string;
      appointmentTime: string;
      purpose?: string;
    },
  ) {
    clearMessages();
    setBusy(true);
    try {
      await api(`/appointments/${id}/reschedule`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      setNotice("Appointment rescheduled and sent for approval.");
      await loadStudentData();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to reschedule appointment.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function checkIn(appointmentId: string) {
    clearMessages();
    try {
      const ticket = await api<QueueTicket>(
        `/appointments/${appointmentId}/check-in`,
        { method: "POST" },
      );
      setNotice(
        `Checked in successfully. Your number is ${ticket.queueNumber}.`,
      );
      await loadStudentData();
      setView("queue");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to check in.",
      );
    }
  }

  async function approveAppointment(id: string) {
    clearMessages();
    try {
      await api(`/appointments/${id}/approve`, { method: "PATCH" });
      setNotice("Appointment approved.");
      await refreshStaffAppointments();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to approve appointment.",
      );
    }
  }

  async function createOffice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    try {
      const office = await api<Office>("/offices", {
        method: "POST",
        body: JSON.stringify({ name: officeName, code: officeCode }),
      });
      setOfficeName("");
      setOfficeCode("");
      setNotice(`${office.name} was added.`);
      await loadPublicData();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to create office.",
      );
    }
  }

  async function createService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    try {
      await api("/services", {
        method: "POST",
        body: JSON.stringify({
          name: newServiceName,
          officeId: newServiceOffice,
          durationMinutes: 20,
        }),
      });
      setNewServiceName("");
      setNotice("Service added.");
      await loadPublicData();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to create service.",
      );
    }
  }

  async function refreshQueueDesk() {
    if (!officeId) return;
    const sessions = await api<QueueSession[]>(
      `/queue/sessions?officeId=${officeId}`,
    );
    setQueueSessions(sessions);
    const sessionId = sessions.some(
      (session) => session.id === selectedSessionId,
    )
      ? selectedSessionId
      : sessions[0]?.id || "";
    setSelectedSessionId(sessionId);
    setDeskTickets(
      sessionId
        ? await api<DeskTicket[]>(`/queue/sessions/${sessionId}/tickets`)
        : [],
    );
  }

  async function queueAction(
    path: string,
    method: "POST" | "PATCH",
    body?: object,
  ) {
    clearMessages();
    try {
      await api(path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      setNotice("Queue updated.");
      await refreshQueueDesk();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to update queue.",
      );
    }
  }

  async function createCounter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!officeId) return;
    clearMessages();
    try {
      await api(`/offices/${officeId}/counters`, {
        method: "POST",
        body: JSON.stringify({ name: counterName, code: counterCode }),
      });
      setCounterName("");
      setCounterCode("");
      setOfficeCounters(
        await api<QueueCounter[]>(`/offices/${officeId}/counters`),
      );
      setNotice("Counter created.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to create counter.",
      );
    }
  }

  async function assignOfficeStaff() {
    if (!officeId || !selectedStaffId) return;
    clearMessages();
    try {
      await api(`/offices/${officeId}/staff/${selectedStaffId}`, {
        method: "POST",
      });
      setOfficeAssignments(
        await api<OfficeAssignment[]>(`/offices/${officeId}/staff`),
      );
      setNotice("Staff member assigned to office.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to assign staff member.",
      );
    }
  }

  async function removeOfficeStaff(userId: string) {
    if (!officeId) return;
    clearMessages();
    try {
      await api(`/offices/${officeId}/staff/${userId}`, { method: "DELETE" });
      setOfficeAssignments(
        await api<OfficeAssignment[]>(`/offices/${officeId}/staff`),
      );
      setNotice("Office assignment removed.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to remove assignment.",
      );
    }
  }

  async function assignCounterStaff(counterId: string, userId: string) {
    clearMessages();
    try {
      await api(`/counters/${counterId}/staff/${userId}`, { method: "POST" });
      setOfficeCounters(
        await api<QueueCounter[]>(`/offices/${officeId}/counters`),
      );
      setNotice("Staff member assigned to counter.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Assign this staff member to the office first.",
      );
    }
  }

  async function removeCounterStaff(counterId: string, userId: string) {
    clearMessages();
    try {
      await api(`/counters/${counterId}/staff/${userId}`, { method: "DELETE" });
      setOfficeCounters(
        await api<QueueCounter[]>(`/offices/${officeId}/counters`),
      );
      setNotice("Counter assignment removed.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to remove counter assignment.",
      );
    }
  }

  async function toggleCounter(counter: QueueCounter) {
    clearMessages();
    try {
      await api(`/counters/${counter.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !counter.isActive }),
      });
      setOfficeCounters(
        await api<QueueCounter[]>(`/offices/${officeId}/counters`),
      );
      setNotice(counter.isActive ? "Counter paused." : "Counter activated.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to update counter.",
      );
    }
  }

  const roleTitle =
    user?.role === "ADMIN"
      ? "Administrator"
      : user?.role === "STAFF"
        ? "Office staff"
        : "Student";
  const displayName =
    user?.fullName?.split(" ")[0] || user?.email?.split("@")[0] || "there";

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <a className="brand" href="#home" onClick={() => setView("overview")}>
          <span className="brand-mark">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span className="brand-word">
            campus<span>queue</span>
          </span>
        </a>
        <div className="side-divider" />
        <p className="side-label">WORKSPACE</p>
        <nav
          id="primary-navigation"
          className="side-nav"
          aria-label="Main navigation"
        >
          <NavButton
            active={view === "overview"}
            onClick={() => {
              setView("overview");
              setMobileNav(false);
            }}
            icon="grid"
          >
            Overview
          </NavButton>
          {user && (
            <NavButton
              active={view === "appointments"}
              onClick={() => {
                setView("appointments");
                setMobileNav(false);
              }}
              icon="calendar"
            >
              Appointments
            </NavButton>
          )}
          {user && (
            <NavButton
              active={view === "queue"}
              onClick={() => {
                setView("queue");
                setMobileNav(false);
              }}
              icon="ticket"
            >
              {user.role === "STUDENT" ? "My queue" : "Queue desk"}
            </NavButton>
          )}
          {user?.role === "ADMIN" && (
            <NavButton
              active={view === "manage"}
              onClick={() => {
                setView("manage");
                setMobileNav(false);
              }}
              icon="building"
            >
              Campus setup
            </NavButton>
          )}
          {user && user.role !== "STUDENT" && (
            <NavButton
              active={view === "hours"}
              onClick={() => {
                setView("hours");
                setMobileNav(false);
              }}
              icon="clock"
            >
              Office hours
            </NavButton>
          )}
        </nav>
        <div className="sidebar-spacer" />
        <div className="help-card">
          <span className="help-icon">
            <Icon name="spark" size={17} />
          </span>
          <strong>Here to make campus easier.</strong>
          <p>Spend less time waiting, more time learning.</p>
        </div>
        <div className="side-divider bottom-divider" />
        {user ? (
          <div className="profile-row">
            <span className="avatar">{initials(user)}</span>
            <span className="profile-copy">
              <strong>{user.fullName || user.email.split("@")[0]}</strong>
              <small>{roleTitle}</small>
            </span>
            <button
              className="icon-button logout-button"
              title="Sign out"
              onClick={() => void handleLogout()}
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        ) : (
          <span className="sidebar-footnote">A calmer way through campus.</span>
        )}
      </aside>

      <section className="main-column">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label={mobileNav ? "Close menu" : "Open menu"}
            aria-controls="primary-navigation"
            aria-expanded={mobileNav}
            onClick={() => setMobileNav(!mobileNav)}
          >
            <Icon name={mobileNav ? "close" : "menu"} />
          </button>
          <div className="breadcrumb">
            <span>Campus</span>
            <b>/</b>
            <strong>{viewLabel(view)}</strong>
          </div>
          <div className="topbar-right">
            <span className="today-pill">
              <span className="live-dot" /> Campus services
            </span>
            {user ? (
              <>
                <div className="notification-menu">
                  <button
                    className="notification-button"
                    type="button"
                    aria-label={`Notifications, ${notifications.filter((item) => !item.isRead).length} unread`}
                    aria-expanded={notificationsOpen}
                    onClick={() => setNotificationsOpen((open) => !open)}
                  >
                    <Icon name="bell" size={18} />
                    {notifications.some((item) => !item.isRead) && (
                      <span className="notification-count">
                        {notifications.filter((item) => !item.isRead).length}
                      </span>
                    )}
                  </button>
                  {notificationsOpen && (
                    <section
                      className="notification-popover"
                      aria-label="Notifications"
                    >
                      <header>
                        <div>
                          <span className="section-kicker">YOUR UPDATES</span>
                          <h2>Notifications</h2>
                        </div>
                        {notifications.some((item) => !item.isRead) && (
                          <button
                            className="notification-mark-all"
                            type="button"
                            onClick={() => void markAllNotificationsRead()}
                          >
                            Mark all read
                          </button>
                        )}
                      </header>
                      <div className="notification-list">
                        {notifications.length ? (
                          notifications.map((item) => (
                            <button
                              className={`notification-item ${item.isRead ? "read" : "unread"}`}
                              key={item.id}
                              type="button"
                              onClick={() =>
                                item.isRead
                                  ? undefined
                                  : void markNotificationRead(item.id)
                              }
                            >
                              <span className="notification-indicator" />
                              <span className="notification-copy">
                                <span>{item.message}</span>
                                <small>
                                  {new Date(item.createdAt).toLocaleString([], {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                  })}
                                </small>
                              </span>
                            </button>
                          ))
                        ) : (
                          <div className="notification-empty">
                            You’re all caught up. Updates about your
                            appointments and queue will appear here.
                          </div>
                        )}
                      </div>
                    </section>
                  )}
                </div>
                <span className="top-avatar">{initials(user)}</span>
              </>
            ) : (
              <button
                className="top-signin"
                onClick={() =>
                  document
                    .getElementById("auth-card")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                Sign in <Icon name="arrow" size={16} />
              </button>
            )}
          </div>
        </header>

        <div className="content-wrap">
          {notice && (
            <div className="toast success-toast" role="status">
              <Icon name="check" size={17} />
              {notice}
              <button onClick={() => setNotice("")} aria-label="Dismiss">
                ×
              </button>
            </div>
          )}
          {error && (
            <div className="toast error-toast" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss">
                ×
              </button>
            </div>
          )}

          {!user ? (
            <GuestLanding
              loading={loading}
              servicesLoading={servicesLoading}
              servicesError={servicesError}
              onRetryServices={() => void loadPublicData()}
              offices={offices}
              services={services}
              authMode={authMode}
              setAuthMode={setAuthMode}
              onSubmit={handleAuth}
              busy={busy}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              registerName={registerName}
              setRegisterName={setRegisterName}
              studentId={registerStudentId}
              setStudentId={setRegisterStudentId}
            />
          ) : (
            <>
              {view === "overview" && user.role === "STUDENT" && (
                <StudentOverview
                  userName={displayName}
                  appointments={upcomingAppointments}
                  activeQueue={activeQueue}
                  services={services}
                  onBook={() => setView("appointments")}
                  onJoin={joinQueue}
                  busy={busy}
                />
              )}
              {view === "appointments" && user.role === "STUDENT" && (
                <StudentAppointments
                  appointments={appointments}
                  services={services}
                  servicesLoading={servicesLoading}
                  servicesError={servicesError}
                  onRetryServices={() => void loadPublicData()}
                  serviceId={serviceId}
                  setServiceId={(value) => {
                    setServiceId(value);
                    setCalendarInfo(null);
                    setCalendarError("");
                    setCalendarLoading(Boolean(value));
                    setAppointmentDate("");
                    setAppointmentTime("");
                    setCalendarMonth(todayString().slice(0, 7));
                  }}
                  appointmentDate={appointmentDate}
                  setAppointmentDate={setAppointmentDate}
                  calendarMonth={calendarMonth}
                  setCalendarMonth={setCalendarMonth}
                  calendarInfo={
                    calendarInfo?.service.id === serviceId &&
                    calendarInfo.month === calendarMonth
                      ? calendarInfo
                      : null
                  }
                  calendarLoading={
                    calendarLoading ||
                    Boolean(
                      serviceId &&
                        (calendarInfo?.service.id !== serviceId ||
                          calendarInfo.month !== calendarMonth),
                    )
                  }
                  calendarError={calendarError}
                  appointmentTime={appointmentTime}
                  setAppointmentTime={setAppointmentTime}
                  availability={
                    availability?.service.id === serviceId &&
                    availability.date === appointmentDate
                      ? availability
                      : null
                  }
                  availabilityLoading={availabilityLoading}
                  purpose={purpose}
                  setPurpose={setPurpose}
                  onSubmit={handleAppointment}
                  onCancel={cancelAppointment}
                  onCheckIn={checkIn}
                  onReschedule={rescheduleAppointment}
                  busy={busy}
                />
              )}
              {view === "queue" && user.role === "STUDENT" && (
                <QueueView
                  tickets={tickets}
                  services={services}
                  onJoin={joinQueue}
                  busy={busy}
                />
              )}
              {view === "overview" && user.role !== "STUDENT" && (
                <StaffOverview
                  role={user.role}
                  offices={offices}
                  officeId={officeId}
                  setOfficeId={setOfficeId}
                  appointments={staffAppointments}
                  onReview={() => setView("appointments")}
                />
              )}
              {view === "appointments" && user.role !== "STUDENT" && (
                  <StaffAppointments
                    role={user.role}
                    offices={offices}
                    officeId={officeId}
                    setOfficeId={(value) => {
                      setOfficeId(value);
                      setStaffAppointments([]);
                    }}
                    appointments={staffAppointments}
                    refreshing={staffAppointmentsRefreshing}
                    onRefresh={() => void refreshStaffAppointments()}
                    onApprove={approveAppointment}
                  />
                )}
              {view === "queue" && user.role !== "STUDENT" && (
                <StaffQueueDesk
                  role={user.role}
                  offices={offices}
                  officeId={officeId}
                  setOfficeId={setOfficeId}
                  sessions={queueSessions}
                  sessionId={selectedSessionId}
                  setSessionId={setSelectedSessionId}
                  tickets={deskTickets}
                  selectedCounterId={selectedCounterId}
                  setCounterId={setSelectedCounterId}
                  onCallNext={(sessionId, counterId) =>
                    void queueAction(
                      `/queue/sessions/${sessionId}/call-next`,
                      "POST",
                      { counterId },
                    )
                  }
                  onSessionAction={(sessionId, action) =>
                    void queueAction(
                      `/queue/sessions/${sessionId}/${action}`,
                      "PATCH",
                    )
                  }
                  onTicketAction={(ticketId, action) =>
                    void queueAction(
                      `/queue/tickets/${ticketId}/${action}`,
                      "PATCH",
                    )
                  }
                  onRefresh={() => void refreshQueueDesk()}
                />
              )}
              {view === "manage" && user.role === "ADMIN" && (
                <AdminSetup
                  offices={offices}
                  services={services}
                  officeId={officeId}
                  setOfficeId={setOfficeId}
                  officeName={officeName}
                  setOfficeName={setOfficeName}
                  officeCode={officeCode}
                  setOfficeCode={setOfficeCode}
                  newServiceName={newServiceName}
                  setNewServiceName={setNewServiceName}
                  newServiceOffice={newServiceOffice}
                  setNewServiceOffice={setNewServiceOffice}
                  officeAssignments={officeAssignments}
                  officeCounters={officeCounters}
                  staffDirectory={staffDirectory}
                  selectedStaffId={selectedStaffId}
                  setSelectedStaffId={setSelectedStaffId}
                  counterName={counterName}
                  setCounterName={setCounterName}
                  counterCode={counterCode}
                  setCounterCode={setCounterCode}
                  onCreateOffice={createOffice}
                  onCreateService={createService}
                  onCreateCounter={createCounter}
                  onAssignOfficeStaff={() => void assignOfficeStaff()}
                  onRemoveOfficeStaff={removeOfficeStaff}
                  onAssignCounterStaff={assignCounterStaff}
                  onRemoveCounterStaff={removeCounterStaff}
                  onToggleCounter={toggleCounter}
                />
              )}
              {view === "hours" && user.role !== "STUDENT" && (
                <OfficeHoursManager
                  offices={offices}
                  officeId={officeId}
                  setOfficeId={setOfficeId}
                  onSaved={() => setNotice("Office availability updated.")}
                />
              )}
            </>
          )}
          <footer className="page-footer">
            <span>Campus Queue</span>
            <span>
              Made for a smoother campus day{" "}
              <span className="footer-spark">✳</span>
            </span>
          </footer>
        </div>
      </section>
    </main>
  );
}

function NavButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`nav-item ${active ? "nav-active" : ""}`}
      onClick={onClick}
    >
      <Icon name={icon} size={18} />
      <span>{children}</span>
      {active && <i />}
    </button>
  );
}

function viewLabel(view: View) {
  return {
    overview: "Overview",
    appointments: "Appointments",
    queue: "My queue",
    manage: "Campus setup",
    hours: "Office hours",
  }[view];
}

function GuestLanding(props: {
  loading: boolean;
  servicesLoading: boolean;
  servicesError: string;
  onRetryServices: () => void;
  offices: Office[];
  services: CampusService[];
  authMode: "login" | "register";
  setAuthMode: (mode: "login" | "register") => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  registerName: string;
  setRegisterName: (value: string) => void;
  studentId: string;
  setStudentId: (value: string) => void;
}) {
  return (
    <>
      <section className="guest-hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="eyebrow-line" /> YOUR CAMPUS, IN GOOD FLOW
          </span>
          <h1>
            Make time for
            <br />
            <em>what matters.</em>
          </h1>
          <p>
            Book campus services and see your place in line, all in one calm,
            simple space.
          </p>
          <div className="hero-proof">
            <div className="proof-avatars">
              <span>J</span>
              <span>M</span>
              <span>A</span>
              <span>+</span>
            </div>
            <span>One less thing to worry about today.</span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-sun" />
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-campus">
            <div className="campus-roof" />
            <div className="campus-top">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="campus-base">
              <b />
              <b />
              <b />
              <b />
              <b />
            </div>
            <div className="campus-steps" />
          </div>
          <div className="art-leaf leaf-a">✳</div>
          <div className="art-leaf leaf-b">✳</div>
          <div className="art-label label-top">
            <span className="live-dot" /> A LITTLE MORE IN CONTROL
          </div>
          <div className="art-note">
            <span className="note-icon">
              <Icon name="calendar" size={16} />
            </span>
            <span>
              <strong>Plan your visit</strong>
              <small>On your own time</small>
            </span>
            <Icon name="arrow" size={17} />
          </div>
        </div>
      </section>
      <section className="guest-lower">
        <div className="service-preview">
          <div className="section-kicker">CAMPUS, MADE SIMPLER</div>
          <div className="section-heading">
            <div>
              <h2>Help is right here.</h2>
              <p>Find the right office and plan your next step.</p>
            </div>
            <span className="service-count">
              {props.services.length.toString().padStart(2, "0")} SERVICES
            </span>
          </div>
          <div className="preview-list">
            {props.servicesLoading ? (
              <div className="muted-empty">Loading campus services…</div>
            ) : props.services.length ? (
              props.services.slice(0, 4).map((service, index) => (
                <div className="preview-service" key={service.id}>
                  <span className={`service-symbol symbol-${index % 4}`}>
                    <Icon name={index % 2 ? "ticket" : "building"} size={18} />
                  </span>
                  <span className="preview-service-copy">
                    <strong>{service.name}</strong>
                    <small>
                      {service.office.name} · about {service.durationMinutes}{" "}
                      min
                    </small>
                  </span>
                  <span className="service-arrow">
                    <Icon name="arrow" size={16} />
                  </span>
                </div>
              ))
            ) : (
              <div className="service-load-message" role={props.servicesError ? "alert" : "status"}>
                <span>
                  {props.servicesError || "No active campus services are available right now."}
                </span>
                {props.servicesError && (
                  <button className="button-soft" type="button" onClick={props.onRetryServices}>
                    Try again
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="preview-foot">
            <span>Connected offices</span>
            <strong>{props.offices.length.toString().padStart(2, "0")}</strong>
          </div>
        </div>
        <div className="auth-card" id="auth-card">
          <div className="auth-card-top">
            <span className="auth-icon">
              <Icon name="spark" size={19} />
            </span>
            <span className="auth-tag">STUDENT ACCESS</span>
          </div>
          <h2>
            {props.authMode === "login"
              ? "Welcome back."
              : "A better campus day starts here."}
          </h2>
          <p className="auth-subtitle">
            {props.authMode === "login"
              ? "Sign in to pick up where you left off."
              : "Create your student account to get started."}
          </p>
          <div className="auth-tabs">
            <button
              className={
                props.authMode === "login" ? "auth-tab selected" : "auth-tab"
              }
              onClick={() => props.setAuthMode("login")}
            >
              Sign in
            </button>
            <button
              className={
                props.authMode === "register" ? "auth-tab selected" : "auth-tab"
              }
              onClick={() => props.setAuthMode("register")}
            >
              Create account
            </button>
          </div>
          <form className="auth-form" onSubmit={props.onSubmit}>
            {props.authMode === "register" && (
              <>
                <label>
                  Full name
                  <input
                    required
                    value={props.registerName}
                    onChange={(event) =>
                      props.setRegisterName(event.target.value)
                    }
                    placeholder="e.g. Jamie Santos"
                    autoComplete="name"
                  />
                </label>
                <label>
                  Student ID <span className="optional">optional</span>
                  <input
                    value={props.studentId}
                    onChange={(event) => props.setStudentId(event.target.value)}
                    placeholder="Your campus ID"
                  />
                </label>
              </>
            )}
            <label>
              School email
              <input
                type="email"
                required
                value={props.email}
                onChange={(event) => props.setEmail(event.target.value)}
                placeholder="you@campus.edu"
                autoComplete="email"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                required
                minLength={8}
                value={props.password}
                onChange={(event) => props.setPassword(event.target.value)}
                placeholder="At least 8 characters"
                autoComplete={
                  props.authMode === "login"
                    ? "current-password"
                    : "new-password"
                }
              />
            </label>
            <button
              className="button-primary auth-submit"
              type="submit"
              disabled={props.busy}
            >
              {props.busy
                ? "Please wait…"
                : props.authMode === "login"
                  ? "Sign in to Campus Queue"
                  : "Create student account"}
              <Icon name="arrow" size={17} />
            </button>
          </form>
          <p className="auth-note">
            <span className="secure-dot" /> Your account is protected with
            secure sign-in.
          </p>
        </div>
      </section>
    </>
  );
}

function StudentOverview({
  userName,
  appointments,
  activeQueue,
  services,
  onBook,
  onJoin,
  busy,
}: {
  userName: string;
  appointments: Appointment[];
  activeQueue?: QueueTicket;
  services: CampusService[];
  onBook: () => void;
  onJoin: (service: CampusService) => void;
  busy: boolean;
}) {
  const nextAppointment = appointments.find((appointment) =>
    ["pending", "approved"].includes(appointment.status),
  );
  return (
    <>
      <section className="dashboard-welcome">
        <div>
          <span className="eyebrow">
            <span className="eyebrow-line" /> YOUR STUDENT SPACE
          </span>
          <h1>
            Good day, {userName}
            <span className="wave">✳</span>
          </h1>
          <p>Here’s a little overview to help your day run smoothly.</p>
        </div>
        <div className="welcome-date">
          <span className="date-day">
            {new Date().toLocaleDateString("en-PH", { weekday: "long" })}
          </span>
          <strong>
            {new Date().toLocaleDateString("en-PH", {
              month: "long",
              day: "numeric",
            })}
          </strong>
        </div>
      </section>
      <section className="stats-grid">
        <StatCard
          label="Next appointment"
          value={nextAppointment ? nextAppointment.appointmentTime : "—"}
          foot={
            nextAppointment
              ? `${nextAppointment.service.name} · ${localDate(nextAppointment.appointmentDate)}`
              : "Nothing on your calendar yet"
          }
          icon="calendar"
          tone="peach"
        />
        <StatCard
          label="Queue status"
          value={activeQueue ? `#${activeQueue.queueNumber}` : "All clear"}
          foot={
            activeQueue
              ? `${activeQueue.peopleAhead} people ahead of you`
              : "No active tickets right now"
          }
          icon="ticket"
          tone="green"
        />
        <StatCard
          label="Your appointments"
          value={appointments.length.toString().padStart(2, "0")}
          foot="Requests and upcoming visits"
          icon="clock"
          tone="lavender"
        />
      </section>
      <section className="dashboard-grid">
        <div className="panel service-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">START WITH A SERVICE</span>
              <h2>What can we help with?</h2>
            </div>
            <button className="text-link" onClick={onBook}>
              Book a visit <Icon name="arrow" size={15} />
            </button>
          </div>
          <div className="service-cards">
            {services.length ? (
              services.slice(0, 4).map((service, index) => (
                <article className="service-card" key={service.id}>
                  <span className={`service-symbol symbol-${index % 4}`}>
                    <Icon name={index % 2 ? "ticket" : "building"} size={18} />
                  </span>
                  <span className="service-type">{service.office.code}</span>
                  <h3>{service.name}</h3>
                  <p>{service.office.name}</p>
                  <div className="service-card-bottom">
                    <span>
                      <Icon name="clock" size={14} /> {service.durationMinutes}{" "}
                      min
                    </span>
                    <button
                      disabled={busy}
                      aria-label={`Join ${service.name} queue`}
                      onClick={() => onJoin(service)}
                    >
                      <Icon name="arrow" size={17} />
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-block">
                Services are being set up. Check back soon.
              </div>
            )}
          </div>
        </div>
        <div className="panel next-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">COMING UP</span>
              <h2>Your next step</h2>
            </div>
            <span className="panel-dots">•••</span>
          </div>
          {nextAppointment ? (
            <div className="next-appointment">
              <div className="next-date">
                <strong>
                  {new Date(
                    `${nextAppointment.appointmentDate.slice(0, 10)}T12:00:00`,
                  ).getDate()}
                </strong>
                <span>
                  {new Date(
                    `${nextAppointment.appointmentDate.slice(0, 10)}T12:00:00`,
                  )
                    .toLocaleDateString("en", { month: "short" })
                    .toUpperCase()}
                </span>
              </div>
              <div>
                <span className="status-chip status-pending">
                  {statusLabel(nextAppointment.status)}
                </span>
                <h3>{nextAppointment.service.name}</h3>
                <p>
                  {nextAppointment.office.name} ·{" "}
                  {nextAppointment.appointmentTime}
                </p>
              </div>
            </div>
          ) : (
            <div className="empty-next">
              <div className="empty-calendar">
                <Icon name="calendar" size={23} />
              </div>
              <strong>A little room in your day.</strong>
              <p>You don’t have anything scheduled yet.</p>
            </div>
          )}
          <button className="button-soft full-button" onClick={onBook}>
            {nextAppointment ? "View appointments" : "Plan a visit"}
            <Icon name="arrow" size={16} />
          </button>
        </div>
      </section>
      <section className="tip-banner">
        <span className="tip-icon">
          <Icon name="spark" size={19} />
        </span>
        <div>
          <strong>A small tip for a smoother visit</strong>
          <p>
            Book an appointment ahead of time, or join a queue when you’re
            already on campus.
          </p>
        </div>
        <span className="tip-decoration">✳</span>
      </section>
    </>
  );
}

function StatCard({
  label,
  value,
  foot,
  icon,
  tone,
}: {
  label: string;
  value: string;
  foot: string;
  icon: string;
  tone: string;
}) {
  return (
    <article className="stat-card">
      <span className={`stat-icon ${tone}`}>
        <Icon name={icon} size={18} />
      </span>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      <small>{foot}</small>
    </article>
  );
}

function AppointmentCalendarPicker(props: {
  month: string;
  setMonth: (month: string) => void;
  selectedDate: string;
  onSelect: (date: string) => void;
  calendar: AppointmentCalendar | null;
  loading: boolean;
  error: string;
}) {
  const [year, monthNumber] = props.month.split("-").map(Number);
  const monthIndex = monthNumber - 1;
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });
  const today = todayString();
  const todayMonth = today.slice(0, 7);
  const monthLabel = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthIndex, 1)));
  const closedDates = new Map(
    (props.calendar?.closedDates || []).map((closed) => [closed.closedDate, closed.reason]),
  );
  const timeLabel = (time: string | null | undefined) => {
    if (!time) return "";
    const [hourText, minuteText] = time.slice(0, 5).split(":");
    const hour = Number(hourText);
    return `${hour % 12 || 12}:${minuteText} ${hour >= 12 ? "PM" : "AM"}`;
  };
  const changeMonth = (nextMonth: string) => {
    props.setMonth(nextMonth);
    if (props.selectedDate && !props.selectedDate.startsWith(`${nextMonth}-`)) {
      props.onSelect("");
    }
  };

  return (
    <div className={calendarStyles.calendar} aria-label="Choose an appointment date">
      <div className={calendarStyles.header}>
        <div className={calendarStyles.titleGroup}>
          <strong className={calendarStyles.monthLabel}>{monthLabel}</strong>
          <span className={calendarStyles.officeName}>{props.calendar?.office.name || "Office availability"}</span>
        </div>
        <div className={calendarStyles.monthActions}>
          <button
            type="button"
            aria-label="Previous month"
            disabled={props.month <= todayMonth || props.loading}
            onClick={() => changeMonth(new Date(Date.UTC(year, monthIndex - 1, 1)).toISOString().slice(0, 7))}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next month"
            disabled={props.loading}
            onClick={() => changeMonth(new Date(Date.UTC(year, monthIndex + 1, 1)).toISOString().slice(0, 7))}
          >
            ›
          </button>
        </div>
      </div>
      {props.loading ? (
        <p className={calendarStyles.loadingMessage} role="status">
          Loading office hours…
        </p>
      ) : props.error ? (
        <p className={calendarStyles.errorMessage} role="alert">
          Office hours couldn’t be loaded. {props.error}
        </p>
      ) : !props.calendar ? (
        <p className={calendarStyles.empty}>Choose a service to see open dates.</p>
      ) : (
        <>
          <div className={calendarStyles.weekdays} aria-hidden="true">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className={`${calendarStyles.days}${props.loading ? ` ${calendarStyles.loading}` : ""}`}>
            {cells.map((day, index) => {
              if (!day) return <span className={calendarStyles.blank} key={`blank-${index}`} />;
              const date = `${props.month}-${String(day).padStart(2, "0")}`;
              const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
              const dayHours = props.calendar?.hours.find((item) => item.dayOfWeek === weekday);
              const closedReason = closedDates.get(date);
              const isPast = date < today;
              const open = Boolean(dayHours && !dayHours.isClosed && dayHours.openTime && dayHours.closeTime && !closedDates.has(date));
              const disabled = !props.calendar || props.loading || isPast || !open;
              const label = isPast && open
                ? `${date}, past date; office hours were ${timeLabel(dayHours?.openTime)} to ${timeLabel(dayHours?.closeTime)}`
                : open
                ? `${date}, open ${timeLabel(dayHours?.openTime)} to ${timeLabel(dayHours?.closeTime)}`
                : `${date}, ${closedReason ? `closed: ${closedReason}` : "closed"}`;
              return (
                <button
                  key={date}
                  type="button"
                  className={`${calendarStyles.day} ${isPast ? calendarStyles.past : open ? calendarStyles.open : calendarStyles.closed}${props.selectedDate === date ? ` ${calendarStyles.selected}` : ""}`}
                  disabled={disabled}
                  aria-label={label}
                  aria-pressed={props.selectedDate === date}
                  title={!open && closedReason ? closedReason : undefined}
                  onClick={() => props.onSelect(date)}
                >
                  <strong>{day}</strong>
                  {open && <small className={calendarStyles.hours}>{isPast ? "Past" : "Open"}</small>}
                </button>
              );
            })}
          </div>
          <div className={calendarStyles.legend}>
            <span><i className={calendarStyles.legendOpen} /> Office open</span>
            <span><i className={calendarStyles.legendClosed} /> Closed</span>
          </div>
        </>
      )}
    </div>
  );
}

function StudentAppointments(props: {
  appointments: Appointment[];
  services: CampusService[];
  servicesLoading: boolean;
  servicesError: string;
  onRetryServices: () => void;
  serviceId: string;
  setServiceId: (value: string) => void;
  appointmentDate: string;
  setAppointmentDate: (value: string) => void;
  calendarMonth: string;
  setCalendarMonth: (month: string) => void;
  calendarInfo: AppointmentCalendar | null;
  calendarLoading: boolean;
  calendarError: string;
  appointmentTime: string;
  setAppointmentTime: (value: string) => void;
  availability: AppointmentAvailability | null;
  availabilityLoading: boolean;
  purpose: string;
  setPurpose: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: (id: string) => void;
  onCheckIn: (id: string) => void;
  onReschedule: (
    id: string,
    values: {
      serviceId: string;
      appointmentDate: string;
      appointmentTime: string;
      purpose?: string;
    },
  ) => void;
  busy: boolean;
}) {
  const [listView, setListView] = useState<AppointmentListView>("upcoming");
  const pendingAppointments = props.appointments.filter(
    (appointment) => appointmentStatus(appointment) === "pending",
  );
  const upcomingAppointments = props.appointments.filter(
    (appointment) =>
      ["approved", "scheduled"].includes(appointmentStatus(appointment)) &&
      appointmentDay(appointment) >= todayString(),
  );
  const historyAppointments = props.appointments.filter(
    (appointment) =>
      isPastOrClosedAppointment(appointment) ||
      !["pending", "approved", "scheduled"].includes(
        appointmentStatus(appointment),
      ),
  );
  const visibleAppointments = sortAppointments(
    listView === "review"
      ? pendingAppointments
      : listView === "upcoming"
        ? upcomingAppointments
        : historyAppointments,
  );

  return (
    <>
      <PageIntro
        kicker="MAKE A LITTLE ROOM"
        title="Appointments"
        subtitle="Plan a visit around your day. Your requests and upcoming appointments live here."
      />
      <div className="appointment-layout">
        <section className="panel booking-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">REQUEST A VISIT</span>
              <h2>Let’s find a time.</h2>
            </div>
            <span className="booking-mark">
              <Icon name="calendar" size={20} />
            </span>
          </div>
          <form className="booking-form" onSubmit={props.onSubmit}>
            <label>
              Campus service
              <select
                required
                disabled={props.servicesLoading}
                value={props.serviceId}
                onChange={(event) => props.setServiceId(event.target.value)}
              >
                <option value="">
                  {props.servicesLoading ? "Loading campus services…" : "Choose a service"}
                </option>
                {props.services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} — {service.office.name}
                  </option>
                ))}
              </select>
              {props.servicesError ? (
                <span className="service-load-message" role="alert">
                  {props.servicesError}
                  <button className="button-soft" type="button" onClick={props.onRetryServices}>
                    Try again
                  </button>
                </span>
              ) : !props.servicesLoading && props.services.length === 0 ? (
                <span className="availability-hint" role="status">
                  No active campus services are available right now.
                </span>
              ) : null}
            </label>
            <AppointmentCalendarPicker
              month={props.calendarMonth}
              setMonth={props.setCalendarMonth}
              selectedDate={props.appointmentDate}
              onSelect={props.setAppointmentDate}
              calendar={props.calendarInfo}
              loading={props.calendarLoading}
              error={props.calendarError}
            />
            <div className="form-row">
              <label>
                Available time
                <select
                  required
                  disabled={
                    props.availabilityLoading ||
                    !props.availability?.slots.length
                  }
                  value={props.appointmentTime}
                  onChange={(event) =>
                    props.setAppointmentTime(event.target.value)
                  }
                >
                  <option value="">
                    {props.availabilityLoading
                      ? "Checking times…"
                      : !props.serviceId || !props.appointmentDate
                        ? "Choose a service and date"
                        : "No available times"}
                  </option>
                  {props.availability?.slots.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
                {props.appointmentDate && props.calendarInfo && (
                  <span className="availability-hint">
                    {(() => {
                      const weekday = new Date(`${props.appointmentDate}T00:00:00Z`).getUTCDay();
                      const hours = props.calendarInfo.hours.find((item) => item.dayOfWeek === weekday);
                      const timeLabel = (value: string | null) => {
                        if (!value) return "";
                        const [hourText, minuteText] = value.slice(0, 5).split(":");
                        const hour = Number(hourText);
                        return `${hour % 12 || 12}:${minuteText} ${hour >= 12 ? "PM" : "AM"}`;
                      };
                      return hours && !hours.isClosed && hours.openTime && hours.closeTime
                        ? `Office hours: ${timeLabel(hours.openTime)}–${timeLabel(hours.closeTime)} (${props.calendarInfo.timeZone})`
                        : "The office is closed on this date.";
                    })()}
                  </span>
                )}
                {props.serviceId &&
                  props.appointmentDate &&
                  !props.availabilityLoading &&
                  props.availability &&
                  props.availability.slots.length === 0 && (
                    <span className="availability-hint" role="status">
                      {props.availability.message ||
                        "No bookable times for this date. Choose another day."}
                    </span>
                  )}
              </label>
            </div>
            <label>
              What do you need help with?{" "}
              <span className="optional">optional</span>
              <textarea
                rows={3}
                maxLength={500}
                value={props.purpose}
                onChange={(event) => props.setPurpose(event.target.value)}
                placeholder="A short note can help the office prepare."
              />
            </label>
            <div className="booking-foot">
              <span>
                <Icon name="clock" size={15} /> Requests are reviewed by the
                office.
              </span>
              <button
                className="button-primary"
                disabled={
                  props.busy ||
                  props.availabilityLoading ||
                  !props.availability?.slots.includes(props.appointmentTime)
                }
              >
                {props.busy ? "Sending…" : "Request appointment"}
                <Icon name="arrow" size={16} />
              </button>
            </div>
          </form>
        </section>
        <aside className="booking-aside">
          <span className="aside-illustration">
            <span />
            <span />
            <span />
          </span>
          <span className="section-kicker">GOOD TO KNOW</span>
          <h3>Your time matters.</h3>
          <p>
            Appointments are requests until the office approves them. You’ll see
            the updated status here.
          </p>
          <div className="aside-rule" />
          <div className="aside-detail">
            <span className="detail-number">01</span>
            <span>
              <strong>Choose a service</strong>
              <small>Pick the campus office that can help.</small>
            </span>
          </div>
          <div className="aside-detail">
            <span className="detail-number">02</span>
            <span>
              <strong>Pick a time</strong>
              <small>Choose a date and time that suits you.</small>
            </span>
          </div>
        </aside>
      </div>
      <section className="panel list-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">YOUR VISITS</span>
            <h2>Appointments and requests</h2>
          </div>
          <span className="service-count">
            {props.appointments.length} TOTAL
          </span>
        </div>
        <AppointmentFilters
          selected={listView}
          onSelect={setListView}
          labels={{
            review: "Pending requests",
            upcoming: "Upcoming",
            history: "Past & cancelled",
          }}
          counts={{
            review: pendingAppointments.length,
            upcoming: upcomingAppointments.length,
            history: historyAppointments.length,
          }}
        />
        {visibleAppointments.length ? (
          <div className="appointment-list">
            {visibleAppointments.map((appointment) => (
              <AppointmentRow
                key={appointment.id}
                appointment={appointment}
                onCancel={props.onCancel}
                onCheckIn={props.onCheckIn}
                services={props.services}
                onReschedule={props.onReschedule}
                busy={props.busy}
              />
            ))}
          </div>
        ) : (
          <div className="empty-block">
            {listView === "review"
              ? "You don’t have any requests waiting for a decision."
              : listView === "upcoming"
                ? "You don’t have any upcoming approved visits yet. Pending requests appear under Pending requests."
                : "Past and cancelled appointments will appear here."}
          </div>
        )}
      </section>
    </>
  );
}

function AppointmentRow({
  appointment,
  onCancel,
  onCheckIn,
  services,
  onReschedule,
  busy,
}: {
  appointment: Appointment;
  onCancel: (id: string) => void;
  onCheckIn: (id: string) => void;
  services: CampusService[];
  onReschedule: (
    id: string,
    values: {
      serviceId: string;
      appointmentDate: string;
      appointmentTime: string;
      purpose?: string;
    },
  ) => void;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [serviceId, setServiceId] = useState(appointment.service.id);
  const [dateValue, setDateValue] = useState(
    appointment.appointmentDate.slice(0, 10),
  );
  const [timeValue, setTimeValue] = useState(appointment.appointmentTime);
  const [rescheduleSlots, setRescheduleSlots] = useState<string[]>([]);
  const [checkingSlots, setCheckingSlots] = useState(false);
  const [purposeValue, setPurposeValue] = useState(appointment.purpose || "");
  useEffect(() => {
    if (!editing || !serviceId || !dateValue) return;
    let active = true;
    const checkSlots = window.setTimeout(() => {
      setCheckingSlots(true);
      void api<AppointmentAvailability>(
        `/appointments/availability?serviceId=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(dateValue)}&appointmentId=${encodeURIComponent(appointment.id)}`,
      )
      .then((result) => {
        if (active) {
          setRescheduleSlots(result.slots);
          setTimeValue((currentTime) =>
            result.slots.includes(currentTime)
              ? currentTime
              : result.slots[0] || "",
          );
        }
      })
      .catch(() => {
        if (active) setRescheduleSlots([]);
      })
      .finally(() => {
        if (active) setCheckingSlots(false);
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(checkSlots);
    };
  }, [editing, serviceId, dateValue, appointment.id]);
  const date = new Date(`${appointment.appointmentDate.slice(0, 10)}T12:00:00`);
  const canCancel = ["pending", "approved"].includes(appointment.status);
  return (
    <div>
      <article className="appointment-row">
        <div className="row-date">
          <strong>{date.getDate().toString().padStart(2, "0")}</strong>
          <span>
            {date.toLocaleDateString("en", { month: "short" }).toUpperCase()}
          </span>
        </div>
        <div className="appointment-main">
          <div className="appointment-title">
            <strong>{appointment.service.name}</strong>
            <span className={`status-chip ${statusClass(appointment.status)}`}>
              {statusLabel(appointment.status)}
            </span>
          </div>
          <p>
            {appointment.office.name} <span>·</span>{" "}
            {appointment.appointmentTime}
            {appointment.purpose ? ` · ${appointment.purpose}` : ""}
          </p>
        </div>
        <div className="row-actions">
          {appointment.status === "approved" && (
            <button
              className="button-small button-primary"
              onClick={() => onCheckIn(appointment.id)}
            >
              Check in
            </button>
          )}
          {canCancel && (
            <button
              className="button-small button-quiet"
              onClick={() => setEditing((value) => !value)}
            >
              {editing ? "Close" : "Reschedule"}
            </button>
          )}
          {canCancel && (
            <button
              className="button-small button-quiet"
              onClick={() => onCancel(appointment.id)}
            >
              Cancel
            </button>
          )}
          {appointment.queueNumber && (
            <span className="queue-number-mini">{appointment.queueNumber}</span>
          )}
        </div>
      </article>
      {editing && canCancel && (
        <form
          className="reschedule-form"
          onSubmit={(event) => {
            event.preventDefault();
            onReschedule(appointment.id, {
              serviceId,
              appointmentDate: dateValue,
              appointmentTime: timeValue,
              purpose: purposeValue,
            });
            setEditing(false);
          }}
        >
          <label>
            Service
            <select
              required
              value={serviceId}
              onChange={(event) => setServiceId(event.target.value)}
            >
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} — {service.office.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input
              required
              type="date"
              min={todayString()}
              value={dateValue}
              onChange={(event) => setDateValue(event.target.value)}
            />
          </label>
          <label>
            Time
            <select
              required
              disabled={checkingSlots || !rescheduleSlots.length}
              value={timeValue}
              onChange={(event) => setTimeValue(event.target.value)}
            >
              <option value="">
                {checkingSlots ? "Checking times…" : "No available times"}
              </option>
              {rescheduleSlots.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </label>
          <label className="reschedule-purpose">
            Purpose
            <input
              maxLength={500}
              value={purposeValue}
              onChange={(event) => setPurposeValue(event.target.value)}
            />
          </label>
          <button className="button-primary button-small" disabled={busy}>
            Save new time
          </button>
        </form>
      )}
    </div>
  );
}

function QueueView({
  tickets,
  services,
  onJoin,
  busy,
}: {
  tickets: QueueTicket[];
  services: CampusService[];
  onJoin: (service: CampusService) => void;
  busy: boolean;
}) {
  return (
    <>
      <PageIntro
        kicker="YOUR PLACE IN LINE"
        title="My queue"
        subtitle="Keep an eye on your place. We’ll help you know when it’s almost your turn."
      />
      {tickets.length ? (
        <div className="queue-ticket-grid">
          {tickets.map((ticket) => (
            <article className="queue-ticket-card" key={ticket.id}>
              <div className="ticket-topline">
                <span className="section-kicker">NOW IN LINE</span>
                <span className={`status-chip ${statusClass(ticket.status)}`}>
                  {statusLabel(ticket.status)}
                </span>
              </div>
              <div className="queue-ticket-number">{ticket.queueNumber}</div>
              <p className="ticket-service">
                {ticket.session.service.name} <span>·</span>{" "}
                {ticket.session.office.name}
              </p>
              <div className="ticket-progress">
                <div className="progress-head">
                  <span>Your place</span>
                  <strong>
                    {ticket.status === "WAITING"
                      ? `#${ticket.position}`
                      : statusLabel(ticket.status)}
                  </strong>
                </div>
                <div className="progress-track">
                  <i
                    style={{
                      width: `${ticket.status === "WAITING" ? Math.max(12, Math.min(86, 100 / (ticket.position + 1))) : 100}%`,
                    }}
                  />
                </div>
                <div className="progress-foot">
                  <span>{ticket.peopleAhead} people ahead</span>
                  <span>~{ticket.estimatedWaitMinutes} min</span>
                </div>
              </div>
              <div className="ticket-counter">
                <Icon name="building" size={16} />
                {ticket.counter
                  ? `Please go to ${ticket.counter.name}`
                  : "Stay nearby and watch for your number"}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="queue-empty panel">
          <span className="empty-calendar">
            <Icon name="ticket" size={25} />
          </span>
          <h2>No active queue tickets.</h2>
          <p>
            Join a service queue when you arrive on campus, or check in to an
            approved appointment.
          </p>
        </div>
      )}
      <section className="panel queue-services">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">READY WHEN YOU ARE</span>
            <h2>Join a campus queue</h2>
          </div>
        </div>
        <div className="quick-service-list">
          {services.map((service, index) => (
            <div className="quick-service" key={service.id}>
              <span className={`service-symbol symbol-${index % 4}`}>
                <Icon name="building" size={17} />
              </span>
              <div>
                <strong>{service.name}</strong>
                <small>{service.office.name}</small>
              </div>
              <button
                className="button-soft"
                disabled={busy}
                onClick={() => onJoin(service)}
              >
                Join queue <Icon name="arrow" size={15} />
              </button>
            </div>
          ))}
          {!services.length && (
            <div className="muted-empty">
              No active services are available yet.
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function StaffAppointments(props: {
  role: string;
  offices: Office[];
  officeId: string;
  setOfficeId: (value: string) => void;
  appointments: Appointment[];
  refreshing: boolean;
  onRefresh: () => void;
  onApprove: (id: string) => void;
}) {
  const [listView, setListView] = useState<AppointmentListView>("review");
  const pendingAppointments = props.appointments.filter(
    (appointment) => appointmentStatus(appointment) === "pending",
  );
  const upcomingAppointments = props.appointments.filter(
    (appointment) =>
      ["approved", "scheduled"].includes(appointmentStatus(appointment)) &&
      appointmentDay(appointment) >= todayString(),
  );
  const historyAppointments = props.appointments.filter(
    (appointment) =>
      isPastOrClosedAppointment(appointment) ||
      !["pending", "approved", "scheduled"].includes(
        appointmentStatus(appointment),
      ),
  );
  const visibleAppointments = sortAppointments(
    listView === "review"
      ? pendingAppointments
      : listView === "upcoming"
        ? upcomingAppointments
        : historyAppointments,
  );

  return (
    <>
      <PageIntro
        kicker={
          props.role === "ADMIN" ? "CAMPUS OPERATIONS" : "OFFICE WORKSPACE"
        }
        title="Appointments"
        subtitle="Review requests, approve upcoming visits, and check what has already happened."
      />
      <section className="panel staff-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">APPOINTMENT WORKLIST</span>
            <h2>Office appointments</h2>
          </div>
          <div className="staff-appointment-controls">
            <button
              className="staff-refresh-button"
              type="button"
              onClick={props.onRefresh}
              disabled={!props.officeId || props.refreshing}
            >
              {props.refreshing ? "Refreshing…" : "Refresh requests"}
            </button>
            <label className="office-picker">
              <span>Office</span>
              <select
                value={props.officeId}
                onChange={(event) => props.setOfficeId(event.target.value)}
              >
                <option value="">Choose an office</option>
                {props.offices.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {!props.officeId ? (
          <div className="empty-block">
            Choose your office to view its appointment requests. Staff can only
            access offices they’re assigned to.
          </div>
        ) : (
          <>
          <AppointmentFilters
            selected={listView}
            onSelect={setListView}
            labels={{
              review: "Needs review",
              upcoming: "Upcoming",
              history: "Past & cancelled",
            }}
            counts={{
              review: pendingAppointments.length,
              upcoming: upcomingAppointments.length,
              history: historyAppointments.length,
            }}
          />
          {visibleAppointments.length ? (
          <div className="appointment-list">
            {visibleAppointments.map((appointment) => (
              <article
                className={`appointment-row staff-appointment-row${appointmentStatus(appointment) === "pending" ? " staff-appointment-pending" : ""}`}
                key={appointment.id}
              >
                {(() => {
                  const dateParts = appointmentDateParts(appointment);
                  return (
                <div className="row-date">
                  <strong>{dateParts.day}</strong>
                  <span>{dateParts.month}</span>
                </div>
                  );
                })()}
                <div className="appointment-main">
                  <div className="appointment-title">
                    <strong>{appointment.user?.fullName || "Student"}</strong>
                    <span
                      className={`status-chip ${statusClass(appointment.status)}`}
                    >
                      {statusLabel(appointment.status)}
                    </span>
                  </div>
                  <p>
                    {appointment.appointmentTime} · {appointment.service.name}
                    {appointment.user?.studentId
                      ? ` · ${appointment.user.studentId}`
                      : ""}
                    {appointment.purpose ? ` · ${appointment.purpose}` : ""}
                  </p>
                </div>
                <div className="row-actions">
                  {appointmentStatus(appointment) === "pending" && (
                    <button
                      className="button-small button-primary"
                      onClick={() => props.onApprove(appointment.id)}
                    >
                      Approve request
                    </button>
                  )}
                  {appointment.queueNumber && (
                    <span className="queue-number-mini">
                      {appointment.queueNumber}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
          ) : (
            <div className="empty-block">
              {listView === "review"
                ? "No appointment requests need review right now."
                : listView === "upcoming"
                  ? "No approved upcoming appointments for this office."
                  : "Past and cancelled appointments will appear here."}
            </div>
          )}
          </>
        )}
      </section>
      <div className="staff-note">
        <Icon name="spark" size={17} />
        <span>
          Office access follows your staff assignment. If this office isn’t
          assigned to you, ask an administrator to update your access.
        </span>
      </div>
    </>
  );
}

function StaffOverview(props: {
  role: string;
  offices: Office[];
  officeId: string;
  setOfficeId: (value: string) => void;
  appointments: Appointment[];
  onReview: () => void;
}) {
  const pending = props.appointments.filter(
    (appointment) => appointment.status.toLowerCase() === "pending",
  );
  const approved = props.appointments.filter(
    (appointment) => appointment.status.toLowerCase() === "approved",
  );
  const officeName =
    props.offices.find((office) => office.id === props.officeId)?.name ??
    "your assigned office";

  return (
    <>
      <PageIntro
        kicker={props.role === "ADMIN" ? "CAMPUS OPERATIONS" : "OFFICE WORKSPACE"}
        title="Staff overview"
        subtitle={`A quick view of appointment activity for ${officeName}. Use Appointments to review and manage individual requests.`}
      />
      <section className="panel staff-overview-toolbar">
        <label className="office-picker">
          <span>Office</span>
          <select
            value={props.officeId}
            onChange={(event) => props.setOfficeId(event.target.value)}
          >
            <option value="">Choose an office</option>
            {props.offices.map((office) => (
              <option key={office.id} value={office.id}>
                {office.name}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section className="stats-grid staff-stats-grid">
        <StatCard
          label="Needs review"
          value={pending.length.toString().padStart(2, "0")}
          foot="Pending appointment requests"
          icon="calendar"
          tone="peach"
        />
        <StatCard
          label="Approved"
          value={approved.length.toString().padStart(2, "0")}
          foot="Visits approved by the office"
          icon="check"
          tone="green"
        />
        <StatCard
          label="Appointments"
          value={props.appointments.length.toString().padStart(2, "0")}
          foot="Requests shown for this office"
          icon="clock"
          tone="lavender"
        />
      </section>
      <section className="panel staff-overview-next">
        <div>
          <span className="section-kicker">NEXT STEP</span>
          <h2>{pending.length ? "Review pending requests" : "You’re up to date"}</h2>
          <p>
            {pending.length
              ? `${pending.length} request${pending.length === 1 ? "" : "s"} waiting for an office decision.`
              : "Open Appointments to see visit statuses and the full request list."}
          </p>
        </div>
        <button className="button-primary" onClick={props.onReview}>
          Open appointments <Icon name="arrow" size={15} />
        </button>
      </section>
      <div className="staff-note">
        <Icon name="spark" size={17} />
        <span>
          Overview summarizes activity. Appointments contains the full list and approval actions.
        </span>
      </div>
    </>
  );
}

function StaffQueueDesk(props: {
  role: string;
  offices: Office[];
  officeId: string;
  setOfficeId: (value: string) => void;
  sessions: QueueSession[];
  sessionId: string;
  setSessionId: (value: string) => void;
  tickets: DeskTicket[];
  selectedCounterId: string;
  setCounterId: (value: string) => void;
  onCallNext: (sessionId: string, counterId: string) => void;
  onSessionAction: (sessionId: string, action: string) => void;
  onTicketAction: (ticketId: string, action: string) => void;
  onRefresh: () => void;
}) {
  const session = props.sessions.find((item) => item.id === props.sessionId);
  const servingTickets = props.tickets.filter((ticket) => ticket.status === "SERVING");
  const calledTickets = props.tickets.filter((ticket) => ticket.status === "CALLED");
  return (
    <>
      <PageIntro
        kicker="QUEUE OPERATIONS"
        title="Queue desk"
        subtitle="Call students forward, track the active line, and keep each campus service moving."
      />
      <section className="panel desk-toolbar">
        <label className="office-picker">
          <span>Office</span>
          <select
            value={props.officeId}
            onChange={(event) => props.setOfficeId(event.target.value)}
          >
            <option value="">Choose an office</option>
            {props.offices.map((office) => (
              <option key={office.id} value={office.id}>
                {office.name}
              </option>
            ))}
          </select>
        </label>
        <label className="office-picker session-picker">
          <span>Today’s service queue</span>
          <select
            value={props.sessionId}
            onChange={(event) => props.setSessionId(event.target.value)}
          >
            <option value="">Choose a queue</option>
            {props.sessions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.service.name} · {item.office.code}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button-soft refresh-button"
          onClick={props.onRefresh}
        >
          <Icon name="clock" size={15} /> Refresh
        </button>
        {session && (
          <a
            className="button-soft public-display-link"
            href={`/display/${session.id}`}
            target="_blank"
            rel="noreferrer"
          >
            Open public display <Icon name="arrow" size={15} />
          </a>
        )}
      </section>
      {!session ? (
        <div className="queue-empty panel">
          <span className="empty-calendar">
            <Icon name="ticket" size={25} />
          </span>
          <h2>No queue sessions yet today.</h2>
          <p>
            Today’s session appears once a student joins a service queue. Choose
            an office with an active queue to start managing tickets.
          </p>
        </div>
      ) : (
        <>
          <section className="queue-workflow panel" aria-label="Queue workflow">
            <div className="queue-workflow-heading">
              <span className="section-kicker">HOW TO RUN THIS QUEUE</span>
              <strong>{session.service.name}</strong>
            </div>
            <ol>
              <li className={session.status === "OPEN" ? "is-ready" : ""}>
                <span>1</span>
                <div>
                  <strong>Keep the queue open</strong>
                  <small>Students can join while it is open.</small>
                </div>
              </li>
              <li className={props.selectedCounterId ? "is-ready" : ""}>
                <span>2</span>
                <div>
                  <strong>Choose your counter</strong>
                  <small>Use the counter assigned to you.</small>
                </div>
              </li>
              <li className={calledTickets.length ? "is-ready" : ""}>
                <span>3</span>
                <div>
                  <strong>Call the next student</strong>
                  <small>{session.waitingCount} waiting in line.</small>
                </div>
              </li>
              <li className={servingTickets.length ? "is-ready" : ""}>
                <span>4</span>
                <div>
                  <strong>Finish service</strong>
                  <small>{servingTickets.length} currently being served.</small>
                </div>
              </li>
            </ol>
          </section>
          <section className="desk-overview-grid">
            <article className="desk-service-card">
              <div className="desk-card-top">
                <span className="section-kicker">ACTIVE SERVICE</span>
                <span
                  className={`status-chip ${session.status === "OPEN" ? "status-good" : "status-pending"}`}
                >
                  {statusLabel(session.status)}
                </span>
              </div>
              <h2>{session.service.name}</h2>
              <p>
                {session.office.name} <span>·</span>{" "}
                {session.service.durationMinutes} min appointments
              </p>
              <div className="desk-stat-row">
                <div>
                  <strong>{session.waitingCount}</strong>
                  <small>waiting</small>
                </div>
                <div>
                  <strong>{session.currentTickets.length}</strong>
                  <small>at counter</small>
                </div>
                <div>
                  <strong>{props.tickets.length}</strong>
                  <small>tickets today</small>
                </div>
              </div>
            </article>
            <article className="panel call-next-panel">
              <span className="section-kicker">
                READY FOR THE NEXT STUDENT?
              </span>
              <h2>Call next</h2>
              <p>
                Choose an available counter, then call the next person in line.
              </p>
              <label className="counter-label">
                Your counter
                <select
                  value={props.selectedCounterId}
                  onChange={(event) => props.setCounterId(event.target.value)}
                >
                  <option value="">Choose counter</option>
                  {session.counters.map((counter) => (
                    <option key={counter.id} value={counter.id}>
                      {counter.name} · {counter.code}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button-primary call-next-button"
                disabled={
                  session.status !== "OPEN" ||
                  !props.selectedCounterId ||
                  !session.waitingCount
                }
                onClick={() =>
                  props.onCallNext(session.id, props.selectedCounterId)
                }
              >
                <Icon name="arrow" size={17} /> Call next ticket
              </button>
            </article>
          </section>
          <section className="panel serving-panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">AT THE COUNTER</span>
                <h2>Students being served</h2>
              </div>
              <span className="manage-count">{servingTickets.length}</span>
            </div>
            {servingTickets.length ? (
              <div className="serving-list">
                {servingTickets.map((ticket) => (
                  <article className="serving-ticket" key={ticket.id}>
                    <strong>{ticket.queueNumber}</strong>
                    <span>
                      {ticket.user.fullName}
                      <small>{ticket.counter?.name || "Counter not set"}</small>
                    </span>
                    <button
                      className="button-small button-primary"
                      onClick={() => props.onTicketAction(ticket.id, "complete")}
                    >
                      Finish service
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="serving-empty">No student is being served right now. Call the next ticket when a counter is ready.</p>
            )}
          </section>
          <section className="panel session-control-panel">
            <div>
              <span className="section-kicker">SESSION CONTROLS</span>
              <h2>Keep the line moving</h2>
            </div>
            <div className="session-actions">
              {session.status === "OPEN" ? (
                <button
                  className="button-soft"
                  onClick={() => props.onSessionAction(session.id, "pause")}
                >
                  Pause queue
                </button>
              ) : session.status === "PAUSED" ? (
                <button
                  className="button-primary"
                  onClick={() => props.onSessionAction(session.id, "resume")}
                >
                  Resume queue
                </button>
              ) : (
                <span className="muted-empty">This session is closed.</span>
              )}
              {session.status !== "CLOSED" && (
                <button
                  className="button-quiet"
                  onClick={() => props.onSessionAction(session.id, "close")}
                >
                  Close session
                </button>
              )}
            </div>
          </section>
          <section className="panel desk-ticket-panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">LIVE LINE</span>
                <h2>Today’s tickets</h2>
              </div>
              <span className="service-count">
                {props.tickets.length} TICKETS
              </span>
            </div>
            {props.tickets.length ? (
              <div className="desk-ticket-list">
                {props.tickets.map((ticket) => (
                  <article className="desk-ticket-row" key={ticket.id}>
                    <div className="desk-ticket-number">
                      {ticket.queueNumber}
                    </div>
                    <div className="desk-student">
                      <strong>{ticket.user.fullName}</strong>
                      <small>
                        {ticket.user.studentId || "Student"}
                        {ticket.counter ? ` · ${ticket.counter.name}` : ""}
                      </small>
                    </div>
                    <span
                      className={`status-chip ${statusClass(ticket.status)}`}
                    >
                      {statusLabel(ticket.status)}
                    </span>
                    <div className="desk-ticket-actions">
                      {ticket.status === "CALLED" && (
                        <>
                          <button
                            className="button-small button-primary"
                            onClick={() =>
                              props.onTicketAction(ticket.id, "start")
                            }
                          >
                            Start service
                          </button>
                          <button
                            className="button-small button-quiet"
                            onClick={() =>
                              props.onTicketAction(ticket.id, "recall")
                            }
                          >
                            Recall
                          </button>
                          <button
                            className="button-small button-quiet"
                            onClick={() =>
                              props.onTicketAction(ticket.id, "no-show")
                            }
                          >
                            No-show
                          </button>
                        </>
                      )}
                      {["WAITING", "CALLED"].includes(ticket.status) && (
                        <button
                          className="button-small button-quiet"
                          onClick={() =>
                            props.onTicketAction(ticket.id, "skip")
                          }
                        >
                          Skip
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-block">No tickets in this session yet.</div>
            )}
          </section>
          <div className="staff-note">
            <Icon name="spark" size={17} />
            <span>
              {props.role === "ADMIN"
                ? "Administrator access covers every counter in this office."
                : "Your queue actions are limited to counters assigned to you."}
            </span>
          </div>
        </>
      )}
    </>
  );
}

function OfficeHoursManager(props: {
  offices: Office[];
  officeId: string;
  setOfficeId: (id: string) => void;
  onSaved: () => void;
}) {
  const [hours, setHours] = useState<OfficeDayHours[]>(
    OFFICE_DAY_NAMES.map((_, dayOfWeek) => ({
      dayOfWeek,
      isClosed: true,
      openTime: null,
      closeTime: null,
    })),
  );
  const [closedDates, setClosedDates] = useState<OfficeClosedDate[]>([]);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!props.officeId) return;
    let active = true;
    Promise.all([
      api<OfficeDayHours[]>(`/offices/${props.officeId}/hours`),
      api<OfficeClosedDate[]>(`/offices/${props.officeId}/closed-dates`),
    ])
      .then(([savedHours, dates]) => {
        if (!active) return;
        setHours(
          OFFICE_DAY_NAMES.map(
            (_, dayOfWeek) =>
              savedHours.find((row) => row.dayOfWeek === dayOfWeek) ?? {
                dayOfWeek,
                isClosed: true,
                openTime: null,
                closeTime: null,
              },
          ),
        );
        setClosedDates(dates);
      })
      .catch((error: Error) => setMessage(error.message));
    return () => {
      active = false;
    };
  }, [props.officeId]);
  async function saveHours(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const editableHours = hours.map(
        ({ dayOfWeek, isClosed, openTime, closeTime }) => ({
          dayOfWeek,
          isClosed,
          openTime,
          closeTime,
        }),
      );
      const saved = await api<OfficeDayHours[]>(
        `/offices/${props.officeId}/hours`,
        { method: "PATCH", body: JSON.stringify({ hours: editableHours }) },
      );
      setHours(
        OFFICE_DAY_NAMES.map(
          (_, dayOfWeek) =>
            saved.find((row) => row.dayOfWeek === dayOfWeek) ?? {
              dayOfWeek,
              isClosed: true,
              openTime: null,
              closeTime: null,
            },
        ),
      );
      props.onSaved();
      setMessage("Weekly hours saved.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save hours.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function addDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const created = await api<OfficeClosedDate>(
        `/offices/${props.officeId}/closed-dates`,
        { method: "POST", body: JSON.stringify({ closedDate: date, reason }) },
      );
      setClosedDates((list) => [...list, created]);
      setDate("");
      setReason("");
      setMessage("Closure date added.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not add date.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function removeDate(id: string) {
    try {
      await api(`/offices/${props.officeId}/closed-dates/${id}`, {
        method: "DELETE",
      });
      setClosedDates((list) => list.filter((entry) => entry.id !== id));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not remove date.",
      );
    }
  }
  return (
    <>
      <PageIntro
        kicker="KEEP YOUR HOURS UP TO DATE"
        title="Office hours"
        subtitle="Set when students can book. Available appointment times follow each service’s duration."
      />
      <section className="panel admin-office-select">
        <label className="office-picker">
          <span>Manage office</span>
          <select
            value={props.officeId}
            onChange={(event) => props.setOfficeId(event.target.value)}
          >
            {props.offices.map((office) => (
              <option key={office.id} value={office.id}>
                {office.name}
              </option>
            ))}
          </select>
        </label>
      </section>
      {message && <p role="status">{message}</p>}
      <form className="panel list-panel" onSubmit={saveHours}>
        <div className="panel-heading">
          <div>
            <span className="section-kicker">REPEATS EVERY WEEK</span>
            <h2>Opening hours</h2>
          </div>
        </div>
        {hours.map((day, index) => (
          <div className="admin-list-row" key={day.dayOfWeek}>
            <strong>{OFFICE_DAY_NAMES[day.dayOfWeek]}</strong>
            <label>
              <input
                type="checkbox"
                checked={!day.isClosed}
                onChange={(event) =>
                  setHours((current) =>
                    current.map((item, i) =>
                      i === index
                        ? {
                            ...item,
                            isClosed: !event.target.checked,
                            openTime: event.target.checked
                              ? (item.openTime ?? "09:00")
                              : item.openTime,
                            closeTime: event.target.checked
                              ? (item.closeTime ?? "17:00")
                              : item.closeTime,
                          }
                        : item,
                    ),
                  )
                }
              />{" "}
              Open
            </label>
            <input
              aria-label={`${OFFICE_DAY_NAMES[day.dayOfWeek]} opens`}
              type="time"
              disabled={day.isClosed}
              value={day.openTime ?? "09:00"}
              onChange={(event) =>
                setHours((current) =>
                  current.map((item, i) =>
                    i === index
                      ? { ...item, openTime: event.target.value }
                      : item,
                  ),
                )
              }
            />
            <input
              aria-label={`${OFFICE_DAY_NAMES[day.dayOfWeek]} closes`}
              type="time"
              disabled={day.isClosed}
              value={day.closeTime ?? "17:00"}
              onChange={(event) =>
                setHours((current) =>
                  current.map((item, i) =>
                    i === index
                      ? { ...item, closeTime: event.target.value }
                      : item,
                  ),
                )
              }
            />
          </div>
        ))}
        <button className="button-primary" disabled={busy || !props.officeId}>
          {busy ? "Saving…" : "Save weekly hours"}
        </button>
      </form>
      <section className="panel list-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">HOLIDAYS AND EXCEPTIONS</span>
            <h2>Closed dates</h2>
          </div>
        </div>
        <form className="form-row" onSubmit={addDate}>
          <label>
            Date
            <input
              type="date"
              required
              min={todayString()}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label>
            Reason (optional)
            <input
              maxLength={160}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Campus holiday"
            />
          </label>
          <button
            className="button-secondary"
            disabled={busy || !props.officeId}
          >
            Add date
          </button>
        </form>
        {closedDates.map((entry) => (
          <div className="admin-list-row" key={entry.id}>
            <strong>{localDate(entry.closedDate)}</strong>
            <span>{entry.reason || "Office closed"}</span>
            <button
              className="button-secondary"
              onClick={() => void removeDate(entry.id)}
            >
              Remove
            </button>
          </div>
        ))}
      </section>
    </>
  );
}

function AdminSetup(props: {
  offices: Office[];
  services: CampusService[];
  officeId: string;
  setOfficeId: (value: string) => void;
  officeName: string;
  setOfficeName: (value: string) => void;
  officeCode: string;
  setOfficeCode: (value: string) => void;
  newServiceName: string;
  setNewServiceName: (value: string) => void;
  newServiceOffice: string;
  setNewServiceOffice: (value: string) => void;
  officeAssignments: OfficeAssignment[];
  officeCounters: QueueCounter[];
  staffDirectory: StaffUser[];
  selectedStaffId: string;
  setSelectedStaffId: (value: string) => void;
  counterName: string;
  setCounterName: (value: string) => void;
  counterCode: string;
  setCounterCode: (value: string) => void;
  onCreateOffice: (event: FormEvent<HTMLFormElement>) => void;
  onCreateService: (event: FormEvent<HTMLFormElement>) => void;
  onCreateCounter: (event: FormEvent<HTMLFormElement>) => void;
  onAssignOfficeStaff: () => void;
  onRemoveOfficeStaff: (userId: string) => void;
  onAssignCounterStaff: (counterId: string, userId: string) => void;
  onRemoveCounterStaff: (counterId: string, userId: string) => void;
  onToggleCounter: (counter: QueueCounter) => void;
}) {
  const officeStaffReady = props.officeAssignments.length > 0;
  const counterStaffReady = props.officeCounters.some(
    (counter) => (counter.staffAssignments?.length ?? 0) > 0,
  );
  const steps = [
    { title: "Create an office", detail: "Add the campus office students will visit.", done: props.offices.length > 0, href: "#setup-offices" },
    { title: "Add a bookable service", detail: "Connect a student service to an office.", done: props.services.length > 0, href: "#setup-services" },
    { title: "Set up a counter", detail: "Create the counter that serves queue tickets.", done: props.officeCounters.length > 0, href: "#setup-counters" },
    { title: "Assign office staff", detail: "Give staff access to the selected office.", done: officeStaffReady, href: "#setup-staff" },
    { title: "Assign staff to a counter", detail: "Let staff call and serve queue tickets.", done: counterStaffReady, href: "#setup-counters" },
  ];
  return (
    <>
      <PageIntro
        kicker="SET THE CAMPUS UP FOR SUCCESS"
        title="Campus setup"
        subtitle="Follow the steps below so students can find a service and staff can manage its queue."
      />
      <section className="setup-checklist panel" aria-label="Campus setup progress">
        <div className="setup-checklist-heading">
          <div>
            <span className="section-kicker">GET STARTED</span>
            <h2>Campus setup checklist</h2>
          </div>
          <span>{steps.filter((step) => step.done).length} of {steps.length} complete</span>
        </div>
        <ol>
          {steps.map((step, index) => (
            <li className={step.done ? "setup-step-done" : ""} key={step.title}>
              <span className="setup-step-number">{step.done ? <Icon name="check" size={15} /> : index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </div>
              <a href={step.href}>
                {step.done ? "Review" : "Go to step"}
                <Icon name="arrow" size={14} />
              </a>
            </li>
          ))}
        </ol>
      </section>
      <section className="panel admin-office-select">
        <label className="office-picker">
          <span>Manage office</span>
          <select
            value={props.officeId}
            onChange={(event) => props.setOfficeId(event.target.value)}
          >
            <option value="">Choose an office</option>
            {props.offices.map((office) => (
              <option key={office.id} value={office.id}>
                {office.name}
              </option>
            ))}
          </select>
        </label>
        <span className="admin-office-hint">
          <Icon name="building" size={17} /> Office assignments and counters are
          managed separately for each office.
        </span>
      </section>
      <div className="manage-grid">
        <section className="panel manage-panel" id="setup-offices">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">OFFICES</span>
              <h2>Campus offices</h2>
            </div>
            <span className="manage-count">{props.offices.length}</span>
          </div>
          <form className="manage-form" onSubmit={props.onCreateOffice}>
            <label>
              Office name
              <input
                required
                maxLength={120}
                value={props.officeName}
                onChange={(event) => props.setOfficeName(event.target.value)}
                placeholder="Student Records"
              />
            </label>
            <label>
              Short code
              <input
                required
                maxLength={20}
                value={props.officeCode}
                onChange={(event) =>
                  props.setOfficeCode(event.target.value.toUpperCase())
                }
                placeholder="REG"
              />
            </label>
            <button className="button-primary">
              <Icon name="plus" size={16} /> Add office
            </button>
          </form>
          <div className="manage-list">
            {props.offices.map((office, index) => (
              <div className="manage-list-row" key={office.id}>
                <span className={`service-symbol symbol-${index % 4}`}>
                  <Icon name="building" size={17} />
                </span>
                <span>
                  <strong>{office.name}</strong>
                  <small>{office.code}</small>
                </span>
                <span className="active-indicator">
                  <i />
                  Active
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel manage-panel" id="setup-services">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">SERVICES</span>
              <h2>What students can book</h2>
            </div>
            <span className="manage-count">{props.services.length}</span>
          </div>
          <form className="manage-form" onSubmit={props.onCreateService}>
            <label>
              Service name
              <input
                required
                maxLength={120}
                value={props.newServiceName}
                onChange={(event) =>
                  props.setNewServiceName(event.target.value)
                }
                placeholder="Transcript request"
              />
            </label>
            <label>
              Office
              <select
                required
                value={props.newServiceOffice}
                onChange={(event) =>
                  props.setNewServiceOffice(event.target.value)
                }
              >
                <option value="">Choose office</option>
                {props.offices.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="button-primary">
              <Icon name="plus" size={16} /> Add service
            </button>
          </form>
          <div className="manage-list">
            {props.services.map((service, index) => (
              <div className="manage-list-row" key={service.id}>
                <span className={`service-symbol symbol-${index % 4}`}>
                  <Icon name="ticket" size={17} />
                </span>
                <span>
                  <strong>{service.name}</strong>
                  <small>
                    {service.office.name} · {service.durationMinutes} min
                  </small>
                </span>
                <span className="active-indicator">
                  <i />
                  Active
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="manage-grid admin-ops-grid">
        <section className="panel manage-panel" id="setup-staff">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">OFFICE ACCESS</span>
              <h2>Assigned staff</h2>
            </div>
            <span className="manage-count">
              {props.officeAssignments.length}
            </span>
          </div>
          <div className="assignment-form">
            <select
              value={props.selectedStaffId}
              onChange={(event) => props.setSelectedStaffId(event.target.value)}
            >
              <option value="">Select staff member</option>
              {props.staffDirectory
                .filter(
                  (person) =>
                    !props.officeAssignments.some(
                      (assignment) => assignment.userId === person.id,
                    ),
                )
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.fullName} · {person.employeeId || person.email}
                  </option>
                ))}
            </select>
            <button
              className="button-primary"
              disabled={!props.officeId || !props.selectedStaffId}
              onClick={props.onAssignOfficeStaff}
            >
              <Icon name="plus" size={15} /> Assign to office
            </button>
          </div>
          <div className="manage-list">
            {props.officeAssignments.map((assignment) => (
              <div className="manage-list-row" key={assignment.userId}>
                <span className="staff-avatar">
                  {initials({
                    ...assignment.user,
                    userId: assignment.userId,
                    role: "STAFF",
                  })}
                </span>
                <span>
                  <strong>{assignment.user.fullName}</strong>
                  <small>
                    {assignment.user.employeeId || assignment.user.email}
                  </small>
                </span>
                <button
                  className="button-quiet"
                  onClick={() => props.onRemoveOfficeStaff(assignment.userId)}
                >
                  Remove
                </button>
              </div>
            ))}
            {!props.officeAssignments.length && (
              <div className="muted-empty">
                Choose an office and assign staff to grant access.
              </div>
            )}
          </div>
        </section>
        <section className="panel manage-panel" id="setup-counters">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">SERVICE COUNTERS</span>
              <h2>Manage counters</h2>
            </div>
            <span className="manage-count">{props.officeCounters.length}</span>
          </div>
          <form
            className="counter-create-form"
            onSubmit={props.onCreateCounter}
          >
            <label>
              Counter name
              <input
                required
                maxLength={80}
                value={props.counterName}
                onChange={(event) => props.setCounterName(event.target.value)}
                placeholder="Window 1"
              />
            </label>
            <label>
              Code
              <input
                required
                maxLength={20}
                value={props.counterCode}
                onChange={(event) =>
                  props.setCounterCode(event.target.value.toUpperCase())
                }
                placeholder="W1"
              />
            </label>
            <button className="button-primary" disabled={!props.officeId}>
              <Icon name="plus" size={15} /> Add counter
            </button>
          </form>
          <div className="counter-list">
            {props.officeCounters.map((counter) => (
              <article className="counter-card" key={counter.id}>
                <div className="counter-card-head">
                  <span className="counter-code">{counter.code}</span>
                  <span className="counter-title">
                    <strong>{counter.name}</strong>
                    <small>
                      {counter.isActive
                        ? "Available for queue service"
                        : "Paused"}
                    </small>
                  </span>
                  <button
                    className="button-quiet"
                    onClick={() => props.onToggleCounter(counter)}
                  >
                    {counter.isActive ? "Pause" : "Activate"}
                  </button>
                </div>
                <div className="counter-assignees">
                  {counter.staffAssignments?.map((assignment) => (
                    <span className="assigned-chip" key={assignment.user.id}>
                      {assignment.user.fullName}
                      <button
                        aria-label={`Remove ${assignment.user.fullName} from ${counter.name}`}
                        onClick={() =>
                          props.onRemoveCounterStaff(
                            counter.id,
                            assignment.user.id,
                          )
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {!counter.staffAssignments?.length && (
                    <small>No staff assigned to this counter.</small>
                  )}
                </div>
                <div className="counter-assign-row">
                  <select
                    aria-label={`Staff for ${counter.name}`}
                    value={props.selectedStaffId}
                    onChange={(event) =>
                      props.setSelectedStaffId(event.target.value)
                    }
                  >
                    <option value="">Choose office staff</option>
                    {props.officeAssignments
                      .filter(
                        (assignment) =>
                          !counter.staffAssignments?.some(
                            (entry) => entry.user.id === assignment.userId,
                          ),
                      )
                      .map((assignment) => (
                        <option
                          key={assignment.userId}
                          value={assignment.userId}
                        >
                          {assignment.user.fullName}
                        </option>
                      ))}
                  </select>
                  <button
                    className="button-soft"
                    disabled={!props.selectedStaffId || !counter.isActive}
                    onClick={() =>
                      props.selectedStaffId &&
                      props.onAssignCounterStaff(
                        counter.id,
                        props.selectedStaffId,
                      )
                    }
                  >
                    Assign
                  </button>
                </div>
              </article>
            ))}
            {!props.officeCounters.length && (
              <div className="muted-empty">
                Add a counter before assigning staff or serving queue tickets.
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function PageIntro({
  kicker,
  title,
  subtitle,
}: {
  kicker: string;
  title: string;
  subtitle: string;
}) {
  return (
    <section className="page-intro">
      <span className="eyebrow">
        <span className="eyebrow-line" /> {kicker}
      </span>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </section>
  );
}

function statusClass(status: string) {
  if (["approved", "serving", "CALLED", "SERVING"].includes(status))
    return "status-good";
  if (["pending", "WAITING"].includes(status)) return "status-pending";
  if (
    [
      "cancelled",
      "skipped",
      "no_show",
      "CANCELLED",
      "SKIPPED",
      "NO_SHOW",
    ].includes(status)
  )
    return "status-muted";
  return "status-good";
}
