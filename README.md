# eslint-plugin-jsonv

ESLint plugin for validating `.jsonv` files using the @cldmv/jsonv parser.

## Features

- **Syntax Validation**: Validates jsonv syntax using the actual jsonv parser
- **ES2011-2025 Support**: All JSON5, ES2015, ES2020, ES2021 features supported
- **Internal References**: Validates bare identifiers, template interpolation, nested property access
- **BigInt Support**: Validates BigInt literals and numeric separators
- **Accurate Error Reporting**: Parse errors include line/column information
- **Year-Based Features**: Configurable target ES year for feature detection

## Installation

```bash
npm install --save-dev eslint-plugin-jsonv
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
import jsonv from 'eslint-plugin-jsonv';

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

Apache-2.0. See [LICENSE](LICENSE).
