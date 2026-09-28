/**
 * Shading for the CSS 3D hexagonal prism (.ip-prism). Each face gets a
 * lightness value (--l) from a simple Lambert + specular model so the metal
 * reacts to rotation instead of looking painted on.
 */

import { clamp } from "./motion";

const DEG = Math.PI / 180;

export const METAL_SWATCHES = {
    steel: ["#d4d9e0", "#1d2025"],
    black: ["#777b84", "#07080a"],
    stainless: ["#f7f9fb", "#5f6671"],
    brass: ["#ffe08e", "#6b4c12"],
    titanium: ["#d9deea", "#343b4b"],
    none: null,
    zinc: ["#eef3fa", "#56616f"],
    yellow: ["#fbe78f", "#7c5d12"],
    hdg: ["#c9cdd2", "#565a60"],
    flake: ["#dcdfe3", "#61656b"],
    zinc_nickel: ["#f1f4f8", "#5e646e"],
};

export function setPrismMetal(prismEl, swatch) {
    const colors = METAL_SWATCHES[swatch];
    if (!colors) {
        return;
    }
    prismEl.style.setProperty("--m-hi", colors[0]);
    prismEl.style.setProperty("--m-lo", colors[1]);
}

export function shadePrism(prismEl, rotation, { light = -40, ambient = 0.14, gloss = 0.55 } = {}) {
    if (!prismEl.__ipFaces) {
        prismEl.__ipFaces = [...prismEl.querySelectorAll(".ip-prism__face")];
    }
    prismEl.style.setProperty("--ry", `${rotation.toFixed(2)}deg`);
    prismEl.__ipFaces.forEach((face, i) => {
        const angle = (rotation + i * 60 - light) * DEG;
        const lambert = Math.max(0, Math.cos(angle));
        const view = Math.max(0, Math.cos((rotation + i * 60) * DEG));
        const specular = Math.pow(lambert, 24) * gloss;
        const l = clamp(ambient + lambert * 0.62 * (0.55 + 0.45 * view) + specular, 0, 1);
        face.style.setProperty("--l", l.toFixed(3));
    });
}

export function resetPrism(prismEl) {
    prismEl.style.removeProperty("--ry");
    prismEl.style.removeProperty("--m-hi");
    prismEl.style.removeProperty("--m-lo");
    (prismEl.__ipFaces || []).forEach((face) => face.style.removeProperty("--l"));
    delete prismEl.__ipFaces;
}
