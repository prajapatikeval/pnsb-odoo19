import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";
import { getScrollingElement, getScrollingTarget } from "@web/core/utils/scrolling";

const interactions = registry.category("public.interactions");

// ---------------------------------------------------------------------------
// Enquiry list (localStorage, synchronised between tabs)
// ---------------------------------------------------------------------------
const STORE_KEY = "pnsb_enquiry_v1";
const MAX_ITEMS = 40;
const bus = new EventTarget();
let memory = null;

const enquiry = {
    items() {
        if (!memory) {
            try {
                memory = JSON.parse(window.localStorage.getItem(STORE_KEY)) || [];
            } catch {
                memory = [];
            }
            if (!Array.isArray(memory)) {
                memory = [];
            }
        }
        return memory;
    },
    save(items) {
        memory = items.slice(0, MAX_ITEMS);
        try {
            window.localStorage.setItem(STORE_KEY, JSON.stringify(memory));
        } catch {
            // Storage disabled: keep the list in memory for this page.
        }
        bus.dispatchEvent(new Event("change"));
    },
    has(id) {
        return this.items().some((item) => item.id === id);
    },
    add(product) {
        const items = this.items().filter((item) => item.id !== product.id);
        const existing = this.items().find((item) => item.id === product.id);
        items.push({ ...product, qty: existing ? existing.qty : 1 });
        this.save(items);
    },
    remove(id) {
        this.save(this.items().filter((item) => item.id !== id));
    },
    setQty(id, qty) {
        const value = Math.max(1, Math.min(1000000, parseInt(qty, 10) || 1));
        this.save(this.items().map((item) => (item.id === id ? { ...item, qty: value } : item)));
    },
    clear() {
        this.save([]);
    },
    count() {
        return this.items().length;
    },
};

window.addEventListener("storage", (ev) => {
    if (ev.key === STORE_KEY) {
        memory = null;
        bus.dispatchEvent(new Event("change"));
    }
});

function motionAllowed() {
    return document.documentElement.classList.contains("pn-motion");
}

// ---------------------------------------------------------------------------
// Site chrome: header state, mobile menu, enquiry badge, add buttons, toast
// ---------------------------------------------------------------------------
export class PnsbChrome extends Interaction {
    static selector = ".pn-root";
    dynamicContent = {
        "[data-pnsb-menu-toggle]": {
            "t-on-click": this.toggleMenu,
            "t-att-aria-expanded": () => String(this.menuOpen),
        },
        "[data-pnsb-menu] a": { "t-on-click": this.closeMenu },
        "[data-pnsb-add]": {
            "t-on-click.prevent": this.onAdd,
            "t-att-class": (el) => ({ "is-added": enquiry.has(parseInt(el.dataset.id, 10)) }),
        },
        "[data-pnsb-add] span": {
            "t-out": (el) =>
                enquiry.has(parseInt(el.closest("[data-pnsb-add]").dataset.id, 10))
                    ? "Added to enquiry"
                    : "Add to enquiry",
        },
        "[data-pnsb-basket-link]": {
            "t-att-class": () => ({ "has-items": enquiry.count() > 0, "is-bump": this.bump }),
        },
        "[data-pnsb-basket-count]": { "t-out": () => String(enquiry.count()) },
        "[data-pnsb-header]": { "t-att-class": () => ({ "is-scrolled": this.scrolled }) },
        "[data-pnsb-totop]": {
            "t-on-click": this.scrollToTop,
            "t-att-class": () => ({ "is-visible": this.showTop }),
        },
        _document: { "t-on-keydown.noUpdate": this.onKeydown },
    };

    setup() {
        this.menuOpen = false;
        this.scrolled = false;
        this.showTop = false;
        this.bump = false;
        this.onStoreChange = () => {
            if (this.isReady && !this.isDestroyed) {
                this.updateContent();
            }
        };
        bus.addEventListener("change", this.onStoreChange);
    }

    start() {
        this.scroller = getScrollingElement(document);
        const target = getScrollingTarget(this.scroller);
        this.addListener(target, "scroll.noUpdate", this.onScroll, { passive: true });
        this.onScroll();
    }

    destroy() {
        bus.removeEventListener("change", this.onStoreChange);
        document.documentElement.classList.remove("pn-menu-open");
    }

    onScroll() {
        const y = this.scroller.scrollTop || window.scrollY || 0;
        const scrolled = y > 8;
        const showTop = y > 700;
        if (scrolled !== this.scrolled || showTop !== this.showTop) {
            this.scrolled = scrolled;
            this.showTop = showTop;
            this.updateContent();
        }
    }

