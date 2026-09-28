/**
 * Industrial Parts - early boot (loaded with `defer`, outside Odoo's lazy bundle).
 *
 * Odoo only loads the main frontend bundle after `window.load`, i.e. once
 * every image has arrived. This tiny script runs as soon as the DOM is parsed
 * so the preloader, page-enter curtain, text splitting and scroll reveals
 * never wait for remote photos. The interactions in the main bundle then add
 * smooth scrolling, counters, pinned sections, etc.
 */
(function () {
    "use strict";
    var html = document.documentElement;
    if (!html.classList.contains("ip-motion")) {
        return;
    }
    var root = document.querySelector(".ip-root");
    if (!root) {
        return;
    }

    // ------------------------------------------------------------------
    // Preloader (first visit of the session) and page-enter curtain
    // ------------------------------------------------------------------
    if (html.classList.contains("ip-intro")) {
        var loader = root.querySelector(".ip-loader");
        var counter = loader && loader.querySelector("[data-ip-loader-count]");
        var bar = loader && loader.querySelector(".ip-loader__bar span");
        var start = performance.now();
        var step = function (now) {
            var t = Math.min(1, (now - start) / 1400);
            var e = 1 - Math.pow(1 - t, 3);
            if (counter) {
                counter.textContent = String(Math.round(e * 100)).padStart(3, "0");
            }
            if (bar) {
                bar.style.setProperty("--p", e.toFixed(3));
            }
            if (t < 1) {
                requestAnimationFrame(step);
                return;
            }
            if (loader) {
                loader.classList.add("is-done");
            }
            try {
                sessionStorage.setItem("ip-intro", "1");
            } catch (err) {
                // storage disabled
            }
            setTimeout(function () {
                html.classList.remove("ip-intro");
            }, 1150);
        };
        requestAnimationFrame(step);
    }
    if (html.classList.contains("ip-entering")) {
        var curtain = root.querySelector(".ip-curtain");
        requestAnimationFrame(function () {
            if (curtain) {
                curtain.classList.add("is-revealing");
            }
            setTimeout(function () {
                html.classList.remove("ip-entering");
                if (curtain) {
                    curtain.classList.remove("is-revealing");
                }
            }, 900);
        });
    }

    // ------------------------------------------------------------------
    // Delays & staggered groups
    // ------------------------------------------------------------------
    root.querySelectorAll("[data-ip-stagger]").forEach(function (group) {
        var children = group.querySelectorAll(":scope > [data-ip-reveal], :scope > * > [data-ip-reveal]");
        Array.prototype.forEach.call(children, function (child, i) {
            if (!child.dataset.ipDelay) {
                child.style.setProperty("--ip-delay", i * 90 + "ms");
            }
        });
    });
    root.querySelectorAll("[data-ip-delay]").forEach(function (el) {
        el.style.setProperty("--ip-delay", (parseInt(el.dataset.ipDelay, 10) || 0) + "ms");
    });

    // ------------------------------------------------------------------
    // Text splitting (same markup as core/split.js so it can be restored)
    // ------------------------------------------------------------------
    function splitWords(el) {
        el.__ipOriginalHTML = el.innerHTML;
        var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
        var nodes = [];
        while (walker.nextNode()) {
            if (walker.currentNode.nodeValue.trim()) {
                nodes.push(walker.currentNode);
            }
        }
        var index = 0;
        nodes.forEach(function (node) {
            var fragment = document.createDocumentFragment();
            node.nodeValue.split(/(\s+)/).forEach(function (part) {
                if (!part) {
                    return;
                }
                if (/^\s+$/.test(part)) {
                    fragment.appendChild(document.createTextNode(part));
                    return;
                }
                var outer = document.createElement("span");
                outer.className = "ip-sw";
                var inner = document.createElement("span");
                inner.className = "ip-sw__in";
                inner.style.setProperty("--i", index++);
                inner.textContent = part;
                outer.appendChild(inner);
                fragment.appendChild(outer);
            });
            node.parentNode.replaceChild(fragment, node);
        });
    }

    function splitLines(el) {
        var lines = el.querySelectorAll(":scope > .ip-line");
        if (!lines.length) {
            splitWords(el);
            return;
        }
        el.__ipOriginalHTML = el.innerHTML;
        Array.prototype.forEach.call(lines, function (line, i) {
            var inner = document.createElement("span");
            inner.className = "ip-line__in";
            inner.style.setProperty("--i", i);
            while (line.firstChild) {
                inner.appendChild(line.firstChild);
            }
            line.appendChild(inner);
        });
    }

    root.querySelectorAll("[data-ip-split]").forEach(function (el) {
        if (el.dataset.ipSplit === "lines") {
            splitLines(el);
        } else {
            splitWords(el);
        }
        el.classList.add("is-split");
    });

    // ------------------------------------------------------------------
    // Scroll reveals
    // ------------------------------------------------------------------
    var targets = root.querySelectorAll("[data-ip-reveal], [data-ip-split], [data-ip-report]");
    var reveal = function (el) {
        el.classList.add("is-in");
    };
    var io = "IntersectionObserver" in window
        ? new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    reveal(entry.target);
                    io.unobserve(entry.target);
                }
            });
        }, { rootMargin: "0px 0px -6% 0px", threshold: 0.08 })
        : null;
    var vh = window.innerHeight;
    var aboveFold = [];
    Array.prototype.forEach.call(targets, function (el) {
        var rect = el.getBoundingClientRect();
        if (!io || (rect.top < vh && rect.bottom > 0)) {
            aboveFold.push(el);
        } else {
            io.observe(el);
        }
    });
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            aboveFold.forEach(reveal);
        });
    });
    window.__ipBootObserver = io;
    html.classList.add("ip-booted");
})();
