/**
 * Client-side stores for the quote basket and the comparison list.
 * Persisted in localStorage and synchronised between tabs.
 */

const BASKET_KEY = "ip_quote_basket_v1";
const COMPARE_KEY = "ip_compare_v1";
export const COMPARE_MAX = 4;

export const bus = new EventTarget();

function read(key, fallback) {
    try {
        const value = JSON.parse(window.localStorage.getItem(key));
        return value === null || value === undefined ? fallback : value;
    } catch {
        return fallback;
    }
}

function write(key, value) {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Private mode / storage disabled: keep working in memory for this page.
    }
}

function emit(name, detail) {
    bus.dispatchEvent(new CustomEvent(name, { detail }));
}

window.addEventListener("storage", (ev) => {
    if (ev.key === BASKET_KEY) {
        memoryBasket = null;
        emit("basket");
    } else if (ev.key === COMPARE_KEY) {
        memoryCompare = null;
        emit("compare");
    }
});

let memoryBasket = null;
let memoryCompare = null;

const uid = () => Math.random().toString(36).slice(2, 10);

export const basket = {
    items() {
        if (!memoryBasket) {
            memoryBasket = read(BASKET_KEY, []);
            if (!Array.isArray(memoryBasket)) {
                memoryBasket = [];
            }
        }
        return memoryBasket;
    },
    save(items) {
        memoryBasket = items;
        write(BASKET_KEY, items);
        emit("basket");
    },
    add(item) {
        const items = this.items().slice();
        const key = [item.productId || "", item.name, item.size, item.length, item.material, item.finish].join("|");
        const existing = items.find((i) => i.key === key && item.productId);
        if (existing) {
            existing.qty = (Number(existing.qty) || 0) + (Number(item.qty) || 1);
        } else {
            items.push({ uid: uid(), key, qty: 1, ...item });
        }
        this.save(items);
        return existing || items[items.length - 1];
    },
    update(id, patch) {
        const items = this.items().map((i) => (i.uid === id ? { ...i, ...patch } : i));
        this.save(items);
    },
    remove(id) {
        this.save(this.items().filter((i) => i.uid !== id));
    },
    clear() {
        this.save([]);
    },
    count() {
        return this.items().length;
    },
    totalQty() {
        return this.items().reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
    },
};

export const compare = {
    items() {
        if (!memoryCompare) {
            memoryCompare = read(COMPARE_KEY, []);
            if (!Array.isArray(memoryCompare)) {
                memoryCompare = [];
            }
        }
        return memoryCompare;
    },
    save(items) {
        memoryCompare = items;
        write(COMPARE_KEY, items);
        emit("compare");
    },
    has(id) {
        return this.items().some((i) => i.id === id);
    },
    /** Returns "added", "removed" or "full". */
    toggle(item) {
        if (this.has(item.id)) {
            this.remove(item.id);
            return "removed";
        }
        const items = this.items();
        if (items.length >= COMPARE_MAX) {
            return "full";
        }
        this.save([...items, { id: item.id, name: item.name, image: item.image, url: item.url }]);
        return "added";
    },
    remove(id) {
        this.save(this.items().filter((i) => i.id !== id));
    },
    clear() {
        this.save([]);
    },
    url() {
        return "/products/compare?ids=" + this.items().map((i) => i.id).join(",");
    },
};

/** Show a toast: { title, text, image } */
export function toast(detail) {
    emit("toast", detail);
}

export function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
