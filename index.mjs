/**
 * @fileoverview ESLint plugin for @cldmv/jsonv files
 * @module eslint-plugin-jsonv
 * @public
 *
 * @description
 * Custom ESLint plugin for validating .jsonv files using the @cldmv/jsonv parser.
 * Provides language definition, parser, and recommended rules for jsonv files.
 *
 * Features:
 * - Validates jsonv syntax using the actual jsonv parser
 * - Reports parse errors with accurate source locations
 * - Supports all ES2011-2025 features (JSON5, binary/octal literals, BigInt, numeric separators, etc.)
 * - Detects internal reference errors (circular refs, undefined refs)
 * - Configurable year-based feature detection
 * - Exposes a positioned AST (objects, arrays, properties, literals, references, templates),
 *   comments and tokens, so rules can select nodes and inline `eslint-disable` comments work
 *
 * @example
 * // In eslint.config.mjs
 * import jsonv from 'eslint-plugin-jsonv';
 *
 * export default [
 *   {
 *     files: ["**\/*.jsonv"],
 *     plugins: { jsonv },
 *     language: "jsonv/jsonv",
 *     extends: ["jsonv/recommended"]
 *   }
 * ];
 */

import { JsonvReferenceError, JsonvSyntaxError, parseToAst, parseWithOptions } from "@cldmv/jsonv/parser";
import { ConfigCommentParser, Directive, TextSourceCodeBase, VisitNodeStep } from "@eslint/plugin-kit";

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Reads this package's own `name` and `version` from its `package.json`.
 *
 * `scripts/build.mjs` copies this file verbatim into `dist/index.mjs` — one directory
 * deeper than the source file — so `package.json` sits alongside the source copy but
 * one level up from the built copy. Check the co-located path first and fall back to
 * the parent directory so this resolves correctly from either location.
 *
 * @public
 * @returns {{name: string, version: string}} The package's `name` and `version`.
 * @example
 * const { name, version } = readPackageMeta();
 */
function readPackageMeta() {
	const here = dirname(fileURLToPath(import.meta.url));
	const localPath = join(here, "package.json");
	const pkgPath = existsSync(localPath) ? localPath : join(here, "..", "package.json");
	const require = createRequire(import.meta.url);
	const { name, version } = require(pkgPath);
	return { name, version };
}

/**
 * Language options `jsonvLanguage#parse` reads from `context.languageOptions` and
 * forwards to `@cldmv/jsonv`'s `parseWithOptions`. Any other key is rejected by
 * `validateLanguageOptions` since it would silently do nothing.
 *
 * @public
 * @type {Set<string>}
 */
const SUPPORTED_LANGUAGE_OPTIONS = new Set(["year", "strictBigInt"]);

/**
 * Valid `year` language option values, matching @cldmv/jsonv's `ParseOptions["year"]`
 * union (see `@cldmv/jsonv/parser`'s `ParseOptions` type).
 *
 * @public
 * @type {Set<number>}
 */
