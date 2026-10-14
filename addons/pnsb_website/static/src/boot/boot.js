/**
 * PNSB website - early boot (loaded with `defer`, outside Odoo's bundles).
 *
 * Odoo loads the main frontend bundle only after `window.load`, i.e. once
 * every image has arrived. Scroll reveals and heading splits therefore run
 * here, as soon as the DOM is parsed, so content is never left hidden while
 * photos download. It only acts under html.pn-motion, which the layout never
 * sets in edit mode; if the editor is opened later, CSS shows everything
 * (body.editor_enable), and none of these elements are in editable areas.
 */
(function () {
    "use strict";
    var html = document.documentElement;
    if (!html.classList.contains("pn-motion") || !window.IntersectionObserver) {
        return;
    }
    var root = document.querySelector(".pn-root");
    if (!root) {
        return;
    }

    // Masked word reveal for headings: <span.pn-sw><span.pn-sw__in>word</span></span>
    function splitWords(el) {
        var index = 0;
        var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
        var nodes = [];
        while (walker.nextNode()) {
            if (walker.currentNode.nodeValue.trim()) {
                nodes.push(walker.currentNode);
            }
        }
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
                outer.className = "pn-sw";
                var inner = document.createElement("span");
                inner.className = "pn-sw__in";
                inner.style.setProperty("--i", index++);
                inner.textContent = part;
                outer.appendChild(inner);
                fragment.appendChild(outer);
            });
            node.parentNode.replaceChild(fragment, node);
        });
        el.classList.add("pn-splitw");
    }

    var splits = root.querySelectorAll("[data-pnsb-split]");
    Array.prototype.forEach.call(splits, splitWords);

    // Stagger siblings that enter together (grids, lists).
    var reveals = root.querySelectorAll(".pn-reveal");
    var groups = new Map();
    Array.prototype.forEach.call(reveals, function (el) {
        var list = groups.get(el.parentElement) || [];
        list.push(el);
        groups.set(el.parentElement, list);
    });
    groups.forEach(function (list) {
        list.forEach(function (el, i) {
            el.style.setProperty("--pn-delay", Math.min(i, 6) * 70 + "ms");
        });
    });

    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) {
                return;
            }
            var el = entry.target;
            el.classList.add(el.hasAttribute("data-pnsb-split") ? "pn-splitw--in" : "pn-shown");
            observer.unobserve(el);
        });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    Array.prototype.forEach.call(reveals, function (el) { observer.observe(el); });
    Array.prototype.forEach.call(splits, function (el) { observer.observe(el); });
    html.classList.add("pn-booted");
})();
