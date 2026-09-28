import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import {
    clamp,
    easeInOutSine,
    formatNumber,
    lerp,
    motion,
    motionEnabled,
    pageTop,
    tween,
} from "../core/motion";
import { resetPrism, setPrismMetal, shadePrism } from "../core/prism";

const interactions = registry.category("public.interactions");

// -----------------------------------------------------------------------------
// Pinned horizontal category rail
// -----------------------------------------------------------------------------
export class IpHScroll extends Interaction {
    static selector = "[data-ip-hscroll]";

    setup() {
        this.track = this.el.querySelector("[data-ip-hscroll-track]");
        this.viewport = this.el.querySelector(".ip-rail__viewport");
        this.bar = this.el.querySelector("[data-ip-hscroll-bar]");
        this.index = this.el.querySelector("[data-ip-hscroll-index]");
        this.count = this.track ? this.track.children.length : 0;
        this.pinned = false;
        this.dist = 0;
        this.top = 0;
        this.last = -1;
    }

    start() {
        if (!this.track) {
            return;
        }
        this.measure();
        this.unlayout = motion.onLayout(() => this.measure());
        this.unsubscribe = motion.subscribe((state) => this.update(state));
        this.onNativeScroll = () => this.setProgress(
            this.viewport.scrollLeft / Math.max(1, this.viewport.scrollWidth - this.viewport.clientWidth));
        this.viewport.addEventListener("scroll", this.onNativeScroll, { passive: true });
    }

    measure() {
        const wide = window.innerWidth >= 992 && motionEnabled();
        this.el.classList.toggle("is-pinned", wide);
        this.pinned = wide;
        this.track.style.transform = "";
        if (!wide) {
            this.el.style.height = "";
            return;
        }
        const vw = this.el.clientWidth;
        this.dist = Math.max(0, this.track.scrollWidth - vw);
        this.el.style.height = `${this.dist + window.innerHeight}px`;
        this.top = pageTop(this.el);
        this.last = -1;
    }

    update({ y }) {
        if (!this.pinned) {
            return;
        }
        const p = this.dist ? clamp((y - this.top) / this.dist) : 0;
        if (Math.abs(p - this.last) < 0.0002) {
            return;
        }
        this.last = p;
        this.track.style.transform = `translate3d(${(-p * this.dist).toFixed(1)}px, 0, 0)`;
        this.setProgress(p);
    }

    setProgress(p) {
        this.bar?.style.setProperty("--p", p.toFixed(4));
        if (this.index && this.count) {
            const i = Math.min(this.count, Math.floor(p * (this.count - 1) + 1.5));
            const text = String(i).padStart(2, "0");
            if (this.index.textContent !== text) {
                this.index.textContent = text;
            }
        }
    }

    destroy() {
        this.unsubscribe?.();
        this.unlayout?.();
        this.viewport?.removeEventListener("scroll", this.onNativeScroll);
        this.el.classList.remove("is-pinned");
        this.el.style.removeProperty("height");
        this.track?.style.removeProperty("transform");
        this.bar?.style.removeProperty("--p");
    }
}
interactions.add("pnsb_website.hscroll", IpHScroll);

// -----------------------------------------------------------------------------
// Stacking sticky cards
// -----------------------------------------------------------------------------
export class IpStack extends Interaction {
    static selector = "[data-ip-stack]";

    setup() {
        this.cards = [...this.el.querySelectorAll(".ip-stack__card")];
        this.items = [];
    }

    start() {
        if (!motionEnabled() || this.cards.length < 2) {
            return;
        }
        this.measure();
        this.unlayout = motion.onLayout(() => this.measure());
        this.unsubscribe = motion.subscribe((state) => this.update(state));
    }

    measure() {
        let top = pageTop(this.el);
        this.items = this.cards.map((card) => {
            const style = getComputedStyle(card);
            const stickTop = parseFloat(style.top) || 0;
            const item = { card, start: top - stickTop, last: -1 };
            top += card.offsetHeight + (parseFloat(style.marginBottom) || 0);
            return item;
        });
        this.end = this.items[this.items.length - 1].start;
    }

