IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Appointments_PatientCalendar' AND object_id=OBJECT_ID('Appointments'))
  CREATE INDEX IX_Appointments_PatientCalendar ON Appointments (IdOrganizacion, IdPaciente, StartsAt, EndsAt) INCLUDE (Estado, IdNutricionista, AppointmentType, Titulo);
