"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Apple,
  BadgeCheck,
  Bell,
  BellRing,
  Building2,
  Calculator,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  NotebookTabs,
  Ruler,
  Salad,
  Settings,
  Stethoscope,
  Sun,
  UserPlus,
  Users,
  Utensils,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";

type User = {
  id: number;
  name: string;
  role: "ADMIN" | "NUTRICIONISTA";
  organizationId: string;
  organizationRole: "OWNER" | "ADMIN" | "NUTRITIONIST" | "ASSISTANT" | "PATIENT";
  patientId?: string | null;
};
type Organization = { id: string; name: string; role: User["organizationRole"] };

const sections = [
  ["Principal", [
    ["/dashboard", "Inicio", LayoutDashboard],
    ["/pacientes/nuevo", "Nuevo paciente", UserPlus],
    ["/pacientes", "Mis pacientes", Users],
  ]],
  ["Atención", [
    ["/clinica", "Historia clínica", Stethoscope],
    ["/mediciones", "Mediciones", Ruler],
    ["/nutricion", "Evaluación nutricional", Utensils],
    ["/planes", "Planes nutricionales", ClipboardList],
    ["/agenda", "Agenda", CalendarDays],
  ]],
  ["Catálogos", [
    ["/catalogos/recetas", "Mis recetas", NotebookTabs],
    ["/catalogos/alimentos", "Mis alimentos", Apple],
    ["/catalogos/dietas", "Mis dietas", Salad],
  ]],
  ["Gestión", [
    ["/notificaciones", "Notificaciones", BellRing],
    ["/documentos", "Documentos", FileText],
    ["/reportes", "Reportes", ChartNoAxesCombined],
    ["/membresia", "Membresía", BadgeCheck],
    ["/calculos", "Cálculos dietéticos", Calculator],
    ["/configuracion", "Configuración", Settings],
  ]],
] as const;

const patientSections = [["Mi espacio", [["/mi-portal", "Mi portal nutricional", LayoutDashboard]]]] as const;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function Shell({ children, user }: { children: React.ReactNode; user: User }) {
  const [open, setOpen] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [switchingOrganization, setSwitchingOrganization] = useState(false);
  const path = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const visibleSections = user.organizationRole === "PATIENT" ? patientSections : sections;

  useEffect(() => {
    if (user.organizationRole === "PATIENT" && path !== "/mi-portal") router.replace("/mi-portal");
  }, [path, router, user.organizationRole]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/organizations", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : [])
      .then(setOrganizations)
      .catch((error) => {
        if (error.name !== "AbortError") console.error(error);
      });
    return () => controller.abort();
  }, []);

  async function switchOrganization(organizationId: string) {
    if (!organizationId || organizationId.toLowerCase() === user.organizationId.toLowerCase()) return;
    setSwitchingOrganization(true);
    const response = await fetch("/api/organizations/switch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    setSwitchingOrganization(false);
    if (response.ok) router.refresh();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen">
      <button
        aria-label="Cerrar menú"
        onClick={() => setOpen(false)}
        className={`${open ? "block" : "hidden"} fixed inset-0 z-30 bg-black/40 lg:hidden`}
      />
      <aside
        className={`${open ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 z-40 flex w-72 flex-col border-r bg-white p-5 transition dark:border-emerald-800 dark:bg-emerald-950 lg:translate-x-0`}
      >
        <div className="mb-8 flex items-center gap-3">
          <b className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-700 text-xl text-white">N</b>
          <div>
            <strong className="font-display">NUTRIMEJOR</strong>
            <small className="block text-xs text-slate-500">Gestión nutricional</small>
          </div>
          <button aria-label="Cerrar menú" className="ml-auto lg:hidden" onClick={() => setOpen(false)}>
            <X />
          </button>
        </div>

        {user.organizationRole !== "PATIENT" && <label className="mb-4 block rounded-xl border p-3 text-xs dark:border-emerald-800">
          <span className="mb-2 flex items-center gap-2 font-semibold text-slate-500">
            <Building2 className="h-4 w-4" /> Organización
          </span>
          <select
            aria-label="Organización activa"
            className="w-full bg-transparent font-semibold outline-none"
            disabled={switchingOrganization || organizations.length < 2}
            value={user.organizationId.toLowerCase()}
            onChange={(event) => switchOrganization(event.target.value)}
          >
            {organizations.length === 0 && (
              <option value={user.organizationId.toLowerCase()}>Organización actual</option>
            )}
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id.toLowerCase()}>
                {organization.name}
              </option>
            ))}
          </select>
        </label>}

        <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {visibleSections.map(([section, links]) => (
            <div key={section}>
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {section}
              </p>
              <div className="space-y-1">
                {links.map(([href, label, Icon]) => (
                  <Link
                    className={`nav ${path === href || path.startsWith(`${href}/`) ? "active" : ""}`}
                    href={href}
                    key={href}
                    onClick={() => setOpen(false)}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-3 border-t pt-4 dark:border-emerald-800">
          <b className="grid h-10 w-10 place-items-center rounded-xl bg-lime-200 text-xs text-emerald-900">
            {initials(user.name)}
          </b>
          <div className="min-w-0 flex-1">
            <strong className="block truncate text-sm">{user.name}</strong>
            <small className="block text-xs capitalize text-slate-500">
              {user.organizationRole === "PATIENT" ? "paciente" : user.role.toLowerCase()}
            </small>
          </div>
          <button aria-label="Cerrar sesión" title="Cerrar sesión" onClick={logout} className="rounded-lg p-2">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-20 items-center border-b bg-white/90 px-5 backdrop-blur dark:border-emerald-800 dark:bg-emerald-950/90">
          <button aria-label="Abrir menú" className="mr-4 lg:hidden" onClick={() => setOpen(true)}>
            <Menu />
          </button>
          <div>
            <p className="text-xs capitalize text-slate-500">
              {new Intl.DateTimeFormat("es-BO", {
                weekday: "long",
                day: "numeric",
                month: "long",
              }).format(new Date())}
            </p>
            <h2 className="font-display font-bold">Panel principal</h2>
          </div>
          <div className="ml-auto flex gap-2">
            <button
              aria-label="Cambiar tema"
              className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-emerald-900"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun /> : <Moon />}
            </button>
            <button aria-label="Notificaciones" className="rounded-xl p-2">
              <Bell />
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] p-5 lg:p-8">{children}</main>
        <footer className="p-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} NUTRIMEJOR
        </footer>
      </div>
    </div>
  );
}