    update({ y }) {
        const n = this.items.length;
        this.items.forEach((item, i) => {
            const depth = n - 1 - i;
            if (!depth) {
                return;
            }
            const p = clamp((y - item.start) / Math.max(1, this.end - item.start));
            if (Math.abs(p - item.last) < 0.001) {
                return;
            }
            item.last = p;
            item.card.style.transform = `scale(${(1 - p * depth * 0.045).toFixed(4)})`;
            item.card.style.setProperty("--dim", (p * Math.min(0.6, depth * 0.2)).toFixed(3));
        });
    }

    destroy() {
        this.unsubscribe?.();
        this.unlayout?.();
        this.cards.forEach((card) => {
            card.style.removeProperty("transform");
            card.style.removeProperty("--dim");
        });
    }
}
interactions.add("pnsb_website.stack", IpStack);

// -----------------------------------------------------------------------------
// Velocity-reactive marquee
// -----------------------------------------------------------------------------
export class IpMarquee extends Interaction {
    static selector = "[data-ip-marquee]";

    dynamicContent = {
        _root: {
            "t-on-pointerenter.noUpdate": () => (this.hover = true),
            "t-on-pointerleave.noUpdate": () => (this.hover = false),
        },
    };

    setup() {
        this.track = this.el.querySelector(".ip-marquee__track");
        this.speed = parseFloat(this.el.dataset.speed || "0.5");
        this.x = 0;
        this.dir = 1;
        this.visible = false;
        this.hover = false;
        this.clones = [];
        this.pausable = this.el.classList.contains("ip-marquee--cards");
    }

    start() {
        if (!this.track || !motionEnabled()) {
            return;
        }
        // Duplicate the content until it is at least twice the viewport width.
        const originals = [...this.track.children];
        let guard = 0;
        while (this.track.scrollWidth < window.innerWidth * 2.2 && guard++ < 6) {
            for (const child of originals) {
                const clone = child.cloneNode(true);
                clone.setAttribute("aria-hidden", "true");
                this.track.appendChild(clone);
                this.clones.push(clone);
            }
        }
        this.originalCount = originals.length;
        this.measure();
        this.unlayout = motion.onLayout(() => this.measure());
        this.io = new IntersectionObserver(([entry]) => (this.visible = entry.isIntersecting));
        this.io.observe(this.el);
        this.unsubscribe = motion.subscribe((state) => this.update(state));
    }

    measure() {
        // Width of one loop = the original items (clones follow them).
        const gap = parseFloat(getComputedStyle(this.track).columnGap) || 0;
        const originals = [...this.track.children].slice(0, this.originalCount);
        this.loop = originals.reduce((w, el) => w + el.offsetWidth + gap, 0) || this.track.scrollWidth / 2;
    }

    update({ vy, dt }) {
        if (!this.visible) {
            return;
        }
        if (Math.abs(vy) > 0.5) {
            this.dir = vy > 0 ? 1 : -1;
        }
        const pause = this.pausable && this.hover ? 0.12 : 1;
        const velocity = (this.speed + Math.min(14, Math.abs(vy) * 0.18)) * this.dir * pause;
        this.x -= velocity * (dt / 16);
        if (this.x <= -this.loop) {
            this.x += this.loop;
        } else if (this.x > 0) {
            this.x -= this.loop;
        }
        this.track.style.transform = `translate3d(${this.x.toFixed(2)}px, 0, 0)`;
    }

    destroy() {
        this.unsubscribe?.();
        this.unlayout?.();
        this.io?.disconnect();
        this.clones.forEach((clone) => clone.remove());
        this.track?.style.removeProperty("transform");
    }
}
interactions.add("pnsb_website.marquee", IpMarquee);

// -----------------------------------------------------------------------------
// Process: nut screwing down a bolt, driven by scroll
// -----------------------------------------------------------------------------
export class IpProcess extends Interaction {
    static selector = "[data-ip-process]";

