import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { formatNumber, motion } from "../core/motion";
import { basket, compare, escapeHtml } from "../core/store";

const interactions = registry.category("public.interactions");

const MAX_FILES = 6;
const MAX_SIZE = 15 * 1024 * 1024;
const EXTENSIONS = [
    "pdf", "dwg", "dxf", "step", "stp", "igs", "iges", "stl", "x_t",
    "png", "jpg", "jpeg", "webp", "zip", "xlsx", "xls", "csv", "docx",
];

const prettySize = (bytes) =>
    bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// -----------------------------------------------------------------------------
// Compare page
// -----------------------------------------------------------------------------
export class IpComparePage extends Interaction {
    static selector = "[data-ip-compare-page]";

    dynamicContent = {
        "[data-ip-compare-diff]": {
            "t-on-change": (ev) => this.highlight(ev.currentTarget.checked),
        },
        "[data-ip-compare-remove]": {
            "t-on-click": (ev) => this.removeColumn(parseInt(ev.currentTarget.dataset.ipCompareRemove, 10)),
        },
    };

    setup() {
        this.table = this.el.querySelector(".ip-table--compare");
    }

    start() {
        // Opening a shared link restores the comparison list for this visitor.
        const ids = [...this.el.querySelectorAll("[data-ip-compare-col]")].map((th) => parseInt(th.dataset.ipCompareCol, 10));
        if (ids.length) {
            const known = new Set(compare.items().map((i) => i.id));
            if (ids.some((id) => !known.has(id))) {
                compare.save(
                    ids.map((id) => {
                        const th = this.el.querySelector(`[data-ip-compare-col="${id}"]`);
                        return {
                            id,
                            name: th.querySelector(".ip-compare__name")?.textContent.trim() || "",
                            image: th.querySelector("img")?.getAttribute("src") || "",
                            url: th.querySelector("a")?.getAttribute("href") || "",
                        };
                    })
                );
            }
        } else if (compare.items().length) {
            window.location.replace(compare.url());
        }
    }

    highlight(on) {
        if (!this.table) {
            return;
        }
        this.table.querySelectorAll("[data-ip-compare-row]").forEach((row) => {
            const values = [...row.querySelectorAll("td")].map((td) => td.textContent.trim().toLowerCase());
            const same = values.every((v) => v === values[0]);
            row.classList.toggle("is-same", on && same);
            row.classList.toggle("is-diff", on && !same);
        });
        this.table.classList.toggle("is-diff-only", on);
    }

    removeColumn(id) {
        compare.remove(id);
        const headers = [...this.table.querySelectorAll("thead th")];
        const index = headers.findIndex((th) => parseInt(th.dataset.ipCompareCol, 10) === id);
        if (index < 0) {
            return;
        }
        const cells = [...this.table.querySelectorAll("tr")].map((tr) => tr.children[index]).filter(Boolean);
        cells.forEach((cell) => cell.classList.add("is-removing"));
        setTimeout(() => {
            if (compare.items().length) {
                window.location.replace(compare.url());
            } else {
                window.location.replace("/products/compare");
            }
        }, 380);
    }
}
interactions.add("pnsb_website.compare_page", IpComparePage);

// -----------------------------------------------------------------------------
// Multi-step RFQ form
// -----------------------------------------------------------------------------
export class IpRfq extends Interaction {
    static selector = "[data-ip-rfq]";

    dynamicContent = {
        _root: {
            "t-on-submit.prevent": this.submit,
        },
        "[data-ip-rfq-next]": {
            "t-on-click": () => this.goTo(this.step + 1),
            "t-att-hidden": () => this.step >= 2,
        },
        "[data-ip-rfq-back]": {
            "t-on-click": () => this.goTo(this.step - 1),
            "t-att-hidden": () => this.step === 0,
        },
        "[data-ip-rfq-submit]": {
            "t-att-hidden": () => this.step < 2,
            "t-att-class": () => ({ "is-busy": this.busy }),
        },
        "[data-ip-rfq-panel]": {
            "t-att-class": (el) => ({ "is-active": parseInt(el.dataset.ipRfqPanel, 10) === this.step }),
        },
        "[data-ip-rfq-step-label]": {
            "t-att-class": (el) => {
                const i = parseInt(el.dataset.ipRfqStepLabel, 10);
                return { "is-active": i === this.step, "is-done": i < this.step };
            },
        },
        "[data-ip-rfq-progress]": {
            "t-att-style": () => ({ "--p": String((this.step + 1) / 3) }),
        },
        "[data-ip-rfq-add-custom]": {
            "t-on-click": this.addCustom,
        },
        "[data-ip-rfq-items]": {
            "t-on-input": this.onItemInput,
            "t-on-click": this.onItemClick,
        },
        "[data-ip-drop]": {
            "t-on-dragenter.prevent.noUpdate": (ev) => ev.currentTarget.classList.add("is-over"),
            "t-on-dragover.prevent.noUpdate": (ev) => ev.currentTarget.classList.add("is-over"),
            "t-on-dragleave.noUpdate": (ev) => ev.currentTarget.classList.remove("is-over"),
            "t-on-drop.prevent": this.onDrop,
        },
        "[data-ip-drop-input]": {
            "t-on-change": this.onFileInput,
        },
        "[data-ip-drop-files]": {
            "t-on-click": this.onFileClick,
        },
        '[data-ip-rfq-sum="lines"]': { "t-out": () => String(this.items.length) },
        '[data-ip-rfq-sum="pieces"]': {
            "t-out": () => formatNumber(this.items.reduce((s, i) => s + (parseInt(i.qty, 10) || 0), 0)),
        },
        '[data-ip-rfq-sum="files"]': { "t-out": () => String(this.files.length) },
        "[data-ip-rfq-error]": {
            "t-out": () => this.error,
            "t-att-hidden": () => !this.error,
        },
    };

