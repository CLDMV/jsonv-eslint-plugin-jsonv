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

//-----------------------------------------------------------------------------
// Types
//
// The language, its SourceCode and the plugin are typed against @eslint/core's
// generics (`Language`, `TextSourceCode`, `OkParseResult`, `Plugin`, ...), the same
// way @eslint/json types its JSON language. `tsc -p .configs/tsconfig.types.json`
// type-checks this JSDoc (`checkJs`) and emits it as `dist/index.d.mts`.
//-----------------------------------------------------------------------------

/**
 * @import { ConfigObject, File, FileError, FileProblem, Language, OkParseResult, ParseResult, Plugin, RulesConfig, RuleVisitor, SourceLocation, SourceRange } from "@eslint/core";
 * @import { CustomRuleDefinitionType, CustomRuleTypeDefinitions, CustomRuleVisitorWithExit, DirectiveType } from "@eslint/plugin-kit";
 * @import { AstResult, SourceLocation as JsonvParserLocation, TokenType } from "@cldmv/jsonv/parser";
 */

/**
 * The ES years the `year` language option accepts, matching @cldmv/jsonv's `ParseOptions["year"]`.
 *
 * @public
 * @typedef {2011 | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025} JsonvYear
 */

/**
 * Language options for `language: "jsonv/jsonv"`. Any other key is rejected by
 * `validateLanguageOptions`, so the type is closed.
 *
 * @public
 * @typedef {object} JsonvLanguageOptions
 * @property {JsonvYear} [year] The ES year whose jsonv features are allowed. Defaults to `2025`.
 * @property {boolean} [strictBigInt] When `true`, an integer outside the safe range without an `n` suffix is an error instead of
 *   being converted to a BigInt. Defaults to `false`.
 */

/**
 * A `Literal`: string, number, BigInt, boolean, `null`, `Infinity` or `NaN`, with its source text in `raw`.
 *
 * @public
 * @typedef {object} JsonvLiteral
 * @property {"Literal"} type The node type.
 * @property {string | number | bigint | boolean | null} value The evaluated value.
 * @property {string} raw The source text.
 * @property {string} [bigint] The BigInt digits, for a BigInt literal.
 * @property {SourceLocation} loc The location (1-based lines and columns).
 * @property {SourceRange} range The `[start, end)` source offsets.
 */

/**
 * An `Identifier`: an unquoted key, or an internal reference such as `backup: port`.
 *
 * @public
 * @typedef {object} JsonvIdentifier
 * @property {"Identifier"} type The node type.
 * @property {string} name The identifier text.
 * @property {SourceLocation} loc The location (1-based lines and columns).
 * @property {SourceRange} range The `[start, end)` source offsets.
 */

/**
 * An `ObjectExpression`: `{ ... }`.
 *
 * @public
 * @typedef {object} JsonvObjectExpression
 * @property {"ObjectExpression"} type The node type.
 * @property {JsonvProperty[]} properties The properties, in source order.
 * @property {SourceLocation} loc The location (1-based lines and columns).
 * @property {SourceRange} range The `[start, end)` source offsets.
 */

/**
 * A `Property`: `key: value`. The key is a `Literal` (quoted or numeric key) or an `Identifier` (unquoted key).
 *
 * @public
 * @typedef {object} JsonvProperty
 * @property {"Property"} type The node type.
 * @property {JsonvLiteral | JsonvIdentifier} key The key.
 * @property {JsonvExpression} value The value.
 * @property {boolean} computed Always `false` in jsonv.
 * @property {SourceLocation} loc The location (1-based lines and columns).
 * @property {SourceRange} range The `[start, end)` source offsets.
 */

/**
 * An `ArrayExpression`: `[ ... ]`.
 *
 * @public
 * @typedef {object} JsonvArrayExpression
 * @property {"ArrayExpression"} type The node type.
 * @property {JsonvExpression[]} elements The elements, in source order.
 * @property {SourceLocation} loc The location (1-based lines and columns).
 * @property {SourceRange} range The `[start, end)` source offsets.
 */