    setup() {
        this.track = this.el.querySelector(".ip-process__track");
        this.stage = this.el.querySelector(".ip-process__stage");
        this.scene = this.el.querySelector("[data-ip-scene]");
        this.nut = this.el.querySelector("[data-ip-nut]");
        this.nutPrism = this.nut?.querySelector(".ip-prism");
        this.headPrism = this.el.querySelector(".ip-prism--head");
        this.glow = this.el.querySelector("[data-ip-seat-glow]");
        this.bar = this.el.querySelector("[data-ip-process-bar]");
        this.steps = [...this.el.querySelectorAll("[data-ip-step]")];
        this.telemetry = {
            rotation: this.el.querySelector('[data-ip-telemetry="rotation"]'),
            travel: this.el.querySelector('[data-ip-telemetry="travel"]'),
            preload: this.el.querySelector('[data-ip-telemetry="preload"]'),
        };
        this.activeStep = -1;
        this.last = -1;
        this.live = false;
    }

    start() {
        if (this.headPrism) {
            shadePrism(this.headPrism, 30);
        }
        if (this.nutPrism) {
            shadePrism(this.nutPrism, 0);
        }
        this.setStep(0);
        if (!motionEnabled() || !this.track) {
            return;
        }
        this.live = true;
        this.el.classList.add("is-live");
        this.measure();
        this.unlayout = motion.onLayout(() => this.measure());
        this.unsubscribe = motion.subscribe((state) => this.update(state));
    }

    measure() {
        this.top = pageTop(this.track);
        this.dist = Math.max(1, this.track.offsetHeight - window.innerHeight);
        const bolt = this.el.querySelector(".ip-bolt");
        if (bolt && this.stage) {
            const cs = getComputedStyle(bolt);
            this.len = parseFloat(cs.getPropertyValue("--len")) || 430;
            const needed = bolt.offsetHeight + 150; // head/washer tilt below the box
            const k = Math.min(1, (this.stage.clientHeight - 30) / needed, (this.stage.clientWidth - 20) / 320);
            this.scene.style.setProperty("--scene-k", k.toFixed(3));
        }
        this.nutH = this.nutPrism ? parseFloat(getComputedStyle(this.nutPrism).height) || 78 : 78;
        this.last = -1;
    }

    setStep(index) {
        if (index === this.activeStep) {
            return;
        }
        this.activeStep = index;
        this.steps.forEach((step, i) => {
            step.classList.toggle("is-active", i === index);
            step.classList.toggle("is-done", i < index);
        });
    }

    update({ y }) {
        const p = clamp((y - this.top) / this.dist);
        if (Math.abs(p - this.last) < 0.0003) {
            return;
        }
        this.last = p;
        this.setStep(Math.min(this.steps.length - 1, Math.floor(p * this.steps.length)));
        this.bar?.style.setProperty("--p", p.toFixed(4));

        const travel = clamp(p / 0.9);
        const eased = easeInOutSine(travel);
        const startY = 12;
        const endY = this.len - this.nutH / 2 - 2;
        const ny = lerp(startY + this.nutH / 2, endY, eased) - this.nutH / 2;
        const rotation = eased * 1800;
        this.nut?.style.setProperty("--ny", `${ny.toFixed(1)}px`);
        if (this.nutPrism) {
            shadePrism(this.nutPrism, rotation);
        }
        const seat = clamp((p - 0.86) / 0.12);
        this.glow?.style.setProperty("--glow", seat.toFixed(3));

        const t = this.telemetry;
        if (t.rotation) {
            t.rotation.textContent = `${formatNumber(Math.round(rotation))}°`;
        }
        if (t.travel) {
            t.travel.textContent = `${(eased * 96).toFixed(1)} mm`;
        }
        if (t.preload) {
            t.preload.textContent = `${(seat * 158.9).toFixed(1)} kN`;
        }
    }

    destroy() {
        this.unsubscribe?.();
        this.unlayout?.();
        this.el.classList.remove("is-live");
        this.steps.forEach((step) => step.classList.remove("is-active", "is-done"));
        this.nut?.style.removeProperty("--ny");
        this.glow?.style.removeProperty("--glow");
        this.bar?.style.removeProperty("--p");
        this.scene?.style.removeProperty("--scene-k");
        if (this.nutPrism) {
            resetPrism(this.nutPrism);
        }
        if (this.headPrism) {
            resetPrism(this.headPrism);
        }
    }
}
interactions.add("pnsb_website.process", IpProcess);