const VALID_YEARS = new Set([2011, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);

/**
 * Child keys of every node type in the AST `jsonvLanguage#parse` produces, in source order
 * where that is defined. The node types and their shapes come from @cldmv/jsonv's own AST
 * (`@cldmv/jsonv/parser`'s `Program`/`Expression` types); the plugin only re-positions them.
 *
 * - `Program` — the document; `body` is the single root value.
 * - `ObjectExpression` — `{ ... }`, with `properties` (`Property` nodes).
 * - `Property` — `key: value`; `key` is a `Literal` (quoted or numeric key) or an `Identifier` (unquoted key).
 * - `ArrayExpression` — `[ ... ]`, with `elements`.
 * - `Literal` — string, number, BigInt, boolean, null, `Infinity`, `NaN` (`raw` holds the source text).
 * - `Identifier` — an unquoted key, or an internal reference such as `backup: port`.
 * - `MemberExpression` — a dotted internal reference such as `server.port`.
 * - `TemplateLiteral` / `TemplateElement` — backtick strings and their `${...}` interpolations.
 *
 * @public
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
const VISITOR_KEYS = Object.freeze({
	Program: Object.freeze(["body"]),
	ObjectExpression: Object.freeze(["properties"]),
	Property: Object.freeze(["key", "value"]),
	ArrayExpression: Object.freeze(["elements"]),
	Literal: Object.freeze([]),
	Identifier: Object.freeze([]),
	MemberExpression: Object.freeze(["object", "property"]),
	TemplateLiteral: Object.freeze(["quasis", "expressions"]),
	TemplateElement: Object.freeze([])
});

/**
 * Line terminators, matching how @cldmv/jsonv advances its line counter (`\r\n` as one
 * break, plus lone `\r`, `\n`, U+2028 and U+2029), so `sourceCode.lines` and
 * `getLocFromIndex()` agree with the node positions.
 *
 * @public
 * @type {RegExp}
 */
const LINE_ENDING_PATTERN = /\r\n|[\r\n\u2028\u2029]/u;

/**
 * Matches the comment bodies ESLint treats as inline configuration (same pattern as @eslint/json).
 *
 * @public
 * @type {RegExp}
 */
const INLINE_CONFIG = /^\s*eslint(?:-enable|-disable(?:(?:-next)?-line)?)?(?:\s|$)/u;

/**
 * Shared parser for `eslint-*` directive comments.
 *
 * @public
 * @type {ConfigCommentParser}
 */
const commentParser = new ConfigCommentParser();

/**
 * Tests whether a value is a positioned @cldmv/jsonv AST node.
 * @public
 * @param {unknown} value - Any property value of a node.
 * @returns {boolean} `true` for an object with a string `type` and a `loc`.
 * @example
 * isJsonvNode({ type: "Literal", loc: { start: {}, end: {} } }); // true
 */
function isJsonvNode(value) {
	return value !== null && typeof value === "object" && typeof value.type === "string" && typeof value.loc === "object";
}

/**
 * Returns the child keys to visit for a node: its entry in {@link VISITOR_KEYS}, or — for a
 * node type @cldmv/jsonv may add later — every key holding a node or an array of nodes.
 * @public
 * @param {Object} node - An AST node.
 * @returns {ReadonlyArray<string>} Child property names.
 * @example
 * getChildKeys({ type: "Property", key, value }); // ["key", "value"]
 */
function getChildKeys(node) {
	return (
		VISITOR_KEYS[node.type] ??
		Object.keys(node).filter((key) => {
			const value = node[key];
			return Array.isArray(value) ? value.some(isJsonvNode) : isJsonvNode(value);
		})
	);
}

/**
 * Converts a @cldmv/jsonv `loc` (1-based lines, 0-based columns, 0-based `offset`s) into the
 * ESLint `loc`/`range` pair for this language. The language declares `lineStart: 1` and
 * `columnStart: 1`, so columns are shifted to 1-based; `range` comes from the offsets.
 * @public
 * @param {{start: {line: number, column: number, offset: number}, end: {line: number, column: number, offset: number}}} loc - A jsonv location.
 * @returns {{loc: {start: {line: number, column: number}, end: {line: number, column: number}}, range: [number, number]}} The ESLint location and range.
 * @example
 * toEslintPosition({ start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 3, offset: 3 } });
 * // { loc: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } }, range: [0, 3] }
 */
function toEslintPosition(loc) {
	return {
		loc: {
			start: { line: loc.start.line, column: loc.start.column + 1 },
			end: { line: loc.end.line, column: loc.end.column + 1 }
		},
		range: [loc.start.offset, loc.end.offset]
	};
}

/**
 * Copies a jsonv comment or token with ESLint positions (a 1-based `loc` and a `range`).
 * Tokens are never walked for children: some token types share a name with a node type
 * (`Identifier`, `TemplateLiteral`) but carry no child nodes.
 * @public
 * @param {Object} element - A jsonv comment or token.
 * @returns {Object} The converted copy.
 * @example
 * convertLeaf(parseToAst("// note\n1").comments[0]);
 */
function convertLeaf(element) {
	return { ...element, ...toEslintPosition(element.loc) };
}

/**
 * Deep-copies a jsonv AST node with ESLint positions: every node gets a 1-based `loc` and a
 * `range`, and child nodes are converted recursively.
 * @public
 * @param {Object} node - A jsonv AST node.
 * @returns {Object} The converted copy.
 * @example
 * convertNode(parseToAst("{ a: 1 }").program.body);
 */
function convertNode(node) {
	const converted = convertLeaf(node);
	for (const key of getChildKeys(node)) {
		const child = node[key];
		converted[key] = Array.isArray(child) ? child.map(convertNode) : convertNode(child);
	}
	return converted;
}

/**
 * Builds the ESLint AST for a document from @cldmv/jsonv's `parseToAst()` result: the
 * `Program` root (whose `body` is the root value) with positioned `comments` and `tokens`.
 * @public
 * @param {{program: Object, comments: Object[], tokens: Object[]}} astResult - The `parseToAst()` result.
 * @returns {Object} The `Program` node.
 * @example
 * buildProgram(parseToAst("// note\n{ a: 1 }"));
 */
function buildProgram({ program, comments, tokens }) {
	return {
		...convertNode(program),
		comments: comments.map(convertLeaf),
		tokens: tokens.map(convertLeaf)
	};
}

/**
 * SourceCode for a parsed `.jsonv` file, modelled on @eslint/json's `JSONSourceCode`:
 * positions, lines and text helpers come from `TextSourceCodeBase`; this class adds AST
 * traversal, parent lookup and inline configuration (`eslint-disable*` / `eslint-enable`
 * directives and `/* eslint rule: ... *\/` config comments).
 *
 * @public
 */
class JsonvSourceCode extends TextSourceCodeBase {
	/**
	 * Cached traversal steps.
	 * @type {VisitNodeStep[]|undefined}
	 */
	#steps;

	/**
	 * Parent of every non-root node.
	 * @type {WeakMap<Object, Object>}
	 */
	#parents = new WeakMap();

	/**
	 * Cached inline configuration comments.
	 * @type {Object[]|undefined}
	 */
	#inlineConfigComments;

	/**
	 * Creates a SourceCode object.
	 * @param {Object} options - Options.
	 * @param {string} options.text - The source text.
	 * @param {Object} options.ast - The `Program` node built by `jsonvLanguage#parse`.
	 */
	constructor({ text, ast }) {
		super({ text, ast, lineEndingPattern: LINE_ENDING_PATTERN });
		/** @type {Object[]} Comments in source order. */
		this.comments = ast.comments;
		/** @type {Object[]} Tokens in source order, excluding comments. */
		this.tokens = ast.tokens;
		/** @type {boolean} Whether the text starts with a byte order mark. */
		this.hasBOM = text.charCodeAt(0) === 0xfeff;
	}

	/**
	 * Returns the source text split into lines (a fresh copy of `lines`).
	 * @public
	 * @returns {string[]} The lines.
	 */
	getLines() {
		return [...this.lines];
	}

	/**
	 * Walks the AST once, recording enter/exit steps and each node's parent.
	 * @returns {VisitNodeStep[]} The traversal steps.
	 */
	#ensureTraversal() {
		if (!this.#steps) {
			const steps = [];
			const visit = (node, parent) => {
				if (parent) this.#parents.set(node, parent);
				steps.push(new VisitNodeStep({ target: node, phase: 1, args: [node, parent] }));
				for (const key of getChildKeys(node)) {
					const child = node[key];
					for (const item of Array.isArray(child) ? child : [child]) visit(item, node);
				}
				steps.push(new VisitNodeStep({ target: node, phase: 2, args: [node, parent] }));
			};
			visit(this.ast, undefined);
			this.#steps = steps;
		}
		return this.#steps;
	}

	/**
	 * Returns the enter/exit visit steps for every node, depth first in source order.
	 * @public
	 * @returns {Iterator<VisitNodeStep>} The traversal steps.
	 */
	traverse() {
		return this.#ensureTraversal().values();
	}

	/**
	 * Returns the parent of a node, or `undefined` for the `Program` root.
	 * @public
	 * @param {Object} node - An AST node.
	 * @returns {Object|undefined} The parent node.
	 */
	getParent(node) {
		this.#ensureTraversal();
		return this.#parents.get(node);
	}

	/**
	 * Returns the comments that hold inline configuration (`eslint`, `eslint-enable`,
	 * `eslint-disable`, `eslint-disable-line`, `eslint-disable-next-line`).
	 * @public
	 * @returns {Object[]} The inline configuration comments.
	 */
	getInlineConfigNodes() {
		if (!this.#inlineConfigComments) {
			this.#inlineConfigComments = this.comments.filter((comment) => INLINE_CONFIG.test(comment.value));
		}
		return this.#inlineConfigComments;
	}

	/**
	 * Returns the `eslint-disable*` / `eslint-enable` directives, plus problems for malformed
	 * ones (an `eslint-disable-line` spanning several lines).
	 * @public
	 * @returns {{problems: Object[], directives: Directive[]}} Directives and problems.
	 */
	getDisableDirectives() {
		const problems = [];
		const directives = [];

		for (const comment of this.getInlineConfigNodes()) {
			const { label, value, justification } = commentParser.parseDirective(comment.value);

			if (label === "eslint-disable-line" && comment.loc.start.line !== comment.loc.end.line) {
				problems.push({ ruleId: null, message: `${label} comment should not span multiple lines.`, loc: comment.loc });
				continue;
			}

			if (label !== "eslint") {
				directives.push(new Directive({ type: label.slice("eslint-".length), node: comment, value, justification }));
			}
		}

		return { problems, directives };
	}

	/**
	 * Returns the rule configurations from `/* eslint rule: ... *\/` comments, plus problems for
	 * ones that fail to parse.
	 * @public
	 * @returns {{problems: Object[], configs: Array<{config: {rules: Object}, loc: Object}>}} Configs and problems.
	 */
	applyInlineConfig() {
		const problems = [];
		const configs = [];

		for (const comment of this.getInlineConfigNodes()) {
			const { label, value } = commentParser.parseDirective(comment.value);
			if (label !== "eslint") continue;

			const parseResult = commentParser.parseJSONLikeConfig(value);
			if (parseResult.ok) {
				configs.push({ config: { rules: parseResult.config }, loc: comment.loc });
			} else {
				problems.push({ ruleId: null, message: parseResult.error.message, loc: comment.loc });
			}
		}

		return { problems, configs };
	}
}

