import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { easeOutExpo, formatNumber, motionEnabled, tween } from "../core/motion";
import { restore, splitLines, splitWords } from "../core/split";

/**
 * Scroll-triggered entrances: fade/slide/clip reveals, masked word & line
 * reveals, staggered groups, counters and meters.
 *
 * The early boot script (static/src/boot/boot.js) usually splits the text and
 * toggles the reveal classes before Odoo's lazy bundle is even loaded; this
 * interaction then only adds what needs the full framework (counters, meters)
 * and takes over when boot did not run (e.g. inside the website builder).
 */
export class IpReveal extends Interaction {
    static selector = ".ip-root";

    setup() {
        this.animated = motionEnabled();
        this.booted = document.documentElement.classList.contains("ip-booted");
        this.touched = [];
        this.cancels = [];
    }

    start() {
        const root = this.el;
        if (!this.booted) {
            root.querySelectorAll("[data-ip-stagger]").forEach((group) => {
                [...group.querySelectorAll(":scope > [data-ip-reveal], :scope > * > [data-ip-reveal]")].forEach((child, i) => {
                    if (!child.dataset.ipDelay) {
                        child.style.setProperty("--ip-delay", `${i * 90}ms`);
                        this.touched.push(child);
                    }
                });
            });
            root.querySelectorAll("[data-ip-delay]").forEach((el) => {
                el.style.setProperty("--ip-delay", `${parseInt(el.dataset.ipDelay, 10) || 0}ms`);
                this.touched.push(el);
            });
        }
        root.querySelectorAll("[data-ip-split]:not(.is-split)").forEach((el) => {
            if (el.dataset.ipSplit === "lines") {
                splitLines(el);
            } else {
                splitWords(el);
            }
            el.classList.add("is-split");
        });

        const selector = this.booted
            ? "[data-ip-counter], [data-ip-meter]"
            : "[data-ip-reveal], [data-ip-split], [data-ip-counter], [data-ip-meter], [data-ip-report]";
        const targets = root.querySelectorAll(selector);
        if (!this.animated || !window.IntersectionObserver) {
            targets.forEach((el) => this.reveal(el, true));
            return;
        }
        this.io = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        this.io.unobserve(entry.target);
                        this.reveal(entry.target);
                    }
                }
            },
            { rootMargin: "0px 0px -6% 0px", threshold: 0.08 }
        );
        // Anything already above the fold animates in right away (the 48px
        // entrance offset would otherwise keep bottom-aligned content outside
        // the observer's area); the rest waits for scroll.
        const vh = window.innerHeight;
        const aboveFold = [];
        targets.forEach((el) => {
            const rect = el.getBoundingClientRect();
            if (rect.top < vh && rect.bottom > 0 && rect.width) {
                aboveFold.push(el);
            } else {
                this.io.observe(el);
            }
        });
        requestAnimationFrame(() =>
            requestAnimationFrame(() => {
                if (!this.isDestroyed) {
                    aboveFold.forEach((el) => this.reveal(el));
                }
            })
        );
    }

    reveal(el, instant = false) {
        el.classList.add("is-in");
        if (el.hasAttribute("data-ip-counter")) {
            this.runCounter(el, instant);
        }
        if (el.hasAttribute("data-ip-meter")) {
            const bar = el.querySelector("span");
            bar?.style.setProperty("--v", el.dataset.ipMeter || "0");
        }
    }

    runCounter(el, instant) {
        if (el.__ipCounterDone) {
            return;
        }
        el.__ipCounterDone = true;
        el.__ipOriginalText = el.textContent;
        const target = parseFloat(el.dataset.ipCounter) || 0;
        const decimals = parseInt(el.dataset.decimals || "0", 10);
        const prefix = el.dataset.prefix || "";
        const render = (v) => {
            el.textContent = prefix + formatNumber(v, decimals);
        };
        if (instant) {
            render(target);
            return;
        }
        this.cancels.push(tween(0, target, 2200, render, easeOutExpo));
    }

    destroy() {
        this.io?.disconnect();
        window.__ipBootObserver?.disconnect();
        this.cancels.forEach((cancel) => cancel());
        this.el.querySelectorAll("[data-ip-split].is-split").forEach((el) => {
            restore(el);
            el.classList.remove("is-split");
        });
        this.el.querySelectorAll("[data-ip-delay], [data-ip-stagger] [data-ip-reveal]").forEach((el) =>
            el.style.removeProperty("--ip-delay")
        );
        this.touched.forEach((el) => el.style.removeProperty("--ip-delay"));
        this.el.querySelectorAll(".is-in").forEach((el) => el.classList.remove("is-in"));
        this.el.querySelectorAll("[data-ip-counter]").forEach((el) => {
            if (el.__ipOriginalText !== undefined) {
                el.textContent = el.__ipOriginalText;
            }
            delete el.__ipCounterDone;
        });
        this.el.querySelectorAll("[data-ip-meter] span").forEach((el) => el.style.removeProperty("--v"));
        document.documentElement.classList.remove("ip-booted");
    }
}

registry.category("public.interactions").add("pnsb_website.reveal", IpReveal);
