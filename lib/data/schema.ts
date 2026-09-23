import { z } from "zod";

const id = z.string().trim().min(1);
const text = z.string().trim().min(1);
const date = z.iso.date();
const retrievedAt = z.iso.datetime({ offset: true });

// 値が無い理由を null や空文字に押し込めず、元の表記も保持する。
const unavailable = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("not_collected"), raw: z.null(), value: z.null() }),
  z.strictObject({ state: z.literal("not_in_official_source"), raw: z.null(), value: z.null() }),
  z.strictObject({ state: z.literal("unknown"), raw: z.string().nullable(), value: z.null() }),
]);

function sourcedValue<T extends z.ZodType>(value: T) {
  return z.union([
    z.strictObject({ state: z.literal("known"), raw: text, value }),
    unavailable,
  ]);
}

export const voteValues = [
  "for", "against", "absent", "left", "recused", "chair_not_voting",
] as const;
export const voteValueSchema = z.enum(voteValues);
export const sourcedVoteSchema = sourcedValue(voteValueSchema);
export const reviewStatusSchema = z.enum(["unreviewed", "verified", "needs_correction"]);

const evidence = {
  sourceIds: z.array(id).min(1),
  reviewStatus: reviewStatusSchema,
};

export const sourceSchema = z.strictObject({
  id,
  title: sourcedValue(text),
  url: z.url({ protocol: /^https?$/ }),
  retrievedAt,
  reviewStatus: reviewStatusSchema,
});

export const sessionSchema = z.strictObject({
  id,
  title: sourcedValue(text),
  startDate: sourcedValue(date),
  endDate: sourcedValue(date),
  ...evidence,
});

export const itemSchema = z.strictObject({
  id,
  sessionId: id,
  title: sourcedValue(text),
  officialNumber: sourcedValue(text),
  officialSummary: sourcedValue(text),
  result: sourcedValue(z.enum(["passed", "rejected", "consented", "other"])),
  fieldEvidence: z.strictObject({
    title: z.strictObject({ sourceId: id, retrievedAt, reviewStatus: reviewStatusSchema }),
    officialNumber: z.strictObject({ sourceId: id, retrievedAt, reviewStatus: reviewStatusSchema }),
    officialSummary: z.strictObject({ sourceId: id, retrievedAt, reviewStatus: reviewStatusSchema }),
    result: z.strictObject({ sourceId: id, retrievedAt, reviewStatus: reviewStatusSchema }),
  }),
  ...evidence,
});

export const memberSchema = z.strictObject({
  id,
  name: sourcedValue(text),
  ...evidence,
});

export const factionSchema = z.strictObject({
  id,
  name: sourcedValue(text),
  ...evidence,
});

// 会期当時の所属を独立した行にする。議員の現在所属はこのモデルに置かない。
export const membershipSchema = z.strictObject({
  id,
  sessionId: id,
  memberId: id,
  factionId: sourcedValue(id),
  ...evidence,
});

export const voteSchema = z.strictObject({
  id,
  itemId: id,
  memberId: id,
  membershipId: id,
  position: sourcedVoteSchema,
  ...evidence,
});

const countsSchema = z.strictObject({
  sessions: z.number().int().nonnegative(),
  items: z.number().int().nonnegative(),
  members: z.number().int().nonnegative(),
  factions: z.number().int().nonnegative(),
  memberships: z.number().int().nonnegative(),
  votes: z.number().int().nonnegative(),
  sources: z.number().int().nonnegative(),
});

const collections = {
  sessions: z.array(sessionSchema).length(1),
  items: z.array(itemSchema),
  members: z.array(memberSchema),
  factions: z.array(factionSchema),
  memberships: z.array(membershipSchema),
  votes: z.array(voteSchema),
  sources: z.array(sourceSchema),
};

const dataShape = z.strictObject({
  schemaVersion: z.literal(1),
  counts: countsSchema,
  ...collections,
});