/**
 * A `MemberExpression`: a dotted internal reference such as `server.port`.
 *
 * @public
 * @typedef {object} JsonvMemberExpression
 * @property {"MemberExpression"} type The node type.
 * @property {JsonvExpression} object The object being accessed.
 * @property {JsonvIdentifier} property The accessed property.
 * @property {false} computed Always `false`.
 * @property {SourceLocation} loc The location (1-based lines and columns).
 * @property {SourceRange} range The `[start, end)` source offsets.
 */

/**
 * A `TemplateElement`: one string segment of a template literal.
 *
 * @public
 * @typedef {object} JsonvTemplateElement
 * @property {"TemplateElement"} type The node type.
 * @property {{raw: string, cooked: string}} value The raw and cooked segment text.
 * @property {boolean} tail Whether this is the last segment.
 * @property {SourceLocation} loc The location (1-based lines and columns).
 * @property {SourceRange} range The `[start, end)` source offsets.
 */

/**
 * A `TemplateLiteral`: a backtick string and its `${...}` interpolations.
 *
 * @public
 * @typedef {object} JsonvTemplateLiteral
 * @property {"TemplateLiteral"} type The node type.
 * @property {JsonvTemplateElement[]} quasis The string segments.
 * @property {JsonvExpression[]} expressions The interpolated expressions.
 * @property {SourceLocation} loc The location (1-based lines and columns).
 * @property {SourceRange} range The `[start, end)` source offsets.
 */

/**
 * Any value node.
 *
 * @public
 * @typedef {JsonvLiteral | JsonvObjectExpression | JsonvArrayExpression | JsonvIdentifier | JsonvTemplateLiteral | JsonvMemberExpression} JsonvExpression
 */

/**
 * A `Line` (`// ...`) or `Block` (`/* ... *\/`) comment. `value` excludes the delimiters; `loc` and `range` include them.
 *
 * @public
 * @typedef {object} JsonvComment
 * @property {"Line" | "Block"} type The comment kind.
 * @property {string} value The comment text without its delimiters.
 * @property {SourceLocation} loc The location (1-based lines and columns).
 * @property {SourceRange} range The `[start, end)` source offsets.
 */

/**
 * A token (comments and the end-of-file token are not included).
 *
 * @public
 * @typedef {object} JsonvToken
 * @property {`${TokenType}`} type The token type, e.g. `"{"`, `"String"`, `"Identifier"`, `"TemplateHead"`.
 * @property {string | number | bigint | boolean | null} value The token's value.
 * @property {string} raw The source text.
 * @property {SourceLocation} loc The location (1-based lines and columns).
 * @property {SourceRange} range The `[start, end)` source offsets.
 */

/**
 * The `Program` root: `body` is the root value; `comments` and `tokens` are in source order.
 *
 * @public
 * @typedef {object} JsonvProgram
 * @property {"Program"} type The node type.
 * @property {JsonvExpression} body The root value.
 * @property {JsonvComment[]} comments The comments.
 * @property {JsonvToken[]} tokens The tokens, excluding comments.
 * @property {SourceLocation} loc The location of the whole document (1-based lines and columns).
 * @property {SourceRange} range The `[start, end)` source offsets of the whole document.
 */

/**
 * Any AST node.
 *
 * @public
 * @typedef {JsonvProgram | JsonvExpression | JsonvProperty | JsonvTemplateElement} JsonvNode
 */

/**
 * Anything with a location: a node, a token or a comment.
 *
 * @public
 * @typedef {JsonvNode | JsonvToken | JsonvComment} JsonvSyntaxElement
 */

/**
 * The jsonv language, typed with @eslint/core's `Language` generics.
 *
 * @public
 * @typedef {Language<{LangOptions: JsonvLanguageOptions, Code: JsonvSourceCode, RootNode: JsonvProgram, Node: JsonvNode}>} JsonvLanguage
 */

/**
 * A successful `parse()` result. Besides `ast` it carries `jsonvValue`, the evaluated document
 * (references resolved).
 *
 * @public
 * @typedef {OkParseResult<JsonvProgram>} JsonvOkParseResult
 */

/**
 * A `parse()` result: {@link JsonvOkParseResult}, or a failure carrying `errors`.
 *
 * @public
 * @typedef {ParseResult<JsonvProgram>} JsonvParseResult
 */