    scrollToTop() {
        const smooth = motionAllowed();
        this.scroller.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
        if (this.scroller !== document.scrollingElement) {
            window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
        }
    }

    toggleMenu() {
        this.menuOpen = !this.menuOpen;
        document.documentElement.classList.toggle("pn-menu-open", this.menuOpen);
    }

    closeMenu() {
        this.menuOpen = false;
        document.documentElement.classList.remove("pn-menu-open");
    }

    onKeydown(ev) {
        if (ev.key === "Escape" && this.menuOpen) {
            this.closeMenu();
            this.updateContent();
        }
    }

    onAdd(ev) {
        const btn = ev.currentTarget;
        const id = parseInt(btn.dataset.id, 10);
        if (!id) {
            return;
        }
        if (enquiry.has(id)) {
            enquiry.remove(id);
            this.toast(`${btn.dataset.name} removed from your enquiry.`);
            return;
        }
        enquiry.add({ id, name: btn.dataset.name || "", image: btn.dataset.image || "" });
        this.bump = true;
        this.waitForTimeout(() => {
            this.bump = false;
            this.updateContent();
        }, 600);
        this.toast(`${btn.dataset.name} added to your enquiry.`, true);
    }

    toast(message, withLink = false) {
        const el = this.el.querySelector("[data-pnsb-toast]");
        if (!el) {
            return;
        }
        el.textContent = message;
        if (withLink) {
            const link = document.createElement("a");
            link.href = "/contact#enquiry";
            link.textContent = "View enquiry";
            el.appendChild(link);
        }
        el.classList.add("is-visible");
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove("is-visible"), 3200);
        this.registerCleanup(() => clearTimeout(this.toastTimer));
    }
}
interactions.add("pnsb_website.chrome", PnsbChrome);

// ---------------------------------------------------------------------------
// Products page: line filter + search (client side, URL kept in sync)
// ---------------------------------------------------------------------------
export class PnsbCatalog extends Interaction {
    static selector = "[data-pnsb-catalog]";
    dynamicContent = {
        "[data-pnsb-filter]": {
            "t-on-click": (ev) => this.setLine(ev.currentTarget.dataset.pnsbFilter),
            "t-att-class": (el) => ({ "is-active": el.dataset.pnsbFilter === this.line }),
            "t-att-aria-selected": (el) => String(el.dataset.pnsbFilter === this.line),
        },
        "[data-pnsb-filter-select]": {
            "t-on-change": (ev) => this.setLine(ev.currentTarget.value),
            "t-att-value": () => this.line,
        },
        "[data-pnsb-search]": { "t-on-input": this.onSearch },
        "[data-pnsb-intro]": { "t-att-hidden": (el) => el.dataset.pnsbIntro !== this.line },
        ".pn-product": { "t-att-class": (el) => ({ "is-filtered": !this.matches(el) }) },
        "[data-pnsb-empty]": { "t-att-hidden": () => this.visibleCount() > 0 },
        "[data-pnsb-count]": { "t-out": () => String(this.visibleCount()) },
    };

    setup() {
        const active = this.el.querySelector("[data-pnsb-filter].is-active");
        this.line = active ? active.dataset.pnsbFilter : "all";
        this.query = "";
    }

    matches(el) {
        if (this.line !== "all" && el.dataset.line !== this.line) {
            return false;
        }
        return !this.query || (el.dataset.search || "").includes(this.query);
    }

    visibleCount() {
        return [...this.el.querySelectorAll(".pn-product")].filter((el) => this.matches(el)).length;
    }

    showAll() {
        // Reveal-on-scroll must not keep newly shown cards invisible.
        this.el.querySelectorAll(".pn-product").forEach((el) => el.classList.add("pn-shown"));
    }

    setLine(line) {
        this.line = line || "all";
        this.showAll();
        const url = new URL(window.location.href);
        if (this.line === "all") {
            url.searchParams.delete("line");
        } else {
            url.searchParams.set("line", this.line);
        }
        window.history.replaceState(window.history.state, "", url);
    }

    onSearch(ev) {
        this.query = ev.currentTarget.value.trim().toLowerCase();
        this.showAll();
    }
}
interactions.add("pnsb_website.catalog", PnsbCatalog);

