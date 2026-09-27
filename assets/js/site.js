(() => {
  document.documentElement.classList.add("atlas-js");

  const externalLinks = document.querySelectorAll('main a[target="_blank"]');
  for (const link of externalLinks) {
    if (!link.getAttribute("rel")) {
      link.setAttribute("rel", "noopener noreferrer");
    }
  }
})();