    setup() {
        this.step = 0;
        this.busy = false;
        this.error = "";
        this.files = [];
        this.items = basket.items().map((i) => ({ ...i }));
        this.itemsBox = this.el.querySelector("[data-ip-rfq-items]");
        this.filesBox = this.el.querySelector("[data-ip-drop-files]");
        this.success = document.querySelector("[data-ip-rfq-success]");
    }

    start() {
        this.renderItems();
        this.renderFiles();
    }

    // ------------------------------------------------------------------
    // Items
    // ------------------------------------------------------------------

    renderItems() {
        if (!this.itemsBox) {
            return;
        }
        this.itemsBox.innerHTML = this.items
            .map((item) => {
                const media = item.image
                    ? `<img src="${escapeHtml(item.image)}" alt=""/>`
                    : `<span class="ip-ritem__custom-icon"><svg class="ip-i"><use href="#ip-i-ruler"/></svg></span>`;
                const name = item.productId
                    ? `<div class="ip-ritem__name">${escapeHtml(item.name)}</div>`
                    : `<div class="ip-ritem__name"><input class="ip-input" data-field="name" maxlength="200" placeholder="Describe the part, e.g. Special shoulder bolt M16, 10.9" value="${escapeHtml(item.name === "Custom part" ? "" : item.name)}"/></div>`;
                const field = (key, label, placeholder = "") =>
                    `<label><span>${label}</span><input class="ip-input" data-field="${key}" maxlength="80" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(item[key] || "")}"/></label>`;
                return `
                <div class="ip-ritem" data-uid="${escapeHtml(item.uid)}">
                    <div class="ip-ritem__top">
                        ${media}
                        ${name}
                        <button type="button" class="ip-icon-btn ip-icon-btn--sm" data-remove="" aria-label="Remove"><svg class="ip-i"><use href="#ip-i-trash"/></svg></button>
                    </div>
                    <div class="ip-ritem__fields">
                        ${field("size", "Size", "M12")}
                        ${field("length", "Length", "50 mm")}
                        ${field("material", "Material", "Steel 8.8")}
                        ${field("finish", "Finish", "Zinc plated")}
                        <label><span>Quantity</span><input class="ip-input" data-field="qty" inputmode="numeric" maxlength="12" value="${escapeHtml(formatNumber(item.qty || 0))}"/></label>
                    </div>
                </div>`;
            })
            .join("");
    }

    addCustom() {
        const item = basket.add({ productId: null, name: "Custom part", image: "", url: "", size: "", length: "", material: "", finish: "", qty: 1000 });
        this.items = basket.items().map((i) => ({ ...i }));
        this.renderItems();
        this.itemsBox.querySelector(`[data-uid="${item.uid}"] input`)?.focus();
    }

    onItemInput(ev) {
        const input = ev.target.closest("[data-field]");
        const row = ev.target.closest("[data-uid]");
        if (!input || !row) {
            return;
        }
        const key = input.dataset.field;
        let value = input.value;
        if (key === "qty") {
            value = parseInt(value.replace(/[^\d]/g, ""), 10) || 0;
        }
        const item = this.items.find((i) => i.uid === row.dataset.uid);
        if (item) {
            item[key] = value;
            basket.update(item.uid, { [key]: value });
        }
    }

    onItemClick(ev) {
        const remove = ev.target.closest("[data-remove]");
        if (!remove) {
            return;
        }
        const row = remove.closest("[data-uid]");
        row.classList.add("is-removing");
        setTimeout(() => {
            basket.remove(row.dataset.uid);
            this.items = basket.items().map((i) => ({ ...i }));
            this.renderItems();
            this.updateContent();
        }, 360);
    }

    // ------------------------------------------------------------------
    // Files
    // ------------------------------------------------------------------

    addFiles(list) {
        for (const file of list) {
            if (this.files.length >= MAX_FILES) {
                this.error = `Up to ${MAX_FILES} files per request.`;
                break;
            }
            const ext = (file.name.split(".").pop() || "").toLowerCase();
            const invalid = !EXTENSIONS.includes(ext) ? "Unsupported type" : file.size > MAX_SIZE ? "Larger than 15 MB" : "";
            this.files.push({ file, invalid });
        }
        this.renderFiles();
    }

