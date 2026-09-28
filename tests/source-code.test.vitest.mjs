/**
 * @fileoverview Direct tests of `languages.jsonv.createSourceCode()` — the
 * SourceCode object ESLint hands to rules for a parsed `.jsonv` file.
 */
import { describe, expect, it } from "vitest";
import { Directive, VisitNodeStep } from "@eslint/plugin-kit";
import plugin from "../index.mjs";

const language = plugin.languages.jsonv;

/**
 * Parses and wraps a body the way ESLint does for a successful parse.
 * @param {string|Buffer} body - File contents.
 * @returns {object} The SourceCode object.
 * @example
 * sourceFor("{ a: 1 }").lines;
 */
function sourceFor(body) {
	const file = { body };
	const parseResult = language.parse({ body: String(body) }, {});
	expect(parseResult.ok).toBe(true);
	return language.createSourceCode(file, parseResult, {});
}

describe("createSourceCode() — text and lines", () => {
	it("keeps the original text and the parse result's AST", () => {
		const file = { body: "{ a: 1 }" };
		const parseResult = language.parse(file, {});
		const source = language.createSourceCode(file, parseResult, {});
		expect(source.text).toBe("{ a: 1 }");
		expect(source.ast).toBe(parseResult.ast);
	});

	it("splits lines on LF, CRLF, CR, LS and PS — the same breaks jsonv counts", () => {
		const source = sourceFor("[1,\n2,\r\n3,\r4 ,5 ]");
		expect(source.lines).toEqual(["[1,", "2,", "3,", "4", ",5", "]"]);
		expect(source.getLines()).toEqual(source.lines);
	});

	it("returns a fresh array from getLines()", () => {
		const source = sourceFor("{\n a: 1\n}");
		expect(source.getLines()).not.toBe(source.lines);
		expect(source.getLines()).toEqual(["{", " a: 1", "}"]);
	});

	it("detects a leading BOM", () => {
		expect(sourceFor("﻿{ a: 1 }").hasBOM).toBe(true);
		expect(sourceFor("{ a: 1 }").hasBOM).toBe(false);
	});

	it("coerces a non-string body to a string", () => {
		const source = sourceFor(Buffer.from("{ a: 1 }"));
		expect(source.text).toBe("{ a: 1 }");
	});

	it("treats a missing body as empty text", () => {
		const parseResult = language.parse({ body: "1" }, {});
		const source = language.createSourceCode({ body: undefined }, parseResult, {});
		expect(source.text).toBe("");
		expect(source.lines).toEqual([""]);
		expect(source.hasBOM).toBe(false);
	});

	it("exposes the comments and tokens of the AST", () => {
		const source = sourceFor("// c\n{ a: 1 }");
		expect(source.comments).toBe(source.ast.comments);
		expect(source.tokens).toBe(source.ast.tokens);
		expect(source.comments).toHaveLength(1);
		expect(source.tokens).toHaveLength(5);
	});
});

describe("createSourceCode() — locations and ranges", () => {
	const text = "{\n  key: 'value',\n  list: [1, 2]\n}";
	const source = sourceFor(text);
	const [first, second] = source.ast.body.properties;

	it("returns each node's own loc and range", () => {
		expect(source.getLoc(first.key)).toEqual({ start: { line: 2, column: 3 }, end: { line: 2, column: 6 } });
		expect(source.getRange(first.key)).toEqual([4, 7]);
		expect(source.getLoc(source.ast)).toEqual({ start: { line: 1, column: 1 }, end: { line: 4, column: 2 } });
		expect(source.getRange(source.ast)).toEqual([0, text.length]);
	});

	it("agrees with getLocFromIndex() / getIndexFromLoc() for every node boundary", () => {
		for (const node of [source.ast, first, first.key, first.value, second, second.value, ...second.value.elements]) {
			expect(source.getLocFromIndex(node.range[0])).toEqual(node.loc.start);
			expect(source.getLocFromIndex(node.range[1])).toEqual(node.loc.end);
			expect(source.getIndexFromLoc(node.loc.start)).toBe(node.range[0]);
		}
	});

	it("throws for an object with no position, rather than inventing one", () => {
		expect(() => source.getLoc({})).toThrow();
		expect(() => source.getRange({})).toThrow();
	});
});

describe("createSourceCode() — getText()", () => {
	const source = sourceFor('{ key: "value" }');
	const [property] = source.ast.body.properties;

	it("returns the whole text with no node, or for the Program node", () => {
		expect(source.getText()).toBe('{ key: "value" }');
		expect(source.getText(source.ast)).toBe('{ key: "value" }');
	});

	it("slices the text by a node's range", () => {
		expect(source.getText(property.key)).toBe("key");
		expect(source.getText(property.value)).toBe('"value"');
		expect(source.getText(property)).toBe('key: "value"');
	});

	it("widens the slice by before/after counts", () => {
		expect(source.getText(property.key, 2, 2)).toBe("{ key: ");
	});

	it("clamps the widened slice to the text bounds", () => {
		expect(source.getText(property.key, 50, 50)).toBe('{ key: "value" }');
	});
});