// ---------------------------------------------------------------------------
// Contact page: enquiry items, file list, validation and AJAX submission
// ---------------------------------------------------------------------------
const MAX_FILES = 5;
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED = /\.(pdf|dwg|dxf|step|stp|igs|iges|stl|png|jpe?g|webp|zip|xlsx?|csv|docx)$/i;

function formatSize(bytes) {
    return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

export class PnsbEnquiryForm extends Interaction {
    static selector = "[data-pnsb-enquiry]";
    dynamicContent = {
        _root: { "t-on-submit.prevent": this.onSubmit },
        "[data-pnsb-enquiry-list]": { "t-att-hidden": () => !enquiry.count() || this.done },
        "[data-pnsb-enquiry-hint]": { "t-att-hidden": () => enquiry.count() > 0 },
        "[data-pnsb-files]": { "t-on-change": this.onFiles },
        "[data-pnsb-drop]": {
            "t-on-dragenter": () => (this.dragOver = true),
            "t-on-dragleave": () => (this.dragOver = false),
            "t-on-drop": () => (this.dragOver = false),
            "t-att-class": () => ({ "is-over": this.dragOver }),
        },
        "[data-pnsb-drop-label]": {
            "t-out": () =>
                this.files.length
                    ? `${this.files.length} file${this.files.length > 1 ? "s" : ""} selected`
                    : "Choose files or drop them here",
        },
        "[data-pnsb-submit]": { "t-att-disabled": () => (this.busy ? "disabled" : false) },
        "[data-pnsb-submit] span": { "t-out": () => (this.busy ? "Sending…" : "Send enquiry") },
        "[data-pnsb-error]": {
            "t-att-hidden": () => !this.error && !this.serverError,
            "t-out": () => this.error || this.serverError,
        },
        "[data-pnsb-done]": { "t-att-hidden": () => !this.done },
        "[data-pnsb-form-body]": { "t-att-hidden": () => this.done },
        "[data-pnsb-ref]": { "t-out": () => this.reference || "-" },
    };

    setup() {
        this.busy = false;
        this.done = false;
        this.error = "";
        const serverError = this.el.querySelector("[data-pnsb-error]");
        this.serverError = serverError ? serverError.textContent.trim() : "";
        this.reference = "";
        this.files = [];
        this.dragOver = false;
        this.list = this.el.querySelector("[data-pnsb-enquiry-items]");
        this.onStoreChange = () => {
            this.renderItems();
            if (this.isReady && !this.isDestroyed) {
                this.updateContent();
            }
        };
        bus.addEventListener("change", this.onStoreChange);
    }

    start() {
        this.renderItems();
        if (window.location.hash === "#enquiry" && enquiry.count()) {
            this.el.querySelector("input[name='name']")?.focus({ preventScroll: true });
        }
    }

    destroy() {
        bus.removeEventListener("change", this.onStoreChange);
        if (this.list) {
            this.list.replaceChildren();
        }
    }

    renderItems() {
        if (!this.list) {
            return;
        }
        const icon = (name) => {
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("class", "pn-i");
            const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
            use.setAttribute("href", `#pn-i-${name}`);
            svg.appendChild(use);
            return svg;
        };
        const rows = enquiry.items().map((item) => {
            const li = document.createElement("li");
            const img = document.createElement("img");
            img.src = item.image || "/web/static/img/placeholder.png";
            img.alt = "";
            img.loading = "lazy";
            const name = document.createElement("span");
            name.className = "pn-enq__name";
            name.textContent = item.name;

            const qty = document.createElement("div");
            qty.className = "pn-qty";
            const minus = document.createElement("button");
            minus.type = "button";
            minus.setAttribute("aria-label", "Decrease quantity");
            minus.appendChild(icon("minus"));
            minus.addEventListener("click", () => enquiry.setQty(item.id, (item.qty || 1) - 1));
            const input = document.createElement("input");
            input.type = "number";
            input.min = "1";
            input.value = String(item.qty || 1);
            input.setAttribute("aria-label", `Quantity for ${item.name}`);
            input.addEventListener("change", () => enquiry.setQty(item.id, input.value));
            const plus = document.createElement("button");
            plus.type = "button";
            plus.setAttribute("aria-label", "Increase quantity");
            plus.appendChild(icon("plus"));
            plus.addEventListener("click", () => enquiry.setQty(item.id, (item.qty || 1) + 1));
            qty.append(minus, input, plus);

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "pn-enq__remove";
            remove.setAttribute("aria-label", `Remove ${item.name}`);
            remove.appendChild(icon("x"));
            remove.addEventListener("click", () => enquiry.remove(item.id));

            li.append(img, name, qty, remove);
            return li;
        });
        this.list.replaceChildren(...rows);
    }

    onFiles(ev) {
        const listEl = this.el.querySelector("[data-pnsb-file-list]");
        this.files = [...ev.currentTarget.files].map((file) => {
            let problem = "";
            if (!ALLOWED.test(file.name)) {
                problem = "file type not accepted";
            } else if (file.size > MAX_FILE_SIZE) {
                problem = "larger than 15 MB";
            }
            return { file, problem };
        });
        this.files.slice(MAX_FILES).forEach((f) => (f.problem = f.problem || `only ${MAX_FILES} files are sent`));
        const rows = this.files.map(({ file, problem }) => {
            const li = document.createElement("li");
            li.className = problem ? "is-rejected" : "";
            li.textContent = problem ? `${file.name} (${problem})` : file.name;
            const size = document.createElement("small");
            size.textContent = formatSize(file.size);
            li.appendChild(size);
            return li;
        });
        listEl?.replaceChildren(...rows);
    }

    validate() {
        this.el.querySelectorAll(".is-invalid").forEach((el) => el.classList.remove("is-invalid"));
        const name = this.el.querySelector("input[name='name']");
        const email = this.el.querySelector("input[name='email']");
        const message = this.el.querySelector("textarea[name='message']");
        const invalid = [];
        if (!name.value.trim()) {
            invalid.push(name);
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
            invalid.push(email);
        }
        if (invalid.length) {
            invalid.forEach((el) => el.classList.add("is-invalid"));
            invalid[0].focus();
            return "Please enter your name and a valid e-mail address.";
        }
        if (!enquiry.count() && !message.value.trim()) {
            message.classList.add("is-invalid");
            message.focus();
            return "Please tell us a little about your requirement, or add products to your enquiry.";
        }
        return "";
    }

    async onSubmit() {
        if (this.busy) {
            return;
        }
        this.serverError = "";
        this.error = this.validate();
        if (this.error) {
            return;
        }
        const data = new FormData();
        for (const el of this.el.elements) {
            if (el.name && el.type !== "file" && el.name !== "items") {
                data.append(el.name, el.value);
            }
        }
        data.set(
            "items",
            JSON.stringify(enquiry.items().map((item) => ({ id: item.id, qty: item.qty || 1 })))
        );
        this.files
            .filter(({ problem }) => !problem)
            .forEach(({ file }) => data.append("attachments", file, file.name));

        this.busy = true;
        this.updateContent();
        try {
            const response = await this.waitFor(
                fetch(this.el.getAttribute("action"), {
                    method: "POST",
                    body: data,
                    credentials: "same-origin",
                    headers: { Accept: "application/json" },
                })
            );
            const result = await this.waitFor(response.json().catch(() => ({ ok: false })));
            if (!response.ok || !result.ok) {
                this.error = result.error || "Something went wrong. Please try again or call us.";
                return;
            }
            this.reference = result.reference;
            this.done = true;
            enquiry.clear();
            this.el.scrollIntoView({ behavior: motionAllowed() ? "smooth" : "auto", block: "start" });
        } catch {
            this.error = "We could not send your enquiry. Please check your connection and try again.";
        } finally {
            this.busy = false;
        }
    }
}
interactions.add("pnsb_website.enquiry_form", PnsbEnquiryForm);

// ---------------------------------------------------------------------------
// Scroll-linked effects (ported from the previous PNSB site): one shared rAF
// ticker; positions come from getBoundingClientRect so they work whichever
// element Odoo uses as the scroller.
// ---------------------------------------------------------------------------
const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));

