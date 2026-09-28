# @cldmv/eslint-plugin-jsonv

[![npm version]][npm_version_url] [![npm downloads]][npm_downloads_url] [![GitHub downloads]][github_downloads_url] [![Last commit]][last_commit_url] [![npm last update]][npm_last_update_url]

[![Contributors]][contributors_url] [![Sponsor shinrai]][sponsor_url]

ESLint plugin for validating `.jsonv` files using the [@cldmv/jsonv](https://github.com/CLDMV/jsonv) parser.

## ✨ What's New

### Latest: v1.0.13 (September 2026)

- **Published types describe a real ESLint plugin** — `dist/index.d.mts` typed the default export as a bare `Object`; it now types the plugin, the `jsonv/jsonv` language, `JsonvSourceCode` and every AST node against `@eslint/core`'s generics, checked in CI by a new `test:types` script, alongside a declared `engines.node` and `eslint` peer range that finally match what the runtime dependencies require (#30, #37, fixes #28, #32).
- **Three more language options** — `mode` (`"jsonv"`, `"json5"` or `"json"`), `strictOctal` and `allowInternalReferences` are now accepted, validated and forwarded to `@cldmv/jsonv`, matching what the README already documented (#39, fixes #34).
- **CLDMV lint/format tooling** — `lint`, `lint:fix`, `format` and `format:check` scripts, a pre-commit hook and the org's shared ESLint/Prettier config land, and the repository is reformatted repo-wide (#38, fixes #33).
- [View full v1.0.13 Changelog](https://github.com/CLDMV/jsonv-eslint-plugin-jsonv/blob/master/docs/changelog/v1/v1.0.13.md)

### Recent Releases

- **v1.0.12** (September 2026) — the `jsonv/jsonv` language builds a real ESLint AST from `@cldmv/jsonv`'s `parseToAst()`, so rules can select nodes and inline `eslint-disable` comments work (#26) ([Changelog](https://github.com/CLDMV/jsonv-eslint-plugin-jsonv/blob/master/docs/changelog/v1/v1.0.12.md))
- **v1.0.11** (September 2026) — language options are validated, parse errors report at their real position, and the plugin gained a vitest suite with a CI coverage badge (#16, #17, #18, #23, #24) ([Changelog](https://github.com/CLDMV/jsonv-eslint-plugin-jsonv/blob/master/docs/changelog/v1/v1.0.11.md))
- **v1.0.10** (September 2026) — the README links back to the jsonv repo (#15) ([Changelog](https://github.com/CLDMV/jsonv-eslint-plugin-jsonv/blob/master/docs/changelog/v1/v1.0.10.md))
- **v1.0.9** (September 2026) — corrected package name, badge row and license badges (#12) ([Changelog](https://github.com/CLDMV/jsonv-eslint-plugin-jsonv/blob/master/docs/changelog/v1/v1.0.9.md))

📚 **For complete version history, see [docs/changelog/](https://github.com/CLDMV/jsonv-eslint-plugin-jsonv/tree/master/docs/changelog/) and the [GitHub Releases](https://github.com/CLDMV/jsonv-eslint-plugin-jsonv/releases).**

## Features

- **Syntax Validation**: Validates jsonv syntax using the actual jsonv parser
- **ES2011-2025 Support**: All JSON5, ES2015, ES2020, ES2021 features supported
- **Internal References**: Validates bare identifiers, template interpolation, nested property access
- **BigInt Support**: Validates BigInt literals and numeric separators
- **Accurate Error Reporting**: Parse errors include line/column information
- **Configurable Parsing**: Target ES year, parse mode, strict BigInt and octal checks, and internal reference resolution

## Installation

```bash
npm install --save-dev @cldmv/eslint-plugin-jsonv
```

**Requirements:** Node `^20.19.0 || ^22.13.0 || >=24` and ESLint `^9.13.0 || ^10.0.0` (the first ESLint release with `defaultLanguageOptions` support for plugin `languages`; the plugin's `@eslint/plugin-kit` and `@eslint/core` dependencies also need that Node floor).

**Note:** This plugin requires `@cldmv/jsonv` as a peer dependency.

```bash
npm install @cldmv/jsonv
```

## Building the Plugin

If you're developing the plugin:

```bash
npm install
npm run build
```

This will:

1. Copy `index.mjs` into `dist/index.mjs`
2. Generate type definitions into `dist/index.d.mts`
3. Prepare the plugin for use

## Usage

### ESLint Flat Config (eslint.config.mjs)

```javascript
import jsonv from "@cldmv/eslint-plugin-jsonv";

export default [
	{
		files: ["**/*.jsonv"],
		plugins: { jsonv },
		language: "jsonv/jsonv",
		extends: ["jsonv/recommended"]
	}
];
```

### Configuration Options

`languageOptions` are passed to the `@cldmv/jsonv` parser (both `parseWithOptions()`, which reports errors, and `parseToAst()`, which builds the AST rules see). Every option is optional; the values below are the defaults:

```javascript
{
  files: ["**/*.jsonv"],
  plugins: { jsonv },
  language: "jsonv/jsonv",
  languageOptions: {
    year: 2025,                    // Target ES year: which jsonv features are allowed
    mode: "jsonv",                 // Parse mode: "jsonv", "json5" or "json"
    strictBigInt: false,           // true: an unsafe integer needs the `n` suffix
    strictOctal: false,            // true: legacy `0755` octals are errors (use `0o755`)
    allowInternalReferences: true  // false: references are not resolved or checked
  }
}
```

| Option                    | Type    | Allowed values                                                                                 | Default   | Meaning                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | ------- | ---------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `year`                    | number  | `2011`, `2015`, `2016`, `2017`, `2018`, `2019`, `2020`, `2021`, `2022`, `2023`, `2024`, `2025` | `2025`    | The target ES year. A feature introduced after it is an error: binary/octal literals and template literals need 2015, BigInt needs 2020, numeric separators need 2021.                                                                                                                                                                                            |
| `mode`                    | string  | `"jsonv"`, `"json5"`, `"json"`                                                                 | `"jsonv"` | The parse mode. `"jsonv"` allows every jsonv feature of the selected year, `"json5"` is meant for JSON5 only and `"json"` for strict JSON. The plugin passes the mode through unchanged, so it enforces exactly what `@cldmv/jsonv` enforces: in `@cldmv/jsonv` 1.1.0, `"json"` rejects comments, and the other JSON and JSON5 restrictions are not enforced yet. |
| `strictBigInt`            | boolean | `true`, `false`                                                                                | `false`   | When `true`, an integer outside the safe range (±9007199254740991) without an `n` suffix is an error. When `false`, it is read as a BigInt.                                                                                                                                                                                                                       |
| `strictOctal`             | boolean | `true`, `false`                                                                                | `false`   | When `true`, a legacy octal literal such as `0755` is an error; `0o755` is still allowed.                                                                                                                                                                                                                                                                         |
| `allowInternalReferences` | boolean | `true`, `false`                                                                                | `true`    | When `true`, internal references (`backup: port`, `server.port`, `` `${host}` ``) are resolved, and an undefined or circular reference is an error. When `false`, they are left unresolved and are not reported.                                                                                                                                                  |

Any other key, or a value outside the allowed ones, is a configuration error (a `TypeError` naming the option).

Three `@cldmv/jsonv` parse options are deliberately not accepted:

- `reviver`: a reviver only transforms the evaluated value, and linting does not use that value.
- `preserveComments`: the AST always carries the comments, so inline `eslint-disable` comments and rules can see them.
- `tolerant`: the plugin controls how parse errors are collected.

### Inline Configuration

The usual ESLint comments work inside `.jsonv` files: `// eslint-disable`, `/* eslint-disable <rule> */`, `/* eslint-enable */`, `// eslint-disable-line`, `// eslint-disable-next-line`, and `/* eslint <rule>: "off" */` rule configuration.

### Writing Rules

The `jsonv/jsonv` language exposes the document as an AST built from `@cldmv/jsonv`'s `parseToAst()`. Every node has a `loc` (1-based lines and columns) and a `range`, so reports on a node land on that node, and rules can use node types and selectors:

| Node type          | Children                | Notes                                                                                                                |
| ------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `Program`          | `body`                  | The document; `body` is the root value. `comments` and `tokens` hang off it.                                         |
| `ObjectExpression` | `properties`            | `{ ... }`                                                                                                            |
| `Property`         | `key`, `value`          | `key` is a `Literal` (quoted or numeric key) or an `Identifier` (unquoted key).                                      |
| `ArrayExpression`  | `elements`              | `[ ... ]`                                                                                                            |
| `Literal`          | —                       | Strings, numbers, BigInt (`bigint` holds the digits), booleans, `null`, `Infinity`, `NaN`; `raw` is the source text. |
| `Identifier`       | —                       | An unquoted key, or an internal reference such as `backup: port`.                                                    |
| `MemberExpression` | `object`, `property`    | A dotted internal reference such as `server.port`.                                                                   |
| `TemplateLiteral`  | `quasis`, `expressions` | A backtick string with `${...}` interpolation (a plain backtick string is a `Literal`).                              |
| `TemplateElement`  | —                       | A literal segment of a template.                                                                                     |

```javascript
// Report every string value containing "TODO", on the string itself
create(context) {
  return {
    "Property > Literal.value"(node) {
      if (typeof node.value === "string" && node.value.includes("TODO")) {
        context.report({ node, message: "Unexpected TODO." });
      }
    }
  };
}
```

## Supported Features

### ES2011 (JSON5 Base)

- Single-line (`//`) and multi-line (`/* */`) comments
- Trailing commas in objects and arrays
- Unquoted object keys
- Single-quoted strings
- Hexadecimal number literals (`0xFF`)
- Leading/trailing decimal points (`.5`, `5.`)
- Explicit positive sign (`+5`)
- `Infinity`, `-Infinity`, `NaN`
- Multi-line strings with backslash continuation
- **Internal references via bare identifiers**: `{ port: 8080, backup: port }`

### ES2015 (ES6)

- Binary literals (`0b1010`)
- Octal literals (`0o755`, also legacy `0755`)
- Template literals (backtick strings)
- **Template interpolation for internal refs**: `` url: `http://${host}:${port}` ``

### ES2020

- BigInt literals (`9007199254740992n`)
- BigInt in hex/binary/octal formats

### ES2021

- Numeric separators (`1_000_000`, `0xFF_AA`, `0b1111_0000`)

## Example

**config.jsonv:**

<!-- @cldmv/prettier-plugin-jsonv 1.0.6 rewrites this block destructively (keys become "[object Object]", comments and numeric formats are lost), so prettier leaves it verbatim. -->
<!-- prettier-ignore -->
```jsonv
{
  // Server configuration with internal references
  host: "localhost",
  port: 8080,
  
  // Template interpolation
  url: `http://${host}:${port}`,
  
  // ES2021 numeric separators
  maxConnections: 1_000_000,
  
  // ES2020 BigInt
  userId: 9007199254740993n,
  
  // ES2015 binary flags
  permissions: 0b1111_0000,
  
  // Nested reference
  monitoring: {
    healthCheck: url
  }
}
```

## License

[![GitHub license]][github_license_url] [![npm license]][npm_license_url]

Apache-2.0 © Shinrai / CLDMV

[npm version]: https://img.shields.io/npm/v/%40cldmv%2Feslint-plugin-jsonv.svg?style=for-the-badge&logo=npm&logoColor=white&labelColor=CB3837
[npm_version_url]: https://www.npmjs.com/package/@cldmv/eslint-plugin-jsonv
[npm downloads]: https://img.shields.io/npm/dm/%40cldmv%2Feslint-plugin-jsonv.svg?style=for-the-badge&logo=npm&logoColor=white&labelColor=CB3837
[npm_downloads_url]: https://www.npmjs.com/package/@cldmv/eslint-plugin-jsonv
[npm last update]: https://img.shields.io/npm/last-update/%40cldmv%2Feslint-plugin-jsonv?style=for-the-badge&logo=npm&logoColor=white&labelColor=CB3837
[npm_last_update_url]: https://www.npmjs.com/package/@cldmv/eslint-plugin-jsonv
[npm license]: https://img.shields.io/npm/l/%40cldmv%2Feslint-plugin-jsonv.svg?style=for-the-badge&logo=npm&logoColor=white&labelColor=CB3837
[npm_license_url]: https://www.npmjs.com/package/@cldmv/eslint-plugin-jsonv
[github downloads]: https://img.shields.io/github/downloads/CLDMV/jsonv-eslint-plugin-jsonv/total?style=for-the-badge&logo=github&logoColor=white&labelColor=181717
[github_downloads_url]: https://github.com/CLDMV/jsonv-eslint-plugin-jsonv/releases
[last commit]: https://img.shields.io/github/last-commit/CLDMV/jsonv-eslint-plugin-jsonv?style=for-the-badge&logo=github&logoColor=white&labelColor=181717
[last_commit_url]: https://github.com/CLDMV/jsonv-eslint-plugin-jsonv/commits
[github license]: https://img.shields.io/github/license/CLDMV/jsonv-eslint-plugin-jsonv.svg?style=for-the-badge&logo=github&logoColor=white&labelColor=181717
[github_license_url]: https://github.com/CLDMV/jsonv-eslint-plugin-jsonv/blob/HEAD/LICENSE
[contributors]: https://img.shields.io/github/contributors/CLDMV/jsonv-eslint-plugin-jsonv.svg?style=for-the-badge&logo=github&logoColor=white&labelColor=181717
[contributors_url]: https://github.com/CLDMV/jsonv-eslint-plugin-jsonv/graphs/contributors
[sponsor shinrai]: https://img.shields.io/github/sponsors/shinrai?style=for-the-badge&logo=githubsponsors&logoColor=white&labelColor=EA4AAA&label=Sponsor
[sponsor_url]: https://github.com/sponsors/shinrai