export const councilDataSchema = dataShape.superRefine((data, ctx) => {
  type Collection = keyof typeof collections;
  const keys = Object.keys(collections) as Collection[];
  const lookup = {} as Record<Collection, Set<string>>;

  const issue = (path: (string | number)[], message: string) => {
    ctx.addIssue({ code: "custom", path, message });
  };

  for (const key of keys) {
    const rows = data[key];
    if (data.counts[key] !== rows.length) {
      issue(["counts", key], `${key} の宣言件数が実際の件数と一致しません`);
    }
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      if (seen.has(row.id)) issue([key, index, "id"], `${key} 内でIDが重複しています`);
      seen.add(row.id);
    });
    lookup[key] = seen;
  }

  const exists = (key: Collection, value: string, path: (string | number)[]) => {
    if (!lookup[key].has(value)) issue(path, `${key} に参照先IDがありません: ${value}`);
  };
  const checkSources = (row: { sourceIds: string[] }, path: (string | number)[]) => {
    const seen = new Set<string>();
    row.sourceIds.forEach((sourceId, index) => {
      exists("sources", sourceId, [...path, "sourceIds", index]);
      if (seen.has(sourceId)) issue([...path, "sourceIds", index], "出典IDが重複しています");
      seen.add(sourceId);
    });
  };

  data.sessions.forEach((row, index) => {
    checkSources(row, ["sessions", index]);
    if (row.startDate.state === "known" && row.endDate.state === "known" && row.startDate.value > row.endDate.value) {
      issue(["sessions", index, "endDate"], "終了日が開始日より前です");
    }
  });
  data.items.forEach((row, index) => {
    exists("sessions", row.sessionId, ["items", index, "sessionId"]);
    checkSources(row, ["items", index]);
    for (const key of ["title", "officialNumber", "officialSummary", "result"] as const) {
      const field = row.fieldEvidence[key];
      exists("sources", field.sourceId, ["items", index, "fieldEvidence", key, "sourceId"]);
      if (!row.sourceIds.includes(field.sourceId)) {
        issue(["items", index, "fieldEvidence", key, "sourceId"], "項目の出典が案件の出典一覧にありません");
      }
    }
  });
  data.members.forEach((row, index) => checkSources(row, ["members", index]));
  data.factions.forEach((row, index) => checkSources(row, ["factions", index]));

  const membershipPairs = new Set<string>();
  data.memberships.forEach((row, index) => {
    exists("sessions", row.sessionId, ["memberships", index, "sessionId"]);
    exists("members", row.memberId, ["memberships", index, "memberId"]);
    if (row.factionId.state === "known") {
      exists("factions", row.factionId.value, ["memberships", index, "factionId", "value"]);
    }
    checkSources(row, ["memberships", index]);
    const pair = JSON.stringify([row.sessionId, row.memberId]);
    if (membershipPairs.has(pair)) issue(["memberships", index], "会期と議員の所属行が重複しています");
    membershipPairs.add(pair);
  });

  const itemById = new Map(data.items.map((row) => [row.id, row]));
  const membershipById = new Map(data.memberships.map((row) => [row.id, row]));
  const votePairs = new Set<string>();
  data.votes.forEach((row, index) => {
    exists("items", row.itemId, ["votes", index, "itemId"]);
    exists("members", row.memberId, ["votes", index, "memberId"]);
    exists("memberships", row.membershipId, ["votes", index, "membershipId"]);
    checkSources(row, ["votes", index]);
    const pair = JSON.stringify([row.itemId, row.memberId]);
    if (votePairs.has(pair)) issue(["votes", index], "同じ案件に対する同じ議員の票が重複しています");
    votePairs.add(pair);
    const item = itemById.get(row.itemId);
    const membership = membershipById.get(row.membershipId);
    if (membership && membership.memberId !== row.memberId) {
      issue(["votes", index, "membershipId"], "所属行の議員と票の議員が一致しません");
    }
    if (item && membership && item.sessionId !== membership.sessionId) {
      issue(["votes", index, "membershipId"], "所属行の会期と案件の会期が一致しません");
    }
  });
});

export type CouncilData = z.infer<typeof councilDataSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Member = z.infer<typeof memberSchema>;
export type Faction = z.infer<typeof factionSchema>;
export type Membership = z.infer<typeof membershipSchema>;
export type Vote = z.infer<typeof voteSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type VoteValue = z.infer<typeof voteValueSchema>;

// unknown を入口にし、画面側へは検証済みの型だけを渡す。
export function parseCouncilData(input: unknown): CouncilData {
  return councilDataSchema.parse(input);
}

// 公開に使う入口。未確認・要修正の行や出典はここで止める。
export const publishableCouncilDataSchema = councilDataSchema.superRefine((data, ctx) => {
  const keys = Object.keys(collections) as (keyof typeof collections)[];
  for (const key of keys) {
    data[key].forEach((row, index) => {
      if (row.reviewStatus !== "verified") {
        ctx.addIssue({
          code: "custom",
          path: [key, index, "reviewStatus"],
          message: "公開用データは人による確認が必要です",
        });
      }
    });
  }
  data.items.forEach((row, index) => {
    for (const key of ["title", "officialNumber", "officialSummary", "result"] as const) {
      if (row.fieldEvidence[key].reviewStatus !== "verified") {
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "fieldEvidence", key, "reviewStatus"],
          message: "公開用データの各項目は人による確認が必要です",
        });
      }
    }
  });
});

export function parsePublishableCouncilData(input: unknown): CouncilData {
  return publishableCouncilDataSchema.parse(input);
}
