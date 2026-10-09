import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { ESLint } from "eslint";

const require = createRequire(import.meta.url);
const { getRootDirs } = require(
  "@next/eslint-plugin-next/dist/utils/get-root-dirs.js",
) as {
  getRootDirs(context: {
    cwd: string;
    settings: { next?: { rootDir?: string | string[] } };
  }): string[];
};

test("Next lint root discovery supports directory globs without the vulnerable dependency", async () => {
  const directory = await mkdtemp(join(tmpdir(), "doctor-lint-"));
  try {
    const clinic = join(directory, "apps", "clinic");
    const dashboard = join(directory, "apps", "dashboard");
    await Promise.all([
      mkdir(clinic, { recursive: true }),
      mkdir(dashboard, { recursive: true }),
    ]);
    await writeFile(join(directory, "apps", "file.txt"), "not a directory");

    const glob = join(directory, "apps", "*").replaceAll("\\", "/");
    const normalize = (paths: string[]) =>
      paths.map((path) => resolve(path).replaceAll("\\", "/").replace(/\/$/, "")).sort();

    assert.deepEqual(getRootDirs({ cwd: clinic, settings: {} }), [clinic]);
    assert.deepEqual(
      normalize(getRootDirs({ cwd: directory, settings: { next: { rootDir: glob } } })),
      normalize([clinic, dashboard]),
    );
    assert.deepEqual(
      normalize(
        getRootDirs({
          cwd: directory,
          settings: { next: { rootDir: [glob.replaceAll("/", "\\")] } },
        }),
      ),
      normalize([clinic, dashboard]),
    );

    const pluginRequire = createRequire(require.resolve("@next/eslint-plugin-next"));
    assert.equal(pluginRequire("fast-glob/package.json").name, "tinyglobby");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Next internal-link rule remains active when rootDir uses a glob", async () => {
  const directory = await mkdtemp(join(tmpdir(), "doctor-lint-rule-"));
  try {
    const page = join(directory, "apps", "clinic", "pages");
    await mkdir(page, { recursive: true });
    await writeFile(join(page, "admin.tsx"), "export default function Page() { return null; }");
    const eslint = new ESLint({
      overrideConfig: {
        settings: { next: { rootDir: join(directory, "apps", "*").replaceAll("\\", "/") } },
      },
    });
    const [result] = await eslint.lintText(
      'export default function Page() { return <a href="/admin">Admin</a>; }',
      { filePath: "app/lint-regression.tsx" },
    );
    assert.ok(
      result.messages.some((message) => message.ruleId === "@next/next/no-html-link-for-pages"),
      JSON.stringify(result.messages),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