    onDrop(ev) {
        ev.currentTarget.classList.remove("is-over");
        this.error = "";
        this.addFiles(ev.dataTransfer?.files || []);
    }

    onFileInput(ev) {
        this.error = "";
        this.addFiles(ev.currentTarget.files || []);
        ev.currentTarget.value = "";
    }

    onFileClick(ev) {
        const btn = ev.target.closest("[data-file-index]");
        if (btn) {
            this.files.splice(parseInt(btn.dataset.fileIndex, 10), 1);
            this.renderFiles();
        }
    }

    renderFiles() {
        if (!this.filesBox) {
            return;
        }
        this.filesBox.innerHTML = this.files
            .map(
                ({ file, invalid }, i) => `
                <li class="${invalid ? "is-invalid" : ""}">
                    <svg class="ip-i"><use href="#ip-i-file"/></svg>
                    <span>${escapeHtml(file.name)}</span>
                    <small>${invalid ? escapeHtml(invalid) : prettySize(file.size)}</small>
                    <button type="button" class="ip-icon-btn ip-icon-btn--sm" data-file-index="${i}" aria-label="Remove file"><svg class="ip-i"><use href="#ip-i-x"/></svg></button>
                </li>`
            )
            .join("");
    }

    // ------------------------------------------------------------------
    // Steps & submission
    // ------------------------------------------------------------------

    validateContact() {
        const name = this.el.querySelector("[name='contact_name']");
        const email = this.el.querySelector("[name='email']");
        const consent = this.el.querySelector("[data-ip-rfq-consent]");
        let ok = true;
        [name, email].forEach((input) => {
            const valid = input && input.value.trim() && input.checkValidity();
            input?.classList.toggle("is-invalid", !valid);
            ok = ok && !!valid;
        });
        if (!ok) {
            this.error = "Please enter your name and a valid business e-mail.";
            return false;
        }
        if (consent && !consent.checked) {
            this.error = "Please accept that we use your details to prepare the quotation.";
            return false;
        }
        return true;
    }

    goTo(step) {
        this.error = "";
        if (step > this.step && this.step === 0) {
            const message = this.el.querySelector("[name='message']")?.value.trim();
            if (!this.items.length && !this.files.some((f) => !f.invalid) && !message) {
                // Allowed: the visitor can still describe the need on the next step.
                this.error = "";
            }
        }
        this.step = Math.max(0, Math.min(2, step));
        const top = this.el.getBoundingClientRect().top + window.scrollY - 120;
        if (window.scrollY > top) {
            motion.scrollTo(top, { duration: 700 });
        }
    }

    async submit() {
        if (this.busy) {
            return;
        }
        this.error = "";
        if (this.step < 2) {
            this.goTo(this.step + 1);
            return;
        }
        if (!this.validateContact()) {
            return;
        }
        const validFiles = this.files.filter((f) => !f.invalid);
        const message = this.el.querySelector("[name='message']")?.value.trim();
        if (!this.items.length && !validFiles.length && !message) {
            this.error = "Add at least one part, a drawing or a short description of your need.";
            this.step = 0;
            return;
        }
        const lines = this.items.map((i) => ({
            productId: i.productId || null,
            name: i.name,
            size: i.size,
            length: i.length,
            material: i.material,
            finish: i.finish,
            qty: i.qty,
            note: i.note || "",
        }));
        const formData = new FormData();
        for (const el of this.el.elements) {
            if (!el.name || el.type === "file" || el.name === "lines") {
                continue;
            }
            if ((el.type === "checkbox" || el.type === "radio") && !el.checked) {
                continue;
            }
            formData.append(el.name, el.value);
        }
        formData.set("lines", JSON.stringify(lines));
        const onlyCustom = lines.every((l) => !l.productId);
        formData.set("source", validFiles.length && onlyCustom ? "custom" : "basket");
        validFiles.forEach(({ file }) => formData.append("attachments", file, file.name));

        this.busy = true;
        this.updateContent();
        try {
            const response = await this.waitFor(
                fetch(this.el.getAttribute("action"), { method: "POST", body: formData, credentials: "same-origin" })
            );
            const result = await this.waitFor(response.json().catch(() => ({ ok: false })));
            if (!response.ok || !result.ok) {
                this.error = result.error || "Something went wrong. Please try again or e-mail us directly.";
                return;
            }
            basket.clear();
            this.showSuccess(result.reference);
        } catch {
            this.error = "Network error. Please check your connection and try again.";
        } finally {
            this.busy = false;
        }
    }

    showSuccess(reference) {
        const ref = this.success?.querySelector("[data-ip-rfq-ref]");
        if (ref) {
            ref.textContent = reference || "received";
        }
        this.el.hidden = true;
        if (this.success) {
            this.success.hidden = false;
            motion.scrollTo(Math.max(0, this.success.getBoundingClientRect().top + window.scrollY - 140), { duration: 900 });
        }
    }

    destroy() {
        this.el.hidden = false;
        if (this.success) {
            this.success.hidden = true;
        }
    }
}
interactions.add("pnsb_website.rfq", IpRfq);
