import type { Plugin } from "@opencode-ai/plugin";
import { analyzeCommand, loadConfig } from "./core/analyze.ts";
// import type { AnalyzeOptions, Config, CustomRule } from "./types.ts";

// export { analyzeCommand, loadConfig };
// export type { AnalyzeOptions, Config, CustomRule };

// export { validateConfig, validateConfigFile } from "./core/config.ts";

export const SafetyNetPlugin: Plugin = async ({ directory }) => {
	const config = loadConfig();

	return {
		"tool.execute.before": async (input, output) => {
			if (input.tool === "bash") {
				const command = output.args.command;
				const result = analyzeCommand(command, {
					cwd: directory,
					config,
				});
				if (result) {
					let message = `BLOCKED by Safety Net\n\nReason: ${result.reason}`;

					const excerpt =
						command.length > 200 ? `${command.slice(0, 200)}...` : command;
					message += `\n\nCommand: ${excerpt}`;

					if (result.segment && result.segment !== command) {
						const segmentExcerpt =
							result.segment.length > 200
								? `${result.segment.slice(0, 200)}...`
								: result.segment;
						message += `\n\nSegment: ${segmentExcerpt}`;
					}

					message +=
						"\n\nIf this operation is truly needed, ask the user for explicit permission and have them run the command manually.";

					throw new Error(message);
				}
			}
		},
	};
};
