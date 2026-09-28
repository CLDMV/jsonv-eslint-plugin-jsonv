/**
 * @fileoverview Type-level consumer test. It imports the BUILT declarations through the
 * package's own `exports` (a self-reference by package name resolves to `dist/index.d.mts`)
 * and uses them the way an `eslint.config.mts` and a custom rule would. It is compiled with
 * `tsc --noEmit` by `npm run test:types`; every `@ts-expect-error` must still see an error.
 */
import jsonv, { JsonvSourceCode } from "@cldmv/eslint-plugin-jsonv";
import type {
	JsonvComment,
	JsonvIdentifier,
	JsonvLanguage,
	JsonvLanguageOptions,
	JsonvLiteral,
	JsonvNode,
	JsonvObjectExpression,
	JsonvParseResult,
	JsonvProgram,
	JsonvRuleDefinition,
	JsonvSyntaxElement,
	JsonvTemplateLiteral,
	JsonvToken
} from "@cldmv/eslint-plugin-jsonv";
import type { File, Plugin, SourceLocation, SourceRange } from "@eslint/core";
import type { ESLint, Linter } from "eslint";
import { defineConfig } from "eslint/config";

// The plugin is an ESLint plugin, with no casts.
jsonv satisfies Plugin;
jsonv satisfies ESLint.Plugin;
const asPlugin: ESLint.Plugin = jsonv;
void asPlugin;

// Literal keys survive.
jsonv.meta.name satisfies string;
jsonv.meta.version satisfies string;
jsonv.languages.jsonv satisfies JsonvLanguage;
jsonv.configs.recommended satisfies Linter.Config;
// @ts-expect-error -- the plugin defines no "json" language.
void jsonv.languages.json;

// A flat config that uses the plugin, its language, its options and its recommended config.
export default defineConfig([
	{
		files: ["**/*.jsonv"],
		plugins: { jsonv },
		language: "jsonv/jsonv",
		languageOptions: { year: 2021, strictBigInt: true } satisfies JsonvLanguageOptions,
		extends: ["jsonv/recommended"]
	},
	{
		files: ["legacy/**/*.jsonv"],
		plugins: { jsonv },
		language: "jsonv/jsonv",
		// @ts-expect-error -- 1999 is not a supported jsonv year.
		languageOptions: { year: 1999 } satisfies JsonvLanguageOptions
	}
]);

// Language options are closed and typed.
const defaults: JsonvLanguageOptions = {};
const full: JsonvLanguageOptions = { year: 2025, strictBigInt: false };
// @ts-expect-error -- unknown option; validateLanguageOptions rejects it at runtime too.
const unknownKey: JsonvLanguageOptions = { ecmaVersion: 2020 };
// @ts-expect-error -- strictBigInt is a boolean.
const badValue: JsonvLanguageOptions = { strictBigInt: "yes" };
void [defaults, full, unknownKey, badValue];

// The language is typed with @eslint/core's generics.
declare const file: File;
const result: JsonvParseResult = jsonv.languages.jsonv.parse(file, { languageOptions: { year: 2020 } });
if (result.ok) {
	result.ast satisfies JsonvProgram;
	const sourceCode = jsonv.languages.jsonv.createSourceCode(file, result, { languageOptions: {} });
	sourceCode satisfies JsonvSourceCode;
	sourceCode.ast.body satisfies JsonvNode;
	sourceCode.comments satisfies JsonvComment[];
	sourceCode.tokens satisfies JsonvToken[];
	sourceCode.getLoc(sourceCode.ast) satisfies SourceLocation;
	sourceCode.getRange(sourceCode.tokens[0]!) satisfies SourceRange;
	sourceCode.getParent(sourceCode.ast.body) satisfies JsonvNode | undefined;
	sourceCode.getAncestors(sourceCode.ast.body) satisfies JsonvSyntaxElement[];
} else {
	result.errors[0]!.line satisfies number;
}

// Rule authors get typed visitors and SourceCode.
const noTodo: JsonvRuleDefinition<{ MessageIds: "todo"; RuleOptions: [] }> = {
	meta: {
		type: "problem",
		messages: { todo: "Unexpected TODO." }
	},
	create(context) {
		const { sourceCode } = context;
		sourceCode satisfies JsonvSourceCode;
		sourceCode.ast satisfies JsonvProgram;
		return {
			Literal(node) {
				node satisfies JsonvLiteral;
				if (typeof node.value === "string" && node.value.includes("TODO")) {
					context.report({ node, messageId: "todo" });
				}
			},
			"Property:exit"(node, parent) {
				node.key satisfies JsonvLiteral | JsonvIdentifier;
				parent satisfies JsonvObjectExpression | undefined;
			},
			TemplateLiteral(node) {
				node satisfies JsonvTemplateLiteral;
				// @ts-expect-error -- a TemplateLiteral has no `value`.
				void node.value;
			}
		};
	}
};

// A plugin carrying a jsonv rule is still an ESLint plugin.
({ rules: { "no-todo": noTodo } }) satisfies ESLint.Plugin;
