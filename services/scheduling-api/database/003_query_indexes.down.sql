IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Appointments_PatientCalendar' AND object_id=OBJECT_ID('Appointments'))
  DROP INDEX IX_Appointments_PatientCalendar ON Appointments;
