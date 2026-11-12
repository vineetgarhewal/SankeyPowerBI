const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const navigator = {};

class Element {
    constructor(tagName) {
        this.tagName = tagName;
        this.children = [];
        this.attributes = {};
        this.dataset = {};
        this.style = {};
        this.style.setProperty = (name, value) => { this.style[name] = value; };
        this.listeners = {};
        this.textContent = "";
        const classes = this.classes = new Set();
        this.classList = {
            add: (...names) => names.forEach(name => classes.add(name)),
            contains: name => classes.has(name),
            toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)
        };
    }

    setAttribute(name, value) {
        this.attributes[name] = value;
    }

    getAttribute(name) {
        return this.attributes[name] ?? null;
    }

    get firstChild() {
        return this.children[0] ?? null;
    }

    insertBefore(child, reference) {
        const index = this.children.indexOf(reference);
        this.children.splice(index < 0 ? this.children.length : index, 0, child);
    }

    cloneNode(deep) {
        const clone = new Element(this.tagName);
        Object.assign(clone.attributes, this.attributes);
        Object.assign(clone.dataset, this.dataset);
        for (const [name, value] of Object.entries(this.style)) {
            if (typeof value !== "function") {
                clone.style[name] = value;
            }
        }
        this.classes.forEach(name => clone.classList.add(name));
        clone.textContent = this.textContent;
        if (deep) {
            this.children.forEach(child => clone.appendChild(child.cloneNode(true)));
        }
        return clone;
    }

    get outerHTML() {
        const escape = text => String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
        const style = Object.entries(this.style).filter(([, value]) => typeof value === "string")
            .map(([name, value]) => `${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}:${value}`)
            .join(";");
        const attributes = Object.entries({
            ...this.attributes,
            ...(this.classes.size ? { class: [...this.classes].join(" ") } : {}),
            ...(style ? { style } : {})
        }).map(([name, value]) => ` ${name}="${escape(value)}"`).join("");
        return `<${this.tagName}${attributes}>${escape(this.textContent)}${this.children.map(child => child.outerHTML).join("")}</${this.tagName}>`;
    }

    appendChild(child) {
        this.children.push(child);
        return child;
    }

    replaceChildren() {
        this.children = [];
    }

    addEventListener(name, handler) {
        this.listeners[name] = handler;
    }

    focus() {
        this.focused = true;
    }

    select() {
        this.selected = true;
    }

    emit(name, overrides = {}) {
        this.listeners[name]?.({
            clientX: 120,
            clientY: 80,
            stopPropagation() {},
            preventDefault() {},
            ...overrides
        });
    }

    querySelectorAll(selector) {
        return this.children.flatMap(child => [
            ...(selector === "*" || child.classList.contains(selector.slice(1)) ? [child] : []),
            ...child.querySelectorAll(selector)
        ]);
    }
}

function loadSource(file, imports = {}) {
    const source = readFileSync(path.join(__dirname, "..", "src", file), "utf8");
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    });
    const exports = {};
    vm.runInNewContext(outputText, {
        exports,
        require: name => imports[name] ?? {},
        document: {
            createElementNS: (_, tagName) => new Element(tagName),
            createElement: tagName => new Element(tagName)
        },
        window: {
            getComputedStyle: element => ({
                backgroundColor: element.style.backgroundColor ?? "",
                getPropertyValue: name => element.style[name]
                    ?? element.style[name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())]
                    ?? element.attributes[name] ?? ""
            })
        },
        Intl,
        navigator,
        console
    });
    return exports;
}

const palettes = loadSource("palettes.ts");
const htmlExport = loadSource("htmlExport.ts");
const { Visual } = loadSource("visual.ts", {
    "./palettes": palettes,
    "./htmlExport": htmlExport,
    "powerbi-visuals-api": {
        default: { PrivilegeStatus: { Allowed: 0, NotDeclared: 1, NotSupported: 2, DisabledByAdmin: 3 } }
    }
});
const value = value => ({ value });
const selectionId = key => ({ getKey: () => key });

