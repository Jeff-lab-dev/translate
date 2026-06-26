// LLM-decided semantic version bump.
//
// Flow:
//   1. Read last version from the most recent `vX.Y.Z` git tag (fallback: package.json).
//   2. Gather changes since that tag (commit subjects + diffstat).
//   3. Ask an OpenAI-compatible LLM to classify the bump as major | minor | patch,
//      based on the nature AND size of the changes.
//   4. Bump package.json accordingly.
//   5. Emit the new version + bump type for CI (writes $GITHUB_OUTPUT).
//
// Fallback: no key / API error / unparseable response -> "patch", so releases
// never get blocked by the LLM.
//
// Requires (CI or local env):
//   LLM_API_KEY           — required for LLM decision (else falls back to patch)
//   LLM_ENDPOINT          — optional, default OpenAI chat completions
//   LLM_MODEL             — optional, default gpt-4o-mini
import { execSync } from "node:child_process"
import { appendFileSync, readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, "..")
const pkgPath = resolve(root, "package.json")

function run(cmd, fallback = "") {
  try {
    return execSync(cmd, { encoding: "utf8", cwd: root, stdio: ["pipe", "pipe", "ignore"] })
      .trim()
  } catch {
    return fallback
  }
}

function setOutput(name, value) {
  const gh = process.env.GITHUB_OUTPUT
  if (gh) appendFileSync(gh, `${name}=${value}\n`)
}

// ── Determine base version + reference point ───────────
const lastTag = run('git describe --tags --abbrev=0 --match "v[0-9]*"')
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))

let base = pkg.version
if (lastTag) {
  const m = lastTag.match(/^v?(\d+\.\d+\.\d+)$/)
  if (m) base = m[1]
}
// If a tag exists, diff from it; otherwise diff from the root commit (whole history).
const sinceRef = lastTag || run("git rev-list --max-parents=0 HEAD") || "HEAD"

// Bootstrap: no prior version tag -> just tag the current package.json version
// (avoids feeding the entire history to the LLM for the very first release).
if (!lastTag) {
  console.log(`[bump] no prior tag — bootstrapping at ${base}`)
  setOutput("version", base)
  setOutput("bump", "bootstrap")
  setOutput("skipped", "false")
  console.log(`NEW_VERSION=${base}`)
  console.log(`BUMP=bootstrap`)
  process.exit(0)
}

// ── Gather changes ─────────────────────────────────────
const subjects = run(`git log ${sinceRef}..HEAD --pretty=format:"- %s"`)
const diffstat = run(`git diff --stat ${sinceRef}..HEAD`)

if (!subjects) {
  console.log("[bump] no new commits since last tag — no bump")
  setOutput("version", base)
  setOutput("bump", "none")
  setOutput("skipped", "true")
  console.log(`NEW_VERSION=${base}\nBUMP=none\nSKIPPED=true`)
  process.exit(0)
}

// ── LLM decision ───────────────────────────────────────
const bump = await decideBump(subjects, diffstat, base, lastTag)

// ── Apply bump ─────────────────────────────────────────
const [maj, min, pat] = base.split(".").map((n) => parseInt(n, 10) || 0)
let next
if (bump === "major") next = `${maj + 1}.0.0`
else if (bump === "minor") next = `${maj}.${min + 1}.0`
else next = `${maj}.${min}.${pat + 1}`

pkg.version = next
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n")

setOutput("version", next)
setOutput("bump", bump)
setOutput("skipped", "false")
console.log(
  `[bump] ${base} -> ${next} (${bump})` +
    (lastTag ? ` since ${lastTag}` : " (no prior tag, from package.json)")
)
console.log(`NEW_VERSION=${next}`)
console.log(`BUMP=${bump}`)

// ── LLM call ───────────────────────────────────────────
async function decideBump(subjects, diffstat, base, lastTag) {
  const key = process.env.LLM_API_KEY
  if (!key) {
    console.log("[bump] LLM_API_KEY not set — defaulting to patch")
    return "patch"
  }
  const endpoint =
    process.env.LLM_ENDPOINT || "https://api.openai.com/v1/chat/completions"
  const model = process.env.LLM_MODEL || "gpt-4o-mini"

  const system =
    "You are a release manager that decides semantic version bumps for a Chrome extension. " +
    "Reply with exactly one lowercase word: major, minor, or patch. No punctuation, no explanation."

  const user =
    `Current version: ${base}${lastTag ? ` (last tag ${lastTag})` : ""}.\n\n` +
    `Changes since then:\n${subjects.slice(0, 4000)}\n\n` +
    `Diffstat:\n${diffstat.slice(0, 2000)}\n\n` +
    "Decide the bump type by BOTH the nature and the size of the changes:\n" +
    "- major: breaking changes, large rewrites, or removals that break existing behavior\n" +
    "- minor: new features, new UI, or moderate non-breaking changes\n" +
    "- patch: bug fixes, chores, docs, config, small refactors\n" +
    "Reply with one word: major, minor, or patch."

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        temperature: 0,
        max_tokens: 10
      })
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => "")
      console.log(`[bump] LLM HTTP ${res.status}: ${txt.slice(0, 200)} — defaulting to patch`)
      return "patch"
    }
    const data = await res.json()
    const content =
      data.choices?.[0]?.message?.content || data.content || data.response || ""
    const m = String(content).toLowerCase().match(/(major|minor|patch)/)
    if (!m) {
      console.log(`[bump] LLM unparseable response: ${JSON.stringify(content)} — defaulting to patch`)
      return "patch"
    }
    console.log(`[bump] LLM decided: ${m[1]}`)
    return m[1]
  } catch (e) {
    console.log(`[bump] LLM call failed: ${e?.message || e} — defaulting to patch`)
    return "patch"
  }
}