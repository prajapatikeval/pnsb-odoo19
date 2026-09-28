import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { motionEnabled } from "../core/motion";
import { escapeHtml } from "../core/store";

const VIEW_KEY = "ip_catalog_view";
const normalize = (s) =>
    String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\s\-_.·/]+/g, "");

/**
 * Instant catalogue filtering: category chips, search, material / finish /
 * standard / thread-size filters, sorting and grid/list layout, with FLIP
 * animations and URL synchronisation.
 */
export class IpCatalog extends Interaction {
    static selector = "[data-ip-catalog]";

    dynamicContent = {
        "[data-ip-filter-category]": {
            "t-on-click": (ev) => this.setCategory(parseInt(ev.currentTarget.dataset.ipFilterCategory, 10)),
            "t-att-class": (el) => ({ "is-active": parseInt(el.dataset.ipFilterCategory, 10) === this.state.category }),
        },
        "[data-ip-filter-search]": {
            "t-on-input": this.debounced(this.onSearch, 140),
        },
        "[data-ip-filter]": {
            "t-on-change": this.onFilterChange,
        },
        "[data-ip-sort]": {
            "t-on-change": (ev) => {
                this.state.sort = ev.currentTarget.value;
                this.apply();
            },
        },
        "[data-ip-view]": {
            "t-on-click": (ev) => this.setView(ev.currentTarget.dataset.ipView),
            "t-att-class": (el) => ({ "is-active": el.dataset.ipView === this.state.view }),
        },
        "[data-ip-filter-reset]": {
            "t-on-click": this.reset,
        },
        "[data-ip-dd] .ip-dd__btn": {
            "t-on-click": this.toggleDropdown,
        },
        "[data-ip-filter-active]": {
            "t-on-click": this.onActiveChipClick,
        },
        _document: {
            "t-on-click.noUpdate": this.onOutsideClick,
            "t-on-keydown.noUpdate": this.onKeydown,
        },
    };

    setup() {
        this.grid = this.el.querySelector("[data-ip-grid]");
        this.cards = [...this.el.querySelectorAll("[data-ip-grid] .ip-pcard")].map((el) => {
            let data = {};
            try {
                data = JSON.parse(el.dataset.ipProduct);
            } catch {
                data = {};
            }
            data.haystack = normalize([data.name, data.standard, data.categoryName, el.querySelector(".ip-pcard__code")?.textContent].join(" "));
            return { el, data };
        });
        this.labels = this.collectLabels();
        const params = new URLSearchParams(window.location.search);
        const list = (key) => new Set((params.get(key) || "").split(",").filter(Boolean));
        this.state = {
            category: parseInt(params.get("category") || this.el.dataset.activeCategory || "0", 10) || 0,
            q: params.get("q") || this.el.dataset.search || "",
            material: list("material"),
            finish: list("finish"),
            standard: list("standard"),
            size: list("size"),
            sort: params.get("sort") || "featured",
            view: this.readView(),
        };
        this.basePath = window.location.pathname;
    }

    start() {
        const search = this.el.querySelector("[data-ip-filter-search]");
        if (search) {
            search.value = this.state.q;
        }
        const sort = this.el.querySelector("[data-ip-sort]");
        if (sort) {
            sort.value = this.state.sort;
        }
        this.el.querySelectorAll("[data-ip-filter]").forEach((input) => {
            input.checked = this.state[input.dataset.ipFilter]?.has(input.value) || false;
        });
        this.observeSticky();
        this.apply({ animate: false, syncUrl: false });
    }

    destroy() {
        this.stickyObserver?.disconnect();
        this.sentinel?.remove();
        this.cards.forEach(({ el }) => {
            el.classList.remove("is-hidden", "is-entering");
            el.getAnimations?.().forEach((a) => a.cancel());
        });
        this.grid?.classList.remove("is-list");
    }

    readView() {
        try {
            return window.localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
        } catch {
            return "grid";
        }
    }

    collectLabels() {
        const labels = { material: {}, finish: {}, standard: {}, size: {} };
        this.el.querySelectorAll("[data-ip-filter]").forEach((input) => {
            const label = input.closest("label")?.querySelector(".ip-check__label, .mono");
            labels[input.dataset.ipFilter][input.value] = label ? label.textContent.trim() : input.value;
        });
        return labels;
    }

    observeSticky() {
        const bar = this.el.querySelector("[data-ip-filterbar]");
        if (!bar || !window.IntersectionObserver) {
            return;
        }
        this.sentinel = document.createElement("div");
        this.sentinel.style.cssText = "height:1px;margin-top:-1px;pointer-events:none;";
        bar.before(this.sentinel);
        this.stickyObserver = new IntersectionObserver(([entry]) => {
            bar.classList.toggle("is-stuck", !entry.isIntersecting && entry.boundingClientRect.top < 0);
        });
        this.stickyObserver.observe(this.sentinel);
    }

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------

