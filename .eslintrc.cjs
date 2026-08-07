module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
  },
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ["react-hooks", "react-refresh"],
  ignorePatterns: ["dist", "node_modules"],
  rules: {
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        argsIgnorePattern: "^_",
        caughtErrors: "none",
        varsIgnorePattern: "^_",
      },
    ],
    "no-empty": "off",
    "prefer-const": "off",
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/rules-of-hooks": "error",
    "react-refresh/only-export-components": "off",
  },
};
