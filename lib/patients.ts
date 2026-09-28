export type HistoryItem = {
  id: string;
  date: string;
  type: string;
  notes: string;
};

export type Patient = {
  id: string;
  names: string;
  lastNames: string;
  preferredName?: string;
  documentType?: string;
  document: string;
  birthDate: string;
  sex: string;
  phone: string;
  email: string;
  address?: string;
  city?: string;
  country?: string;
  objective: string;
  photoPath?: string;
  status: "Activo" | "Inactivo";
  version?: number;
  createdAt: string;
  updatedAt?: string;
  history: HistoryItem[];
};

export const fullName = (patient: Patient) =>
  patient.names + " " + patient.lastNames;
