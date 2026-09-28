import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { formatNumber } from "../core/motion";
import { COMPARE_MAX, basket, bus, compare, escapeHtml, toast } from "../core/store";

function readProduct(el) {
    const source = el.closest("[data-ip-product]") || (el.dataset.product ? el : null);
    const raw = source ? source.dataset.ipProduct || source.dataset.product : el.dataset.product;
    try {
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

/**
 * Quote basket drawer, header badge, quick-add buttons, compare toggles and
 * the floating compare tray. Shared by every page of the site.
 */
export class IpCommerce extends Interaction {
    static selector = ".ip-root";

    dynamicContent = {
        _document: {
            "t-on-click": this.onClick,
            "t-on-keydown": (ev) => ev.key === "Escape" && this.drawerOpen && this.closeDrawer(),
        },
        "[data-ip-basket]": {
            "t-att-class": () => ({ "is-open": this.drawerOpen, "is-empty": !basket.count() }),
            "t-att-aria-hidden": () => String(!this.drawerOpen),
        },
        "[data-ip-basket-count]": {
            "t-out": () => String(basket.count()),
        },
        "[data-ip-basket-label]": {
            "t-out": () => `${basket.count()} ${basket.count() === 1 ? "item" : "items"}`,
        },
        "[data-ip-basket-total]": {
            "t-out": () => formatNumber(basket.totalQty()),
        },
        ".ip-nav__basket": {
            "t-att-class": () => ({ "has-items": basket.count() > 0 }),
        },
        "[data-ip-compare-tray]": {
            "t-att-class": () => ({ "is-visible": compare.items().length > 0 && !this.onComparePage }),
        },
        "[data-ip-compare-count]": {
            "t-out": () => String(compare.items().length),
        },
        "[data-ip-compare-go]": {
            "t-att-href": () => compare.url(),
        },
        "[data-ip-basket-list]": {
            "t-on-change": this.onListChange,
        },
    };

    setup() {
        this.drawerOpen = false;
        // The tray is pointless on the compare page and would cover the RFQ form.
        this.onComparePage = !!this.el.querySelector("[data-ip-compare-page], [data-ip-rfq]");
        this.list = this.el.querySelector("[data-ip-basket-list]");
        this.trayItems = this.el.querySelector("[data-ip-compare-items]");
        this.onBasket = () => {
            this.renderBasket();
            this.updateContent();
        };
        this.onCompare = () => {
            this.renderCompare();
            this.updateContent();
        };
    }

    start() {
        bus.addEventListener("basket", this.onBasket);
        bus.addEventListener("compare", this.onCompare);
        this.renderBasket();
        this.renderCompare();
    }

    destroy() {
        bus.removeEventListener("basket", this.onBasket);
        bus.removeEventListener("compare", this.onCompare);
        document.documentElement.classList.remove("ip-locked");
        this.el.querySelectorAll("[data-ip-compare-toggle].is-active").forEach((b) => b.classList.remove("is-active"));
    }

    // ------------------------------------------------------------------
    // Clicks (delegated)
    // ------------------------------------------------------------------

    onClick(ev) {
        const t = ev.target;
        if (!t.closest) {
            return;
        }
        if (t.closest("[data-ip-basket-open]")) {
            ev.preventDefault();
            this.openDrawer();
            return;
        }
        if (t.closest("[data-ip-basket-close]")) {
            this.closeDrawer();
            return;
        }
        const quick = t.closest("[data-ip-quick-add]");
        if (quick) {
            ev.preventDefault();
            this.quickAdd(quick);
            return;
        }
        const cmp = t.closest("[data-ip-compare-toggle]");
        if (cmp) {
            ev.preventDefault();
            this.toggleCompare(cmp);
            return;
        }
        if (t.closest("[data-ip-compare-clear]")) {
            compare.clear();
            return;
        }
        const step = t.closest("[data-ip-bitem-step]");
        if (step) {
            const row = step.closest("[data-uid]");
            const item = basket.items().find((i) => i.uid === row.dataset.uid);
            if (item) {
                const moq = Math.max(1, parseInt(item.moq || 0, 10) || 100);
                const inc = Math.max(1, Math.round(moq / 5 / 50) * 50) || 50;
                const next = Math.max(1, (parseInt(item.qty, 10) || 0) + inc * parseInt(step.dataset.ipBitemStep, 10));
                basket.update(item.uid, { qty: next });
            }
            return;
        }
        const remove = t.closest("[data-ip-bitem-remove]");
        if (remove) {
            const row = remove.closest("[data-uid]");
            row.classList.add("is-removing");
            setTimeout(() => basket.remove(row.dataset.uid), 380);
        }
    }

    onListChange(ev) {
        const input = ev.target.closest("[data-ip-bitem-qty]");
        if (!input) {
            return;
        }
        const row = input.closest("[data-uid]");
        const qty = Math.max(1, parseInt(String(input.value).replace(/[^\d]/g, ""), 10) || 1);
        basket.update(row.dataset.uid, { qty });
    }

    quickAdd(button) {
        const product = readProduct(button);
        if (!product) {
            return;
        }
        basket.add({
            productId: product.id,
            name: product.name,
            image: product.image,
            url: product.url,
            moq: product.moq,
            size: "",
            length: "",
            material: "",
            finish: "",
            qty: product.moq || 100,
        });
        button.classList.add("is-active");
        const label = button.querySelector("span");
        const previous = label ? label.textContent : "";
        if (label) {
            label.textContent = "Added";
        }
        setTimeout(() => {
            button.classList.remove("is-active");
            if (label) {
                label.textContent = previous;
            }
        }, 1600);
        this.bumpBasket();
        toast({
            title: product.name,
            text: "Added to your quote basket",
            image: product.image,
            href: "/quote",
            action: "Review",
        });
    }

    toggleCompare(button) {
        const product = readProduct(button) || { id: parseInt(button.dataset.productId, 10) };
        if (!product || !product.id) {
            return;
        }
        const result = compare.toggle(product);
        if (result === "full") {
            toast({ title: "Comparison is full", text: `You can compare up to ${COMPARE_MAX} products.`, icon: "compare" });
        }
    }

    bumpBasket() {
        const btn = this.el.querySelector(".ip-nav__basket");
        if (!btn) {
            return;
        }
        btn.classList.remove("is-bump");
        void btn.offsetWidth;
        btn.classList.add("is-bump");
    }

    // ------------------------------------------------------------------
    // Drawer
    // ------------------------------------------------------------------

    openDrawer() {
        this.drawerOpen = true;
        document.documentElement.classList.add("ip-locked");
        this.updateContent();
    }

    closeDrawer() {
        this.drawerOpen = false;
        if (!document.querySelector(".ip-menu.is-open")) {
            document.documentElement.classList.remove("ip-locked");
        }
        this.updateContent();
    }

    renderBasket() {
        if (!this.list) {
            return;
        }
        const items = basket.items();
        this.list.innerHTML = items
            .map((item) => {
                const spec = [item.size, item.length && `${item.length} mm`, item.material, item.finish]
                    .filter(Boolean)
                    .map(escapeHtml)
                    .join(" · ");
                const image = item.image
                    ? `<img src="${escapeHtml(item.image)}" alt=""/>`
                    : `<span class="ip-ritem__custom-icon"><svg class="ip-i"><use href="#ip-i-ruler"/></svg></span>`;
                return `
                <div class="ip-bitem" data-uid="${escapeHtml(item.uid)}">
                    ${image}
                    <div>
                        ${item.url ? `<a class="ip-bitem__name" href="${escapeHtml(item.url)}">${escapeHtml(item.name)}</a>` : `<span class="ip-bitem__name">${escapeHtml(item.name)}</span>`}
                        <span class="ip-bitem__spec mono">${spec || "Specification to confirm"}</span>
                    </div>
                    <div class="ip-bitem__side">
                        <div class="ip-bitem__qty">
                            <button type="button" data-ip-bitem-step="-1" aria-label="Decrease"><svg class="ip-i"><use href="#ip-i-minus"/></svg></button>
                            <input type="text" inputmode="numeric" data-ip-bitem-qty="" value="${escapeHtml(formatNumber(item.qty || 0))}" aria-label="Quantity"/>
                            <button type="button" data-ip-bitem-step="1" aria-label="Increase"><svg class="ip-i"><use href="#ip-i-plus"/></svg></button>
                        </div>
                        <button type="button" class="ip-bitem__remove mono" data-ip-bitem-remove="">Remove</button>
                    </div>
                </div>`;
            })
            .join("");
    }

    // ------------------------------------------------------------------
    // Compare tray
    // ------------------------------------------------------------------

    renderCompare() {
        const items = compare.items();
        if (this.trayItems) {
            this.trayItems.innerHTML = items
                .map((i) => `<img src="${escapeHtml(i.image || "")}" alt="${escapeHtml(i.name || "")}" title="${escapeHtml(i.name || "")}"/>`)
                .join("");
        }
        const ids = new Set(items.map((i) => i.id));
        this.el.querySelectorAll("[data-ip-compare-toggle]").forEach((b) => {
            b.classList.toggle("is-active", ids.has(parseInt(b.dataset.productId, 10)));
        });
    }
}

registry.category("public.interactions").add("pnsb_website.commerce", IpCommerce);
