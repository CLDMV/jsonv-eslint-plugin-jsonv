/**
 *
 *	@Project: @cldmv/eslint-plugin-jsonv
 *	@Filename: /src/source-code.mjs
 *	@Date: 2026-01-18T20:55:56-08:00 (1768798556)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-01T12:07:54-08:00 (1793563674)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview `JsonvSourceCode`, the SourceCode object the `jsonv/jsonv` language hands to rules.
 * Published as `@cldmv/eslint-plugin-jsonv/source-code`, so the package root exports only the plugin.
 * @module eslint-plugin-jsonv/source-code
 * @public
 *
 * @example
 * import { JsonvSourceCode } from "@cldmv/eslint-plugin-jsonv/source-code";
 */

import { ConfigCommentParser, Directive, TextSourceCodeBase, VisitNodeStep } from "@eslint/plugin-kit";

import { getChildKeys } from "./visitor-keys.mjs";

/**
 * @import { FileProblem, RulesConfig, SourceLocation } from "@eslint/core";
 * @import { DirectiveType } from "@eslint/plugin-kit";
 * @import { JsonvComment, JsonvLanguageOptions, JsonvNode, JsonvProgram, JsonvSyntaxElement, JsonvToken } from "./index.mjs";
 */

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

export { JsonvSourceCode };
