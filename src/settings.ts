"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { DEFAULT_PALETTE_ID, PALETTE_OPTIONS } from "./palettes";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

class LayoutCard extends FormattingSettingsCard {
    nodeWidth = new formattingSettings.NumUpDown({
        name: "nodeWidth",
        displayName: "Node width",
        value: 20
    });

    nodePadding = new formattingSettings.NumUpDown({
        name: "nodePadding",
        displayName: "Node padding",
        value: 24
    });

    autoNodeSpacing = new formattingSettings.ToggleSwitch({
        name: "autoNodeSpacing",
        displayName: "Automatic node spacing",
        value: false
    });

    horizontalSpacingPercent = new formattingSettings.NumUpDown({
        name: "horizontalSpacingPercent",
        displayName: "Horizontal spacing (%)",
        value: 100
    });

    autoHorizontalSpacing = new formattingSettings.ToggleSwitch({
        name: "autoHorizontalSpacing",
        displayName: "Automatic horizontal spacing",
        value: false
    });

    palette = new formattingSettings.ItemDropdown({
        name: "palette",
        displayName: "Color palette",
        items: PALETTE_OPTIONS.map(option => ({
            displayName: option.displayName,
            value: option.id
        })),
        value: {
            displayName: "Custom / data colors",
            value: DEFAULT_PALETTE_ID
        }
    });

    heightUtilization = new formattingSettings.NumUpDown({
        name: "heightUtilization",
        displayName: "Diagram height (%)",
        value: 65
    });

    nodeScalePercent = new formattingSettings.NumUpDown({
        name: "nodeScalePercent",
        displayName: "Node size (%)",
        value: 100
    });

    autoNodeScale = new formattingSettings.ToggleSwitch({
        name: "autoNodeScale",
        displayName: "Automatic node size",
        value: false
    });

    edgePadding = new formattingSettings.NumUpDown({
        name: "edgePadding",
        displayName: "Edge label padding",
        value: 20
    });

    backgroundColor = new formattingSettings.ColorPicker({
        name: "backgroundColor",
        displayName: "Background",
        value: { value: "#FFFFFF" }
    });

    showDotPattern = new formattingSettings.ToggleSwitch({
        name: "showDotPattern",
        displayName: "Show dot pattern",
        value: false
    });

    name = "layout";
    displayName = "Layout";
    slices: FormattingSettingsSlice[] = [
        this.nodeWidth,
        this.nodePadding,
        this.autoNodeSpacing,
        this.horizontalSpacingPercent,
        this.autoHorizontalSpacing,
        this.palette,
        this.heightUtilization,
        this.nodeScalePercent,
        this.autoNodeScale,
        this.edgePadding,
        this.backgroundColor,
        this.showDotPattern
    ];
}

class NodeCard extends FormattingSettingsCard {
    defaultColor = new formattingSettings.ColorPicker({
        name: "defaultColor",
        displayName: "Default node color",
        value: { value: "#7AA7F8" }
    });

    borderColor = new formattingSettings.ColorPicker({
        name: "borderColor",
        displayName: "Border color",
        value: { value: "#FFFFFF" }
    });

    borderWidth = new formattingSettings.NumUpDown({
        name: "borderWidth",
        displayName: "Border width",
        value: 1
    });

    maxHeightPercent = new formattingSettings.NumUpDown({
        name: "maxHeightPercent",
        displayName: "Maximum node height (%)",
        value: 35
    });

    name = "nodes";
    displayName = "Nodes";
    slices: FormattingSettingsSlice[] = [
        this.defaultColor,
        this.borderColor,
        this.borderWidth,
        this.maxHeightPercent
    ];
}

class LinkCard extends FormattingSettingsCard {
    defaultColor = new formattingSettings.ColorPicker({
        name: "defaultColor",
        displayName: "Default link color",
        value: { value: "#7AA7F8" }
    });

    opacity = new formattingSettings.NumUpDown({
        name: "opacity",
        displayName: "Opacity (%)",
        value: 42
    });

    autoOpacity = new formattingSettings.ToggleSwitch({
        name: "autoOpacity",
        displayName: "Automatic opacity",
        value: false
    });

    name = "links";
    displayName = "Links";
    slices: FormattingSettingsSlice[] = [
        this.defaultColor,
        this.opacity,
        this.autoOpacity
    ];
}

class LabelCard extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show labels",
        value: true
    });

    showValues = new formattingSettings.ToggleSwitch({
        name: "showValues",
        displayName: "Show values",
        value: true
    });

    color = new formattingSettings.ColorPicker({
        name: "color",
        displayName: "Text color",
        value: { value: "#353535" }
    });

    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Text size",
        value: 12
    });

    autoFontSize = new formattingSettings.ToggleSwitch({
        name: "autoFontSize",
        displayName: "Automatic text size",
        value: false
    });

    bold = new formattingSettings.ToggleSwitch({
        name: "bold",
        displayName: "Bold labels",
        value: false
    });

    autoBold = new formattingSettings.ToggleSwitch({
        name: "autoBold",
        displayName: "Automatic bold",
        value: false
    });

    name = "labels";
    displayName = "Labels";
    slices: FormattingSettingsSlice[] = [
        this.show,
        this.showValues,
        this.color,
        this.fontSize,
        this.autoFontSize,
        this.bold,
        this.autoBold
    ];
}

class StateCard extends FormattingSettingsCard {
    nodePositions = new formattingSettings.TextInput({
        name: "nodePositions",
        displayName: "Saved node positions",
        value: "",
        placeholder: ""
    });

    dataSignature = new formattingSettings.TextInput({
        name: "dataSignature",
        displayName: "Data signature",
        value: "",
        placeholder: ""
    });

    name = "state";
    displayName = "State";
    visible = false;
    slices: FormattingSettingsSlice[] = [this.nodePositions, this.dataSignature];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    layoutCard = new LayoutCard();
    nodeCard = new NodeCard();
    linkCard = new LinkCard();
    labelCard = new LabelCard();
    stateCard = new StateCard();

    cards = [
        this.layoutCard,
        this.nodeCard,
        this.linkCard,
        this.labelCard,
        this.stateCard
    ];
}
