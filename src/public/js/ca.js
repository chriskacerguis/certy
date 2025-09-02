// Add a confirmation dialog for the Destroy CA form to prevent accidental wipes
(function () {
  document.addEventListener("DOMContentLoaded", function () {
    const form = document.querySelector('form[action="/ca/destroy"]');
    if (!form) return;
    form.addEventListener("submit", function (e) {
      const msg =
        "This will destroy the local CA data and wipe the database tables. This cannot be undone.\n\nType DESTROY to confirm:";
      const ans = prompt(msg);
      if (ans !== "DESTROY") {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      return true;
    });
  });
})();