function fixture() {
    const visual = Object.create(Visual.prototype);
    visual.svg = new Element("svg");
    visual.target = new Element("div");
    visual.copyHtmlButton = new Element("button");
    visual.copyStatus = new Element("div");
    visual.copyHtmlText = new Element("textarea");
    visual.copyingHtml = false;
    navigator.clipboard = undefined;
    visual.formattingSettings = {
        layoutCard: {
            palette: value({ value: "custom" }),
            nodeWidth: value(20),
            backgroundColor: value({ value: "#ABCDEF" }),
            showDotPattern: value(false)
        },
        linkCard: { opacity: value(42), autoOpacity: value(false), showValues: value(false) },
        nodeCard: { borderColor: value({ value: "#FFFFFF" }), borderWidth: value(1) },
        labelCard: {
            show: value(true), showValues: value(true), color: value({ value: "#123456" }),
            fontSize: value(12), autoFontSize: value(false), bold: value(false), autoBold: value(false)
        }
    };
    visual.dataView = {
        table: { columns: [{ displayName: "Repair count", roles: { weight: true } }], rows: [[4]] }
    };
    const calls = { show: [], move: [], hide: [], select: [] };
    visual.tooltipService = Object.fromEntries(
        ["show", "move", "hide"].map(name => [name, options => calls[name].push(options)])
    );
    visual.selectionManager = {
        getSelectionIds: () => [],
        select: (ids, multi) => {
            calls.select.push({ ids, multi });
            return Promise.resolve(Array.isArray(ids) ? ids : [ids]);
        }
    };
    function node(name, x, depth) {
        return {
            name, x, y: 30, depth, value: 15, height: 20, color: "#118DFF",
            incoming: [], outgoing: [], selectionIds: []
        };
    }
    const team = node("Team A", 100, 0);
    const otherTeam = node("Team B", 100, 0);
    const repairs = node("RepairItems", 500, 1);
    const other = node("Other", 500, 1);
    function link(source, target, amount, key) {
        const result = {
            source, target, value: amount, color: "#118DFF", width: 0.5,
            y0: 40, y1: 60, selectionId: selectionId(key)
        };
        source.outgoing.push(result);
        source.selectionIds.push(result.selectionId);
        target.incoming.push(result);
        target.selectionIds.push(result.selectionId);
        return result;
    }
    const links = [
        link(team, repairs, 4, "a-repairs"),
        link(team, other, 6, "a-other"),
        link(otherTeam, repairs, 16, "b-repairs")
    ];
    return { visual, calls, team, repairs, links };
}

test("flow hover keeps tooltip contents and identity while the pointer moves", () => {
    const { visual, calls, links } = fixture();
    visual.renderLink(visual.svg, links[0]);
    const group = visual.svg.children[0];
    group.emit("mouseenter");
    group.emit("mousemove", { clientX: 130 });

    const rows = calls.show[0].dataItems;
    assert.equal(rows.find(row => row.displayName === "Source").value, "Team A");
    assert.equal(rows.find(row => row.displayName === "Destination").value, "RepairItems");
    assert.equal(rows.find(row => row.displayName === "Repair count").value, "4");
    assert.equal(rows.find(row => row.displayName === "Share of source outgoing").value, "40%");
    assert.equal(rows.find(row => row.displayName === "Share of destination incoming").value, "20%");
    assert.equal(Object.hasOwn(calls.move[0], "dataItems"), false);
    assert.equal(calls.move[0].identities[0], links[0].selectionId);
    assert.equal(calls.move[0].coordinates[0], 130);
    group.emit("mouseleave");
    assert.equal(calls.hide.length, 1);
});

test("thin flows have a larger hit target and a native tooltip fallback", () => {
    const { visual, links } = fixture();
    visual.renderLink(visual.svg, links[0]);
    const group = visual.svg.children[0];
    const hitArea = group.querySelectorAll(".sankey-link-hit-area")[0];
    const stroke = group.querySelectorAll(".sankey-link")[0];
    assert.equal(hitArea.attributes["stroke-width"], "10");
    assert.equal(stroke.attributes["stroke-width"], "0.5");
    assert.equal(hitArea.attributes.d, stroke.attributes.d);
    assert.equal(hitArea.attributes["pointer-events"], "stroke");
    assert.equal(group.children.find(child => child.tagName === "title").textContent,
        "Team A to RepairItems: 4");
});

test("flow value labels are opt-in and honor light and dark palettes", () => {
    const { visual, links } = fixture();
    visual.renderLink(visual.svg, links[0]);
    assert.equal(visual.svg.querySelectorAll(".sankey-link-label").length, 0);
    visual.formattingSettings.linkCard.showValues.value = true;
    visual.renderLink(visual.svg, links[0]);
    let label = visual.svg.querySelectorAll(".sankey-link-label")[0];
    assert.equal(label.textContent, "4");
    assert.equal(label.attributes.fill, "#123456");
    assert.equal(label.attributes.stroke, "#ABCDEF");
    assert.equal(label.attributes.x, "310");
    assert.equal(label.attributes.y, "46");

    visual.svg.replaceChildren();
    visual.formattingSettings.layoutCard.palette.value.value = "darkBackground";
    visual.renderLink(visual.svg, links[0]);
    label = visual.svg.querySelectorAll(".sankey-link-label")[0];
    assert.equal(label.attributes.fill, "#FFFFFF");
    assert.equal(label.attributes.stroke, "#000000");
});

