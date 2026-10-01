"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Patient } from "@/lib/patients";

type Input = Omit<Patient, "id" | "createdAt" | "history">;
type Store = {
  patients: Patient[];
  ready: boolean;
  error: string;
  reload: () => Promise<void>;
  add: (patient: Input) => Promise<void>;
  update: (id: string, patient: Partial<Patient>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  addHistory: (id: string, type: string, notes: string) => Promise<void>;
};

const Context = createContext<Store | null>(null);

async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...options?.headers },
    ...options,
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.href = "/api/auth/refresh?next=/pacientes";
    throw Error("Tu sesión venció. Se intentará renovar.");
  }
  if (!response.ok) throw Error(data.error || "No se pudo completar la operación.");
  return data;
}

function normalize(value: Record<string, unknown>): Patient {
  return {
    id: String(value.id),
    names: String(value.names || ""),
    lastNames: String(value.lastNames || ""),
    preferredName: String(value.preferredName || ""),
    documentType: String(value.documentType || ""),
    document: String(value.document || ""),
    birthDate: String(value.birthDate || ""),
    sex: String(value.sex || ""),
    phone: String(value.phone || ""),
    email: String(value.email || ""),
    address: String(value.address || ""),
    city: String(value.city || ""),
    country: String(value.country || ""),
    objective: String(value.objective || ""),
    photoPath: String(value.photoPath || ""),
    status: value.status === "Inactivo" ? "Inactivo" : "Activo",
    version: Number(value.version || 1),
    createdAt: String(value.createdAt || ""),
    updatedAt: String(value.updatedAt || ""),
    history: [],
  };
}

export function PatientProvider({ children }: { children: React.ReactNode }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      setError("");
      const data = await request("/api/patients");
      setPatients((data as Record<string, unknown>[]).map(normalize));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Error al cargar pacientes");
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const add = async (patient: Input) => {
    await request("/api/patients", { method: "POST", body: JSON.stringify(patient) });
    await reload();
  };
  const update = async (id: string, patient: Partial<Patient>) => {
    await request(`/api/patients/${id}`, { method: "PUT", body: JSON.stringify(patient) });
    await reload();
  };
  const remove = async (id: string) => {
    await request(`/api/patients/${id}`, { method: "DELETE" });
    setPatients((current) => current.filter((patient) => patient.id !== id));
  };
  const addHistory = async (id: string, type: string, notes: string) => {
    await request(`/api/patients/${id}/history`, { method: "POST", body: JSON.stringify({ type, notes }) });
  };

  return <Context.Provider value={{ patients, ready, error, reload, add, update, remove, addHistory }}>{children}</Context.Provider>;
}

export function usePatients() {
  const context = useContext(Context);
  if (!context) throw Error("PatientProvider no disponible");
  return context;
}