// -----------------------------------------------------------------------------
// Materials & finishes explorer
// -----------------------------------------------------------------------------
export class IpExplorer extends Interaction {
    static selector = "[data-ip-explorer]";

    dynamicContent = {
        "[data-ip-explorer-materials] button": {
            "t-on-click": (ev) => this.select("material", parseInt(ev.currentTarget.dataset.id, 10)),
        },
        "[data-ip-explorer-finishes] button": {
            "t-on-click": (ev) => this.select("finish", parseInt(ev.currentTarget.dataset.id, 10)),
        },
        ".ip-explorer__stage": {
            "t-on-pointerdown.noUpdate": this.onDragStart,
        },
    };

    setup() {
        try {
            this.data = JSON.parse(this.el.dataset.explorer || "{}");
        } catch {
            this.data = {};
        }
        this.materials = this.data.materials || [];
        this.finishes = this.data.finishes || [];
        this.prism = this.el.querySelector(".ip-prism--explorer");
        this.rotation = 20;
        this.spin = 0.018;
        this.visible = false;
        this.drag = null;
        this.factTweens = {};
        this.renderButtons();
    }

    renderButtons() {
        const matBox = this.el.querySelector("[data-ip-explorer-materials]");
        const finBox = this.el.querySelector("[data-ip-explorer-finishes]");
        const button = (item, kind) => {
            const swatch = kind === "material" ? `ip-swatch--${item.swatch}` : `ip-swatch--finish-${item.swatch}`;
            const b = document.createElement("button");
            b.type = "button";
            b.dataset.id = item.id;
            b.setAttribute("role", "radio");
            b.innerHTML = `<span class="ip-swatch ${swatch}"></span>`;
            b.append(document.createTextNode(item.code || item.name));
            b.title = item.name;
            return b;
        };
        matBox?.replaceChildren(...this.materials.map((m) => button(m, "material")));
        finBox?.replaceChildren(...this.finishes.map((f) => button(f, "finish")));
        this.state = {
            material: this.materials[0]?.id,
            finish: this.finishes[0]?.id,
        };
    }

    start() {
        this.apply(true);
        if (this.prism) {
            shadePrism(this.prism, this.rotation);
        }
        if (motionEnabled()) {
            this.io = new IntersectionObserver(([entry]) => (this.visible = entry.isIntersecting));
            this.io.observe(this.el);
            this.unsubscribe = motion.subscribe((state) => this.frame(state));
        }
    }

    select(kind, id) {
        this.state[kind] = id;
        this.apply();
        this.spin = 0.12;
    }

    apply(initial = false) {
        const mat = this.materials.find((m) => m.id === this.state.material);
        const fin = this.finishes.find((f) => f.id === this.state.finish);
        if (!mat) {
            return;
        }
        this.el.querySelectorAll("[data-ip-explorer-materials] button").forEach((b) => {
            const on = parseInt(b.dataset.id, 10) === mat.id;
            b.classList.toggle("is-active", on);
            b.setAttribute("aria-checked", String(on));
        });
        this.el.querySelectorAll("[data-ip-explorer-finishes] button").forEach((b) => {
            const on = fin && parseInt(b.dataset.id, 10) === fin.id;
            b.classList.toggle("is-active", !!on);
            b.setAttribute("aria-checked", String(!!on));
        });
        if (this.prism) {
            setPrismMetal(this.prism, fin && fin.swatch !== "none" ? fin.swatch : mat.swatch);
        }
        const set = (sel, text) => {
            const node = this.el.querySelector(sel);
            if (node) {
                node.textContent = text;
            }
        };
        set("[data-ip-explorer-name]", fin ? `${mat.name} · ${fin.name}` : mat.name);
        set("[data-ip-explorer-desc]", [mat.description, fin && fin.description].filter(Boolean).join(" "));
        set("[data-ip-explorer-code]", [mat.code, fin && fin.code].filter(Boolean).join(" + "));

        const corrosion = Math.max(mat.corrosion || 0, (fin && fin.corrosion) || 0);
        const meters = {
            strength: (mat.strength || 0) / 5,
            corrosion: corrosion / 5,
            cost: clamp(((mat.cost || 1) + (fin && fin.swatch !== "none" ? 0.6 : 0)) / 5.6),
        };
        for (const [key, value] of Object.entries(meters)) {
            this.el.querySelector(`[data-ip-explorer-meter="${key}"]`)?.style.setProperty("--v", value.toFixed(3));
        }
        const saltSpray = Math.max((fin && fin.saltSpray) || 0, mat.corrosion >= 4 ? 1000 : 0);
        this.animateFact("tensile", mat.tensile || 0, initial);
        this.animateFact("saltSpray", saltSpray, initial);
        this.animateFact("temp", mat.temp || 0, initial);
    }

