/**
 * @mcp-apps-kit/create-app CLI
 *
 * Command-line interface for scaffolding MCP applications.
 */
/* eslint-disable no-console */

import { Command, InvalidArgumentError } from "commander";
import prompts from "prompts";
import chalk from "chalk";
import { scaffoldProject, CreateAppOptions } from "./index.js";

// =============================================================================
// Types
// =============================================================================

export interface CLIOptions {
  name?: string;
  template: "react" | "vanilla";
  directory?: string;
  skipInstall: boolean;
  skipGit: boolean;
  interactive: boolean;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate a project name follows npm package naming conventions
 */
export function validateProjectName(name: string): boolean {
  if (!name || name.length === 0) {
    return false;
  }

  // Check for scoped packages
  if (name.startsWith("@")) {
    const parts = name.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
    const scope = parts[0].slice(1);
    const pkg = parts[1];
    return validateSimpleName(scope) && validateSimpleName(pkg);
  }

  return validateSimpleName(name);
}

function validateSimpleName(name: string): boolean {
  // npm package name rules:
  // - lowercase
  // - one word (no spaces)
  // - can contain hyphens, underscores, dots
  // - cannot start with dot or underscore
  const validPattern = /^[a-z][a-z0-9._-]*$/;
  return validPattern.test(name);
}

// =============================================================================
// Argument Parsing
// =============================================================================

const VALID_TEMPLATES = ["react", "vanilla"] as const;
type Template = (typeof VALID_TEMPLATES)[number];

/**
 * Parse CLI arguments
 */
export function parseArgs(args: string[]): CLIOptions {
  let result: CLIOptions = {
    template: "react",
    skipInstall: false,
    skipGit: false,
    interactive: false,
  };

  const program = new Command()
    .name("create-mcp-apps-kit")
    .description("Scaffold a new MCP application")
    .version("0.1.0")
    .argument("[name]", "Project name")
    .option(
      "-t, --template <template>",
      "Template to use (react, vanilla)",
      (value) => {
        if (!VALID_TEMPLATES.includes(value as Template)) {
          throw new InvalidArgumentError(
            `Invalid template: ${value}. Must be one of: ${VALID_TEMPLATES.join(", ")}`
          );
        }
        return value as Template;
      },
      "react"
    )
    .option("-d, --directory <path>", "Directory to create project in")
    .option("--skip-install", "Skip installing dependencies", false)
    .option("--skip-git", "Skip initializing git repository", false)
    .allowUnknownOption(false)
    .parse(["node", "create-mcp-apps-kit", ...args]);

  const options = program.opts<{
    template: Template;
    directory?: string;
    skipInstall: boolean;
    skipGit: boolean;
  }>();
  const [name] = program.args;

  result = {
    name,
    template: options.template,
    directory: options.directory,
    skipInstall: options.skipInstall,
    skipGit: options.skipGit,
    interactive: !name,
  };

  return result;
}

// =============================================================================
// Interactive Mode
// =============================================================================

async function runInteractive(): Promise<CreateAppOptions> {
  console.log();
  console.log(chalk.bold("🚀 Create a new MCP application"));
  console.log();

  const response = await prompts<"name" | "template" | "skipInstall" | "skipGit">([
    {
      type: "text",
      name: "name",
      message: "Project name:",
      validate: (value: string) => {
        if (!validateProjectName(value)) {
          return "Invalid project name. Must be lowercase, no spaces, valid npm package name.";
        }
        return true;
      },
    },
    {
      type: "select",
      name: "template",
      message: "Template:",
      choices: [
        { title: "React", value: "react", description: "React + TypeScript with hooks" },
        { title: "Vanilla", value: "vanilla", description: "Vanilla TypeScript" },
      ],
      initial: 0,
    },
    {
      type: "confirm",
      name: "skipInstall",
      message: "Skip installing dependencies?",
      initial: false,
    },
    {
      type: "confirm",
      name: "skipGit",
      message: "Skip initializing git?",
      initial: false,
    },
  ]);

  if (!response.name) {
    console.log(chalk.yellow("Cancelled."));
    process.exit(0);
  }

  return {
    name: response.name as string,
    template: response.template as "react" | "vanilla",
    skipInstall: response.skipInstall as boolean,
    skipGit: response.skipGit as boolean,
  };
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main(): Promise<void> {
  try {
    const cliOptions = parseArgs(process.argv.slice(2));

    let options: CreateAppOptions;

    if (cliOptions.interactive) {
      options = await runInteractive();
    } else {
      if (!cliOptions.name) {
        console.error(chalk.red("Error: Project name is required"));
        process.exit(1);
      }

      if (!validateProjectName(cliOptions.name)) {
        console.error(chalk.red("Error: Invalid project name. Must be a valid npm package name."));
        process.exit(1);
      }

      options = {
        name: cliOptions.name,
        template: cliOptions.template,
        directory: cliOptions.directory,
        skipInstall: cliOptions.skipInstall,
        skipGit: cliOptions.skipGit,
      };
    }

    console.log();
    console.log(chalk.blue(`Creating ${options.name} with ${options.template} template...`));
    console.log();

    await scaffoldProject(options);

    console.log();
    console.log(chalk.green("✓ Project created successfully!"));
    console.log();
    console.log("Next steps:");
    console.log(chalk.cyan(`  cd ${options.directory ?? options.name}`));
    if (!options.skipInstall) {
      console.log(chalk.cyan("  pnpm dev"));
    } else {
      console.log(chalk.cyan("  pnpm install"));
      console.log(chalk.cyan("  pnpm dev"));
    }
    console.log();
  } catch (error) {
    console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run if executed directly
void main();
