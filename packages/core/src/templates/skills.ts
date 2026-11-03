import { Skill, type SkillInput } from "../schema/skill";

/**
 * Starter skills — examples only, written for Agent Town (not copied from any
 * other project). Users can install, edit or delete them like any skill.
 */
const STARTERS: SkillInput[] = [
  {
    id: "fact-check-checklist",
    name: "Fact-check checklist",
    description: "Use when reviewing copy, briefs or reports for factual accuracy before they go out.",
    scope: "agents",
    source: "starter",
    content: `# Fact-check checklist

1. List every number, price, date and named competitor in the text.
2. For each, find the matching line in the research notes. Quote it.
3. Mark each claim: ✅ supported · ⚠️ partly supported · ❌ not supported.
4. Check tone: does the copy promise anything the research doesn't support?
5. Verdict: APPROVE only if there are no ❌ items.

Report format: see templates/report.md.`,
    files: [
      {
        path: "templates/report.md",
        content: `VERDICT: APPROVE | REJECT

| Claim | Source in research | Status |
|---|---|---|
| … | … | ✅/⚠️/❌ |

Top fixes (most important first):
1. …`,
      },
    ],
  },
  {
    id: "brand-voice",
    name: "Brand voice guide",
    description: "Use when writing anything customers will read: taglines, landing pages, posts, emails.",
    scope: "global",
    source: "starter",
    content: `# Brand voice

- Warm, plain, local. Write like a friendly neighbour, not an advertiser.
- Short sentences. One idea per sentence.
- Concrete over clever: "$4 flat white" beats "affordable luxury".
- No hype words: revolutionary, world-class, best-in-class, game-changing.
- Use "we" for the business and "you" for the reader.`,
    files: [],
  },
  {
    id: "landing-page-style",
    name: "Landing page style guide",
    description: "Use when building or reviewing a one-page HTML landing page.",
    scope: "agents",
    source: "starter",
    content: `# Landing page style

Structure: hero (headline + one-line promise + one button) → 3 reasons → how to visit/buy → footer.

Rules:
- One primary call to action, repeated at most twice.
- Readable without images; every image has alt text.
- Colour contrast at least 4.5:1 for body text.
- Mobile first: single column under 640px wide.
- No external scripts.`,
    files: [{ path: "checklist.md", content: "- [ ] Headline under 8 words\n- [ ] One primary button\n- [ ] Alt text on images\n- [ ] Works at 360px wide\n- [ ] No external scripts" }],
  },
  {
    id: "short-handoffs",
    name: "Short handoffs",
    description: "Use when your output goes to another agent: keep handoffs short so the next step stays focused.",
    scope: "global",
    source: "starter",
    content: `# Short handoffs

End every answer with a "Handoff" section of at most 5 bullets:
- what you produced,
- what the next person must not miss,
- open questions.

Don't repeat the whole input back.`,
    files: [],
  },
];

export function starterSkills(): Skill[] {
  return STARTERS.map((s) => Skill.parse(structuredClone(s)));
}
