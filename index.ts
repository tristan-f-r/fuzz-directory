import { exists } from "jsr:@std/fs";
import { parse } from "jsr:@std/yaml";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

// Clone oss-fuzz
if (!(await exists("./output"))) {
  const cmd = new Deno.Command("git", {
    args: [
      "clone",
      "--depth",
      "1",
      "https://github.com/google/oss-fuzz",
      "./output",
    ],
  });
  const { code } = await cmd.output();

  if (code !== 0) {
    console.error("git clone failed.");
    Deno.exit(1);
  }
}

const projectSchema = z.object({
  homepage: z.string().optional(),
  main_repo: z.string().optional(),
  language: z.string().optional(),
});

type Project = z.infer<typeof projectSchema>;

const projects: Record<string, (Project | [error: unknown])> = {};

// Go to projects, and acc projects
for await (const dirEntry of Deno.readDir("./output/projects")) {
  const projectYAML = await Deno.readTextFile(
    `./output/projects/${dirEntry.name}/project.yaml`,
  );

  try {
    const parsedYAML = parse(projectYAML);
    const sanitizedYAML = await projectSchema.safeParseAsync(parsedYAML);

    if (sanitizedYAML.error) {
      console.error(`Error while getting metadata from ${dirEntry.name}:`);
      projects[dirEntry.name] = [JSON.stringify(sanitizedYAML.error)];
    }

    projects[dirEntry.name] = sanitizedYAML.data!;
  } catch (e) {
    projects[dirEntry.name] = [JSON.stringify(e)];
  }
}

function markdownProject(name: string, project: Project | [error: unknown]) {
  if (Array.isArray(project)) {
    return `Couldn't parse. [View file](https://github.com/google/oss-fuzz/blob/master/projects/${name}/project.yaml).`;
  }

  return `([homepage](${project.homepage})) made in ${project.language}`;
}

await Deno.writeTextFile("./data.json", JSON.stringify(projects, null, 2));
await Deno.writeTextFile(
  "./README.md",
  `# fuzz-directory

sorted and usable list from [oss-fuzz](https://github.com/google/oss-fuzz/).

## Projects

${
    Object.entries(projects).map(([name, project]) => {
      return `- ${name}: ${markdownProject(name, project)}`;
    }).join("\n")
  }`,
);
