using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Nutrimejor.Web.Services;

namespace Nutrimejor.Web.Pages.Account;

public sealed class LoginModel(PlatformApiClient api) : PageModel
{
    [BindProperty, Required, EmailAddress] public string Email { get; set; } = "";
    [BindProperty, Required, MinLength(8)] public string Password { get; set; } = "";
    [BindProperty] public string? Name { get; set; }
    [BindProperty(SupportsGet = true)] public string? ReturnUrl { get; set; }
    [BindProperty(SupportsGet = true)] public bool Register { get; set; }
    public string? ErrorMessage { get; private set; }

    public IActionResult OnGet()
        => string.IsNullOrWhiteSpace(HttpContext.Session.GetString("AccessToken")) ? Page() : RedirectToPage("/Index");

    public Task<IActionResult> OnPostLoginAsync() => AuthenticateAsync("/v1/sessions", new { email = Email, password = Password });

    public Task<IActionResult> OnPostRegisterAsync()
    {
        Register = true;
        if (string.IsNullOrWhiteSpace(Name))
        {
            ErrorMessage = "Ingresa tu nombre para crear la cuenta.";
            return Task.FromResult<IActionResult>(Page());
        }
        return AuthenticateAsync("/v1/users", new { name = Name, email = Email, password = Password });
    }

    private async Task<IActionResult> AuthenticateAsync(string path, object body)
    {
        if (!ModelState.IsValid) return Page();
        var response = await api.SendAsync("identity", path, HttpMethod.Post, JsonSerializer.Serialize(body), authenticated: false);
        if (!response.Success)
        {
            ErrorMessage = response.Error;
            return Page();
        }
        using var document = JsonDocument.Parse(response.Content);
        var root = document.RootElement;
        HttpContext.Session.SetString("AccessToken", root.GetProperty("accessToken").GetString()!);
        HttpContext.Session.SetString("RefreshToken", root.GetProperty("refreshToken").GetString()!);
        if (root.TryGetProperty("user", out var user))
        {
            HttpContext.Session.SetString("UserName", user.TryGetProperty("name", out var name) ? name.GetString() ?? Email : Email);
            HttpContext.Session.SetString("UserRole", user.TryGetProperty("organizationRole", out var role) ? role.GetString() ?? "PROFESSIONAL" : "PROFESSIONAL");
        }
        return LocalRedirect(!string.IsNullOrWhiteSpace(ReturnUrl) && Url.IsLocalUrl(ReturnUrl) ? ReturnUrl : "/");
    }
}
