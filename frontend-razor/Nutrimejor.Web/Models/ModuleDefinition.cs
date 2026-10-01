namespace Nutrimejor.Web.Models;

public sealed record ModuleDefinition(string Key, string Name, string ShortName, string Description,
    string Icon, string Service, string ListPath, string? CreatePath, string? UpdatePath,
    string? DeletePath, string SampleJson, bool Immutable = false);

public sealed record ServiceStatus(string Key, string Name, string Icon, bool Online, long LatencyMs);

public sealed class ApiResponse
{
    public bool Success { get; init; }
    public int StatusCode { get; init; }
    public string Content { get; init; } = "";
    public string Error { get; init; } = "";
}
