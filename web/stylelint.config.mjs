/** §3.1: colour literals live only in styles/tokens.css. Modules use var(--token). */
export default {
  rules: {
    "color-no-hex": true,
    "color-named": "never",
    "function-disallowed-list": ["/^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)$/i"],
  },
  ignoreFiles: ["styles/tokens.css", "node_modules/**", ".next/**", "public/**", "playwright-report/**", "test-results/**"],
};
