"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import DataView = powerbi.DataView;
import DataViewMetadataColumn = powerbi.DataViewMetadataColumn;
import ISelectionId = powerbi.visuals.ISelectionId;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ITooltipService = powerbi.extensibility.ITooltipService;
import IVisual = powerbi.extensibility.visual.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

import { VisualFormattingSettingsModel } from "./settings";
import { DEFAULT_PALETTE_ID, PALETTE_OPTIONS } from "./palettes";
import { createHtmlSnapshot } from "./htmlExport";

const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_COLORS = [
    "#7AA7F8", "#73C9B0", "#F6B26B", "#A894E8", "#F08CA6",
    "#79C7E3", "#A8C96F", "#D99AD6", "#F2CB67", "#8FA6C9"
];

interface PersistedPosition {
    x?: number;
    y: number;
}

interface SankeyNode {
    name: string;
    depth: number;
    value: number;
    x: number;
    y: number;
    height: number;
    incoming: SankeyLink[];
    outgoing: SankeyLink[];
    color: string;
    selectionIds: ISelectionId[];
}

interface SankeyLink {
    source: SankeyNode;
    target: SankeyNode;
    value: number;
    color: string;
    index: number;
    y0: number;
    y1: number;
    width: number;
    selectionId: ISelectionId;
}

interface LayoutResult {
    nodes: SankeyNode[];
    links: SankeyLink[];
}

interface RoleIndexes {
    source: number;
    target: number;
    weight: number;
    color: number;
}

export class Visual implements IVisual {
    private readonly host: powerbi.extensibility.visual.IVisualHost;
    private readonly target: HTMLElement;
    private readonly svg: SVGSVGElement;
    private readonly nodeScaleSlider: HTMLInputElement;
    private readonly nodeScaleValue: HTMLSpanElement;
    private readonly nodeScaleAuto: HTMLButtonElement;
    private readonly nodeSpacingSlider: HTMLInputElement;
    private readonly nodeSpacingValue: HTMLSpanElement;
    private readonly nodeSpacingAuto: HTMLButtonElement;
    private readonly horizontalSpacingSlider: HTMLInputElement;
    private readonly horizontalSpacingValue: HTMLSpanElement;
    private readonly horizontalSpacingAuto: HTMLButtonElement;
    private readonly linkOpacitySlider: HTMLInputElement;
    private readonly linkOpacityValue: HTMLSpanElement;
    private readonly linkOpacityAuto: HTMLButtonElement;
    private readonly labelFontSizeSlider: HTMLInputElement;
    private readonly labelFontSizeValue: HTMLSpanElement;
    private readonly labelFontSizeAuto: HTMLButtonElement;
    private readonly labelBoldToggle: HTMLButtonElement;
    private readonly labelBoldValue: HTMLSpanElement;
    private readonly labelBoldAuto: HTMLButtonElement;
    private readonly paletteSelect: HTMLSelectElement;
    private readonly copyHtmlButton: HTMLButtonElement;
    private readonly copyStatus: HTMLDivElement;
    private readonly copyHtmlText: HTMLTextAreaElement;
    private readonly selectionManager: ISelectionManager;
    private readonly tooltipService: ITooltipService;
    private readonly formattingSettingsService: FormattingSettingsService;
    private formattingSettings = new VisualFormattingSettingsModel();
    private dataView: DataView | undefined;
    private positions: Record<string, PersistedPosition> = {};
    private positionState = "";
    private dataSignature = "";
    private draggedNode: SankeyNode | undefined;
    private dragOffset = { x: 0, y: 0 };
    private viewportWidth = 0;
    private viewportHeight = 0;
    private effectiveNodeScale = 100;
    private effectiveNodeSpacing = 24;
    private effectiveHorizontalSpacing = 100;
    private copyingHtml = false;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.target = options.element;
        this.selectionManager = options.host.createSelectionManager();
        this.tooltipService = options.host.tooltipService;
        this.formattingSettingsService = new FormattingSettingsService();

        this.target.classList.add("sankey-visual");
        this.svg = document.createElementNS(SVG_NS, "svg");
        this.svg.classList.add("sankey-canvas");
        this.svg.setAttribute("role", "img");
        this.svg.setAttribute("aria-label", "Sankey diagram");
        this.target.appendChild(this.svg);

        const scaleControl = document.createElement("div");
        scaleControl.classList.add("node-scale-control");
        const scaleLabel = document.createElement("label");
        const scaleTitle = document.createElement("span");
        scaleTitle.classList.add("control-title");
        scaleTitle.textContent = "Node size";
        scaleLabel.appendChild(scaleTitle);
        this.nodeScaleSlider = document.createElement("input");
        this.nodeScaleSlider.type = "range";
        this.nodeScaleSlider.min = "50";
        this.nodeScaleSlider.max = "180";
        this.nodeScaleSlider.step = "5";
        this.nodeScaleSlider.setAttribute("aria-label", "Node size percentage");
        this.nodeScaleValue = document.createElement("span");
        this.nodeScaleValue.classList.add("control-value");
        this.nodeScaleAuto = this.createAutoButton("Automatic node size");
        scaleLabel.appendChild(this.nodeScaleSlider);
        scaleLabel.appendChild(this.nodeScaleValue);
        scaleLabel.appendChild(this.nodeScaleAuto);
        scaleControl.appendChild(scaleLabel);

        const spacingLabel = document.createElement("label");
        const spacingTitle = document.createElement("span");
        spacingTitle.classList.add("control-title");
        spacingTitle.textContent = "Node spacing";
        spacingLabel.appendChild(spacingTitle);
        this.nodeSpacingSlider = document.createElement("input");
        this.nodeSpacingSlider.type = "range";
        this.nodeSpacingSlider.min = "0";
        this.nodeSpacingSlider.max = "80";
        this.nodeSpacingSlider.step = "2";
        this.nodeSpacingSlider.setAttribute("aria-label", "Distance between nodes");
        this.nodeSpacingValue = document.createElement("span");
        this.nodeSpacingValue.classList.add("control-value");
        this.nodeSpacingAuto = this.createAutoButton("Automatic node spacing");
        spacingLabel.appendChild(this.nodeSpacingSlider);
        spacingLabel.appendChild(this.nodeSpacingValue);
        spacingLabel.appendChild(this.nodeSpacingAuto);
        scaleControl.appendChild(spacingLabel);

        const horizontalSpacingLabel = document.createElement("label");
        const horizontalSpacingTitle = document.createElement("span");
        horizontalSpacingTitle.classList.add("control-title");
        horizontalSpacingTitle.textContent = "Horizontal spacing";
        horizontalSpacingLabel.appendChild(horizontalSpacingTitle);
        this.horizontalSpacingSlider = document.createElement("input");
        this.horizontalSpacingSlider.type = "range";
        this.horizontalSpacingSlider.min = "30";
        this.horizontalSpacingSlider.max = "100";
        this.horizontalSpacingSlider.step = "5";
        this.horizontalSpacingSlider.setAttribute("aria-label", "Horizontal distance between node columns");
        this.horizontalSpacingValue = document.createElement("span");
        this.horizontalSpacingValue.classList.add("control-value");
        this.horizontalSpacingAuto = this.createAutoButton("Automatic horizontal node spacing");
        horizontalSpacingLabel.appendChild(this.horizontalSpacingSlider);
        horizontalSpacingLabel.appendChild(this.horizontalSpacingValue);
        horizontalSpacingLabel.appendChild(this.horizontalSpacingAuto);
        scaleControl.appendChild(horizontalSpacingLabel);

