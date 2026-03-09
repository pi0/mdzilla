import type { NavItem } from "./nav.ts";

interface SearchResult {
  path: string;
  title: string;
  snippets: string[];
}

let navItems: NavItem[] = [];

export function setSearchNav(items: NavItem[]) {
  navItems = items;
}

export function initSearch() {
  const trigger = document.getElementById("search-trigger")!;
  const modal = document.getElementById("search-modal")!;
  const backdrop = document.getElementById("search-backdrop")!;
  const input = document.getElementById("search-input") as HTMLInputElement;
  const resultsEl = document.getElementById("search-results")!;

  let timer: ReturnType<typeof setTimeout>;
  let activeIndex = -1;
  let results: SearchResult[] = [];

  trigger.addEventListener("click", open);

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      open();
    }
  });

  backdrop.addEventListener("click", close);

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) {
      activeIndex = -1;
      results = [];
      renderNavList();
      return;
    }
    timer = setTimeout(() => search(q), 200);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(activeIndex + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(activeIndex - 1);
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      navigate(results[activeIndex]!.path);
    } else if (e.key === "Escape") {
      close();
    }
  });

  function open() {
    modal.classList.remove("hidden");
    input.value = "";
    activeIndex = -1;
    results = [];
    renderNavList();
    requestAnimationFrame(() => input.focus());
  }

  function close() {
    modal.classList.add("hidden");
    input.value = "";
    results = [];
    activeIndex = -1;
  }

  async function search(q: string) {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    results = data.results;
    activeIndex = results.length > 0 ? 0 : -1;
    render();
  }

  function render() {
    if (results.length === 0) {
      resultsEl.innerHTML = `<p class="px-4 py-8 text-sm text-gray-400 text-center">No results found</p>`;
      return;
    }
    resultsEl.innerHTML = results
      .map(
        (r, i) => `
      <a href="${r.path}" class="search-item flex items-start gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${i === activeIndex ? "bg-gray-50 dark:bg-gray-800" : ""}" data-index="${i}">
        <svg class="size-4 mt-0.5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
        <div class="min-w-0">
          <div class="text-sm font-medium text-gray-900 dark:text-gray-100">${escapeHtml(r.title)}</div>
          ${r.snippets[0] ? `<div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">${escapeHtml(r.snippets[0])}</div>` : ""}
        </div>
      </a>`,
      )
      .join("");

    resultsEl.querySelectorAll(".search-item").forEach((el) => {
      el.addEventListener("click", () => close());
    });
  }

  function setActive(index: number) {
    if (results.length === 0) return;
    activeIndex = Math.max(0, Math.min(index, results.length - 1));
    render();
    const active = resultsEl.querySelector(`[data-index="${activeIndex}"]`);
    active?.scrollIntoView({ block: "nearest" });
  }

  function renderNavList() {
    const flat = flattenNav(navItems);
    if (flat.length === 0) {
      resultsEl.innerHTML = `<p class="px-4 py-8 text-sm text-gray-400 text-center">Type to search…</p>`;
      return;
    }
    results = flat.map((item) => ({
      path: item.path,
      title: item.title,
      snippets: [],
    }));
    activeIndex = -1;
    resultsEl.innerHTML = results
      .map(
        (r, i) => `
      <a href="${r.path}" class="search-item flex items-start gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" data-index="${i}">
        <svg class="size-4 mt-0.5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
        <div class="min-w-0">
          <div class="text-sm font-medium text-gray-900 dark:text-gray-100">${escapeHtml(r.title)}</div>
        </div>
      </a>`,
      )
      .join("");

    resultsEl.querySelectorAll(".search-item").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const idx = Number((el as HTMLElement).dataset.index);
        navigate(results[idx]!.path);
      });
    });
  }

  function navigate(path: string) {
    location.hash = path;
    close();
  }
}

function flattenNav(items: NavItem[]): { path: string; title: string }[] {
  const result: { path: string; title: string }[] = [];
  for (const item of items) {
    if (item.page !== false) {
      result.push({ path: item.path, title: item.title });
    }
    if (item.children) {
      result.push(...flattenNav(item.children));
    }
  }
  return result;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