    setCategory(id) {
        this.state.category = id;
        const chip = this.el.querySelector(`[data-ip-filter-category="${id}"]`);
        this.basePath = id && chip?.dataset.url ? chip.dataset.url : "/products";
        this.apply();
    }

    onSearch(ev) {
        this.state.q = ev.target.value.trim();
        this.apply();
    }

    onFilterChange(ev) {
        const input = ev.currentTarget;
        const set = this.state[input.dataset.ipFilter];
        if (input.checked) {
            set.add(input.value);
        } else {
            set.delete(input.value);
        }
        this.apply();
    }

    onActiveChipClick(ev) {
        const chip = ev.target.closest("[data-remove]");
        if (!chip) {
            return;
        }
        const [key, value] = chip.dataset.remove.split(":");
        if (key === "q") {
            this.state.q = "";
            const search = this.el.querySelector("[data-ip-filter-search]");
            if (search) {
                search.value = "";
            }
        } else {
            this.state[key].delete(value);
            const input = this.el.querySelector(`[data-ip-filter="${key}"][value="${CSS.escape(value)}"]`);
            if (input) {
                input.checked = false;
            }
        }
        this.apply();
    }

    setView(view) {
        this.state.view = view;
        try {
            window.localStorage.setItem(VIEW_KEY, view);
        } catch {
            // ignore
        }
        this.apply({ keepOrder: true });
    }

    reset() {
        this.state.q = "";
        ["material", "finish", "standard", "size"].forEach((k) => this.state[k].clear());
        this.state.category = 0;
        this.basePath = "/products";
        const search = this.el.querySelector("[data-ip-filter-search]");
        if (search) {
            search.value = "";
        }
        this.el.querySelectorAll("[data-ip-filter]").forEach((input) => (input.checked = false));
        this.apply();
    }

    toggleDropdown(ev) {
        const dd = ev.currentTarget.closest("[data-ip-dd]");
        const open = !dd.classList.contains("is-open");
        this.el.querySelectorAll("[data-ip-dd].is-open").forEach((el) => {
            el.classList.remove("is-open");
            el.querySelector(".ip-dd__btn").setAttribute("aria-expanded", "false");
        });
        dd.classList.toggle("is-open", open);
        ev.currentTarget.setAttribute("aria-expanded", String(open));
    }

    onOutsideClick(ev) {
        if (!ev.target.closest || ev.target.closest("[data-ip-dd]")) {
            return;
        }
        this.el.querySelectorAll("[data-ip-dd].is-open").forEach((el) => {
            el.classList.remove("is-open");
            el.querySelector(".ip-dd__btn").setAttribute("aria-expanded", "false");
        });
    }

    onKeydown(ev) {
        if (ev.key === "Escape") {
            this.onOutsideClick({ target: document.body });
        }
        const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
        if (ev.key === "/" && !typing) {
            ev.preventDefault();
            this.el.querySelector("[data-ip-filter-search]")?.focus();
        }
    }

    // ------------------------------------------------------------------
    // Filtering
    // ------------------------------------------------------------------

    matches({ data }) {
        const s = this.state;
        if (s.category && data.category !== s.category) {
            return false;
        }
        if (s.q) {
            const tokens = s.q.split(/\s+/).map(normalize).filter(Boolean);
            if (!tokens.every((t) => data.haystack.includes(t))) {
                return false;
            }
        }
        if (s.material.size && !(data.materials || []).some((id) => s.material.has(String(id)))) {
            return false;
        }
        if (s.finish.size && !(data.finishes || []).some((id) => s.finish.has(String(id)))) {
            return false;
        }
        if (s.standard.size) {
            const std = String(data.standard || "").toUpperCase();
            if (![...s.standard].some((fam) => std.includes(fam))) {
                return false;
            }
        }
        if (s.size.size) {
            const ok = [...s.size].some((v) => {
                const d = parseFloat(v);
                return data.sizeMax && d >= data.sizeMin && d <= data.sizeMax;
            });
            if (!ok) {
                return false;
            }
        }
        return true;
    }

    sorter() {
        const byName = (a, b) => a.data.name.localeCompare(b.data.name);
        switch (this.state.sort) {
            case "name":
                return byName;
            case "size-asc":
                return (a, b) => (a.data.sizeMin || 999) - (b.data.sizeMin || 999) || byName(a, b);
            case "size-desc":
                return (a, b) => (b.data.sizeMax || 0) - (a.data.sizeMax || 0) || byName(a, b);
            case "moq":
                return (a, b) => (a.data.moq || 0) - (b.data.moq || 0) || byName(a, b);
            default:
                return (a, b) => Number(b.data.featured) - Number(a.data.featured) || (a.data.sequence || 0) - (b.data.sequence || 0) || byName(a, b);
        }
    }