        const opacityLabel = document.createElement("label");
        const opacityTitle = document.createElement("span");
        opacityTitle.classList.add("control-title");
        opacityTitle.textContent = "Link opacity";
        opacityLabel.appendChild(opacityTitle);
        this.linkOpacitySlider = document.createElement("input");
        this.linkOpacitySlider.type = "range";
        this.linkOpacitySlider.min = "5";
        this.linkOpacitySlider.max = "100";
        this.linkOpacitySlider.step = "5";
        this.linkOpacitySlider.setAttribute("aria-label", "Link opacity percentage");
        this.linkOpacityValue = document.createElement("span");
        this.linkOpacityValue.classList.add("control-value");
        this.linkOpacityAuto = this.createAutoButton("Automatic link opacity");
        opacityLabel.appendChild(this.linkOpacitySlider);
        opacityLabel.appendChild(this.linkOpacityValue);
        opacityLabel.appendChild(this.linkOpacityAuto);
        scaleControl.appendChild(opacityLabel);

        const fontSizeLabel = document.createElement("label");
        const fontSizeTitle = document.createElement("span");
        fontSizeTitle.classList.add("control-title");
        fontSizeTitle.textContent = "Label size";
        fontSizeLabel.appendChild(fontSizeTitle);
        this.labelFontSizeSlider = document.createElement("input");
        this.labelFontSizeSlider.type = "range";
        this.labelFontSizeSlider.min = "8";
        this.labelFontSizeSlider.max = "24";
        this.labelFontSizeSlider.step = "1";
        this.labelFontSizeSlider.setAttribute("aria-label", "Label font size");
        this.labelFontSizeValue = document.createElement("span");
        this.labelFontSizeValue.classList.add("control-value");
        this.labelFontSizeAuto = this.createAutoButton("Automatic label font size");
        fontSizeLabel.appendChild(this.labelFontSizeSlider);
        fontSizeLabel.appendChild(this.labelFontSizeValue);
        fontSizeLabel.appendChild(this.labelFontSizeAuto);
        scaleControl.appendChild(fontSizeLabel);

        const boldLabel = document.createElement("label");
        const boldTitle = document.createElement("span");
        boldTitle.classList.add("control-title");
        boldTitle.textContent = "Label bold";
        boldLabel.appendChild(boldTitle);
        this.labelBoldToggle = document.createElement("button");
        this.labelBoldToggle.type = "button";
        this.labelBoldToggle.classList.add("manual-toggle");
        this.labelBoldToggle.setAttribute("role", "switch");
        this.labelBoldToggle.setAttribute("aria-label", "Bold labels");
        this.labelBoldValue = document.createElement("span");
        this.labelBoldValue.classList.add("control-value");
        this.labelBoldAuto = this.createAutoButton("Automatic label bold");
        boldLabel.appendChild(this.labelBoldToggle);
        boldLabel.appendChild(this.labelBoldValue);
        boldLabel.appendChild(this.labelBoldAuto);
        scaleControl.appendChild(boldLabel);

        const paletteLabel = document.createElement("label");
        paletteLabel.classList.add("palette-row");
        const paletteTitle = document.createElement("span");
        paletteTitle.classList.add("control-title");
        paletteTitle.textContent = "Color palette";
        paletteLabel.appendChild(paletteTitle);
        this.paletteSelect = document.createElement("select");
        this.paletteSelect.setAttribute("aria-label", "Color palette");
        for (const palette of PALETTE_OPTIONS) {
            const option = document.createElement("option");
            option.value = palette.id;
            option.textContent = palette.displayName;
            this.paletteSelect.appendChild(option);
        }
        paletteLabel.appendChild(this.paletteSelect);
        scaleControl.appendChild(paletteLabel);

