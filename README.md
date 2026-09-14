# @cldmv/eslint-plugin-jsonv

[![npm version]][npm_version_url] [![npm downloads]][npm_downloads_url] [![GitHub downloads]][github_downloads_url] [![Last commit]][last_commit_url] [![npm last update]][npm_last_update_url]

[![Contributors]][contributors_url] [![Sponsor shinrai]][sponsor_url]

ESLint plugin for validating `.jsonv` files using the [@cldmv/jsonv](https://github.com/CLDMV/jsonv) parser.

## Features

- **Syntax Validation**: Validates jsonv syntax using the actual jsonv parser
- **ES2011-2025 Support**: All JSON5, ES2015, ES2020, ES2021 features supported
- **Internal References**: Validates bare identifiers, template interpolation, nested property access
- **BigInt Support**: Validates BigInt literals and numeric separators
- **Accurate Error Reporting**: Parse errors include line/column information
- **Year-Based Features**: Configurable target ES year for feature detection

## Installation

```bash
npm install --save-dev @cldmv/eslint-plugin-jsonv
```

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
import jsonv from '@cldmv/eslint-plugin-jsonv';

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

The parser supports the following options:

```javascript
{
  files: ["**/*.jsonv"],
  plugins: { jsonv },
  language: "jsonv/jsonv",
  languageOptions: {
    year: 2025,           // Target ES year (2011, 2015, 2020, 2021, 2022-2025)
    strictBigInt: false,  // Require 'n' suffix for large integers
    mode: "jsonv"         // Parse mode: "jsonv", "json5", "json"
  }
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