    apply({ animate = true, syncUrl = true, keepOrder = false } = {}) {
        const animated = animate && motionEnabled() && this.grid && this.grid.animate;
        const before = new Map();
        if (animated) {
            this.cards.forEach(({ el }) => {
                if (!el.classList.contains("is-hidden")) {
                    before.set(el, el.getBoundingClientRect());
                }
            });
        }

        const visible = this.cards.filter((c) => this.matches(c));
        const hidden = this.cards.filter((c) => !visible.includes(c));
        if (!keepOrder) {
            visible.sort(this.sorter());
        }
        this.grid.classList.toggle("is-list", this.state.view === "list");
        for (const card of [...visible, ...hidden]) {
            this.grid.appendChild(card.el);
        }
        hidden.forEach(({ el }) => el.classList.add("is-hidden"));
        visible.forEach(({ el }) => el.classList.remove("is-hidden"));

        if (animated && keepOrder) {
            // Layout switch: a clean cascade reads better than stretching cards.
            visible.forEach(({ el }, i) => {
                el.getAnimations().forEach((a) => a.cancel());
                el.animate(
                    [
                        { opacity: 0, transform: "translate3d(0, 24px, 0)" },
                        { opacity: 1, transform: "none" },
                    ],
                    { duration: 650, delay: Math.min(i, 10) * 40, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "backwards" }
                );
            });
        } else if (animated) {
            let entering = 0;
            visible.forEach(({ el }) => {
                el.getAnimations().forEach((a) => a.cancel());
                const first = before.get(el);
                if (!first) {
                    el.animate(
                        [
                            { opacity: 0, transform: "translate3d(0, 28px, 0) scale(0.97)" },
                            { opacity: 1, transform: "none" },
                        ],
                        { duration: 700, delay: Math.min(entering++, 8) * 45, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "backwards" }
                    );
                    return;
                }
                const last = el.getBoundingClientRect();
                const dx = first.left - last.left;
                const dy = first.top - last.top;
                const sx = first.width / (last.width || 1);
                if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 || Math.abs(sx - 1) > 0.01) {
                    el.animate(
                        [
                            { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${first.height / (last.height || 1)})`, transformOrigin: "0 0" },
                            { transform: "none", transformOrigin: "0 0" },
                        ],
                        { duration: 750, easing: "cubic-bezier(0.32, 0.72, 0, 1)" }
                    );
                }
            });
        }

        const count = this.el.querySelector("[data-ip-result-count]");
        if (count) {
            count.textContent = String(visible.length);
        }
        const empty = this.el.querySelector("[data-ip-empty]");
        if (empty) {
            empty.hidden = visible.length > 0;
        }
        this.renderActive();
        this.updateBadges();
        if (syncUrl) {
            this.syncUrl();
        }
    }

    renderActive() {
        const box = this.el.querySelector("[data-ip-filter-active]");
        if (!box) {
            return;
        }
        const chips = [];
        if (this.state.q) {
            chips.push(["q:", `“${this.state.q}”`]);
        }
        for (const key of ["material", "finish", "standard", "size"]) {
            for (const value of this.state[key]) {
                chips.push([`${key}:${value}`, this.labels[key][value] || value]);
            }
        }
        box.innerHTML = chips
            .map(
                ([remove, label]) =>
                    `<button type="button" class="ip-active-chip" data-remove="${escapeHtml(remove)}">${escapeHtml(label)}<svg class="ip-i"><use href="#ip-i-x"/></svg></button>`
            )
            .join("");
    }

    updateBadges() {
        this.el.querySelectorAll("[data-ip-dd]").forEach((dd) => {
            const key = dd.dataset.ipDdKey;
            const badge = dd.querySelector("[data-ip-dd-badge]");
            if (badge && this.state[key]) {
                badge.textContent = this.state[key].size ? String(this.state[key].size) : "";
            }
        });
    }

    syncUrl() {
        const params = new URLSearchParams();
        const s = this.state;
        if (s.q) {
            params.set("q", s.q);
        }
        for (const key of ["material", "finish", "standard", "size"]) {
            if (s[key].size) {
                params.set(key, [...s[key]].join(","));
            }
        }
        if (s.sort !== "featured") {
            params.set("sort", s.sort);
        }
        const qs = params.toString();
        history.replaceState(null, "", `${this.basePath}${qs ? `?${qs}` : ""}`);
    }
}

registry.category("public.interactions").add("pnsb_website.catalog", IpCatalog);