        this.copyHtmlButton = document.createElement("button");
        this.copyHtmlButton.type = "button";
        this.copyHtmlButton.classList.add("copy-html");
        this.copyHtmlButton.textContent = "Copy HTML";
        this.copyHtmlButton.title = "Copy the current diagram as HTML, then paste into a text editor and save as sankey.html";
        this.copyHtmlButton.disabled = true;
        this.copyHtmlButton.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            void this.copyHtml();
        });
        scaleControl.appendChild(this.copyHtmlButton);
        this.copyStatus = document.createElement("div");
        this.copyStatus.classList.add("copy-status");
        this.copyStatus.setAttribute("role", "status");
        this.copyStatus.setAttribute("aria-live", "polite");
        scaleControl.appendChild(this.copyStatus);
        this.copyHtmlText = document.createElement("textarea");
        this.copyHtmlText.classList.add("copy-html-text");
        this.copyHtmlText.readOnly = true;
        this.copyHtmlText.hidden = true;
        this.copyHtmlText.setAttribute("aria-label", "HTML snapshot: press Ctrl+C or Command+C to copy");
        this.copyHtmlText.addEventListener("click", event => event.stopPropagation());
        this.copyHtmlText.addEventListener("keydown", event => event.stopPropagation());
        scaleControl.appendChild(this.copyHtmlText);
        this.target.appendChild(scaleControl);

        const branding = document.createElement("button");
        branding.classList.add("visual-branding");
        branding.type = "button";
        branding.textContent = "Custom Sankey Visual by Vineet Garhewal";
        branding.title = "Open Vineet Garhewal's LinkedIn profile";
        branding.setAttribute("aria-label", "Open Vineet Garhewal's LinkedIn profile");
        branding.addEventListener("click", event => {
            event.stopPropagation();
            this.host.launchUrl("https://www.linkedin.com/in/vineetgarhewal/");
        });
        this.target.appendChild(branding);

        this.nodeScaleSlider.addEventListener("input", () => {
            const value = this.clamp(Number(this.nodeScaleSlider.value), 50, 180);
            this.formattingSettings.layoutCard.nodeScalePercent.value = value;
            this.nodeScaleValue.textContent = `${value}%`;
            if (this.viewportWidth > 0 && this.viewportHeight > 0) {
                this.render(this.viewportWidth, this.viewportHeight);
            }
        });
        this.nodeScaleSlider.addEventListener("change", () => {
            const value = this.clamp(Number(this.nodeScaleSlider.value), 50, 180);
            this.host.persistProperties({
                merge: [{
                    objectName: "layout",
                    selector: null,
                    properties: { nodeScalePercent: value }
                }]
            });
        });
        this.nodeScaleAuto.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            this.toggleAutoSetting(
                "layout",
                "autoNodeScale",
                this.formattingSettings.layoutCard.autoNodeScale
            );
        });
        this.nodeSpacingSlider.addEventListener("input", () => {
            const value = this.clamp(Number(this.nodeSpacingSlider.value), 0, 80);
            this.formattingSettings.layoutCard.nodePadding.value = value;
            this.nodeSpacingValue.textContent = `${value}px`;
            if (this.viewportWidth > 0 && this.viewportHeight > 0) {
                this.render(this.viewportWidth, this.viewportHeight);
            }
        });
        this.nodeSpacingSlider.addEventListener("change", () => {
            const value = this.clamp(Number(this.nodeSpacingSlider.value), 0, 80);
            this.host.persistProperties({
                merge: [{
                    objectName: "layout",
                    selector: null,
                    properties: { nodePadding: value }
                }]
            });
        });
        this.nodeSpacingAuto.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            this.toggleAutoSetting(
                "layout",
                "autoNodeSpacing",
                this.formattingSettings.layoutCard.autoNodeSpacing
            );
        });
        this.horizontalSpacingSlider.addEventListener("input", () => {
            const value = this.clamp(Number(this.horizontalSpacingSlider.value), 30, 100);
            this.formattingSettings.layoutCard.horizontalSpacingPercent.value = value;
            this.horizontalSpacingValue.textContent = `${value}%`;
            if (this.viewportWidth > 0 && this.viewportHeight > 0) {
                this.render(this.viewportWidth, this.viewportHeight);
            }
        });
        this.horizontalSpacingSlider.addEventListener("change", () => {
            const value = this.clamp(Number(this.horizontalSpacingSlider.value), 30, 100);
            this.host.persistProperties({
                merge: [{
                    objectName: "layout",
                    selector: null,
                    properties: { horizontalSpacingPercent: value }
                }]
            });
        });
        this.horizontalSpacingAuto.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            this.toggleAutoSetting(
                "layout",
                "autoHorizontalSpacing",
                this.formattingSettings.layoutCard.autoHorizontalSpacing
            );
        });
        this.linkOpacitySlider.addEventListener("input", () => {
            const value = this.clamp(Number(this.linkOpacitySlider.value), 5, 100);
            this.formattingSettings.linkCard.opacity.value = value;
            this.linkOpacityValue.textContent = `${value}%`;
            if (this.viewportWidth > 0 && this.viewportHeight > 0) {
                this.render(this.viewportWidth, this.viewportHeight);
            }
        });
        this.linkOpacitySlider.addEventListener("change", () => {
            const value = this.clamp(Number(this.linkOpacitySlider.value), 5, 100);
            this.host.persistProperties({
                merge: [{
                    objectName: "links",
                    selector: null,
                    properties: { opacity: value }
                }]
            });
        });
        this.linkOpacityAuto.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            this.toggleAutoSetting(
                "links",
                "autoOpacity",
                this.formattingSettings.linkCard.autoOpacity
            );
        });
        this.labelFontSizeSlider.addEventListener("input", () => {
            const value = this.clamp(Number(this.labelFontSizeSlider.value), 8, 24);
            this.formattingSettings.labelCard.fontSize.value = value;
            this.labelFontSizeValue.textContent = `${value}px`;
            if (this.viewportWidth > 0 && this.viewportHeight > 0) {
                this.render(this.viewportWidth, this.viewportHeight);
            }
        });
        this.labelFontSizeSlider.addEventListener("change", () => {
            const value = this.clamp(Number(this.labelFontSizeSlider.value), 8, 24);
            this.host.persistProperties({
                merge: [{
                    objectName: "labels",
                    selector: null,
                    properties: { fontSize: value }
                }]
            });
        });
        this.labelFontSizeAuto.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            this.toggleAutoSetting(
                "labels",
                "autoFontSize",
                this.formattingSettings.labelCard.autoFontSize
            );
        });
        this.labelBoldToggle.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            const value = !this.formattingSettings.labelCard.bold.value;
            this.formattingSettings.labelCard.bold.value = value;
            this.host.persistProperties({
                merge: [{
                    objectName: "labels",
                    selector: null,
                    properties: { bold: value }
                }]
            });
            if (this.viewportWidth > 0 && this.viewportHeight > 0) {
                this.render(this.viewportWidth, this.viewportHeight);
            }
            this.updateLayoutControls();
        });
        this.labelBoldAuto.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            this.toggleAutoSetting(
                "labels",
                "autoBold",
                this.formattingSettings.labelCard.autoBold
            );
        });
        this.paletteSelect.addEventListener("change", () => {
            const palette = PALETTE_OPTIONS.find(
                option => option.id === this.paletteSelect.value
            ) ?? PALETTE_OPTIONS[0];
            this.formattingSettings.layoutCard.palette.value = {
                displayName: palette.displayName,
                value: palette.id
            };
            this.host.persistProperties({
                merge: [{
                    objectName: "layout",
                    selector: null,
                    properties: { palette: palette.id }
                }]
            });
            if (this.viewportWidth > 0 && this.viewportHeight > 0) {
                this.render(this.viewportWidth, this.viewportHeight);
            }
        });

        this.svg.addEventListener("click", () => {
            void this.selectionManager.clear().then(() => this.applySelection([]));
        });
    }

    public update(options: VisualUpdateOptions): void {
        this.host.eventService.renderingStarted(options);

        try {
            this.dataView = options.dataViews?.[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
                VisualFormattingSettingsModel,
                this.dataView
            );
            this.loadPositions();
            this.synchronizeDataSignature();
            this.render(options.viewport.width, options.viewport.height);
            this.updateLayoutControls();
            this.host.eventService.renderingFinished(options);
        } catch (error) {
            this.renderMessage(error instanceof Error ? error.message : String(error));
            this.host.eventService.renderingFailed(options, String(error));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    private render(width: number, height: number): void {
        this.viewportWidth = width;
        this.viewportHeight = height;
        this.copyHtmlButton.disabled = true;
        if (!this.copyingHtml) {
            this.copyHtmlText.hidden = true;
            this.copyHtmlText.value = "";
            this.copyStatus.textContent = "";
        }
        this.svg.replaceChildren();
        this.svg.setAttribute("width", `${Math.max(0, width)}`);
        this.svg.setAttribute("height", `${Math.max(0, height)}`);
        this.svg.setAttribute("viewBox", `0 0 ${Math.max(0, width)} ${Math.max(0, height)}`);

        this.applyBackground();

        const table = this.dataView?.table;
        if (!table?.rows?.length) {
            this.renderMessage("Add Source, Destination and Weight fields");
            return;
        }

        const indexes = this.getRoleIndexes(table.columns);
        if (indexes.source < 0 || indexes.target < 0 || indexes.weight < 0) {
            this.renderMessage("Source, Destination and Weight are required");
            return;
        }

        const layout = this.calculateLayout(width, height, indexes);
        if (!layout.links.length) {
            this.renderMessage("No positive flow values to display");
            return;
        }

        const linkGroup = document.createElementNS(SVG_NS, "g");
        linkGroup.classList.add("links");
        this.svg.appendChild(linkGroup);

        for (const link of layout.links) {
            this.renderLink(linkGroup, link);
        }

        const nodeGroup = document.createElementNS(SVG_NS, "g");
        nodeGroup.classList.add("nodes");
        this.svg.appendChild(nodeGroup);

        for (const node of layout.nodes) {
            this.renderNode(nodeGroup, node, width, height);
        }
        this.applySelection(this.selectionManager.getSelectionIds() as unknown as ISelectionId[]);
        this.copyHtmlButton.disabled = this.copyingHtml;
    }

    private async copyHtml(): Promise<void> {
        if (this.copyingHtml || !this.svg.querySelectorAll(".sankey-flow").length) {
            return;
        }

        this.copyingHtml = true;
        this.copyHtmlButton.disabled = true;
        this.copyHtmlText.hidden = true;
        this.copyHtmlText.value = "";
        this.copyStatus.textContent = "Preparing HTML snapshot...";
        try {
            const content = createHtmlSnapshot(this.svg);
            try {
                await navigator.clipboard.writeText(content);
                this.copyStatus.textContent = "HTML copied. Paste into a text editor and save as sankey.html.";
            } catch {
                this.copyHtmlText.value = content;
                this.copyHtmlText.hidden = false;
                this.copyHtmlText.focus();
                this.copyHtmlText.select();
                this.copyStatus.textContent = "Automatic copying is unavailable. Press Ctrl+C (Mac: Command+C) to copy the selected HTML, then paste into a text editor and save as sankey.html.";
            }
        } catch {
            this.copyStatus.textContent = "The HTML snapshot could not be prepared. Please try again.";
        } finally {
            this.copyingHtml = false;
            this.copyHtmlButton.disabled = !this.svg.querySelectorAll(".sankey-flow").length;
        }
    }

    private getRoleIndexes(columns: DataViewMetadataColumn[]): RoleIndexes {
        const indexFor = (role: string): number =>
            columns.findIndex(column => Boolean(column.roles?.[role]));

        return {
            source: indexFor("source"),
            target: indexFor("target"),
            weight: indexFor("weight"),
            color: indexFor("color")
        };
    }

    private calculateLayout(width: number, height: number, indexes: RoleIndexes): LayoutResult {
        const table = this.dataView?.table;
        if (!table) {
            return { nodes: [], links: [] };
        }

        const nodeMap = new Map<string, SankeyNode>();
        const links: SankeyLink[] = [];
        const colorMap = new Map<string, string>();
        const getNode = (name: string): SankeyNode => {
            let node = nodeMap.get(name);
            if (!node) {
                node = {
                    name,
                    depth: 0,
                    value: 0,
                    x: 0,
                    y: 0,
                    height: 0,
                    incoming: [],
                    outgoing: [],
                    color: this.formattingSettings.nodeCard.defaultColor.value.value,
                    selectionIds: []
                };
                nodeMap.set(name, node);
            }
            return node;
        };

        table.rows.forEach((row, rowIndex) => {
            const sourceName = this.valueToText(row[indexes.source]);
            const targetName = this.valueToText(row[indexes.target]);
            const value = Number(row[indexes.weight]);
            if (!sourceName || !targetName || !Number.isFinite(value) || value <= 0 || sourceName === targetName) {
                return;
            }

            const selectionId = this.host.createSelectionIdBuilder()
                .withTable(table, rowIndex)
                .createSelectionId();
            const source = getNode(sourceName);
            const target = getNode(targetName);
            const colorValue = indexes.color >= 0 ? this.valueToText(row[indexes.color]) : "";
            const colorKey = colorValue || sourceName;
            const color = this.resolveColor(colorValue, colorKey, colorMap);
            const link: SankeyLink = {
                source,
                target,
                value,
                color,
                index: rowIndex,
                y0: 0,
                y1: 0,
                width: 0,
                selectionId
            };
            source.outgoing.push(link);
            source.selectionIds.push(selectionId);
            target.incoming.push(link);
            target.selectionIds.push(selectionId);
            links.push(link);
        });

        const nodes = Array.from(nodeMap.values());
        this.assignDepths(nodes);

        for (const node of nodes) {
            const incoming = node.incoming.reduce((sum, link) => sum + link.value, 0);
            const outgoing = node.outgoing.reduce((sum, link) => sum + link.value, 0);
            node.value = Math.max(incoming, outgoing);
            const primary = node.incoming.length
                ? node.incoming.reduce((max, link) => link.value > max.value ? link : max)
                : node.outgoing[0];
            if (primary) {
                node.color = primary.color;
            }
        }

        const labelFontSize = this.getEffectiveLabelFontSize();
        const edgePadding = this.clamp(this.formattingSettings.layoutCard.edgePadding.value, 8, 100);
        const sourceLabelWidth = this.formattingSettings.labelCard.show.value ? Math.max(
            0,
            ...nodes
                .filter(node => node.depth === 0)
                .map(node => this.measureLabelWidth(node.name, node.value, labelFontSize))
        ) : 0;
        const targetLabelWidth = Math.max(
            0,
            ...nodes
                .filter(node => node.outgoing.length === 0)
                .map(node => this.measureLabelWidth(node.name, node.value, labelFontSize))
        );
        const rightMarginCap = Math.min(160, width * 0.30);
        const margin = {
            top: 24,
            right: Math.min(rightMarginCap, Math.max(70, targetLabelWidth + edgePadding)),
            bottom: 24,
            left: Math.max(
                Math.min(100, width * 0.38),
                sourceLabelWidth > 0 ? sourceLabelWidth + 8 + edgePadding : 0
            )
        };
        const innerWidth = Math.max(1, width - margin.left - margin.right);
        const innerHeight = Math.max(1, height - margin.top - margin.bottom);
        const maxDepth = Math.max(0, ...nodes.map(node => node.depth));
        const columns = Array.from({ length: maxDepth + 1 }, () => [] as SankeyNode[]);
        nodes.forEach(node => columns[node.depth].push(node));
        this.orderColumns(columns);

        const nodeWidth = this.clamp(this.formattingSettings.layoutCard.nodeWidth.value, 8, 60);
        const maxColumnCount = Math.max(1, ...columns.map(column => column.length));
        const requestedPadding = this.formattingSettings.layoutCard.autoNodeSpacing.value
            ? this.clamp(innerHeight / Math.max(6, maxColumnCount * 6), 8, 36)
            : this.clamp(this.formattingSettings.layoutCard.nodePadding.value, 0, 100);
        const nodePadding = Math.min(requestedPadding, innerHeight / Math.max(1, maxColumnCount - 1));
        this.effectiveNodeSpacing = nodePadding;
        const maxColumnValue = Math.max(1, ...columns.map(column =>
            column.reduce((sum, node) => sum + node.value, 0)
        ));
        const availableNodeHeight = Math.max(1, innerHeight - Math.max(0, maxColumnCount - 1) * nodePadding);
        const heightUtilization = this.clamp(
            this.formattingSettings.layoutCard.heightUtilization.value,
            10,
            100
        ) / 100;
        const columnScale = (availableNodeHeight * heightUtilization) / maxColumnValue;
        const maxNodeValue = Math.max(1, ...nodes.map(node => node.value));
        const maxNodeHeight = innerHeight * (
            this.clamp(this.formattingSettings.nodeCard.maxHeightPercent.value, 10, 100) / 100
        );
        // Keep small values compact, but give sparse diagrams enough visual weight.
        const sparseDiagramBoost = this.clamp(1.5 - links.length * 0.04, 1, 1.4);
        this.effectiveNodeScale = this.formattingSettings.layoutCard.autoNodeScale.value
            ? this.clamp(132 - links.length * 2, 75, 130)
            : this.clamp(this.formattingSettings.layoutCard.nodeScalePercent.value, 50, 180);
        const nodeScale = this.effectiveNodeScale / 100;
        const compactMaxHeight = Math.min(
            maxNodeHeight,
            Math.max(
                10,
                (10 + 8 * Math.sqrt(maxNodeValue)) * sparseDiagramBoost * nodeScale
            )
        );
        const valueScale = Math.min(
            columnScale,
            maxNodeHeight / maxNodeValue,
            compactMaxHeight / maxNodeValue
        );
        this.effectiveHorizontalSpacing = this.formattingSettings.layoutCard.autoHorizontalSpacing.value
            ? this.clamp(110 - maxDepth * 5, 60, 100)
            : this.clamp(
                this.formattingSettings.layoutCard.horizontalSpacingPercent.value,
                30,
                100
            );
        const requestedDiagramWidth = nodeWidth
            + (innerWidth - nodeWidth) * (this.effectiveHorizontalSpacing / 100);
        const labelWidthsByColumn = columns.map((column, depth) => {
            if (!this.formattingSettings.labelCard.show.value || depth === 0) {
                return 0;
            }
            return Math.max(
                0,
                ...column.map(node => this.measureLabelWidth(node.name, node.value, labelFontSize))
            );
        });
        const requiredGaps = Array.from({ length: maxDepth }, (_, depth) =>
            nodeWidth + (labelWidthsByColumn[depth] > 0
                ? labelWidthsByColumn[depth] + 20
                : 24)
        );
        const requiredDiagramWidth = nodeWidth
            + requiredGaps.reduce((sum, gap) => sum + gap, 0);
        const diagramWidth = Math.min(
            innerWidth,
            Math.max(requestedDiagramWidth, requiredDiagramWidth)
        );
        const diagramStartX = margin.left + Math.max(0, (innerWidth - diagramWidth) / 2);
        const availableGapWidth = Math.max(0, diagramWidth - nodeWidth);
        const requiredGapWidth = requiredGaps.reduce((sum, gap) => sum + gap, 0);
        const columnX = [diagramStartX];
        for (let depth = 0; depth < maxDepth; depth++) {
            const baseGap = requiredGaps[depth] ?? 0;
            const gap = requiredGapWidth <= availableGapWidth
                ? baseGap + (availableGapWidth - requiredGapWidth) / maxDepth
                : baseGap * availableGapWidth / Math.max(1, requiredGapWidth);
            columnX.push((columnX[depth] ?? diagramStartX) + gap);
        }

        columns.forEach((column, depth) => {
            const columnHeight = column.reduce((sum, node) => sum + node.value * valueScale, 0)
                + Math.max(0, column.length - 1) * nodePadding;
            let nextY = margin.top + Math.max(0, (innerHeight - columnHeight) / 2);

            for (const node of column) {
                node.height = Math.max(2, node.value * valueScale);
                const defaultX = columnX[depth] ?? diagramStartX;
                const savedPosition = this.positions[node.name];
                const horizontalBounds = this.getHorizontalBounds(
                    node,
                    width,
                    nodeWidth,
                    labelFontSize,
                    edgePadding
                );
                node.x = savedPosition?.x === undefined
                    ? defaultX
                    : this.clamp(savedPosition.x, horizontalBounds.min, horizontalBounds.max);
                const savedY = savedPosition?.y;
                node.y = savedY === undefined
                    ? nextY
                    : this.clamp(savedY, margin.top, height - margin.bottom - node.height);
                nextY = node.y + node.height + nodePadding;
            }
        });

        for (const node of nodes) {
            node.outgoing.sort((left, right) => left.target.y - right.target.y);
            node.incoming.sort((left, right) => left.source.y - right.source.y);
            let sourceOffset = 0;
            for (const link of node.outgoing) {
                link.width = Math.max(1, link.value * valueScale);
                link.y0 = node.y + sourceOffset + link.width / 2;
                sourceOffset += link.width;
            }
            let targetOffset = 0;
            for (const link of node.incoming) {
                link.width = Math.max(1, link.value * valueScale);
                link.y1 = node.y + targetOffset + link.width / 2;
                targetOffset += link.width;
            }
        }

        return { nodes, links };
    }

    private assignDepths(nodes: SankeyNode[]): void {
        const sources = nodes.filter(node => node.incoming.length === 0);
        const queue = sources.length ? [...sources] : nodes.slice(0, 1);
        const visited = new Set<SankeyNode>();

        while (queue.length) {
            const node = queue.shift();
            if (!node) {
                continue;
            }
            visited.add(node);
            for (const link of node.outgoing) {
                const nextDepth = Math.min(nodes.length - 1, node.depth + 1);
                if (nextDepth > link.target.depth) {
                    link.target.depth = nextDepth;
                }
                if (!visited.has(link.target)) {
                    queue.push(link.target);
                }
            }
        }

        // Cycles are placed in a finite sequence rather than looping forever.
        for (let pass = 0; pass < nodes.length; pass++) {
            let changed = false;
            for (const node of nodes) {
                for (const link of node.outgoing) {
                    if (link.target.depth <= node.depth && link.target.depth < nodes.length - 1) {
                        link.target.depth = node.depth + 1;
                        changed = true;
                    }
                }
            }
            if (!changed) {
                break;
            }
        }
    }

    private orderColumns(columns: SankeyNode[][]): void {
        columns.forEach(column => column.sort((left, right) => left.name.localeCompare(right.name)));

        const weightedRank = (
            links: SankeyLink[],
            relatedNode: (link: SankeyLink) => SankeyNode,
            ranks: Map<SankeyNode, number>
        ): number | undefined => {
            let weightedTotal = 0;
            let totalWeight = 0;
            for (const link of links) {
                const rank = ranks.get(relatedNode(link));
                if (rank === undefined) {
                    continue;
                }
                weightedTotal += rank * link.value;
                totalWeight += link.value;
            }
            return totalWeight > 0 ? weightedTotal / totalWeight : undefined;
        };

        for (let pass = 0; pass < 6; pass++) {
            for (let depth = 1; depth < columns.length; depth++) {
                const previousRanks = new Map(columns[depth - 1].map((node, index) => [node, index]));
                columns[depth].sort((left, right) => {
                    const leftRank = weightedRank(left.incoming, link => link.source, previousRanks);
                    const rightRank = weightedRank(right.incoming, link => link.source, previousRanks);
                    return this.compareOptionalRanks(leftRank, rightRank, left.name, right.name);
                });
            }

            for (let depth = columns.length - 2; depth >= 0; depth--) {
                const nextRanks = new Map(columns[depth + 1].map((node, index) => [node, index]));
                columns[depth].sort((left, right) => {
                    const leftRank = weightedRank(left.outgoing, link => link.target, nextRanks);
                    const rightRank = weightedRank(right.outgoing, link => link.target, nextRanks);
                    return this.compareOptionalRanks(leftRank, rightRank, left.name, right.name);
                });
            }
        }
    }

    private compareOptionalRanks(
        leftRank: number | undefined,
        rightRank: number | undefined,
        leftName: string,
        rightName: string
    ): number {
        if (leftRank === undefined && rightRank === undefined) {
            return leftName.localeCompare(rightName);
        }
        if (leftRank === undefined) {
            return 1;
        }
        if (rightRank === undefined) {
            return -1;
        }
        return leftRank - rightRank || leftName.localeCompare(rightName);
    }

    private renderLink(parent: SVGGElement, link: SankeyLink): void {
        const group = document.createElementNS(SVG_NS, "g");
        group.classList.add("sankey-flow");
        group.dataset.selectionKey = link.selectionId.getKey();
        group.setAttribute("tabindex", "0");
        group.setAttribute("role", "button");
        group.setAttribute("aria-label", `${link.source.name} to ${link.target.name}: ${this.formatValue(link.value)}`);

        const hitArea = document.createElementNS(SVG_NS, "path");
        hitArea.classList.add("sankey-link-hit-area");
        hitArea.setAttribute("d", this.linkPath(link));
        hitArea.setAttribute("fill", "none");
        hitArea.setAttribute("stroke", "transparent");
        hitArea.setAttribute("stroke-width", `${Math.max(10, link.width)}`);
        hitArea.setAttribute("pointer-events", "stroke");
        group.appendChild(hitArea);

        const path = document.createElementNS(SVG_NS, "path");
        path.classList.add("sankey-link");
        path.setAttribute("d", this.linkPath(link));
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", link.color);
        path.setAttribute("stroke-width", `${link.width}`);
        path.setAttribute(
            "stroke-opacity",
            `${this.getEffectiveLinkOpacity() / 100}`
        );
        group.appendChild(path);

        const title = document.createElementNS(SVG_NS, "title");
        title.textContent = `${link.source.name} to ${link.target.name}: ${this.formatValue(link.value)}`;
        group.appendChild(title);

        if (this.formattingSettings.linkCard.showValues.value) {
            const label = document.createElementNS(SVG_NS, "text");
            label.classList.add("sankey-link-label");
            const nodeWidth = this.clamp(this.formattingSettings.layoutCard.nodeWidth.value, 8, 60);
            label.setAttribute("x", `${(link.source.x + nodeWidth + link.target.x) / 2}`);
            label.setAttribute("y", `${(link.y0 + link.y1) / 2 - 4}`);
            label.setAttribute("text-anchor", "middle");
            label.setAttribute("fill", this.isDarkPaletteSelected()
                ? "#FFFFFF"
                : this.formattingSettings.labelCard.color.value.value);
            label.setAttribute("stroke", this.isDarkPaletteSelected()
                ? "#000000"
                : this.formattingSettings.layoutCard.backgroundColor.value.value);
            label.setAttribute("font-size", `${this.getEffectiveLabelFontSize()}px`);
            label.textContent = this.formatValue(link.value);
            group.appendChild(label);
        }

        group.addEventListener("click", event => {
            event.stopPropagation();
            void this.selectionManager.select(link.selectionId, event.ctrlKey || event.metaKey)
                .then(ids => this.applySelection(ids as unknown as ISelectionId[]));
        });
        group.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                void this.selectionManager.select(link.selectionId, event.ctrlKey || event.metaKey)
                    .then(ids => this.applySelection(ids as unknown as ISelectionId[]));
            }
        });
        group.addEventListener("mouseenter", event => {
            this.highlightFlows([link.selectionId]);
            this.showLinkTooltip(event, link);
        });
        group.addEventListener("mousemove", event => this.moveTooltip(event, [link.selectionId]));
        group.addEventListener("mouseleave", () => {
            this.highlightFlows();
            this.tooltipService.hide({ immediately: true, isTouchEvent: false });
        });
        group.addEventListener("focus", () => this.highlightFlows([link.selectionId]));
        group.addEventListener("blur", () => this.highlightFlows());
        parent.appendChild(group);
    }

    private renderNode(
        parent: SVGGElement,
        node: SankeyNode,
        viewportWidth: number,
        viewportHeight: number
    ): void {
        const nodeWidth = this.clamp(this.formattingSettings.layoutCard.nodeWidth.value, 8, 60);
        const group = document.createElementNS(SVG_NS, "g");
        group.classList.add("sankey-node");
        group.setAttribute("transform", `translate(${node.x},${node.y})`);
        group.setAttribute("tabindex", "0");
        group.setAttribute("aria-label", `${node.name}: ${node.value}`);

        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("width", `${nodeWidth}`);
        rect.setAttribute("height", `${node.height}`);
        rect.setAttribute("rx", "2");
        rect.setAttribute("fill", node.color);
        rect.setAttribute("stroke", this.formattingSettings.nodeCard.borderColor.value.value);
        rect.setAttribute(
            "stroke-width",
            `${this.clamp(this.formattingSettings.nodeCard.borderWidth.value, 0, 8)}`
        );
        group.appendChild(rect);

        if (this.formattingSettings.labelCard.show.value) {
            const text = document.createElementNS(SVG_NS, "text");
            const isFirstColumn = node.depth === 0;
            text.setAttribute("x", isFirstColumn ? "-8" : `${nodeWidth + 8}`);
            text.setAttribute("y", `${node.height / 2}`);
            text.setAttribute("text-anchor", isFirstColumn ? "end" : "start");
            text.setAttribute("dominant-baseline", "middle");
            text.setAttribute("fill", this.isDarkPaletteSelected()
                ? "#FFFFFF"
                : this.formattingSettings.labelCard.color.value.value);
            text.setAttribute("font-size", `${this.getEffectiveLabelFontSize()}px`);
            text.setAttribute(
                "font-weight",
                this.getEffectiveLabelBold() ? "600" : "400"
            );
            const fullLabel = this.formattingSettings.labelCard.showValues.value
                ? `${node.name}  ${this.formatValue(node.value)}`
                : node.name;
            text.textContent = fullLabel;
            group.appendChild(text);
        }

        group.addEventListener("mousedown", event => {
            event.stopPropagation();
            this.draggedNode = node;
            const point = this.svgPoint(event.clientX, event.clientY);
            this.dragOffset = {
                x: point.x - node.x,
                y: point.y - node.y
            };
            const move = (moveEvent: MouseEvent): void => {
                if (!this.draggedNode) {
                    return;
                }
                const next = this.svgPoint(moveEvent.clientX, moveEvent.clientY);
                const fontSize = this.getEffectiveLabelFontSize();
                const edgePadding = this.clamp(
                    this.formattingSettings.layoutCard.edgePadding.value,
                    8,
                    100
                );
                const horizontalBounds = this.getHorizontalBounds(
                    node,
                    viewportWidth,
                    nodeWidth,
                    fontSize,
                    edgePadding
                );
                this.positions[node.name] = {
                    x: this.clamp(
                        next.x - this.dragOffset.x,
                        horizontalBounds.min,
                        horizontalBounds.max
                    ),
                    y: this.clamp(
                        next.y - this.dragOffset.y,
                        8,
                        viewportHeight - node.height - 8
                    )
                };
                this.render(viewportWidth, viewportHeight);
            };
            const up = (): void => {
                document.removeEventListener("mousemove", move);
                document.removeEventListener("mouseup", up);
                this.draggedNode = undefined;
                this.persistPositions();
            };
            document.addEventListener("mousemove", move);
            document.addEventListener("mouseup", up);
        });
        group.addEventListener("click", event => {
            event.stopPropagation();
            if (!this.draggedNode) {
                void this.selectionManager.select(node.selectionIds, event.ctrlKey || event.metaKey)
                    .then(ids => this.applySelection(ids as unknown as ISelectionId[]));
            }
        });
        group.addEventListener("mouseenter", event => {
            this.highlightFlows(node.selectionIds);
            this.showNodeTooltip(event, node);
        });
        group.addEventListener("mousemove", event => this.moveTooltip(event, node.selectionIds));
        group.addEventListener("mouseleave", () => {
            this.highlightFlows();
            this.tooltipService.hide({ immediately: true, isTouchEvent: false });
        });
        group.addEventListener("focus", () => this.highlightFlows(node.selectionIds));
        group.addEventListener("blur", () => this.highlightFlows());
        parent.appendChild(group);
    }

    private linkPath(link: SankeyLink): string {
        const nodeWidth = this.clamp(this.formattingSettings.layoutCard.nodeWidth.value, 8, 60);
        const x0 = link.source.x + nodeWidth;
        const x1 = link.target.x;
        const control = (x0 + x1) / 2;
        return `M${x0},${link.y0} C${control},${link.y0} ${control},${link.y1} ${x1},${link.y1}`;
    }

    private applySelection(selectionIds: ISelectionId[]): void {
        const selected = new Set(selectionIds.map(id => id.getKey()));
        const hasSelection = selected.size > 0;
        this.svg.querySelectorAll<SVGGElement>(".sankey-flow").forEach(group => {
            const key = group.dataset.selectionKey ?? "";
            group.classList.toggle("dimmed", hasSelection && !selected.has(key));
        });
    }

    private highlightFlows(selectionIds: ISelectionId[] = []): void {
        const highlighted = new Set(selectionIds.map(id => id.getKey()));
        this.svg.querySelectorAll<SVGGElement>(".sankey-flow").forEach(group => {
            const key = group.dataset.selectionKey ?? "";
            group.classList.toggle("hover-dimmed", highlighted.size > 0 && !highlighted.has(key));
        });
    }

    private showLinkTooltip(event: MouseEvent, link: SankeyLink): void {
        const outgoing = link.source.outgoing.reduce((sum, item) => sum + item.value, 0);
        const incoming = link.target.incoming.reduce((sum, item) => sum + item.value, 0);
        const weightColumn = this.dataView?.table?.columns.find(column => column.roles?.weight);
        const percent = new Intl.NumberFormat(undefined, {
            style: "percent",
            maximumFractionDigits: 1
        });
        this.tooltipService.show({
            coordinates: [event.clientX, event.clientY],
            isTouchEvent: false,
            dataItems: [
                { displayName: "Source", value: link.source.name },
                { displayName: "Destination", value: link.target.name },
                { displayName: weightColumn?.displayName || "Weight", value: this.formatValue(link.value) },
                { displayName: "Share of source outgoing", value: percent.format(outgoing > 0 ? link.value / outgoing : 0) },
                { displayName: "Share of destination incoming", value: percent.format(incoming > 0 ? link.value / incoming : 0) }
            ],
            identities: [link.selectionId]
        });
    }

    private showNodeTooltip(event: MouseEvent, node: SankeyNode): void {
        const incoming = node.incoming.reduce((sum, link) => sum + link.value, 0);
        const outgoing = node.outgoing.reduce((sum, link) => sum + link.value, 0);
        this.tooltipService.show({
            coordinates: [event.clientX, event.clientY],
            isTouchEvent: false,
            dataItems: [
                { displayName: "Node", value: node.name },
                { displayName: "Incoming", value: this.formatValue(incoming) },
                { displayName: "Outgoing", value: this.formatValue(outgoing) },
                ...this.getFlowBreakdown(node.outgoing, link => link.target.name, "To"),
                ...this.getFlowBreakdown(node.incoming, link => link.source.name, "From")
            ],
            identities: node.selectionIds
        });
    }

    private getFlowBreakdown(
        links: SankeyLink[],
        relatedName: (link: SankeyLink) => string,
        direction: string
    ): powerbi.extensibility.VisualTooltipDataItem[] {
        const totals = new Map<string, number>();
        for (const link of links) {
            const name = relatedName(link);
            totals.set(name, (totals.get(name) ?? 0) + link.value);
        }
        const ordered = Array.from(totals).sort((left, right) => right[1] - left[1]);
        const items = ordered.slice(0, 10)
            .map(([name, value]) => ({
                displayName: `${direction} ${name}`,
                value: this.formatValue(value)
            }));
        if (ordered.length > 10) {
            items.push({
                displayName: `${direction} other nodes (${ordered.length - 10})`,
                value: this.formatValue(ordered.slice(10).reduce((sum, [, value]) => sum + value, 0))
            });
        }
        return items;
    }

    private moveTooltip(event: MouseEvent, selectionIds: ISelectionId[]): void {
        this.tooltipService.move({
            coordinates: [event.clientX, event.clientY],
            isTouchEvent: false,
            identities: selectionIds
        });
    }

    private applyBackground(): void {
        const darkPalette = this.isDarkPaletteSelected();
        const background = darkPalette
            ? "#000000"
            : this.formattingSettings.layoutCard.backgroundColor.value.value;
        this.target.classList.toggle("dark-background", darkPalette);
        this.svg.style.backgroundColor = background;
        if (this.formattingSettings.layoutCard.showDotPattern.value) {
            const dot = this.isDark(background) ? "rgba(255,255,255,.18)" : "rgba(124,156,191,.28)";
            this.svg.style.backgroundImage = `radial-gradient(${dot} 1px, transparent 1px)`;
            this.svg.style.backgroundSize = "16px 16px";
        } else {
            this.svg.style.backgroundImage = "";
        }
    }

    private loadPositions(): void {
        const state = this.formattingSettings.stateCard.nodePositions.value;
        if (state === this.positionState) {
            return;
        }
        this.positionState = state;
        try {
            const parsed = state ? JSON.parse(state) as Record<string, PersistedPosition> : {};
            this.positions = parsed && typeof parsed === "object" ? parsed : {};
        } catch {
            this.positions = {};
        }
    }

    private synchronizeDataSignature(): void {
        const signature = this.createDataSignature();
        if (!signature) {
            this.dataSignature = "";
            return;
        }

        const savedSignature = this.formattingSettings.stateCard.dataSignature.value;
        this.dataSignature = signature;
        if (savedSignature === signature) {
            return;
        }

        if (savedSignature) {
            this.positions = {};
            this.positionState = "{}";
        }

        this.host.persistProperties({
            merge: [{
                objectName: "state",
                selector: null,
                properties: {
                    nodePositions: JSON.stringify(this.positions),
                    dataSignature: signature
                }
            }]
        });
    }

    private createDataSignature(): string {
        const table = this.dataView?.table;
        if (!table?.rows?.length) {
            return "";
        }
        const indexes = this.getRoleIndexes(table.columns);
        if (indexes.source < 0 || indexes.target < 0 || indexes.weight < 0) {
            return "";
        }
        const serialized = table.rows.map(row => [
            this.valueToText(row[indexes.source]),
            this.valueToText(row[indexes.target]),
            this.valueToText(row[indexes.weight]),
            indexes.color >= 0 ? this.valueToText(row[indexes.color]) : ""
        ].join("\u001f")).join("\u001e");
        let hash = 2166136261;
        for (let index = 0; index < serialized.length; index++) {
            hash ^= serialized.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return `${table.rows.length}:${(hash >>> 0).toString(16)}`;
    }

    private persistPositions(): void {
        const value = JSON.stringify(this.positions);
        this.positionState = value;
        this.host.persistProperties({
            merge: [{
                objectName: "state",
                selector: null,
                properties: {
                    nodePositions: value,
                    dataSignature: this.dataSignature
                }
            }]
        });
    }

    private updateLayoutControls(): void {
        const autoScale = this.formattingSettings.layoutCard.autoNodeScale.value;
        const autoSpacing = this.formattingSettings.layoutCard.autoNodeSpacing.value;
        const autoHorizontalSpacing =
            this.formattingSettings.layoutCard.autoHorizontalSpacing.value;
        const autoOpacity = this.formattingSettings.linkCard.autoOpacity.value;
        const autoFontSize = this.formattingSettings.labelCard.autoFontSize.value;
        const autoBold = this.formattingSettings.labelCard.autoBold.value;
        const scale = autoScale
            ? this.effectiveNodeScale
            : this.clamp(this.formattingSettings.layoutCard.nodeScalePercent.value, 50, 180);
        const spacing = autoSpacing
            ? this.effectiveNodeSpacing
            : this.clamp(this.formattingSettings.layoutCard.nodePadding.value, 0, 80);
        const horizontalSpacing = autoHorizontalSpacing
            ? this.effectiveHorizontalSpacing
            : this.clamp(
                this.formattingSettings.layoutCard.horizontalSpacingPercent.value,
                30,
                100
            );
        const opacity = this.getEffectiveLinkOpacity();
        const fontSize = this.getEffectiveLabelFontSize();
        const bold = this.getEffectiveLabelBold();
        this.nodeScaleSlider.value = `${scale}`;
        this.nodeScaleValue.textContent = `${Math.round(scale)}%`;
        this.nodeSpacingSlider.value = `${spacing}`;
        this.nodeSpacingValue.textContent = `${Math.round(spacing)}px`;
        this.horizontalSpacingSlider.value = `${horizontalSpacing}`;
        this.horizontalSpacingValue.textContent = `${Math.round(horizontalSpacing)}%`;
        this.linkOpacitySlider.value = `${opacity}`;
        this.linkOpacityValue.textContent = `${Math.round(opacity)}%`;
        this.labelFontSizeSlider.value = `${fontSize}`;
        this.labelFontSizeValue.textContent = `${Math.round(fontSize)}px`;
        this.labelBoldToggle.textContent = bold ? "On" : "Off";
        this.labelBoldToggle.classList.toggle("active", bold);
        this.labelBoldToggle.setAttribute("aria-checked", `${bold}`);
        this.labelBoldValue.textContent = bold ? "Bold" : "Normal";
        this.paletteSelect.value = this.getSelectedPalette().id;
        this.updateAutoControl(this.nodeScaleSlider, this.nodeScaleAuto, autoScale);
        this.updateAutoControl(this.nodeSpacingSlider, this.nodeSpacingAuto, autoSpacing);
        this.updateAutoControl(
            this.horizontalSpacingSlider,
            this.horizontalSpacingAuto,
            autoHorizontalSpacing
        );
        this.updateAutoControl(this.linkOpacitySlider, this.linkOpacityAuto, autoOpacity);
        this.updateAutoControl(this.labelFontSizeSlider, this.labelFontSizeAuto, autoFontSize);
        this.updateAutoControl(this.labelBoldToggle, this.labelBoldAuto, autoBold);
    }

    private createAutoButton(label: string): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.classList.add("auto-toggle");
        button.textContent = "Auto";
        button.setAttribute("role", "switch");
        button.setAttribute("aria-label", label);
        button.setAttribute("aria-checked", "false");
        return button;
    }

    private toggleAutoSetting(
        objectName: string,
        propertyName: string,
        setting: { value: boolean }
    ): void {
        setting.value = !setting.value;
        this.host.persistProperties({
            merge: [{
                objectName,
                selector: null,
                properties: { [propertyName]: setting.value }
            }]
        });
        if (this.viewportWidth > 0 && this.viewportHeight > 0) {
            this.render(this.viewportWidth, this.viewportHeight);
        }
        this.updateLayoutControls();
    }

    private updateAutoControl(
        control: HTMLInputElement | HTMLButtonElement,
        button: HTMLButtonElement,
        automatic: boolean
    ): void {
        control.disabled = automatic;
        button.classList.toggle("active", automatic);
        button.setAttribute("aria-checked", `${automatic}`);
    }

    private getEffectiveLinkOpacity(): number {
        if (!this.formattingSettings.linkCard.autoOpacity.value) {
            return this.clamp(this.formattingSettings.linkCard.opacity.value, 5, 100);
        }
        const rowCount = this.dataView?.table?.rows?.length ?? 0;
        return this.clamp(68 - rowCount * 1.5, 24, 62);
    }

    private getEffectiveLabelFontSize(): number {
        if (!this.formattingSettings.labelCard.autoFontSize.value) {
            return this.clamp(this.formattingSettings.labelCard.fontSize.value, 8, 24);
        }
        const rowCount = this.dataView?.table?.rows?.length ?? 0;
        const widthAdjustment = this.viewportWidth >= 900 ? 1 : this.viewportWidth < 500 ? -1 : 0;
        return this.clamp(14 - Math.floor(rowCount / 10) + widthAdjustment, 9, 15);
    }

    private getEffectiveLabelBold(): boolean {
        if (!this.formattingSettings.labelCard.autoBold.value) {
            return this.formattingSettings.labelCard.bold.value;
        }
        const rowCount = this.dataView?.table?.rows?.length ?? 0;
        return rowCount <= 18 && this.getEffectiveLabelFontSize() >= 11;
    }

    private renderMessage(message: string): void {
        this.svg.replaceChildren();
        const text = document.createElementNS(SVG_NS, "text");
        text.setAttribute("x", "50%");
        text.setAttribute("y", "50%");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("fill", this.isDarkPaletteSelected() ? "#FFFFFF" : "#7C9CBF");
        text.setAttribute("font-size", "13");
        text.textContent = message;
        this.svg.appendChild(text);
    }

    private resolveColor(rawValue: string, key: string, colorMap: Map<string, string>): string {
        const palette = this.getSelectedPalette();
        if (palette.id === DEFAULT_PALETTE_ID && /^#[0-9a-f]{6}$/i.test(rawValue)) {
            return rawValue;
        }
        let color = colorMap.get(key);
        if (!color) {
            const colors = palette.colors?.length ? palette.colors : DEFAULT_COLORS;
            color = colors[colorMap.size % colors.length]
                ?? this.formattingSettings.linkCard.defaultColor.value.value;
            colorMap.set(key, color);
        }
        return color;
    }

    private isDarkPaletteSelected(): boolean {
        return this.getSelectedPalette().id === "darkBackground";
    }

    private getSelectedPalette(): (typeof PALETTE_OPTIONS)[number] {
        const selected = String(
            this.formattingSettings.layoutCard.palette.value?.value ?? DEFAULT_PALETTE_ID
        );
        return PALETTE_OPTIONS.find(palette => palette.id === selected)
            ?? PALETTE_OPTIONS[0];
    }

    private valueToText(value: powerbi.PrimitiveValue): string {
        return value === null || value === undefined ? "" : String(value).trim();
    }

    private formatValue(value: number): string {
        return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
    }

    private measureLabelWidth(name: string, value: number, fontSize: number): number {
        const text = this.formattingSettings.labelCard.showValues.value
            ? `${name}  ${this.formatValue(value)}`
            : name;
        return this.measureTextWidth(text, fontSize);
    }

    private measureTextWidth(text: string, fontSize: number): number {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
            return text.length * fontSize * 0.62;
        }
        const fontWeight = this.getEffectiveLabelBold() ? 600 : 400;
        context.font = `${fontWeight} ${fontSize}px "Segoe UI", Arial, sans-serif`;
        return context.measureText(text).width;
    }

    private getHorizontalBounds(
        node: SankeyNode,
        viewportWidth: number,
        nodeWidth: number,
        fontSize: number,
        edgePadding: number
    ): { min: number; max: number } {
        const labelWidth = this.formattingSettings.labelCard.show.value
            ? this.measureLabelWidth(node.name, node.value, fontSize)
            : 0;
        const labelGap = labelWidth > 0 ? 8 : 0;
        const leftSpace = node.depth === 0 ? labelWidth + labelGap : 0;
        const rightSpace = node.depth === 0 ? 0 : labelWidth + labelGap;
        const min = edgePadding + leftSpace;
        const max = Math.max(
            min,
            viewportWidth - edgePadding - nodeWidth - rightSpace
        );
        return { min, max };
    }

    private svgPoint(clientX: number, clientY: number): DOMPoint {
        const point = this.svg.createSVGPoint();
        point.x = clientX;
        point.y = clientY;
        const matrix = this.svg.getScreenCTM();
        return matrix ? point.matrixTransform(matrix.inverse()) : new DOMPoint(clientX, clientY);
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.min(max, Math.max(min, value));
    }

    private isDark(hex: string): boolean {
        const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#FFFFFF";
        const red = parseInt(normalized.slice(1, 3), 16);
        const green = parseInt(normalized.slice(3, 5), 16);
        const blue = parseInt(normalized.slice(5, 7), 16);
        return (red * 299 + green * 587 + blue * 114) / 1000 < 128;
    }
}
