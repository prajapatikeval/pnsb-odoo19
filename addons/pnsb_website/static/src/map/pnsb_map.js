/**
 * PNSB website - interactive location map (Leaflet + OpenStreetMap tiles).
 *
 * Plain script (outside Odoo's bundles), loaded with `defer` on the Contact
 * page. Leaflet itself is fetched only when the map scrolls near the
 * viewport. Without JS or if loading fails, the address card and the
 * Google Maps buttons still work.
 */
(function () {
    "use strict";
    var root = document.querySelector("[data-pnsb-map]");
    if (!root || document.body.classList.contains("editor_enable")) {
        return;
    }
    var base = root.getAttribute("data-lib") || "/pnsb_website/static/lib/leaflet/";

    function load(done) {
        if (window.L) {
            done();
            return;
        }
        var css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = base + "leaflet.css";
        document.head.appendChild(css);
        var js = document.createElement("script");
        js.src = base + "leaflet.js";
        js.onload = done;
        js.onerror = function () { root.classList.add("is-map-failed"); };
        document.head.appendChild(js);
    }

    function init() {
        var L = window.L;
        var lat = parseFloat(root.getAttribute("data-lat"));
        var lng = parseFloat(root.getAttribute("data-lng"));
        var canvas = root.querySelector("[data-pnsb-map-canvas]");
        if (!L || !canvas || isNaN(lat) || isNaN(lng)) {
            return;
        }
        var touch = window.matchMedia("(pointer: coarse)").matches;
        var map = L.map(canvas, {
            center: [lat, lng],
            zoom: 16,
            minZoom: 11,
            maxZoom: 19,
            zoomControl: false,
            scrollWheelZoom: false, // enabled after the visitor clicks the map
            dragging: !touch, // one-finger page scroll stays page scroll on phones
            tap: false,
            attributionControl: true,
        });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
        }).addTo(map);
        // Phones: top-left, clear of the floating back-to-top / WhatsApp buttons.
        L.control.zoom({ position: touch ? "topleft" : "bottomright" }).addTo(map);

        var pin = L.divIcon({
            className: "pn-map__pin",
            html: '<span class="pn-map__pulse"></span><span class="pn-map__dot"></span><span class="pn-map__tag">PNSB</span>',
            iconSize: [20, 20],
            iconAnchor: [10, 10],
        });
        L.marker([lat, lng], { icon: pin, keyboard: false, title: "PNSB Machinery Industries LLP" }).addTo(map);
        // Shift the view so the pin sits beside the info card on wide screens.
        if (window.innerWidth >= 992) {
            map.panBy([-Math.round(canvas.clientWidth * 0.18), 0], { animate: false });
        }

        map.on("click", function () {
            map.scrollWheelZoom.enable();
            root.classList.add("is-active");
        });
        root.addEventListener("mouseleave", function () {
            map.scrollWheelZoom.disable();
            root.classList.remove("is-active");
        });
        root.querySelectorAll("[data-pnsb-map-recenter]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                map.flyTo([lat, lng], 17, { duration: 0.8 });
            });
        });
        root.classList.add("is-map-ready");
    }

    if (!window.IntersectionObserver) {
        load(init);
        return;
    }
    var io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
            io.disconnect();
            load(init);
        }
    }, { rootMargin: "300px" });
    io.observe(root);
})();