    animateFact(key, value, instant) {
        const node = this.el.querySelector(`[data-ip-explorer-fact="${key}"]`);
        if (!node) {
            return;
        }
        this.factTweens[key]?.();
        const from = parseFloat(node.dataset.value || "0");
        node.dataset.value = value;
        if (instant || !motionEnabled()) {
            node.textContent = formatNumber(value);
            return;
        }
        this.factTweens[key] = tween(from, value, 900, (v) => (node.textContent = formatNumber(Math.round(v))));
    }

    onDragStart(ev) {
        if (!this.prism) {
            return;
        }
        this.drag = { x: ev.clientX, rotation: this.rotation };
        const move = (e) => {
            this.rotation = this.drag.rotation + (e.clientX - this.drag.x) * 0.6;
            shadePrism(this.prism, this.rotation);
        };
        const up = () => {
            this.drag = null;
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    }

    frame({ dt }) {
        if (!this.visible || this.drag || !this.prism) {
            return;
        }
        this.spin = lerp(this.spin, 0.018, 0.03);
        this.rotation += this.spin * dt;
        shadePrism(this.prism, this.rotation);
    }

    destroy() {
        this.unsubscribe?.();
        this.io?.disconnect();
        Object.values(this.factTweens).forEach((cancel) => cancel());
        if (this.prism) {
            resetPrism(this.prism);
        }
    }
}
interactions.add("pnsb_website.explorer", IpExplorer);

// -----------------------------------------------------------------------------
// Industries list with cursor-following image
// -----------------------------------------------------------------------------
export class IpSectors extends Interaction {
    static selector = "[data-ip-sectors]";

    dynamicContent = {
        ".ip-sectors__list": {
            "t-on-pointermove.noUpdate": this.onMove,
            "t-on-pointerleave.noUpdate": this.onLeave,
        },
    };

    setup() {
        this.float = this.el.querySelector("[data-ip-sectors-float]");
        this.img = this.float?.querySelector("img");
        this.pos = { x: 0, y: 0, tx: 0, ty: 0, r: 0 };
        this.current = null;
    }

    start() {
        if (!this.float || !motionEnabled()) {
            return;
        }
        this.unsubscribe = motion.subscribe(({ dt }) => {
            if (!this.float.classList.contains("is-visible")) {
                return;
            }
            const k = 1 - Math.exp(-dt * 0.012);
            const p = this.pos;
            const prevX = p.x;
            p.x = lerp(p.x, p.tx, k);
            p.y = lerp(p.y, p.ty, k);
            p.r = lerp(p.r, clamp((p.x - prevX) * 0.6, -12, 12), 0.1);
            this.float.style.setProperty("--fx", `${p.x.toFixed(1)}px`);
            this.float.style.setProperty("--fy", `${p.y.toFixed(1)}px`);
            this.float.style.setProperty("--fr", `${p.r.toFixed(2)}deg`);
        });
    }

    onMove(ev) {
        if (ev.pointerType !== "mouse" || !this.float) {
            return;
        }
        const rect = this.el.getBoundingClientRect();
        const w = this.float.offsetWidth;
        const h = this.float.offsetHeight;
        this.pos.tx = ev.clientX - rect.left - w / 2;
        this.pos.ty = ev.clientY - rect.top - h / 2;
        if (!this.float.classList.contains("is-visible")) {
            this.pos.x = this.pos.tx;
            this.pos.y = this.pos.ty;
            this.float.classList.add("is-visible");
        }
        const row = ev.target.closest(".ip-sector");
        if (row && row !== this.current) {
            this.current = row;
            if (row.dataset.img && this.img.getAttribute("src") !== row.dataset.img) {
                this.img.src = row.dataset.img;
            }
        }
    }

