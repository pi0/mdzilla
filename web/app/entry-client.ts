import { initTheme } from "./theme.ts";
import { type NavItem, renderNav, setActiveLink, findFirstPage } from "./nav.ts";
import { renderContent, loadPage } from "./content.ts";
import { initSearch, setSearchNav } from "./search.ts";

const sidebar = document.getElementById("sidebar")!;
const content = document.getElementById("content")!;

initTheme();
initSearch();

function navigateTo(path: string) {
  history.pushState(null, "", path);
  handleNavigation();
}

async function handleNavigation() {
  const path = location.pathname;
  if (path === "/") {
    renderContent(content, `<p class="text-gray-400">Select a page from the sidebar.</p>`);
    return;
  }
  setActiveLink(sidebar, path);
  await loadPage(content, path);
}

async function refreshNav(): Promise<NavItem[]> {
  const res = await fetch("/api/meta");
  const meta = await res.json();
  const navData: NavItem[] = meta.toc;
  renderNav(sidebar, navData);
  setSearchNav(navData);
  setActiveLink(sidebar, location.pathname);
  return navData;
}

async function init() {
  renderContent(content, `<p class="text-gray-400">Loading...</p>`);
  const navData = await refreshNav();

  // Intercept nav link clicks for SPA navigation
  sidebar.addEventListener("click", (e) => {
    const link = (e.target as HTMLElement).closest("a.nav-link") as HTMLAnchorElement | null;
    if (!link) return;
    e.preventDefault();
    navigateTo(link.getAttribute("data-path")!);
  });

  window.addEventListener("popstate", handleNavigation);

  if (location.pathname === "/") {
    const first = findFirstPage(navData);
    if (first) {
      navigateTo(first);
      return;
    }
  }
  handleNavigation();
  startWatching();
}

function startWatching() {
  const es = new EventSource("/api/watch");
  es.onmessage = async () => {
    await refreshNav();
    const path = location.pathname;
    if (path !== "/") {
      await loadPage(content, path);
    }
  };
  window.addEventListener("beforeunload", () => es.close());
}

init();
