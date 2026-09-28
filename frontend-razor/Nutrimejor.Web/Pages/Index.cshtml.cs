using Microsoft.AspNetCore.Mvc.RazorPages;
using System.Text.Json;
using Nutrimejor.Web.Models;
using Nutrimejor.Web.Services;

namespace Nutrimejor.Web.Pages;

public class IndexModel(ModuleRegistry registry, PlatformApiClient api) : PageModel
{
    public IReadOnlyList<ServiceStatus> Services { get; private set; } = [];
    public int Patients { get; private set; }
    public int Appointments { get; private set; }
    public int Plans { get; private set; }
    public int Documents { get; private set; }

    public async Task OnGetAsync()
    {
        Services = await Task.WhenAll(registry.All.Select(api.HealthAsync));
        var totals = await Task.WhenAll(
            api.SendAsync("patients", "/v1/patients?limit=100", HttpMethod.Get),
            api.SendAsync("scheduling", "/v1/appointments", HttpMethod.Get),
            api.SendAsync("planning", "/v1/meal-plans", HttpMethod.Get),
            api.SendAsync("documents", "/v1/documents", HttpMethod.Get));
        Patients = Count(totals[0]); Appointments = Count(totals[1]); Plans = Count(totals[2]); Documents = Count(totals[3]);
    }

    private static int Count(ApiResponse response)
    {
        if (!response.Success) return 0;
        try
        {
            using var doc = JsonDocument.Parse(response.Content);
            var root = doc.RootElement;
            if (root.ValueKind == JsonValueKind.Array) return root.GetArrayLength();
            foreach (var key in new[] { "items", "data", "results" })
                if (root.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.Array) return value.GetArrayLength();
        }
        catch { }
        return 0;
    }
}