/**
 * The visitor a jsonv rule returns: a handler per node type (plus `:exit` variants), each called
 * with the node and its parent.
 *
 * @public
 * @typedef {RuleVisitor & CustomRuleVisitorWithExit<{
 *   Program?: (node: JsonvProgram) => void,
 *   ObjectExpression?: (node: JsonvObjectExpression, parent?: JsonvNode) => void,
 *   Property?: (node: JsonvProperty, parent?: JsonvObjectExpression) => void,
 *   ArrayExpression?: (node: JsonvArrayExpression, parent?: JsonvNode) => void,
 *   Literal?: (node: JsonvLiteral, parent?: JsonvNode) => void,
 *   Identifier?: (node: JsonvIdentifier, parent?: JsonvNode) => void,
 *   MemberExpression?: (node: JsonvMemberExpression, parent?: JsonvNode) => void,
 *   TemplateLiteral?: (node: JsonvTemplateLiteral, parent?: JsonvNode) => void,
 *   TemplateElement?: (node: JsonvTemplateElement, parent?: JsonvTemplateLiteral) => void
 * }>} JsonvRuleVisitor
 */

/**
 * A rule for jsonv files. `Options` sets `RuleOptions`, `MessageIds` and `ExtRuleDocs`.
 *
 * @public
 * @template {Partial<CustomRuleTypeDefinitions>} [Options={}]
 * @typedef {CustomRuleDefinitionType<{LangOptions: JsonvLanguageOptions, Code: JsonvSourceCode, Visitor: JsonvRuleVisitor, Node: JsonvNode}, Options>} JsonvRuleDefinition
 */

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
 * @returns {value is {type: string, [key: string]: unknown}} `true` for an object with a string `type` and a `loc`.
 * @example
 * isJsonvNode({ type: "Literal", loc: { start: {}, end: {} } }); // true
 */
function isJsonvNode(value) {
	return (
		value !== null &&
		typeof value === "object" &&
		"type" in value &&
		typeof value.type === "string" &&
		"loc" in value &&
		typeof value.loc === "object"
	);
}

/**
 * Returns the child keys to visit for a node: its entry in {@link VISITOR_KEYS}, or — for a
 * node type @cldmv/jsonv may add later — every key holding a node or an array of nodes.
 * @public
 * @param {{type: string, [key: string]: unknown}} node - An AST node.
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
 * @param {JsonvParserLocation} loc - A jsonv location.
 * @returns {{loc: SourceLocation, range: SourceRange}} The ESLint location and range.
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
 * @template {{loc: JsonvParserLocation}} T
 * @param {T} element - A jsonv comment or token.
 * @returns {{[K in keyof T]: K extends "loc" ? SourceLocation : T[K]} & {range: SourceRange}} The converted copy.
 * @example
 * convertLeaf(parseToAst("// note\n1").comments[0]);
 */
function convertLeaf(element) {
	// TypeScript types a spread of a generic as an intersection (`T & {loc, range}`), which keeps
	// the jsonv `loc` type alongside the ESLint one; the cast states the actual replacement.
	return /** @type {{[K in keyof T]: K extends "loc" ? SourceLocation : T[K]} & {range: SourceRange}} */ ({
		...element,
		...toEslintPosition(element.loc)
	});
}

/**
 * Deep-copies a jsonv AST node with ESLint positions: every node gets a 1-based `loc` and a
 * `range`, and child nodes are converted recursively.
 * @public
 * @param {{type: string, loc: JsonvParserLocation, [key: string]: unknown}} node - A jsonv AST node.
 * @returns {{type: string, [key: string]: unknown}} The converted copy.
 * @example
 * convertNode(parseToAst("{ a: 1 }").program.body);
 */
function convertNode(node) {
	/** @type {{type: string, [key: string]: unknown}} */
	const converted = convertLeaf(node);
	for (const key of getChildKeys(node)) {
		// getChildKeys() only returns keys that hold a node or an array of nodes.
		const child = /** @type {Parameters<typeof convertNode>[0] | Parameters<typeof convertNode>[0][]} */ (node[key]);
		converted[key] = Array.isArray(child) ? child.map(convertNode) : convertNode(child);
	}
	return converted;
}

