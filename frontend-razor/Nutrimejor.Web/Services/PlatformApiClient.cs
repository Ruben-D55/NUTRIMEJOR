using System.Diagnostics;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Nutrimejor.Web.Models;

namespace Nutrimejor.Web.Services;

public sealed class PlatformApiClient(HttpClient http, IConfiguration configuration, IHttpContextAccessor contextAccessor)
{
    private readonly string _serviceKey = configuration["ServiceApiKey"] ?? "";

    public async Task<ApiResponse> SendAsync(string service, string path, HttpMethod method, string? json = null, bool authenticated = true)
    {
        var baseUrl = configuration[$"Services:{service}"] ?? throw new InvalidOperationException($"Servicio desconocido: {service}");
        using var request = new HttpRequestMessage(method, $"{baseUrl.TrimEnd('/')}/{path.TrimStart('/')}");
        request.Headers.Add("x-service-key", _serviceKey);
        if (authenticated)
        {
            var token = contextAccessor.HttpContext?.Session.GetString("AccessToken");
            if (!string.IsNullOrWhiteSpace(token)) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }
        if (json is not null) request.Content = new StringContent(json, Encoding.UTF8, "application/json");
        try
        {
            using var response = await http.SendAsync(request);
            var content = await response.Content.ReadAsStringAsync();
            return new ApiResponse { Success = response.IsSuccessStatusCode, StatusCode = (int)response.StatusCode,
                Content = string.IsNullOrWhiteSpace(content) ? "{}" : content,
                Error = response.IsSuccessStatusCode ? "" : ExtractError(content, response.ReasonPhrase) };
        }
        catch (Exception ex)
        {
            return new ApiResponse { Success = false, StatusCode = 503, Error = ex.Message, Content = "{}" };
        }
    }

    public async Task<ServiceStatus> HealthAsync(ModuleDefinition module)
    {
        var watch = Stopwatch.StartNew();
        var response = await SendAsync(module.Service, "/health/ready", HttpMethod.Get, authenticated: false);
        watch.Stop();
        return new ServiceStatus(module.Key, module.ShortName, module.Icon, response.Success, watch.ElapsedMilliseconds);
    }

    public static string Pretty(string json)
    {
        try { using var doc = JsonDocument.Parse(json); return JsonSerializer.Serialize(doc.RootElement, new JsonSerializerOptions { WriteIndented = true }); }
        catch { return json; }
    }

    private static string ExtractError(string content, string? fallback)
    {
        try
        {
            using var doc = JsonDocument.Parse(content);
            if (doc.RootElement.TryGetProperty("error", out var error)) return error.GetString() ?? fallback ?? "Error";
            if (doc.RootElement.TryGetProperty("message", out var message)) return message.GetString() ?? fallback ?? "Error";
        }
        catch { }
        return fallback ?? "No fue posible completar la operación.";
    }
}