test("team hover highlights its direct flows without changing the selection", () => {
    const { visual, team, links, calls } = fixture();
    links.forEach(link => visual.renderLink(visual.svg, link));
    visual.applySelection([links[1].selectionId]);
    visual.renderNode(visual.svg, team, 800, 400);
    const node = visual.svg.querySelectorAll(".sankey-node")[0];
    node.emit("mouseenter");
    const groups = visual.svg.querySelectorAll(".sankey-flow");
    assert.equal(groups[0].classList.contains("hover-dimmed"), false);
    assert.equal(groups[1].classList.contains("hover-dimmed"), false);
    assert.equal(groups[2].classList.contains("hover-dimmed"), true);
    assert.equal(groups[0].classList.contains("dimmed"), true);
    assert.equal(calls.select.length, 0);
    node.emit("mousemove");
    assert.equal(calls.move[0].identities[0], team.selectionIds[0]);
    node.emit("mouseleave");
    assert.equal(groups[2].classList.contains("hover-dimmed"), false);
    assert.equal(groups[0].classList.contains("dimmed"), true);
});

test("node tooltips show exact direct team contributions, grouping duplicate endpoints", () => {
    const { visual, calls, team, repairs, links } = fixture();
    const duplicate = { ...links[0], value: 3 };
    team.outgoing.push(duplicate);
    repairs.incoming.push(duplicate);
    visual.showNodeTooltip({ clientX: 100, clientY: 100 }, team);
    let rows = calls.show[0].dataItems;
    assert.equal(rows.find(row => row.displayName === "To RepairItems").value, "7");
    assert.equal(rows.find(row => row.displayName === "Incoming").value, "0");
    visual.showNodeTooltip({ clientX: 100, clientY: 100 }, repairs);
    rows = calls.show[1].dataItems;
    assert.equal(rows.find(row => row.displayName === "From Team A").value, "7");
    assert.equal(rows.find(row => row.displayName === "From Team B").value, "16");
});

test("large tooltip breakdowns retain the largest contributors and total the remainder", () => {
    const { visual } = fixture();
    const links = Array.from({ length: 12 }, (_, index) => ({
        target: { name: `Team ${index}` }, value: index + 1
    }));
    const rows = visual.getFlowBreakdown(links, link => link.target.name, "To");
    assert.equal(rows.length, 11);
    assert.equal(rows[0].displayName, "To Team 11");
    assert.equal(rows[10].displayName, "To other nodes (2)");
    assert.equal(rows[10].value, "3");
});

test("flow hover and keyboard selection use the same flow identity", async () => {
    const { visual, links, calls } = fixture();
    links.forEach(link => visual.renderLink(visual.svg, link));
    const groups = visual.svg.querySelectorAll(".sankey-flow");
    groups[0].emit("mouseenter");
    assert.equal(groups[1].classList.contains("hover-dimmed"), true);
    groups[0].emit("mouseleave");
    assert.equal(groups[1].classList.contains("hover-dimmed"), false);
    groups[0].emit("keydown", { key: "Enter", ctrlKey: true });
    await Promise.resolve();
    assert.equal(calls.select[0].ids, links[0].selectionId);
    assert.equal(calls.select[0].multi, true);
    assert.equal(groups[1].classList.contains("dimmed"), true);
});

test("redraw restores selection styling on flows", () => {
    const { visual, links, team, repairs } = fixture();
    visual.getRoleIndexes = () => ({ source: 0, target: 1, weight: 2, color: -1 });
    visual.calculateLayout = () => ({ nodes: [team, repairs], links });
    visual.selectionManager.getSelectionIds = () => [links[0].selectionId];
    visual.render(800, 400);
    const groups = visual.svg.querySelectorAll(".sankey-flow");
    assert.equal(groups[0].classList.contains("dimmed"), false);
    assert.equal(groups[1].classList.contains("dimmed"), true);
});

