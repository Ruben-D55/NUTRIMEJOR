using System.Diagnostics;
using System.Net.Http.Headers;
using System.Security.Cryptography;
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
        var relativePath = $"/{path.TrimStart('/')}";
        using var request = new HttpRequestMessage(method, $"{baseUrl.TrimEnd('/')}{relativePath}");
        AddServiceProof(request, method.Method, relativePath);
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

    private void AddServiceProof(HttpRequestMessage request, string method, string path)
    {
        if (_serviceKey.Length < 32) throw new InvalidOperationException("ServiceApiKey debe tener al menos 32 caracteres.");
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        var nonce = Guid.NewGuid().ToString();
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(_serviceKey));
        var signature = Convert.ToHexString(hmac.ComputeHash(
            Encoding.UTF8.GetBytes($"{timestamp}.{nonce}.{method.ToUpperInvariant()}.{path}"))).ToLowerInvariant();
        request.Headers.Add("x-service-timestamp", timestamp);
        request.Headers.Add("x-service-nonce", nonce);
        request.Headers.Add("x-service-signature", signature);
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