    onLeave() {
        this.float?.classList.remove("is-visible");
        this.current = null;
    }

    destroy() {
        this.unsubscribe?.();
        this.float?.classList.remove("is-visible");
    }
}
interactions.add("pnsb_website.sectors", IpSectors);

// -----------------------------------------------------------------------------
// Tightening torque calculator
// -----------------------------------------------------------------------------
const THREADS = {
    M6: { d: 6, p: 1.0, as: 20.1 },
    M8: { d: 8, p: 1.25, as: 36.6 },
    M10: { d: 10, p: 1.5, as: 58.0 },
    M12: { d: 12, p: 1.75, as: 84.3 },
    M14: { d: 14, p: 2.0, as: 115 },
    M16: { d: 16, p: 2.0, as: 157 },
    M18: { d: 18, p: 2.5, as: 192 },
    M20: { d: 20, p: 2.5, as: 245 },
    M22: { d: 22, p: 2.5, as: 303 },
    M24: { d: 24, p: 3.0, as: 353 },
    M27: { d: 27, p: 3.0, as: 459 },
    M30: { d: 30, p: 3.5, as: 561 },
    M33: { d: 33, p: 3.5, as: 694 },
    M36: { d: 36, p: 4.0, as: 817 },
};
// Proof stress Sp (MPa), ISO 898-1
const PROOF_STRESS = {
    "8.8": (d) => (d <= 16 ? 580 : 600),
    "10.9": () => 830,
    "12.9": () => 970,
};
const DEFAULT_CONDITIONS = [
    { name: "Plain, lightly oiled", k: 0.2 },
    { name: "Zinc plated, dry", k: 0.18 },
    { name: "Zinc flake / waxed", k: 0.14 },
    { name: "MoS₂ paste", k: 0.12 },
];

export class IpTorque extends Interaction {
    static selector = "[data-ip-torque]";

    dynamicContent = {
        "[data-ip-torque-sizes] button": {
            "t-on-click": (ev) => this.set({ size: ev.currentTarget.dataset.size }),
        },
        "[data-ip-torque-grades] button": {
            "t-on-click": (ev) => this.set({ grade: ev.currentTarget.dataset.grade }),
        },
        "[data-ip-torque-k]": {
            "t-on-change": (ev) => this.set({ k: parseFloat(ev.currentTarget.value) }),
        },
        "[data-ip-torque-u]": {
            "t-on-input": (ev) => this.set({ u: parseInt(ev.currentTarget.value, 10) }),
        },
        _document: {
            "t-on-ip:torque-size": (ev) => {
                if (ev.detail && THREADS[ev.detail]) {
                    this.set({ size: ev.detail });
                }
            },
        },
    };

    setup() {
        const size = THREADS[this.el.dataset.size] ? this.el.dataset.size : "M12";
        const grade = PROOF_STRESS[this.el.dataset.grade] ? this.el.dataset.grade : "8.8";
        this.state = { size, grade, k: 0.2, u: 75 };
        this.values = { torque: 0, preload: 0, proof: 0 };
        this.cancels = [];
        this.conditions = this.readConditions();
        this.state.k = this.conditions[0].k;
        this.render();
    }

    readConditions() {
        let list = [];
        try {
            const raw = JSON.parse(this.el.dataset.finishes || "null");
            const finishes = Array.isArray(raw) ? raw : (raw && raw.finishes) || [];
            list = finishes.filter((f) => f.k).map((f) => ({ name: f.name, k: f.k }));
        } catch {
            list = [];
        }
        if (!list.length) {
            const page = document.querySelector("[data-ip-product-page]");
            try {
                const config = page ? JSON.parse(page.dataset.config) : null;
                list = ((config && config.finishOptions) || []).filter((f) => f.k).map((f) => ({ name: f.name, k: f.k }));
            } catch {
                list = [];
            }
        }
        const seen = new Set();
        return [...list, ...DEFAULT_CONDITIONS].filter((c) => {
            const key = `${c.name}|${c.k}`;
            if (seen.has(c.name)) {
                return false;
            }
            seen.add(c.name);
            return !!key;
        });
    }

