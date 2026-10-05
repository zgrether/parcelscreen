import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

// Code that must run in a Web Worker and in Node (docs/plans/phase-0.md §2b).
const PURE = ["lib/screen/**", "lib/geo/**", "lib/http.ts", "lib/format.ts", "lib/render/**"];

const config = [
  { ignores: [".next/**", "node_modules/**", "legacy/**", "coverage/**", "tmp/**", "public/maplibre/**", "next-env.d.ts"] },
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    // Omitting fields with a rest spread ({ veto: _v, ...bench }) is how the parity tests drop fields
    // a later step adds; the omitted names are intentionally unused.
    rules: { "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }] },
  },
  {
    files: PURE,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "react/*", "next", "next/*"],
              message: "lib/screen is DOM-free and framework-free.",
            },
            {
              group: ["maplibre-gl", "three", "three/*", "@react-three/*", "leaflet"],
              message: "Rendering belongs in components/.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "window", message: "No DOM in the pipeline." },
        { name: "document", message: "No DOM in the pipeline." },
        { name: "localStorage", message: "Persistence belongs in lib/client." },
      ],
    },
  },
];

export default config;