function layoutFixture() {
    const { visual } = fixture();
    Object.assign(visual.formattingSettings.layoutCard, {
        edgePadding: value(20), nodePadding: value(24), autoNodeSpacing: value(false),
        heightUtilization: value(65), nodeScalePercent: value(100), autoNodeScale: value(false),
        horizontalSpacingPercent: value(100), autoHorizontalSpacing: value(false)
    });
    Object.assign(visual.formattingSettings.nodeCard, {
        defaultColor: value({ value: "#118DFF" }), maxHeightPercent: value(35)
    });
    visual.positions = {};
    visual.host = {
        createSelectionIdBuilder: () => ({
            withTable(_, rowIndex) {
                this.rowIndex = rowIndex;
                return this;
            },
            createSelectionId() {
                return selectionId(`${this.rowIndex}`);
            }
        })
    };
    visual.measureTextWidth = (text, fontSize) =>
        text.length * fontSize * (visual.getEffectiveLabelBold() ? 0.7 : 0.6);
    visual.dataView.table = {
        columns: [
            { roles: { source: true } }, { roles: { target: true } }, { roles: { weight: true } }
        ],
        rows: [
            ["Configuration and setup of Nexus Tenant Workloads", "TotalSupportRequests", 25],
            ["Configuration and setup of Nexus Platform", "TotalSupportRequests", 35],
            ["TotalSupportRequests", "IcMs", 60],
            ["IcMs", "Team A", 60],
            ["Team A", "RepairItems", 30]
        ]
    };
    const indexes = { source: 0, target: 1, weight: 2, color: -1 };
    return { visual, layout: width => visual.calculateLayout(width, 800, indexes) };
}

test("initial layout reserves the full left label width instead of capping it at 200px", () => {
    const { visual, layout } = layoutFixture();
    for (const width of [800, 1660]) {
        for (const fontSize of [12, 18]) {
            visual.formattingSettings.labelCard.fontSize.value = fontSize;
            visual.formattingSettings.labelCard.bold.value = true;
            const result = layout(width);
            for (const node of result.nodes.filter(node => node.depth === 0)) {
                const labelWidth = visual.measureLabelWidth(node.name, node.value, fontSize);
                assert.ok(labelWidth > 200);
                assert.ok(node.x - 8 - labelWidth >= 20, `left label clipped at ${width}px`);
            }
            assert.ok(result.nodes.every(node => Number.isFinite(node.x)));
            assert.ok(result.nodes.every(node => node.x + 20 <= width));
            assert.ok(result.links.every(link => link.target.x >= link.source.x));
        }
    }
});

test("saved source positions are moved right only when needed to keep labels visible", () => {
    const { visual, layout } = layoutFixture();
    const name = visual.dataView.table.rows[0][0];
    visual.positions[name] = { x: 50, y: 80 };
    let node = layout(1660).nodes.find(node => node.name === name);
    assert.ok(node.x - 8 - visual.measureLabelWidth(name, node.value, 12) >= 20);
    assert.equal(node.y, 80);

    visual.positions[name].x = 700;
    node = layout(1660).nodes.find(node => node.name === name);
    assert.equal(node.x, 700);
    assert.equal(node.y, 80);
});

test("hidden labels do not reserve extra left space for long source names", () => {
    const { visual, layout } = layoutFixture();
    visual.formattingSettings.labelCard.show.value = false;
    const result = layout(1660);
    assert.equal(result.nodes.find(node => node.depth === 0).x, 100);
});

test("HTML snapshots preserve the current geometry, dark theme, labels and native tooltips", () => {
    const { visual, links, team } = fixture();
    visual.svg.setAttribute("width", "1660");
    visual.svg.setAttribute("height", "800");
    visual.svg.setAttribute("viewBox", "0 0 1660 800");
    visual.formattingSettings.layoutCard.palette.value.value = "darkBackground";
    visual.formattingSettings.layoutCard.showDotPattern.value = true;
    visual.formattingSettings.linkCard.showValues.value = true;
    visual.applyBackground();
    visual.renderLink(visual.svg, links[0]);
    visual.renderNode(visual.svg, team, 1660, 800);
    const original = visual.svg.outerHTML;
    const html = htmlExport.createHtmlSnapshot(visual.svg);

    assert.ok(html.startsWith("<!doctype html>"));
    assert.ok(html.includes('charset="utf-8"'));
    assert.ok(html.includes('viewBox="0 0 1660 800"'));
    assert.ok(html.includes(`d="${visual.linkPath(links[0])}"`));
    assert.ok(html.includes("background-color:#000000"));
    assert.ok(html.includes("radial-gradient"));
    assert.ok(html.includes("fill:#FFFFFF"));
    assert.ok(html.includes("font-size:12px"));
    assert.ok(html.includes("width:1660px"));
    assert.ok(html.includes("Team A to RepairItems: 4"));
    assert.ok(html.includes("<title>Team A: 15</title>"));
    assert.ok(html.includes("sankey-link-label"));
    assert.ok(!html.includes("<script"));
    assert.ok(!html.includes("<button"));
    assert.equal(visual.svg.outerHTML, original);
});

