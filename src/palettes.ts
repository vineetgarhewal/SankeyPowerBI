export interface PaletteDefinition {
    id: string;
    displayName: string;
    colors?: readonly string[];
}

export const DEFAULT_PALETTE_ID = "custom";

export const PALETTE_OPTIONS: readonly PaletteDefinition[] = [
    { id: "custom", displayName: "Custom / data colors" },
    {
        id: "softPastel",
        displayName: "Soft Pastel",
        colors: ["#7AA7F8", "#73C9B0", "#F6B26B", "#A894E8", "#F08CA6", "#79C7E3"]
    },
    {
        id: "powerBiClassic",
        displayName: "Power BI Classic",
        colors: ["#118DFF", "#12239E", "#E66C37", "#6B007B", "#E044A7", "#1AAB40"]
    },
    {
        id: "azureOcean",
        displayName: "Azure Ocean",
        colors: ["#0078D4", "#50E6FF", "#2D7D9A", "#00B7C3", "#4F6BED", "#8E8CD8"]
    },
    {
        id: "colorblindConscious",
        displayName: "Colorblind-Conscious",
        colors: ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00"]
    },
    {
        id: "corporateBlue",
        displayName: "Corporate Blue",
        colors: ["#183B56", "#2F6B9A", "#4D8FC3", "#74ACD1", "#A5C9E1", "#D2E4F0"]
    },
    {
        id: "freshNature",
        displayName: "Fresh Nature",
        colors: ["#2A9D8F", "#68B684", "#A7C957", "#E9C46A", "#F4A261", "#E76F51"]
    },
    {
        id: "warmSunset",
        displayName: "Warm Sunset",
        colors: ["#7B2CBF", "#C77DFF", "#F72585", "#FF8C42", "#FFCA3A", "#F28482"]
    },
    {
        id: "monochromeBlue",
        displayName: "Monochrome Blue",
        colors: ["#163A5F", "#245A87", "#367EAD", "#65A5CF", "#9AC8E2", "#CDE5F2"]
    },
    {
        id: "mutedProfessional",
        displayName: "Muted Professional",
        colors: ["#54738C", "#7895A8", "#6E9F8D", "#C19A6B", "#9A86A4", "#C47F7F"]
    },
    {
        id: "darkBackground",
        displayName: "Dark Background",
        colors: ["#58A6FF", "#56D4C0", "#FFB86C", "#BD93F9", "#FF79C6", "#F1FA8C"]
    }
];
