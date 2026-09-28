import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { clamp, motion, motionEnabled, pageTop } from "../core/motion";
import { restore, splitScrubWords } from "../core/split";

/**
 * Scroll-scrubbed effects driven by the shared ticker:
 *  - hero clip / zoom / lift        [data-ip-hero]
 *  - image parallax                 [data-ip-parallax="speed"]
 *  - word-by-word statement fill    [data-ip-scrub-words]
 */
export class IpScrub extends Interaction {
    static selector = ".ip-root";

    setup() {
        this.enabled = motionEnabled();
        this.parallax = [];
        this.words = [];
        this.hero = null;
    }

    start() {
        if (!this.enabled) {
            return;
        }
        this.el.querySelectorAll("[data-ip-parallax]").forEach((el) => {
            this.parallax.push({ el, speed: parseFloat(el.dataset.ipParallax) || 0.1, top: 0, height: 0, last: null });
        });
        this.el.querySelectorAll("[data-ip-scrub-words]").forEach((el) => {
            const words = splitScrubWords(el);
            this.words.push({ el, words, top: 0, height: 0, last: -1 });
        });
        const heroEl = this.el.querySelector("[data-ip-hero]");
        if (heroEl) {
            this.hero = {
                el: heroEl,
                media: heroEl.querySelector("[data-ip-hero-media]"),
                img: heroEl.querySelector(".ip-hero__img"),
                content: heroEl.querySelector(".ip-hero__content"),
                last: -1,
            };
        }
        this.measure();
        this.unsubscribe = motion.subscribe((state) => this.update(state));
        this.unlayout = motion.onLayout(() => this.measure());
    }

    measure() {
        for (const item of this.parallax) {
            const box = item.el.parentElement || item.el;
            item.top = pageTop(box);
            item.height = box.offsetHeight;
            item.last = null;
        }
        for (const item of this.words) {
            item.top = pageTop(item.el);
            item.height = item.el.offsetHeight;
            item.last = -1;
        }
        if (this.hero) {
            this.hero.last = -1;
        }
    }

    update({ y, vh }) {
        // Hero
        const hero = this.hero;
        if (hero && y < vh * 1.4) {
            const p = clamp(y / vh);
            if (Math.abs(p - hero.last) > 0.0005) {
                hero.last = p;
                const inset = p * Math.min(48, window.innerWidth * 0.04);
                const radius = p * 36;
                hero.media.style.clipPath = `inset(${inset.toFixed(1)}px ${inset.toFixed(1)}px ${(inset * 1.5).toFixed(1)}px round ${radius.toFixed(1)}px)`;
                hero.img?.style.setProperty("--hy", `${(p * vh * 0.22).toFixed(1)}px`);
                hero.img?.style.setProperty("--hs", (1.08 - p * 0.05).toFixed(4));
                if (hero.content) {
                    hero.content.style.transform = `translate3d(0, ${(-p * vh * 0.16).toFixed(1)}px, 0)`;
                    hero.content.style.opacity = clamp(1 - p * 1.35).toFixed(3);
                }
            }
        }

        // Parallax
        for (const item of this.parallax) {
            if (y + vh < item.top - 200 || y > item.top + item.height + 200) {
                continue;
            }
            const center = item.top + item.height / 2 - (y + vh / 2);
            const offset = clamp(center * item.speed, -item.height * 0.14, item.height * 0.14);
            const rounded = Math.round(offset * 10) / 10;
            if (rounded !== item.last) {
                item.last = rounded;
                item.el.style.transform = `translate3d(0, ${rounded}px, 0)`;
            }
        }

        // Word fill
        for (const item of this.words) {
            if (y + vh < item.top || y > item.top + item.height) {
                continue;
            }
            const p = clamp((y + vh * 0.82 - item.top) / (item.height + vh * 0.25));
            if (Math.abs(p - item.last) < 0.002) {
                continue;
            }
            item.last = p;
            const n = item.words.length;
            item.words.forEach((word, i) => {
                const o = 0.14 + 0.86 * clamp(p * n * 1.15 - i);
                word.style.setProperty("--o", o.toFixed(3));
            });
        }
    }

    destroy() {
        this.unsubscribe?.();
        this.unlayout?.();
        this.parallax.forEach(({ el }) => el.style.removeProperty("transform"));
        this.words.forEach(({ el }) => restore(el));
        if (this.hero) {
            this.hero.media?.style.removeProperty("clip-path");
            this.hero.img?.style.removeProperty("--hy");
            this.hero.img?.style.removeProperty("--hs");
            this.hero.content?.style.removeProperty("transform");
            this.hero.content?.style.removeProperty("opacity");
        }
    }
}

registry.category("public.interactions").add("pnsb_website.scrub", IpScrub);
