using Nutrimejor.Web.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorPages();
builder.Services.AddHttpContextAccessor();
builder.Services.AddDistributedMemoryCache();
builder.Services.AddSession(options =>
{
    options.Cookie.Name = "nm_razor_session";
    options.Cookie.HttpOnly = true;
    options.Cookie.IsEssential = true;
    options.IdleTimeout = TimeSpan.FromHours(8);
});
builder.Services.AddSingleton<ModuleRegistry>();
builder.Services.AddHttpClient<PlatformApiClient>(client => client.Timeout = TimeSpan.FromSeconds(12));

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

app.UseStaticFiles();
app.UseRouting();
app.UseSession();
app.Use(async (context, next) =>
{
    var path = context.Request.Path;
    var isPublic = path.StartsWithSegments("/Account") || path.StartsWithSegments("/css")
        || path.StartsWithSegments("/js") || path.StartsWithSegments("/lib")
        || path.StartsWithSegments("/favicon.ico");
    if (!isPublic && string.IsNullOrWhiteSpace(context.Session.GetString("AccessToken")))
    {
        context.Response.Redirect($"/Account/Login?returnUrl={Uri.EscapeDataString(path)}");
        return;
    }
    await next();
});
app.MapRazorPages();
app.Run();