/**
 * Builds the ESLint AST for a document from @cldmv/jsonv's `parseToAst()` result: the
 * `Program` root (whose `body` is the root value) with positioned `comments` and `tokens`.
 * @public
 * @param {AstResult} astResult - The `parseToAst()` result.
 * @returns {JsonvProgram} The `Program` node.
 * @example
 * buildProgram(parseToAst("// note\n{ a: 1 }"));
 */
function buildProgram({ program, comments, tokens }) {
	// @cldmv/jsonv positions every node it produces (`ASTNode#loc` is only optional in its type), and
	// convertNode() keeps each node's shape while swapping in ESLint positions, so the copy is a
	// JsonvProgram. The generic, runtime-keyed walk cannot express that per node type, hence the casts.
	const rawProgram = /** @type {Parameters<typeof convertNode>[0]} */ (/** @type {unknown} */ (program));
	const root = /** @type {Omit<JsonvProgram, "comments" | "tokens">} */ (convertNode(rawProgram));
	return {
		...root,
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
 * @extends {TextSourceCodeBase<{LangOptions: JsonvLanguageOptions, RootNode: JsonvProgram, SyntaxElementWithLoc: JsonvSyntaxElement, ConfigNode: JsonvComment}>}
 */
class JsonvSourceCode extends TextSourceCodeBase {
	/**
	 * Cached traversal steps.
	 * @type {VisitNodeStep[]|undefined}
	 */
	#steps;

	/**
	 * Parent of every non-root node.
	 * @type {WeakMap<object, JsonvNode>}
	 */
	#parents = new WeakMap();

	/**
	 * Cached inline configuration comments.
	 * @type {JsonvComment[]|undefined}
	 */
	#inlineConfigComments;

	/**
	 * Creates a SourceCode object.
	 * @param {Object} options - Options.
	 * @param {string} options.text - The source text.
	 * @param {JsonvProgram} options.ast - The `Program` node built by `jsonvLanguage#parse`.
	 */
	constructor({ text, ast }) {
		super({ text, ast, lineEndingPattern: LINE_ENDING_PATTERN });
		/** @type {JsonvComment[]} Comments in source order. */
		this.comments = ast.comments;
		/** @type {JsonvToken[]} Tokens in source order, excluding comments. */
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
			/** @type {VisitNodeStep[]} */
			const steps = [];
			/**
			 * @param {JsonvNode} node - The node to visit.
			 * @param {JsonvNode|undefined} parent - Its parent (`undefined` for the root).
			 */
			const visit = (node, parent) => {
				if (parent) this.#parents.set(node, parent);
				steps.push(new VisitNodeStep({ target: node, phase: 1, args: [node, parent] }));
				for (const key of getChildKeys(node)) {
					// getChildKeys() only returns keys that hold a node or an array of nodes.
					const child = /** @type {JsonvNode | JsonvNode[]} */ (/** @type {{type: string, [key: string]: unknown}} */ (node)[key]);
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
	 * @returns {IterableIterator<VisitNodeStep>} The traversal steps.
	 */
	traverse() {
		return this.#ensureTraversal().values();
	}

	/**
	 * Returns the parent of a node, or `undefined` for the `Program` root.
	 * @public
	 * @param {JsonvSyntaxElement} node - An AST node.
	 * @returns {JsonvNode|undefined} The parent node.
	 */
	getParent(node) {
		this.#ensureTraversal();
		return this.#parents.get(node);
	}

	/**
	 * Returns the comments that hold inline configuration (`eslint`, `eslint-enable`,
	 * `eslint-disable`, `eslint-disable-line`, `eslint-disable-next-line`).
	 * @public
	 * @returns {JsonvComment[]} The inline configuration comments.
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
	 * @returns {{problems: FileProblem[], directives: Directive[]}} Directives and problems.
	 */
	getDisableDirectives() {
		/** @type {FileProblem[]} */
		const problems = [];
		/** @type {Directive[]} */
		const directives = [];

		for (const comment of this.getInlineConfigNodes()) {
			// parseDirective() returns undefined only for text that doesn't start with a directive label;
			// every comment here matched INLINE_CONFIG, which requires one.
			const { label, value, justification } = /** @type {NonNullable<ReturnType<ConfigCommentParser["parseDirective"]>>} */ (
				commentParser.parseDirective(comment.value)
			);

			if (label === "eslint-disable-line" && comment.loc.start.line !== comment.loc.end.line) {
				problems.push({ ruleId: null, message: `${label} comment should not span multiple lines.`, loc: comment.loc });
				continue;
			}

			if (label !== "eslint") {
				// The comment matched INLINE_CONFIG, so any label other than "eslint" is an
				// `eslint-disable*` / `eslint-enable` label, i.e. a DirectiveType once unprefixed.
				const type = /** @type {DirectiveType} */ (label.slice("eslint-".length));
				directives.push(new Directive({ type, node: comment, value, justification }));
			}
		}

		return { problems, directives };
	}

	/**
	 * Returns the rule configurations from `/* eslint rule: ... *\/` comments, plus problems for
	 * ones that fail to parse.
	 * @public
	 * @returns {{problems: FileProblem[], configs: Array<{config: {rules: RulesConfig}, loc: SourceLocation}>}} Configs and problems.
	 */
	applyInlineConfig() {
		/** @type {FileProblem[]} */
		const problems = [];
		/** @type {Array<{config: {rules: RulesConfig}, loc: SourceLocation}>} */
		const configs = [];

		for (const comment of this.getInlineConfigNodes()) {
			// Defined for the same reason as in getDisableDirectives().
			const { label, value } = /** @type {NonNullable<ReturnType<ConfigCommentParser["parseDirective"]>>} */ (
				commentParser.parseDirective(comment.value)
			);
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
 * @type {JsonvLanguage}
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
	/**
	 * Child keys of each AST node type, used for selector matching. `Language#visitorKeys` is typed
	 * with mutable arrays; ESLint only reads them, and VISITOR_KEYS stays frozen at runtime.
	 */
	visitorKeys: /** @type {Record<string, string[]>} */ (VISITOR_KEYS),

	/**
	 * Parse jsonv source code - ESLint Language API.
	 *
	 * The file is first parsed and evaluated with `parseWithOptions` — that is what reports
	 * syntax errors, year-gated features, `strictBigInt` violations and unresolved/circular
	 * internal references, each with its source position. A file that passes is then parsed
	 * with `parseToAst` to build the positioned AST, comments and tokens ESLint traverses.
	 *
	 * @param {File} file - File object with body property containing source text
	 * @param {{languageOptions: JsonvLanguageOptions}} context - Context with languageOptions
	 * @returns {JsonvParseResult} Parse result {ok, ast, jsonvValue} or {ok: false, errors}
	 */
	parse(file, context) {
		// `fileType: "text"` means ESLint reads the file as text, so `body` is a string.
		const text = /** @type {string} */ (file.body);
		/** @type {JsonvLanguageOptions} */
		const options = context.languageOptions || {};
		const parseOptions = {
			year: options.year || 2025,
			strictBigInt: options.strictBigInt !== undefined ? options.strictBigInt : false,
			mode: /** @type {const} */ ("jsonv")
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

			// Everything the parser and buildProgram() throw is an Error instance (the RangeError
			// above included), hence the cast in the fallback branch.
			/** @type {FileError} */
			const errorInfo = hasPosition
				? {
						message: error.message,
						line: error.line,
						column: error.column + 1,
						endLine: error.loc.end.line,
						endColumn: error.loc.end.column + 1
					}
				: { message: /** @type {Error} */ (error).message, line: 1, column: 1 };

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
	 * @param {File} file - The file object
	 * @param {JsonvOkParseResult} parseResult - The successful result from parse()
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
	 * @param {JsonvLanguageOptions} languageOptions - The (already-merged) language options to validate
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
	 * @type {JsonvLanguageOptions}
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
 * @satisfies {ConfigObject}
 */
const recommendedConfig = {
	rules: {
		// Add custom jsonv rules here in the future
		// For now, parsing validation is enough
	}
};

/**
 * ESLint plugin export. `@satisfies` checks it against @eslint/core's `Plugin` (which ESLint's
 * own `ESLint.Plugin` is) while keeping its literal keys (`languages.jsonv`, `configs.recommended`).
 *
 * @public
 * @satisfies {Plugin}
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
export { JsonvSourceCode };
