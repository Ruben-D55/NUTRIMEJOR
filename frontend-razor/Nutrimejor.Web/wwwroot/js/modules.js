document.addEventListener("DOMContentLoaded", () => {
  const labels = { names:"Nombres", lastNames:"Apellidos", documentType:"Tipo de documento", document:"Documento", birthDate:"Fecha de nacimiento", sex:"Sexo", status:"Estado", patientId:"Paciente (ID)", title:"Título", description:"Descripción", source:"Fuente", measuredAt:"Fecha de medición", measurements:"Mediciones", lifestyle:"Estilo de vida", recall24h:"Recordatorio 24 horas", targetCalories:"Calorías objetivo", macroPercentages:"Distribución de macronutrientes", days:"Días", startsAt:"Inicio", endsAt:"Fin", type:"Tipo", channel:"Canal", subject:"Asunto", message:"Mensaje", data:"Datos", name:"Nombre", planCode:"Plan" };
  const friendly = key => labels[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, value => value.toUpperCase());
  const buildForm = (container, data, target, editor) => {
    container.innerHTML = "";
    const state = structuredClone(data);
    Object.entries(state).forEach(([key, value]) => {
      const group = document.createElement("div");
      if (typeof value === "object" && value !== null) group.classList.add("field-wide");
      const label = document.createElement("label"); label.textContent = friendly(key); group.appendChild(label);
      let input;
      if (typeof value === "boolean") { input = document.createElement("select"); input.className="form-select"; input.innerHTML='<option value="true">Sí</option><option value="false">No</option>'; input.value=String(value); }
      else if (typeof value === "object" && value !== null) { input=document.createElement("textarea"); input.className="form-control"; input.value=JSON.stringify(value,null,2); }
      else { input=document.createElement("input"); input.className="form-control"; input.type=typeof value === "number" ? "number" : "text"; input.value=value ?? ""; }
      input.dataset.key=key; group.appendChild(input); container.appendChild(group);
      input.addEventListener("input", () => {
        try { state[key] = typeof value === "object" && value !== null ? JSON.parse(input.value) : typeof value === "number" ? Number(input.value) : typeof value === "boolean" ? input.value === "true" : input.value; sync(); input.classList.remove("is-invalid"); }
        catch { input.classList.add("is-invalid"); }
      });
    });
    const sync = () => { const json=JSON.stringify(state,null,2); target.value=json; editor.value=json; };
    editor.oninput = () => { try { const next=JSON.parse(editor.value); target.value=editor.value; buildForm(container,next,target,editor); editor.classList.remove("is-invalid"); } catch { editor.classList.add("is-invalid"); } };
    sync();
  };
  const createPayload=document.getElementById("createPayload"), createFields=document.getElementById("createFields"), createEditor=document.getElementById("createJsonEditor");
  if(createPayload && createFields && createEditor) { try { buildForm(createFields,JSON.parse(createPayload.value),createPayload,createEditor); } catch {} }
  const search = document.getElementById("tableSearch");
  const rows = [...document.querySelectorAll("#recordsTable tbody tr")];
  const count = document.getElementById("visibleCount");
  search?.addEventListener("input", () => {
    const term = search.value.trim().toLocaleLowerCase("es");
    let visible = 0;
    rows.forEach(row => { const show = row.textContent.toLocaleLowerCase("es").includes(term); row.hidden = !show; if (show) visible++; });
    if (count) count.textContent = visible;
  });
  document.querySelectorAll(".view-record").forEach(button => button.addEventListener("click", () => {
    document.getElementById("detailJson").textContent = button.dataset.json;
    bootstrap.Modal.getOrCreateInstance(document.getElementById("detailModal")).show();
  }));
  document.querySelectorAll(".edit-record").forEach(button => button.addEventListener("click", () => {
    document.getElementById("editRecordId").value = button.dataset.id;
    const payload=document.getElementById("editPayload"), fields=document.getElementById("editFields"), editor=document.getElementById("editJsonEditor");
    payload.value = button.dataset.json;
    try { buildForm(fields,JSON.parse(button.dataset.json),payload,editor); } catch {}
    bootstrap.Modal.getOrCreateInstance(document.getElementById("editModal")).show();
  }));
  document.querySelectorAll(".delete-record").forEach(button => button.addEventListener("click", () => {
    document.getElementById("deleteRecordId").value = button.dataset.id;
    bootstrap.Modal.getOrCreateInstance(document.getElementById("deleteModal")).show();
  }));
});
