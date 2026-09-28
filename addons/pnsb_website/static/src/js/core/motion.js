/**
 * Industrial Parts - motion core.
 *
 * A single requestAnimationFrame ticker shared by every scroll-driven effect,
 * plus a lightweight inertial ("lerp") wheel scroller that keeps native
 * scrolling underneath, so position: sticky, anchors and the keyboard keep
 * working exactly as the browser intends.
 */

export const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

export const prefersReducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const hasFinePointer = () =>
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

/** Absolute document offset of an element (ignores transforms of ancestors). */
export function pageTop(el) {
    let top = 0;
    let node = el;
    while (node) {
        top += node.offsetTop || 0;
        node = node.offsetParent;
    }
    return top;
}

export function formatNumber(value, decimals = 0) {
    return Number(value).toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

/**
 * Tween a number and call `onUpdate` with the interpolated value.
 * Returns a cancel function.
 */
export function tween(from, to, duration, onUpdate, ease = easeOutExpo) {
    const start = performance.now();
    let raf = 0;
    const step = (now) => {
        const t = clamp((now - start) / duration);
        onUpdate(lerp(from, to, ease(t)), t);
        if (t < 1) {
            raf = requestAnimationFrame(step);
        }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
}

// -----------------------------------------------------------------------------
// Inertial wheel scrolling
// -----------------------------------------------------------------------------
class SmoothScroller {
    constructor() {
        this.current = window.scrollY;
        this.target = window.scrollY;
        this.animating = false;
        this.tweenState = null;
        this.lastSet = null;
        this.onWheel = this.onWheel.bind(this);
        this.onNativeScroll = this.onNativeScroll.bind(this);
        window.addEventListener("wheel", this.onWheel, { passive: false });
        window.addEventListener("scroll", this.onNativeScroll, { passive: true });
    }

    destroy() {
        window.removeEventListener("wheel", this.onWheel, { passive: false });
        window.removeEventListener("scroll", this.onNativeScroll, { passive: true });
    }

    get maxScroll() {
        return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    }

    canScrollInside(target, deltaY) {
        let el = target instanceof Element ? target : null;
        while (el && el !== document.body && el !== document.documentElement) {
            if (el.hasAttribute("data-ip-native-scroll")) {
                return true;
            }
            if (el.scrollHeight > el.clientHeight + 1) {
                const overflowY = getComputedStyle(el).overflowY;
                if (overflowY === "auto" || overflowY === "scroll") {
                    const canDown = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
                    const canUp = el.scrollTop > 0;
                    if ((deltaY > 0 && canDown) || (deltaY < 0 && canUp)) {
                        return true;
                    }
                }
            }
            el = el.parentElement;
        }
        return false;
    }

    onWheel(ev) {
        if (ev.defaultPrevented || ev.ctrlKey || ev.metaKey) {
            return;
        }
        if (document.documentElement.classList.contains("ip-locked")) {
            return;
        }
        if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) {
            return;
        }
        if (this.canScrollInside(ev.target, ev.deltaY)) {
            return;
        }
        ev.preventDefault();
        let delta = ev.deltaY;
        if (ev.deltaMode === 1) {
            delta *= 36;
        } else if (ev.deltaMode === 2) {
            delta *= window.innerHeight * 0.9;
        }
        if (!this.animating) {
            this.current = window.scrollY;
            this.target = window.scrollY;
        }
        this.tweenState = null;
        this.target = clamp(this.target + delta, 0, this.maxScroll);
        this.animating = true;
    }

    onNativeScroll() {
        if (!this.animating) {
            this.current = this.target = window.scrollY;
        } else if (this.lastSet !== null && Math.abs(window.scrollY - this.lastSet) > 3) {
            // Scrollbar drag / keyboard / programmatic scroll took over.
            this.stop();
        }
    }

    stop() {
        this.animating = false;
        this.tweenState = null;
        this.current = this.target = window.scrollY;
        this.lastSet = null;
    }

    scrollTo(y, { duration = 1300, immediate = false } = {}) {
        const to = clamp(y, 0, this.maxScroll);
        if (immediate) {
            this.stop();
            window.scrollTo({ top: to, behavior: "instant" });
            return;
        }
        this.tweenState = {
            from: window.scrollY,
            to,
            start: performance.now(),
            duration: Math.max(400, Math.min(duration, 400 + Math.abs(to - window.scrollY) * 0.35)),
        };
        this.target = to;
        this.current = window.scrollY;
        this.animating = true;
    }

    tick(dt, now) {
        if (!this.animating) {
            return;
        }
        if (this.tweenState) {
            const { from, to, start, duration } = this.tweenState;
            const t = clamp((now - start) / duration);
            this.current = lerp(from, to, easeInOutCubic(t));
            if (t >= 1) {
                this.tweenState = null;
                this.animating = false;
            }
        } else {
            const k = 1 - Math.exp(-dt * 0.0095);
            this.current = lerp(this.current, this.target, k);
            if (Math.abs(this.target - this.current) < 0.35) {
                this.current = this.target;
                this.animating = false;
            }
        }
        this.lastSet = Math.round(this.current);
        window.scrollTo({ top: this.current, behavior: "instant" });
    }
}

// -----------------------------------------------------------------------------
// Shared ticker
// -----------------------------------------------------------------------------
class MotionEngine {
    constructor() {
        this.subscribers = new Set();
        this.layoutSubscribers = new Set();
        this.smooth = null;
        this.smoothUsers = 0;
        this.state = { y: window.scrollY, vy: 0, dir: 1, vh: window.innerHeight, vw: window.innerWidth, dt: 16, now: 0 };
        this.raf = 0;
        this.lastTime = 0;
        this.loop = this.loop.bind(this);
        this.onResize = this.onResize.bind(this);
        this.layoutTimer = 0;
        this.resizeObserver = null;
    }

    get scrollY() {
        return this.state.y;
    }

    start() {
        if (this.raf) {
            return;
        }
        this.lastTime = performance.now();
        this.raf = requestAnimationFrame(this.loop);
        window.addEventListener("resize", this.onResize, { passive: true });
        window.addEventListener("load", this.onResize, { passive: true });
        if (window.ResizeObserver && !this.resizeObserver) {
            this.resizeObserver = new ResizeObserver(() => this.scheduleLayout());
            this.resizeObserver.observe(document.body);
        }
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => this.scheduleLayout());
        }
    }

    stopIfIdle() {
        if (this.subscribers.size || this.layoutSubscribers.size || this.smooth) {
            return;
        }
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        window.removeEventListener("resize", this.onResize);
        window.removeEventListener("load", this.onResize);
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
    }

    loop(now) {
        const dt = Math.min(64, now - this.lastTime || 16);
        this.lastTime = now;
        if (this.smooth) {
            this.smooth.tick(dt, now);
        }
        const y = window.scrollY;
        const state = this.state;
        state.vy = lerp(state.vy, y - state.y, 0.3);
        if (Math.abs(y - state.y) > 0.5) {
            state.dir = y > state.y ? 1 : -1;
        }
        state.y = y;
        state.dt = dt;
        state.now = now;
        for (const fn of this.subscribers) {
            try {
                fn(state);
            } catch (e) {
                console.error(e);
            }
        }
        this.raf = requestAnimationFrame(this.loop);
    }

    /** Called every animation frame with the shared scroll state. */
    subscribe(fn) {
        this.subscribers.add(fn);
        this.start();
        return () => {
            this.subscribers.delete(fn);
            this.stopIfIdle();
        };
    }

    /** Called on resize, font load and document size changes (debounced). */
    onLayout(fn) {
        this.layoutSubscribers.add(fn);
        this.start();
        return () => {
            this.layoutSubscribers.delete(fn);
            this.stopIfIdle();
        };
    }

    onResize() {
        this.state.vh = window.innerHeight;
        this.state.vw = window.innerWidth;
        this.scheduleLayout();
    }

    scheduleLayout() {
        clearTimeout(this.layoutTimer);
        this.layoutTimer = setTimeout(() => this.runLayout(), 120);
    }

    runLayout() {
        this.state.vh = window.innerHeight;
        this.state.vw = window.innerWidth;
        for (const fn of this.layoutSubscribers) {
            try {
                fn(this.state);
            } catch (e) {
                console.error(e);
            }
        }
    }

    enableSmoothScroll() {
        this.smoothUsers++;
        if (!this.smooth) {
            this.smooth = new SmoothScroller();
            this.start();
        }
        return () => {
            this.smoothUsers--;
            if (this.smoothUsers <= 0 && this.smooth) {
                this.smooth.destroy();
                this.smooth = null;
                this.stopIfIdle();
            }
        };
    }

    scrollTo(target, { offset = 0, duration, immediate = false } = {}) {
        let y = typeof target === "number" ? target : target.getBoundingClientRect().top + window.scrollY;
        y -= offset;
        if (this.smooth) {
            this.smooth.scrollTo(y, { duration, immediate });
        } else {
            window.scrollTo({ top: y, behavior: immediate || prefersReducedMotion() ? "instant" : "smooth" });
        }
    }
}

export const motion = new MotionEngine();

/** Enable the CSS hidden-until-revealed states (idempotent). */
export function enableMotionClass() {
    if (prefersReducedMotion()) {
        return false;
    }
    document.documentElement.classList.add("ip-motion");
    return true;
}

export function motionEnabled() {
    return !prefersReducedMotion();
}
