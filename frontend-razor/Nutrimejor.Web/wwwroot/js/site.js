document.addEventListener("DOMContentLoaded", () => {
  const menu = document.getElementById("menuToggle");
  const sidebar = document.getElementById("sidebar");
  menu?.addEventListener("click", () => sidebar?.classList.toggle("open"));
  document.addEventListener("click", event => {
    if (window.innerWidth < 992 && sidebar?.classList.contains("open") && !sidebar.contains(event.target) && event.target !== menu) sidebar.classList.remove("open");
  });
});
