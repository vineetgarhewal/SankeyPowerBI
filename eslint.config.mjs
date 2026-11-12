import powerbiVisuals from "eslint-plugin-powerbi-visuals";

export default [
    {
        ignores: ["node_modules/**", "dist/**", ".tmp/**", ".vscode/**"]
    },
    powerbiVisuals.configs.recommended
];