test("exported labels remain text, including Unicode and HTML-looking data", () => {
    const { visual, team } = fixture();
    team.name = 'Team \u03a9 <script>alert("x")</script> & others';
    visual.renderNode(visual.svg, team, 1660, 800);
    const html = htmlExport.createHtmlSnapshot(visual.svg);
    assert.ok(html.includes("Team \u03a9 &lt;script&gt;"));
    assert.ok(html.includes("&amp; others"));
    assert.ok(!html.includes('<script>alert("x")</script>'));
});

test("copy writes the HTML snapshot without invoking the download service", async () => {
    const { visual, links } = fixture();
    visual.renderLink(visual.svg, links[0]);
    let copied;
    visual.host = {
        downloadService: {
            exportStatus: () => { throw new Error("Download service must not be used"); },
            exportVisualsContent: () => { throw new Error("Download service must not be used"); }
        }
    };
    navigator.clipboard = { writeText: async html => { copied = html; } };
    await visual.copyHtml();
    assert.ok(copied.startsWith("<!doctype html>"));
    assert.ok(copied.includes("Team A to RepairItems: 4"));
    assert.ok(visual.copyStatus.textContent.includes("HTML copied"));
    assert.ok(visual.copyStatus.textContent.includes("save as sankey.html"));
    assert.equal(visual.copyHtmlText.hidden, true);
    assert.equal(visual.copyHtmlButton.disabled, false);
});

test("missing and denied clipboard access select HTML for manual copying", async () => {
    for (const clipboard of [undefined, {}, { writeText: async () => { throw new Error("NotAllowedError"); } }]) {
        const { visual, links } = fixture();
        visual.renderLink(visual.svg, links[0]);
        navigator.clipboard = clipboard;
        await visual.copyHtml();
        assert.equal(visual.copyingHtml, false);
        assert.equal(visual.copyHtmlButton.disabled, false);
        assert.equal(visual.copyHtmlText.hidden, false);
        assert.equal(visual.copyHtmlText.focused, true);
        assert.equal(visual.copyHtmlText.selected, true);
        assert.ok(visual.copyHtmlText.value.includes("Team A to RepairItems: 4"));
        assert.ok(visual.copyStatus.textContent.includes("Press Ctrl+C"));
        assert.ok(!visual.copyStatus.textContent.includes("HTML copied"));
        assert.equal(visual.svg.querySelectorAll(".sankey-flow").length, 1);
    }
});

test("snapshot failures preserve the chart and copying can be retried", async () => {
    const { visual, links } = fixture();
    visual.renderLink(visual.svg, links[0]);
    const clone = visual.svg.cloneNode;
    visual.svg.cloneNode = () => { throw new Error("Snapshot failure"); };
    await visual.copyHtml();
    assert.ok(visual.copyStatus.textContent.includes("could not be prepared"));
    assert.equal(visual.copyHtmlButton.disabled, false);
    assert.equal(visual.copyingHtml, false);
    assert.equal(visual.copyHtmlText.hidden, true);
    assert.equal(visual.svg.querySelectorAll(".sankey-flow").length, 1);
    visual.svg.cloneNode = clone;
    navigator.clipboard = { writeText: async () => {} };
    await visual.copyHtml();
    assert.ok(visual.copyStatus.textContent.includes("HTML copied"));
});

test("a pending copy captures the clicked view and ignores duplicate clicks", async () => {
    const { visual, links } = fixture();
    visual.renderLink(visual.svg, links[0]);
    let allow;
    let calls = 0;
    let content;
    navigator.clipboard = {
        writeText: html => {
            calls++;
            content = html;
            return new Promise(resolve => { allow = resolve; });
        }
    };
    const pending = visual.copyHtml();
    assert.equal(visual.copyHtmlButton.disabled, true);
    await visual.copyHtml();
    visual.svg.replaceChildren();
    allow();
    await pending;
    assert.equal(calls, 1);
    assert.ok(content.includes("Team A to RepairItems: 4"));
    assert.equal(visual.copyHtmlButton.disabled, true);
});

test("empty charts do not write to the clipboard", async () => {
    const { visual } = fixture();
    navigator.clipboard = { writeText: () => { throw new Error("Empty charts must not be copied"); } };
    await visual.copyHtml();
    assert.equal(visual.copyingHtml, false);
    assert.equal(visual.copyStatus.textContent, "");
});
