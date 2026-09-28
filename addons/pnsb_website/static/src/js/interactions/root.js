import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import {
    clamp,
    easeOutCubic,
    enableMotionClass,
    hasFinePointer,
    lerp,
    motion,
    prefersReducedMotion,
} from "../core/motion";
import { bus, escapeHtml } from "../core/store";

/**
 * Global behaviour of the industrial site: preloader, page transitions,
 * smooth scrolling, floating header, full-screen menu, custom cursor,
 * magnetic buttons, anchors, fitted footer wordmark and toasts.
 */
export class IpRoot extends Interaction {
    static selector = ".ip-root";

    dynamicContent = {
        _document: {
            "t-on-click.capture": this.onDocumentClick,
            "t-on-keydown": this.onKeydown,
            "t-on-pointermove.noUpdate": this.onPointerMove,
            "t-on-pointerover.noUpdate": this.onPointerOver,
            "t-on-pointerdown.noUpdate": this.onPointerDown,
            "t-on-pointerup.noUpdate": this.onPointerUp,
            "t-on-pointerout.noUpdate": this.onPointerLeaveWindow,
        },
        _window: {
            "t-on-pageshow": this.onPageShow,
        },
        "[data-ip-menu-toggle]": {
            "t-on-click": this.toggleMenu,
            "t-att-aria-expanded": () => String(this.menuOpen),
        },
        "[data-ip-menu]": {
            "t-att-class": () => ({ "is-open": this.menuOpen }),
            "t-att-aria-hidden": () => String(!this.menuOpen),
        },
        ".ip-menu__links a": {
            "t-on-pointerenter": this.onMenuLinkEnter,
        },
        "[data-ip-scroll-top]": {
            "t-on-click": () => motion.scrollTo(0, { duration: 1600 }),
        },
    };

    setup() {
        this.html = document.documentElement;
        this.menuOpen = false;
        this.cleanups = [];
        this.header = this.el.querySelector("[data-ip-header]");
        this.progress = this.el.querySelector(".ip-progress span");
        this.cursor = this.el.querySelector(".ip-cursor");
        this.cursorLabel = this.el.querySelector(".ip-cursor__label");
        this.curtain = this.el.querySelector(".ip-curtain");
        this.loader = this.el.querySelector(".ip-loader");
        this.toastHost = this.el.querySelector("[data-ip-toasts]");
        this.magnetic = null;
        this.pointer = { x: -100, y: -100, cx: -100, cy: -100 };
        this.useCursor = hasFinePointer() && !prefersReducedMotion();
        this.lastHeaderState = "";
    }

    start() {
        const animated = enableMotionClass();
        this.html.classList.add("ip-ready");

        if (animated) {
            this.cleanups.push(motion.enableSmoothScroll());
        }
        this.cleanups.push(motion.subscribe((state) => this.onFrame(state)));
        this.cleanups.push(motion.onLayout(() => this.fitWordmark()));
        this.fitWordmark();

        if (!this.html.classList.contains("ip-booted")) {
            // The early boot script normally handles these; this is a fallback.
            this.runIntro();
            this.runEnterTransition();
        }
        this.observeLightSections();

        const onToast = (ev) => this.showToast(ev.detail || {});
        bus.addEventListener("toast", onToast);
        this.cleanups.push(() => bus.removeEventListener("toast", onToast));

        if (window.location.hash) {
            const target = this.findAnchor(window.location.hash);
            if (target) {
                this.waitForTimeout(() => motion.scrollTo(target, { offset: this.anchorOffset(), immediate: true }), 350);
            }
        }
    }

    destroy() {
        this.cleanups.forEach((fn) => fn());
        this.html.classList.remove("ip-motion", "ip-ready", "ip-intro", "ip-entering", "ip-locked", "ip-nav-hidden");
        if (this.io) {
            this.io.disconnect();
        }
        if (this.header) {
            this.header.classList.remove("is-scrolled", "is-hidden", "is-light", "is-menu");
        }
        if (this.progress) {
            this.progress.style.removeProperty("--p");
        }
        if (this.cursor) {
            this.cursor.className = "ip-cursor";
            this.cursor.style.removeProperty("transform");
        }
        this.curtain?.classList.remove("is-covering", "is-revealing");
        this.loader?.classList.remove("is-done");
        this.resetMagnetic();
    }

