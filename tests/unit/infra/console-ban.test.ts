import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";

/**
 * Guards the `no-console` / `no-restricted-properties` ban in `eslint.config.mjs`
 * (M4-05 #94, concern C).
 *
 * The ban is the only thing that keeps #125 from recurring: application logs that
 * bypass `lib/logger` are unredacted, carry no `request_id`, and cannot be tied
 * back to a request. Nothing in a code review blocks the *next* `console.error`
 * in `lib/`, so the config is the test — and a config nobody lints is a config
 * that has silently stopped applying.
 *
 * Watched red, three separate ways, all of them observed rather than assumed:
 * - With `lib/logger/**` removed from the block's `ignores`, the exemption case
 *   fails: the seam would be banning the only module allowed to call console.
 * - With `"no-console": ["error", { allow: [] }]` — the shape the rule's
 *   documentation shows for "ban everything" — every case here fails, because
 *   ESLint 9.39 rejects the config outright and reports a *fatal*. A fatal is
 *   indistinguishable from a clean run unless it is asserted against, which is
 *   what `ruleIdsFor` does first: this file is the reason the bug did not reach
 *   CI's lint job.
 * - With the block's `files` narrowed to `src/app/api/**`, the `lib/auth` case
 *   goes clean — and `requireUserContext`'s shed line, the one #125 was filed
 *   about, lived in `lib/`, not in a route file.
 */
const eslint = new ESLint();

async function ruleIdsFor(filePath: string, code: string): Promise<string[]> {
  const results = await eslint.lintText(code, { filePath });
  expect(results).toHaveLength(1);
  const result = results[0]!;
  // A fatal is not "no violations": it is the config failing to load, which
  // looks identical to a clean run unless it is checked. Every assertion below
  // would pass against a config ESLint cannot read.
  expect(result.messages.filter((m) => m.fatal).map((m) => m.message)).toEqual([]);
  return result.messages.map((m) => String(m.ruleId));
}

const PROBE = `export const probe = (message: string) => {
  console.log(message);
  console.warn(message);
  console.error(message);
  return message;
};
`;

describe("eslint console ban: the logging seam is the only channel", () => {
  // The first `lintText` in a cold worker also cold-loads the flat config and
  // every plugin — measured over the 5 s default under parallel load, which
  // times out as "the ban stopped working" without touching the ban. The
  // budget rides on this case only, because it is the one that pays the load.
  it("bans every console method in a route handler", { timeout: 20_000 }, async () => {
    const rules = await ruleIdsFor("src/app/api/routines/__probe.ts", PROBE);
    // Watched red: delete the ban block and this is [].
    //
    // Three, not two: `no-console` flags `warn` and `error` too, which is why the
    // block needs no allow-list to be a real ban.
    expect(rules.filter((r) => r === "no-console")).toHaveLength(3);
    expect(rules.filter((r) => r === "no-restricted-properties")).toHaveLength(2);
    expect(rules.filter((r) => r === null)).toEqual([]); // every hit is attributed to a rule
  });

  it("names the seam in the message, the only reason the second rule exists", async () => {
    const results = await eslint.lintText(PROBE, { filePath: "lib/auth/__probe.ts" });
    const guidance = results[0]!.messages
      .filter((m) => m.ruleId === "no-restricted-properties")
      .map((m) => m.message);
    expect(guidance).toHaveLength(2);
    // Watched red: shorten either message to "no" and its line goes false.
    expect(guidance.join("\n")).toContain("log.warn");
    expect(guidance.join("\n")).toContain("request_id");
  });

  it("bans console.error in lib, which is where #125's shed line actually lived", async () => {
    const rules = await ruleIdsFor("lib/auth/__probe.ts", PROBE);
    // Watched red: narrow the block's `files` to `src/app/api/**` and `lib` goes
    // clean — the hole that would have left `requireUserContext`'s `console.error`
    // exactly where #125 found it, while the card still looked done.
    expect(rules.filter((r) => r === "no-console")).toHaveLength(3);
    expect(rules.filter((r) => r === "no-restricted-properties")).toHaveLength(2);
  });

  it("exempts lib/logger, so the seam itself can own the console", async () => {
    // Watched red: drop `ignores: ["lib/logger/**"]` and this fails with three
    // violations against the file that implements the sink.
    expect(await ruleIdsFor("lib/logger/__probe.ts", PROBE)).toEqual([]);
  });

  it("exempts tests, which must be able to capture the real sink", async () => {
    expect(await ruleIdsFor("tests/unit/infra/__probe.ts", PROBE)).toEqual([]);
  });

  it("exempts component code outside src/app/api, which is not the seam's business", async () => {
    expect(await ruleIdsFor("components/__probe.ts", PROBE)).toEqual([]);
  });

  it("does not lift M1-11's set_config restriction in the files it now bans", async () => {
    // This asserts what *this* change is responsible for: the new block declares
    // two rules and must not re-declare a third, because in flat config a later
    // `no-restricted-syntax` would replace the top-level one for `lib/**`.
    // Watched red on `lib/auth/require-user.ts`: adding `"no-restricted-syntax":
    // "off"` to the block drops its severity from 2 to 0.
    //
    // Correction made in the pass that first ran this file green: an earlier
    // version asserted severity 2 for `lib/db/with-user.ts` too, and that half
    // was never true — the pre-existing M1-11 exemption block turns the rule
    // `off` for exactly that file, so the assertion failed on its first run and
    // the "watched red" note could not have observed the mutation it described.
    // The honest pair is: an unexempted `lib` file still carries the ban (2),
    // and the exemption itself survived the new block (0) — the latter is
    // discriminating too, because a later `no-restricted-syntax: ["error", …]`
    // re-declaration would override the exemption by ordering.
    const unexempted = await eslint.calculateConfigForFile("lib/auth/require-user.ts");
    expect(unexempted.rules?.["no-restricted-syntax"]?.[0]).toBe(2);
    const exempt = await eslint.calculateConfigForFile("lib/db/with-user.ts");
    expect(exempt.rules?.["no-restricted-syntax"]?.[0]).toBe(0);
    const testFile = await eslint.calculateConfigForFile("tests/unit/infra/probe.ts");
    expect(testFile.rules?.["no-restricted-syntax"]?.[0]).toBe(0);
  });
});