describe("createSourceCode() — traverse(), getParent() and getAncestors()", () => {
	it("yields enter and exit visit steps for every node, depth first in source order", () => {
		const source = sourceFor("{ a: [1] }");
		const steps = [...source.traverse()];
		expect(steps.every((step) => step instanceof VisitNodeStep && step.kind === 1)).toBe(true);
		expect(steps.map((step) => `${step.phase === 1 ? "enter" : "exit"} ${step.target.type}`)).toEqual([
			"enter Program",
			"enter ObjectExpression",
			"enter Property",
			"enter Identifier",
			"exit Identifier",
			"enter ArrayExpression",
			"enter Literal",
			"exit Literal",
			"exit ArrayExpression",
			"exit Property",
			"exit ObjectExpression",
			"exit Program"
		]);
		const property = source.ast.body.properties[0];
		expect(steps[2].args).toEqual([property, source.ast.body]);
		expect(steps[0].args).toEqual([source.ast, undefined]);
	});

	it("returns an iterator, and the same steps on every call", () => {
		const source = sourceFor("{}");
		const iterator = source.traverse();
		expect(typeof iterator.next).toBe("function");
		expect(iterator.next().value.phase).toBe(1);
		const again = [...source.traverse()];
		expect(again).toHaveLength(4);
		expect(again[0]).toBe([...source.traverse()][0]);
	});

	it("walks TemplateLiteral and MemberExpression children", () => {
		const source = sourceFor("{ b: { c: 1 }, u: `x${b.c}` }");
		const entered = [...source.traverse()].filter((step) => step.phase === 1).map((step) => step.target.type);
		expect(entered).toEqual([
			"Program",
			"ObjectExpression",
			"Property",
			"Identifier",
			"ObjectExpression",
			"Property",
			"Identifier",
			"Literal",
			"Property",
			"Identifier",
			"TemplateLiteral",
			"TemplateElement",
			"TemplateElement",
			"MemberExpression",
			"Identifier",
			"Identifier"
		]);
	});

	it("resolves parents and ancestors, even before traverse() is called", () => {
		const source = sourceFor("{ a: [1] }");
		const object = source.ast.body;
		const property = object.properties[0];
		const literal = property.value.elements[0];
		expect(source.getParent(literal)).toBe(property.value);
		expect(source.getParent(property)).toBe(object);
		expect(source.getParent(source.ast)).toBeUndefined();
		expect(source.getAncestors(literal)).toEqual([source.ast, object, property, property.value]);
	});

	it("walks the node-valued keys of a node type missing from visitorKeys", () => {
		const loc = { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
		const leaf = { type: "Literal", value: 1, raw: "1", loc, range: [0, 1] };
		const other = { type: "Literal", value: 2, raw: "2", loc, range: [0, 1] };
		const future = { type: "FutureNode", loc, range: [0, 1], label: "x", meta: { a: 1 }, empty: [], one: leaf, many: [other] };
		const ast = { type: "Program", body: future, loc, range: [0, 1], comments: [], tokens: [] };
		const source = language.createSourceCode({ body: "1" }, { ast }, {});
		expect([...source.traverse()].filter((step) => step.phase === 1).map((step) => step.target)).toEqual([ast, future, leaf, other]);
		expect(source.getParent(other)).toBe(future);
	});
});

describe("createSourceCode() — inline configuration", () => {
	it("finds only eslint directive comments as inline config nodes", () => {
		const source = sourceFor(
			"// plain comment\n// eslint-disable-next-line x\n{ a: 1 /* eslint-disable-line */, b: 2 } // eslint-enable\n/* eslint x: 1 */\n// eslintish\n// eslint-disable"
		);
		expect(source.getInlineConfigNodes().map((comment) => comment.value)).toEqual([
			" eslint-disable-next-line x",
			" eslint-disable-line ",
			" eslint-enable",
			" eslint x: 1 ",
			" eslint-disable"
		]);
		expect(source.getInlineConfigNodes()).toBe(source.getInlineConfigNodes());
	});

	it("returns disable/enable directives with their comment node, value and justification", () => {
		const source = sourceFor("/* eslint-disable a/b, c -- why */\n// eslint-enable\n{ a: 1 } // eslint-disable-line x\n// eslint-disable-next-line\n");
		const { directives, problems } = source.getDisableDirectives();
		expect(problems).toEqual([]);
		expect(directives.every((directive) => directive instanceof Directive)).toBe(true);
		expect(directives.map(({ type, value, justification }) => ({ type, value, justification }))).toEqual([
			{ type: "disable", value: "a/b, c", justification: "why" },
			{ type: "enable", value: "", justification: "" },
			{ type: "disable-line", value: "x", justification: "" },
			{ type: "disable-next-line", value: "", justification: "" }
		]);
		expect(directives[0].node).toBe(source.comments[0]);
	});

	it("reports a multi-line eslint-disable-line comment as a problem instead of a directive", () => {
		const source = sourceFor("{ a: 1 } /* eslint-disable-line\n */");
		const { directives, problems } = source.getDisableDirectives();
		expect(directives).toEqual([]);
		expect(problems).toEqual([
			{
				ruleId: null,
				message: "eslint-disable-line comment should not span multiple lines.",
				loc: { start: { line: 1, column: 10 }, end: { line: 2, column: 4 } }
			}
		]);
	});

	it("returns rule configs from /* eslint */ comments and ignores disable directives there", () => {
		const source = sourceFor('/* eslint a/b: "error", c: ["warn", { "max": 2 }] */\n// eslint-disable\n{ a: 1 }');
		const { configs, problems } = source.applyInlineConfig();
		expect(problems).toEqual([]);
		expect(configs).toEqual([
			{
				config: { rules: { "a/b": "error", c: ["warn", { max: 2 }] } },
				loc: { start: { line: 1, column: 1 }, end: { line: 1, column: 53 } }
			}
		]);
		expect(source.getDisableDirectives().directives).toHaveLength(1);
	});

	it("reports an unparsable /* eslint */ config comment as a problem", () => {
		const source = sourceFor("/* eslint a/b: [ */\n{ a: 1 }");
		const { configs, problems } = source.applyInlineConfig();
		expect(configs).toEqual([]);
		expect(problems).toEqual([
			{ ruleId: null, message: expect.stringContaining("Failed to parse JSON from"), loc: { start: { line: 1, column: 1 }, end: { line: 1, column: 20 } } }
		]);
	});
});