const ticker = {
    subs: new Set(),
    running: false,
    lastY: 0,
    lastT: 0,
    subscribe(fn) {
        this.subs.add(fn);
        if (!this.running) {
            this.running = true;
            this.lastT = performance.now();
            this.lastY = this.scrollY();
            requestAnimationFrame((t) => this.tick(t));
        }
        return () => this.subs.delete(fn);
    },
    scrollY() {
        const el = getScrollingElement(document);
        return el.scrollTop || window.scrollY || 0;
    },
    tick(t) {
        if (!this.subs.size) {
            this.running = false;
            return;
        }
        const dt = Math.min(64, t - this.lastT || 16);
        const y = this.scrollY();
        const state = { y, vy: (y - this.lastY) / (dt / 16), dt, vh: window.innerHeight };
        this.lastT = t;
        this.lastY = y;
        this.subs.forEach((fn) => fn(state));
        requestAnimationFrame((time) => this.tick(time));
    },
};

function textNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => (node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
    });
    const nodes = [];
    while (walker.nextNode()) {
        nodes.push(walker.currentNode);
    }
    return nodes;
}

/** Wrap every word (keeping inline elements like <em>), remembering the original markup. */
function splitWords(el, wrap) {
    if (el.__pnsbHTML === undefined) {
        el.__pnsbHTML = el.innerHTML;
    }
    let index = 0;
    for (const node of textNodes(el)) {
        const fragment = document.createDocumentFragment();
        for (const part of node.nodeValue.split(/(\s+)/)) {
            if (!part) {
                continue;
            }
            fragment.appendChild(/^\s+$/.test(part) ? document.createTextNode(part) : wrap(part, index++));
        }
        node.parentNode.replaceChild(fragment, node);
    }
    return index;
}

