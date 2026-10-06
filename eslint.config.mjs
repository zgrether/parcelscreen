import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

// Code that must run in a Web Worker and in Node (docs/plans/phase-0.md §2b).
const PURE = [
  "lib/screen/**",
  "lib/geo/**",
  "lib/http.ts",
  "lib/format.ts",
  "lib/render/**",
  "lib/report/**",
  "lib/search/**",
];

// The report blocks render from a ScreenResult and the evaluation point only, so the Phase 1 parcel page and
// its PDF can reuse them, rendered on a server (step 14 plan §2).
const BLOCKS = ["components/Results/blocks/**"];

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "legacy/**",
      "coverage/**",
      "tmp/**",
      "public/maplibre/**",
      "next-env.d.ts",
    ],
  },
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
  {
    files: BLOCKS,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react",
              importNames: [
                "useState",
                "useEffect",
                "useLayoutEffect",
                "useReducer",
                "useRef",
                "useContext",
                "useMemo",
                "useCallback",
                "useSyncExternalStore",
                "createContext",
              ],
              message: "Report blocks are plain functions of their props: no hooks, no context.",
            },
          ],
          patterns: [
            {
              group: ["maplibre-gl", "three", "three/*", "@react-three/*"],
              message: "Report blocks don't know about the map.",
            },
            {
              group: ["@/components/Explore/*", "@/components/Map/*", "@/lib/client/*"],
              message: "Report blocks don't read explorer, map or browser state.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "window", message: "Report blocks render on a server too." },
        { name: "document", message: "Report blocks render on a server too." },
        { name: "localStorage", message: "Open state and other preferences are panel chrome." },
      ],
    },
  },
];

export default config;
