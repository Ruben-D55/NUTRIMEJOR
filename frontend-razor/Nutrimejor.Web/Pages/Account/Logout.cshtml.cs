using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Nutrimejor.Web.Pages.Account;

public sealed class LogoutModel : PageModel
{
    public IActionResult OnGet() { HttpContext.Session.Clear(); return RedirectToPage("/Account/Login"); }
}
