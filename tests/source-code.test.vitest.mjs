/**
 * @fileoverview Direct tests of `languages.jsonv.createSourceCode()` — the
 * SourceCode object ESLint hands to rules for a parsed `.jsonv` file.
 */
import { describe, expect, it } from "vitest";
import plugin from "../index.mjs";

const language = plugin.languages.jsonv;

/**
 * Parses and wraps a body the way ESLint does for a successful parse.
 * @param {string} body - File contents.
 * @returns {object} The SourceCode object.
 * @example
 * sourceFor("{ a: 1 }").lines;
 */
function sourceFor(body) {
	const file = { body };
	const parseResult = language.parse(file, {});
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

	it("splits lines on LF, CRLF, CR, LS and PS", () => {
		const body = "a\nb\r\nc\rd e f";
		const source = language.createSourceCode({ body }, { ast: {} }, {});
		expect(source.lines).toEqual(["a", "b", "c", "d", "e", "f"]);
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
		const source = language.createSourceCode({ body: Buffer.from("{ a: 1 }") }, { ast: {} }, {});
		expect(source.text).toBe("{ a: 1 }");
	});

	it("treats a missing body as empty text", () => {
		const source = language.createSourceCode({ body: undefined }, { ast: {} }, {});
		expect(source.text).toBe("");
		expect(source.lines).toEqual([""]);
		expect(source.hasBOM).toBe(false);
	});
});

describe("createSourceCode() — locations and ranges", () => {
	const source = sourceFor("{ a: 1 }");

	it("returns a node's own loc when present", () => {
		const loc = { start: { line: 2, column: 3 }, end: { line: 2, column: 7 } };
		expect(source.getLoc({ loc })).toBe(loc);
	});

	it("falls back to a zero-width 1:0 loc", () => {
		expect(source.getLoc(source.ast)).toEqual({ start: { line: 1, column: 0 }, end: { line: 1, column: 0 } });
	});

	it("returns a node's own range when present, else [0, 0]", () => {
		expect(source.getRange({ range: [2, 5] })).toEqual([2, 5]);
		expect(source.getRange(source.ast)).toEqual([0, 0]);
	});
});

describe("createSourceCode() — getText()", () => {
	const source = sourceFor('{ key: "value" }');

	it("returns the whole text with no node or a node without a range", () => {
		expect(source.getText()).toBe('{ key: "value" }');
		expect(source.getText(source.ast)).toBe('{ key: "value" }');
	});

	it("slices the text by a node's range", () => {
		expect(source.getText({ range: [2, 5] })).toBe("key");
	});

	it("widens the slice by before/after counts", () => {
		expect(source.getText({ range: [2, 5] }, 2, 2)).toBe("{ key: ");
	});

	it("clamps the widened slice to the text bounds", () => {
		expect(source.getText({ range: [2, 5] }, 50, 50)).toBe('{ key: "value" }');
	});
});

describe("createSourceCode() — traverse()", () => {
	it("yields an enter and an exit visit step for the Program node", () => {
		const source = sourceFor("{ a: 1 }");
		const steps = [...source.traverse()];
		expect(steps).toEqual([
			{ kind: 1, target: source.ast, phase: 1, args: [source.ast] },
			{ kind: 1, target: source.ast, phase: 2, args: [source.ast] }
		]);
	});

	it("returns an iterator", () => {
		const iterator = sourceFor("{}").traverse();
		expect(typeof iterator.next).toBe("function");
		expect(iterator.next().value.phase).toBe(1);
		expect(iterator.next().value.phase).toBe(2);
		expect(iterator.next().done).toBe(true);
	});
});