/**
 * Language definition for jsonv files
 *
 * @public
 * @type {Object}
 */
const jsonvLanguage = {
	/** File type - must be "text" for text-based languages */
	fileType: "text",
	/** Line numbering starts at 1 */
	lineStart: 1,
	/** Column numbering starts at 1 (node `loc` columns are 1-based) */
	columnStart: 1,
	/** Property name for node types */
	nodeTypeKey: "type",
	/** Child keys of each AST node type, used for selector matching */
	visitorKeys: VISITOR_KEYS,

	/**
	 * Parse jsonv source code - ESLint Language API.
	 *
	 * The file is first parsed and evaluated with `parseWithOptions` — that is what reports
	 * syntax errors, year-gated features, `strictBigInt` violations and unresolved/circular
	 * internal references, each with its source position. A file that passes is then parsed
	 * with `parseToAst` to build the positioned AST, comments and tokens ESLint traverses.
	 *
	 * @param {Object} file - File object with body property containing source text
	 * @param {Object} context - Context with languageOptions
	 * @returns {Object} Parse result {ok, ast, jsonvValue} or {ok: false, errors}
	 */
	parse(file, context) {
		const text = file.body;
		const options = context.languageOptions || {};
		const parseOptions = {
			year: options.year || 2025,
			strictBigInt: options.strictBigInt !== undefined ? options.strictBigInt : false,
			mode: "jsonv"
		};

		try {
			const jsonvValue = parseWithOptions(text, { ...parseOptions, tolerant: false });
			const ast = buildProgram(parseToAst(text, parseOptions));

			return {
				ok: true,
				ast,
				// The evaluated document (references resolved) for callers of parse()
				jsonvValue
			};
		} catch (error) {
			// @cldmv/jsonv (>=1.1.0) throws a `JsonvSyntaxError` (or its `LexerError` subclass) for
			// every parser-level and lexer-level failure, and a `JsonvReferenceError` for an
			// unresolved or circular internal reference; both carry the real `line`/`column`/`loc`.
			// Their `column` is 0-based (matching the column embedded in jsonv's messages), while
			// this language's `columnStart: 1` means ESLint expects 1-based columns, hence `+ 1`.
			//
			// Anything else (e.g. a RangeError from exhausting the call stack on pathologically deep
			// nesting) has no position — fall back to line 1, column 1.
			const hasPosition = error instanceof JsonvSyntaxError || error instanceof JsonvReferenceError;

			const errorInfo = hasPosition
				? { message: error.message, line: error.line, column: error.column + 1, endLine: error.loc.end.line, endColumn: error.loc.end.column + 1 }
				: { message: error.message, line: 1, column: 1 };

			return {
				ok: false,
				errors: [errorInfo]
			};
		}
	},

	/**
	 * Create the SourceCode object ESLint hands to rules
	 *
	 * @public
	 * @param {Object} file - The file object
	 * @param {Object} parseResult - The successful result from parse()
	 * @returns {JsonvSourceCode} SourceCode object
	 */
	createSourceCode(file, parseResult) {
		const text = typeof file.body === "string" ? file.body : String(file.body || "");
		return new JsonvSourceCode({ text, ast: parseResult.ast });
	},

	/**
	 * Validate language options
	 * Required by ESLint 9 language API. ESLint calls this with the languageOptions
	 * already merged with `defaultLanguageOptions` below, so `languageOptions` here
	 * reflects the effective options that will reach `parse()`.
	 *
	 * @public
	 * @param {Object} languageOptions - The (already-merged) language options to validate
	 * @returns {void}
	 * @throws {TypeError} When an unsupported key is present, or a supported key holds an invalid value
	 */
	validateLanguageOptions(languageOptions) {
		const options = languageOptions ?? {};

		for (const key of Object.keys(options)) {
			if (!SUPPORTED_LANGUAGE_OPTIONS.has(key)) {
				throw new TypeError(`Unknown language option "${key}". Supported options are: ${[...SUPPORTED_LANGUAGE_OPTIONS].join(", ")}.`);
			}
		}

		if (options.year !== undefined && !VALID_YEARS.has(options.year)) {
			throw new TypeError(
				`Invalid "year" language option: ${JSON.stringify(options.year)}. Supported years are: ${[...VALID_YEARS].join(", ")}.`
			);
		}

		if (options.strictBigInt !== undefined && typeof options.strictBigInt !== "boolean") {
			throw new TypeError(`Invalid "strictBigInt" language option: expected a boolean, got ${typeof options.strictBigInt}.`);
		}
	},

	/**
	 * Default language options
	 * Required by ESLint 9 language API to supply defaults when a config specifies
	 * none — ESLint deep-merges this with the config's `languageOptions` before
	 * calling `validateLanguageOptions` and `parse()`.
	 *
	 * @public
	 * @type {Object}
	 */
	defaultLanguageOptions: {
		year: 2025,
		strictBigInt: false
	}
};

/**
 * Recommended configuration for jsonv files
 *
 * `languageOptions.parser` is intentionally omitted: that field is only read by
 * ESLint's built-in "js" language (for its legacy custom-parser support) — a custom
 * `language` such as `jsonv/jsonv` never consults it, so setting it here was inert.
 *
 * @public
 * @type {Object}
 */
const recommendedConfig = {
	rules: {
		// Add custom jsonv rules here in the future
		// For now, parsing validation is enough
	}
};

/**
 * ESLint plugin export
 *
 * @public
 * @type {Object}
 */
const plugin = {
	meta: readPackageMeta(),
	languages: {
		jsonv: jsonvLanguage
	},
	configs: {
		recommended: recommendedConfig
	},
	rules: {
		// Future: Add custom rules for jsonv-specific validations
		// Examples:
		// - "no-circular-references": enforce no circular internal refs
		// - "require-bigint-suffix": enforce 'n' suffix for large integers
		// - "prefer-template-interpolation": prefer ${} over string concat
		// - "no-duplicate-keys": enforce unique object keys
	}
};

export default plugin;
