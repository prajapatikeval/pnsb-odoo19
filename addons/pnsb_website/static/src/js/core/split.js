/**
 * Text splitting helpers. The original markup is kept on the element so that
 * it can be restored exactly when interactions stop (e.g. entering the
 * website editor), which keeps the saved page content clean.
 */

function remember(el) {
    if (el.__ipOriginalHTML === undefined) {
        el.__ipOriginalHTML = el.innerHTML;
    }
}

export function restore(el) {
    if (el.__ipOriginalHTML !== undefined) {
        el.innerHTML = el.__ipOriginalHTML;
        delete el.__ipOriginalHTML;
    }
}

function textNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => (node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
    });
    const nodes = [];
    while (walker.nextNode()) {
        nodes.push(walker.currentNode);
    }
    return nodes;
}

/**
 * Wrap every word in `wrap(word, index)` while preserving inline elements
 * such as <em> or <br>.
 */
function splitTextNodes(el, wrap) {
    let index = 0;
    for (const node of textNodes(el)) {
        const parts = node.nodeValue.split(/(\s+)/);
        const fragment = document.createDocumentFragment();
        for (const part of parts) {
            if (!part) {
                continue;
            }
            if (/^\s+$/.test(part)) {
                fragment.appendChild(document.createTextNode(part));
            } else {
                fragment.appendChild(wrap(part, index++));
            }
        }
        node.parentNode.replaceChild(fragment, node);
    }
    return index;
}

/** Masked word reveal: <span.ip-sw><span.ip-sw__in>word</span></span> */
export function splitWords(el) {
    remember(el);
    return splitTextNodes(el, (word, i) => {
        const outer = document.createElement("span");
        outer.className = "ip-sw";
        const inner = document.createElement("span");
        inner.className = "ip-sw__in";
        inner.style.setProperty("--i", i);
        inner.textContent = word;
        outer.appendChild(inner);
        return outer;
    });
}

/** Line reveal for markup that already declares lines with .ip-line */
export function splitLines(el) {
    const lines = el.querySelectorAll(":scope > .ip-line");
    if (!lines.length) {
        return splitWords(el);
    }
    remember(el);
    lines.forEach((line, i) => {
        const inner = document.createElement("span");
        inner.className = "ip-line__in";
        inner.style.setProperty("--i", i);
        while (line.firstChild) {
            inner.appendChild(line.firstChild);
        }
        line.appendChild(inner);
    });
    return lines.length;
}

/** Plain word spans used by the scroll-scrubbed opacity fill. */
export function splitScrubWords(el) {
    remember(el);
    const words = [];
    splitTextNodes(el, (word) => {
        const span = document.createElement("span");
        span.className = "ip-word";
        span.textContent = word;
        words.push(span);
        return span;
    });
    return words;
}
