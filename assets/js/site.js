(() => {
  const embedded = window.self !== window.top || new URLSearchParams(window.location.search).has("embed");
  if (embedded) document.documentElement.classList.add("atlas-embedded");
  if (window.location.pathname.includes("/references/")) {
    document.documentElement.classList.add("atlas-reference-page");
  }
  document.documentElement.classList.add("atlas-js");

  const externalLinks = document.querySelectorAll('main a[target="_blank"]');
  for (const link of externalLinks) {
    if (!link.getAttribute("rel")) {
      link.setAttribute("rel", "noopener noreferrer");
    }
  }
})();