    // ------------------------------------------------------------------
    // Intro & page transitions
    // ------------------------------------------------------------------

    runIntro() {
        if (!this.loader || !this.html.classList.contains("ip-intro")) {
            return;
        }
        const counter = this.loader.querySelector("[data-ip-loader-count]");
        const bar = this.loader.querySelector(".ip-loader__bar span");
        const duration = 1500;
        const start = performance.now();
        const step = (now) => {
            if (this.isDestroyed) {
                return;
            }
            const t = clamp((now - start) / duration);
            const value = Math.round(easeOutCubic(t) * 100);
            if (counter) {
                counter.textContent = String(value).padStart(3, "0");
            }
            bar?.style.setProperty("--p", easeOutCubic(t).toFixed(3));
            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                this.loader.classList.add("is-done");
                try {
                    sessionStorage.setItem("ip-intro", "1");
                } catch {
                    // ignore
                }
                this.waitForTimeout(() => this.html.classList.remove("ip-intro"), 1150);
            }
        };
        requestAnimationFrame(step);
    }

    runEnterTransition() {
        if (!this.curtain || !this.html.classList.contains("ip-entering")) {
            return;
        }
        requestAnimationFrame(() => {
            this.curtain.classList.add("is-revealing");
            this.waitForTimeout(() => {
                this.html.classList.remove("ip-entering");
                this.curtain.classList.remove("is-revealing");
            }, 900);
        });
    }

    onPageShow(ev) {
        if (ev.persisted) {
            this.curtain?.classList.remove("is-covering");
            this.html.classList.remove("ip-entering");
        }
    }

    isSamePage(url) {
        const home = this.el.dataset.ipPage === "home";
        const norm = (p) => p.replace(/\/+$/, "") || "/";
        const here = norm(window.location.pathname);
        const there = norm(url.pathname);
        if (here === there) {
            return true;
        }
        return home && ["/", "/industrial"].includes(here) && ["/", "/industrial"].includes(there);
    }

    findAnchor(hash) {
        try {
            return hash && hash.length > 1 ? document.querySelector(decodeURIComponent(hash)) : null;
        } catch {
            return null;
        }
    }

    anchorOffset() {
        return 20;
    }

    onDocumentClick(ev) {
        const link = ev.target.closest && ev.target.closest("a[href]");
        if (!link || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) {
            return;
        }
        if (!this.el.contains(link) || link.target === "_blank" || link.hasAttribute("download")) {
            return;
        }
        const href = link.getAttribute("href");
        if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
            return;
        }
        let url;
        try {
            url = new URL(link.href, window.location.href);
        } catch {
            return;
        }
        if (url.origin !== window.location.origin) {
            return;
        }
        // Same-page anchor: inertial scroll to the section.
        if (url.hash && this.isSamePage(url)) {
            const target = this.findAnchor(url.hash);
            if (target) {
                ev.preventDefault();
                ev.stopPropagation();
                if (this.menuOpen) {
                    this.closeMenu();
                }
                motion.scrollTo(target, { offset: this.anchorOffset() });
                history.replaceState(null, "", url.hash);
            }
            return;
        }
        if (/^\/(web|odoo|my|shop\/cart)(\/|$)/.test(url.pathname) || prefersReducedMotion() || !this.curtain) {
            return;
        }
        ev.preventDefault();
        if (this.menuOpen) {
            this.closeMenu();
        }
        this.curtain.classList.remove("is-revealing");
        this.curtain.classList.add("is-covering");
        try {
            sessionStorage.setItem("ip-transition", "1");
        } catch {
            // ignore
        }
        setTimeout(() => {
            window.location.href = url.href;
        }, 720);
    }

    // ------------------------------------------------------------------
    // Frame loop: progress, header, cursor, magnetic
    // ------------------------------------------------------------------

    onFrame(state) {
        const max = Math.max(1, document.documentElement.scrollHeight - state.vh);
        this.progress?.style.setProperty("--p", clamp(state.y / max).toFixed(4));

        if (this.header) {
            const scrolled = state.y > 40;
            const hidden = !this.menuOpen && state.y > 320 && state.dir > 0 && Math.abs(state.vy) > 0.4;
            const shown = state.dir < 0 || state.y <= 320;
            let nextHidden = this.header.classList.contains("is-hidden");
            if (hidden) {
                nextHidden = true;
            } else if (shown || this.menuOpen) {
                nextHidden = false;
            }
            const key = `${scrolled}|${nextHidden}`;
            if (key !== this.lastHeaderState) {
                this.lastHeaderState = key;
                this.header.classList.toggle("is-scrolled", scrolled);
                this.header.classList.toggle("is-hidden", nextHidden);
                this.html.classList.toggle("ip-nav-hidden", nextHidden);
            }
        }

        if (this.useCursor && this.cursor) {
            const p = this.pointer;
            const k = 1 - Math.exp(-state.dt * 0.018);
            p.cx = lerp(p.cx, p.x, k);
            p.cy = lerp(p.cy, p.y, k);
            this.cursor.style.transform = `translate3d(${p.cx.toFixed(1)}px, ${p.cy.toFixed(1)}px, 0)`;
        }
    }

    observeLightSections() {
        if (!this.header || !window.IntersectionObserver) {
            return;
        }
        const lights = new Set();
        this.io = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        lights.add(entry.target);
                    } else {
                        lights.delete(entry.target);
                    }
                }
                this.header.classList.toggle("is-light", lights.size > 0 && !this.menuOpen);
            },
            { rootMargin: "-40px 0px -92% 0px", threshold: 0 }
        );
        this.el.querySelectorAll('[data-theme="light"]').forEach((el) => this.io.observe(el));
    }

    // ------------------------------------------------------------------
    // Cursor & magnetic buttons
    // ------------------------------------------------------------------

    onPointerMove(ev) {
        if (ev.pointerType && ev.pointerType !== "mouse") {
            return;
        }
        this.pointer.x = ev.clientX;
        this.pointer.y = ev.clientY;
        if (this.cursor && this.useCursor && !this.cursor.classList.contains("is-visible")) {
            this.pointer.cx = ev.clientX;
            this.pointer.cy = ev.clientY;
            this.cursor.classList.add("is-visible");
        }
        const mag = ev.target.closest && ev.target.closest(".ip-magnetic");
        if (mag !== this.magnetic) {
            this.resetMagnetic();
            this.magnetic = mag;
        }
        if (mag && !prefersReducedMotion()) {
            const rect = mag.getBoundingClientRect();
            const strength = parseFloat(mag.dataset.ipMagneticStrength || "0.28");
            const dx = ev.clientX - (rect.left + rect.width / 2);
            const dy = ev.clientY - (rect.top + rect.height / 2);
            mag.style.transition = "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)";
            mag.style.transform = `translate3d(${(dx * strength).toFixed(1)}px, ${(dy * strength).toFixed(1)}px, 0)`;
            mag.style.setProperty("--mx", `${ev.clientX - rect.left}px`);
            mag.style.setProperty("--my", `${ev.clientY - rect.top}px`);
            const label = mag.querySelector(".ip-btn__label, .ip-cta__orb-label");
            if (label) {
                label.style.transform = `translate3d(${(dx * strength * 0.35).toFixed(1)}px, ${(dy * strength * 0.35).toFixed(1)}px, 0)`;
            }
        }
    }

    resetMagnetic() {
        const mag = this.magnetic;
        if (!mag) {
            return;
        }
        mag.style.transition = "transform 0.9s cubic-bezier(0.34, 1.56, 0.64, 1)";
        mag.style.transform = "";
        const label = mag.querySelector(".ip-btn__label, .ip-cta__orb-label");
        if (label) {
            label.style.transform = "";
        }
        this.magnetic = null;
    }

    onPointerOver(ev) {
        if (!this.cursor || !this.useCursor) {
            return;
        }
        const target = ev.target;
        const labelled = target.closest && target.closest("[data-ip-cursor]");
        const interactive = target.closest && target.closest("a, button, [role='button'], input, select, textarea, label");
        const label = labelled ? labelled.dataset.ipCursor : "";
        this.cursor.classList.toggle("is-label", !!label);
        this.cursor.classList.toggle("is-hover", !label && !!interactive);
        if (label && this.cursorLabel.textContent !== label) {
            this.cursorLabel.textContent = label;
        }
    }

    onPointerDown() {
        this.cursor?.classList.add("is-down");
    }

    onPointerUp() {
        this.cursor?.classList.remove("is-down");
    }

    onPointerLeaveWindow(ev) {
        if (ev.relatedTarget) {
            return;
        }
        this.cursor?.classList.remove("is-visible");
        this.resetMagnetic();
    }

    // ------------------------------------------------------------------
    // Menu
    // ------------------------------------------------------------------

    toggleMenu() {
        if (this.menuOpen) {
            this.closeMenu();
        } else {
            this.menuOpen = true;
            this.html.classList.add("ip-locked");
            this.header?.classList.add("is-menu");
            this.header?.classList.remove("is-hidden", "is-light");
        }
    }

    closeMenu() {
        this.menuOpen = false;
        this.html.classList.remove("ip-locked");
        this.header?.classList.remove("is-menu");
        this.updateContent();
    }

    onMenuLinkEnter(ev) {
        const src = ev.currentTarget.dataset.img;
        const img = this.el.querySelector(".ip-menu__preview img");
        if (!src || !img || img.getAttribute("src") === src) {
            return;
        }
        img.classList.add("is-swapping");
        const next = new Image();
        next.onload = () => {
            img.src = src;
            requestAnimationFrame(() => img.classList.remove("is-swapping"));
        };
        next.src = src;
    }

    onKeydown(ev) {
        if (ev.key === "Escape" && this.menuOpen) {
            this.closeMenu();
        }
    }

    // ------------------------------------------------------------------
    // Footer wordmark & toasts
    // ------------------------------------------------------------------

    fitWordmark() {
        const el = this.el.querySelector("[data-ip-fit-text]");
        if (!el) {
            return;
        }
        const box = el.parentElement;
        const style = getComputedStyle(box);
        const available = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        el.style.fontSize = "100px";
        el.style.display = "inline-block";
        const width = el.scrollWidth || 1;
        el.style.display = "";
        el.style.fontSize = `${Math.min(420, (100 * available) / width).toFixed(2)}px`;
    }

    showToast({ title = "", text = "", image = "", icon = "check", href = "", action = "" }) {
        if (!this.toastHost) {
            return;
        }
        const node = document.createElement("div");
        node.className = "ip-toast";
        const media = image
            ? `<img src="${escapeHtml(image)}" alt=""/>`
            : `<span class="ip-toast__icon"><svg class="ip-i"><use href="#ip-i-${escapeHtml(icon)}"/></svg></span>`;
        const link = href && action ? `<a class="ip-link-btn" href="${escapeHtml(href)}">${escapeHtml(action)}</a>` : "";
        node.innerHTML = `${media}<div><b>${escapeHtml(title)}</b><span>${escapeHtml(text)}</span></div>${link}`;
        this.toastHost.appendChild(node);
        while (this.toastHost.children.length > 3) {
            this.toastHost.firstElementChild.remove();
        }
        setTimeout(() => node.classList.add("is-leaving"), 3400);
        setTimeout(() => node.remove(), 3900);
    }
}

registry.category("public.interactions").add("pnsb_website.root", IpRoot);