function restoreWords(el) {
    if (el.__pnsbHTML !== undefined) {
        el.innerHTML = el.__pnsbHTML;
        delete el.__pnsbHTML;
    }
}

/** Statement paragraph whose words fill in as it scrolls through the viewport. */
export class PnsbWordFill extends Interaction {
    static selector = "[data-pnsb-words]";

    start() {
        if (!motionAllowed()) {
            return;
        }
        this.words = [];
        splitWords(this.el, (word) => {
            const span = document.createElement("span");
            span.className = "pn-word";
            span.textContent = word;
            this.words.push(span);
            return span;
        });
        this.el.classList.add("pn-words");
        this.last = -1;
        this.unsubscribe = ticker.subscribe(({ vh }) => {
            const rect = this.el.getBoundingClientRect();
            if (rect.bottom < -50 || rect.top > vh + 50) {
                return;
            }
            const p = clamp((vh * 0.85 - rect.top) / (rect.height + vh * 0.35));
            if (Math.abs(p - this.last) < 0.002) {
                return;
            }
            this.last = p;
            const n = this.words.length;
            this.words.forEach((w, i) => w.style.setProperty("--o", (0.16 + 0.84 * clamp(p * n * 1.15 - i)).toFixed(3)));
        });
    }

    destroy() {
        this.unsubscribe?.();
        this.el.classList.remove("pn-words");
        restoreWords(this.el);
    }
}
interactions.add("pnsb_website.word_fill", PnsbWordFill);

/**
 * Recent developments: the image column is sticky and wipes to the project
 * whose text is in the middle of the viewport. The page scrolls normally.
 */
export class PnsbCases extends Interaction {
    static selector = "[data-pnsb-cases]";

    start() {
        this.items = [...this.el.querySelectorAll("[data-pnsb-case]")];
        this.images = [...this.el.querySelectorAll(".pn-cases__img")];
        this.counter = this.el.querySelector("[data-pnsb-case-index]");
        this.caseName = this.el.querySelector("[data-pnsb-case-name]");
        this.active = 0;
        if (!window.IntersectionObserver || this.items.length < 2) {
            return;
        }
        this.io = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    this.activate(this.items.indexOf(entry.target));
                }
            }
        }, { rootMargin: "-45% 0px -45% 0px" });
        this.items.forEach((item) => this.io.observe(item));
    }

    activate(index) {
        if (index < 0 || index === this.active) {
            return;
        }
        const previous = this.images[this.active];
        this.images.forEach((img) => img.classList.remove("is-prev"));
        previous?.classList.remove("is-active");
        previous?.classList.add("is-prev");
        this.images[index]?.classList.add("is-active");
        this.items.forEach((item, i) => item.classList.toggle("is-active", i === index));
        if (this.counter) {
            this.counter.textContent = String(index + 1).padStart(2, "0");
        }
        if (this.caseName) {
            this.caseName.textContent = this.images[index]?.alt || "";
        }
        this.active = index;
    }

    destroy() {
        this.io?.disconnect();
        this.images?.forEach((img, i) => {
            img.classList.remove("is-prev");
            img.classList.toggle("is-active", i === 0);
        });
        this.items?.forEach((item, i) => item.classList.toggle("is-active", i === 0));
        if (this.counter) {
            this.counter.textContent = "01";
        }
    }
}
interactions.add("pnsb_website.cases", PnsbCases);


