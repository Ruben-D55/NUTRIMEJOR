using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Nutrimejor.Web.Models;
using Nutrimejor.Web.Services;

namespace Nutrimejor.Web.Pages.Modules;

public sealed class IndexModel(ModuleRegistry registry, PlatformApiClient api) : PageModel
{
    [BindProperty(SupportsGet = true)] public string Key { get; set; } = "patients";
    [BindProperty] public string Payload { get; set; } = "{}";
    [BindProperty] public string? RecordId { get; set; }
    public ModuleDefinition Module { get; private set; } = null!;
    public List<RowData> Rows { get; private set; } = [];
    public List<string> Columns { get; private set; } = [];
    public string? LoadError { get; private set; }

    public async Task<IActionResult> OnGetAsync()
    {
        var module = registry.Find(Key);
        if (module is null) return NotFound();
        Module = module;
        Payload = module.SampleJson;
        var response = await api.SendAsync(module.Service, module.ListPath, HttpMethod.Get);
        if (!response.Success) { LoadError = response.Error; return Page(); }
        ParseRows(response.Content);
        return Page();
    }

    public async Task<IActionResult> OnPostCreateAsync()
    {
        var module = registry.Find(Key);
        if (module?.CreatePath is null) return BadRequest();
        if (!ValidJson(Payload)) { TempData["Error"] = "El contenido JSON no es válido."; return RedirectToPage(new { key = Key }); }
        var response = await api.SendAsync(module.Service, module.CreatePath, HttpMethod.Post, Payload);
        TempData[response.Success ? "Success" : "Error"] = response.Success ? $"Registro creado en {module.ShortName}." : response.Error;
        return RedirectToPage(new { key = Key });
    }

    public async Task<IActionResult> OnPostUpdateAsync()
    {
        var module = registry.Find(Key);
        if (module?.UpdatePath is null || string.IsNullOrWhiteSpace(RecordId)) return BadRequest();
        if (!ValidJson(Payload)) { TempData["Error"] = "El contenido JSON no es válido."; return RedirectToPage(new { key = Key }); }
        var path = module.UpdatePath.Replace("{id}", Uri.EscapeDataString(RecordId));
        var response = await api.SendAsync(module.Service, path, HttpMethod.Put, Payload);
        TempData[response.Success ? "Success" : "Error"] = response.Success ? "Registro actualizado correctamente." : response.Error;
        return RedirectToPage(new { key = Key });
    }

    public async Task<IActionResult> OnPostDeleteAsync()
    {
        var module = registry.Find(Key);
        if (module?.DeletePath is null || string.IsNullOrWhiteSpace(RecordId)) return BadRequest();
        var path = module.DeletePath.Replace("{id}", Uri.EscapeDataString(RecordId));
        var response = await api.SendAsync(module.Service, path, HttpMethod.Delete);
        TempData[response.Success ? "Success" : "Error"] = response.Success ? "Registro archivado correctamente." : response.Error;
        return RedirectToPage(new { key = Key });
    }

    private void ParseRows(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            JsonElement items = root;
            if (root.ValueKind == JsonValueKind.Object)
                foreach (var key in new[] { "items", "data", "results" })
                    if (root.TryGetProperty(key, out var candidate) && candidate.ValueKind == JsonValueKind.Array) { items = candidate; break; }
            if (items.ValueKind != JsonValueKind.Array) return;
            foreach (var item in items.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object) continue;
                var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                foreach (var property in item.EnumerateObject())
                {
                    if (property.Value.ValueKind is JsonValueKind.Object or JsonValueKind.Array) continue;
                    values[property.Name] = Display(property.Value);
                }
                var id = values.FirstOrDefault(x => x.Key.Equals("id", StringComparison.OrdinalIgnoreCase)).Value ?? "";
                Rows.Add(new RowData(id, values, JsonSerializer.Serialize(item, new JsonSerializerOptions { WriteIndented = true })));
            }
            Columns = Rows.SelectMany(x => x.Values.Keys).Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(x => x.Equals("id", StringComparison.OrdinalIgnoreCase) ? 0 : 1).Take(6).ToList();
        }
        catch (Exception ex) { LoadError = $"No se pudo interpretar la respuesta: {ex.Message}"; }
    }

    private static string Display(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.String => value.GetString() ?? "—",
        JsonValueKind.True => "Sí",
        JsonValueKind.False => "No",
        JsonValueKind.Null => "—",
        _ => value.ToString()
    };

    private static bool ValidJson(string value) { try { JsonDocument.Parse(value); return true; } catch { return false; } }
    public sealed record RowData(string Id, Dictionary<string, string> Values, string RawJson);
}
