const SVG_NS = "http://www.w3.org/2000/svg";

export function createHtmlSnapshot(svg: SVGSVGElement): string {
    const snapshot = svg.cloneNode(true) as SVGSVGElement;
    snapshot.setAttribute("xmlns", SVG_NS);
    const originals = [svg, ...Array.from(svg.querySelectorAll("*"))];
    const copies = [snapshot, ...Array.from(snapshot.querySelectorAll("*"))];
    const properties = [
        "background-color", "background-image", "background-size",
        "color", "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity",
        "stroke-linecap", "stroke-linejoin", "opacity", "filter",
        "font-family", "font-size", "font-weight", "text-anchor", "dominant-baseline",
        "paint-order", "overflow", "pointer-events"
    ];

    originals.forEach((element, index) => {
        const computed = window.getComputedStyle(element);
        const copy = copies[index] as SVGElement;
        for (const property of properties) {
            copy.style.setProperty(property, computed.getPropertyValue(property));
        }
    });
    snapshot.style.width = `${svg.getAttribute("width")}px`;
    snapshot.style.height = `${svg.getAttribute("height")}px`;
    snapshot.style.display = "block";

    snapshot.querySelectorAll<SVGGElement>(".sankey-node").forEach(node => {
        const title = document.createElementNS(SVG_NS, "title");
        title.textContent = node.getAttribute("aria-label") ?? "";
        node.insertBefore(title, node.firstChild);
        node.style.cursor = "default";
    });

    const body = document.createElement("body");
    body.style.margin = "0";
    body.style.backgroundColor = window.getComputedStyle(svg).backgroundColor;
    body.appendChild(snapshot);

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sankey diagram</title>
</head>
${body.outerHTML}
</html>`;
}
