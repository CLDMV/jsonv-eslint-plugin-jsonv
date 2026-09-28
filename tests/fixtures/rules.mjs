/**
 * @fileoverview Fixture rules used to exercise the jsonv language through ESLint's
 * rule pipeline. The plugin ships no rules of its own yet, so these stand in for
 * a consumer's custom rule to prove the language supports reporting, options and
 * autofix.
 */

/**
 * Reports each `TODO` marker in the file and autofixes it to `DONE`.
 * @type {import("eslint").Rule.RuleModule}
 */
export const noTodo = {
	meta: {
		type: "problem",
		fixable: "code",
		schema: [],
		messages: { todo: "Unexpected TODO marker." }
	},
	create(context) {
		return {
			Program(node) {
				const { text } = context.sourceCode;
				let index = text.indexOf("TODO");
				while (index !== -1) {
					const start = index;
					context.report({
						node,
						messageId: "todo",
						fix: (fixer) => fixer.replaceTextRange([start, start + 4], "DONE")
					});
					index = text.indexOf("TODO", index + 4);
				}
			}
		};
	}
};

/**
 * Reports a file whose line count exceeds the configured maximum.
 * @type {import("eslint").Rule.RuleModule}
 */
export const maxLines = {
	meta: {
		type: "suggestion",
		schema: [
			{
				type: "object",
				properties: { max: { type: "integer", minimum: 1 } },
				additionalProperties: false
			}
		],
		defaultOptions: [{ max: 3 }],
		messages: { tooMany: "File has {{count}} lines (max {{max}})." }
	},
	create(context) {
		const [{ max }] = context.options;
		return {
			"Program:exit"(node) {
				const count = context.sourceCode.lines.length;
				if (count > max) {
					context.report({ node, messageId: "tooMany", data: { count: String(count), max: String(max) } });
				}
			}
		};
	}
};

/** Fixture plugin carrying the rules above. */
export const fixturePlugin = { rules: { "no-todo": noTodo, "max-lines": maxLines } };