    render() {
        const sizes = this.el.querySelector("[data-ip-torque-sizes]");
        sizes?.replaceChildren(
            ...Object.keys(THREADS).map((name) => {
                const b = document.createElement("button");
                b.type = "button";
                b.dataset.size = name;
                b.setAttribute("role", "radio");
                b.textContent = name;
                return b;
            })
        );
        const select = this.el.querySelector("[data-ip-torque-k]");
        select?.replaceChildren(
            ...this.conditions.map((c) => {
                const o = document.createElement("option");
                o.value = String(c.k);
                o.textContent = `${c.name} · K ${c.k.toFixed(2)}`;
                return o;
            })
        );
    }

    start() {
        this.compute(true);
    }

    set(patch) {
        Object.assign(this.state, patch);
        this.compute();
    }

    compute(instant = false) {
        const { size, grade, k, u } = this.state;
        const thread = THREADS[size];
        const sp = PROOF_STRESS[grade](thread.d);
        const proof = (thread.as * sp) / 1000; // kN
        const preload = proof * (u / 100); // kN
        const torque = k * thread.d * preload; // N·m (d in mm, F in kN)

        this.el.querySelectorAll("[data-ip-torque-sizes] button").forEach((b) => {
            b.classList.toggle("is-active", b.dataset.size === size);
            b.setAttribute("aria-checked", String(b.dataset.size === size));
        });
        this.el.querySelectorAll("[data-ip-torque-grades] button").forEach((b) => {
            b.classList.toggle("is-active", b.dataset.grade === grade);
            b.setAttribute("aria-checked", String(b.dataset.grade === grade));
        });
        const range = this.el.querySelector("[data-ip-torque-u]");
        if (range) {
            range.style.setProperty("--p", `${((u - 50) / 40) * 100}%`);
        }
        const uOut = this.el.querySelector("[data-ip-torque-u-out]");
        if (uOut) {
            uOut.textContent = `${u}%`;
        }
        const select = this.el.querySelector("[data-ip-torque-k]");
        if (select && parseFloat(select.value) !== k) {
            select.value = String(k);
        }

        const out = (key) => this.el.querySelector(`[data-ip-torque-out="${key}"]`);
        out("area").textContent = formatNumber(thread.as, thread.as % 1 ? 1 : 0);
        out("pitch").textContent = thread.p.toFixed(2);
        this.animate("torque", torque, 0, instant);
        this.animate("preload", preload, 1, instant);
        this.animate("proof", proof, 1, instant);
        const gauge = this.el.querySelector("[data-ip-gauge]");
        gauge?.style.setProperty("--g", clamp(Math.log10(Math.max(1, torque)) / Math.log10(6000)).toFixed(4));
    }

    animate(key, value, decimals, instant) {
        const node = this.el.querySelector(`[data-ip-torque-out="${key}"]`);
        if (!node) {
            return;
        }
        this.cancels.forEach((c) => c.key === key && c());
        const from = this.values[key] || 0;
        this.values[key] = value;
        if (instant || !motionEnabled()) {
            node.textContent = formatNumber(value, decimals);
            return;
        }
        const cancel = tween(from, value, 800, (v) => (node.textContent = formatNumber(v, decimals)));
        cancel.key = key;
        this.cancels.push(cancel);
    }

    destroy() {
        this.cancels.forEach((c) => c());
    }
}
interactions.add("pnsb_website.torque", IpTorque);

// -----------------------------------------------------------------------------
// "Parts produced today" live counter
// -----------------------------------------------------------------------------
export class IpLiveCounter extends Interaction {
    static selector = "[data-ip-live-counter]";

    start() {
        const rate = parseFloat(this.el.dataset.rate || "10");
        this.original = this.el.textContent;
        const tick = () => {
            const now = new Date();
            const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const value = Math.floor(((now - midnight) / 1000) * rate);
            this.el.textContent = formatNumber(value);
        };
        tick();
        this.timer = setInterval(tick, 110);
    }

    destroy() {
        clearInterval(this.timer);
        if (this.original !== undefined) {
            this.el.textContent = this.original;
        }
    }
}
interactions.add("pnsb_website.live_counter", IpLiveCounter);
