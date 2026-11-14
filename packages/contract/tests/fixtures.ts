export const CARD_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
export const OTHER_CARD_ID = "9c858901-8a57-4791-81fe-4c455b099bc9";

/** 只构造「合法」样本；需要坏样本时在测试里局部改，避免夹具本身漂移。 */
export function makeDeepReadCard(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: "dr-card@1",
    cardId: CARD_ID,
    kind: "deep_read",
    domain: { name: "课程与教学论", slug: "curriculum-theory" },
    theme: "单元设计",
    title: "单元是一条学习经验链，不是一个内容包",
    tags: ["单元设计", "大概念"],
    source: {
      type: "literature",
      citekey: "zhong2015",
      doi: "10.1234/abcd.2015.001",
      title: "单元设计：撬动课堂转型的一个支点",
      authors: ["钟启泉"],
      year: 2015,
      license: "publisher",
    },
    aha: {
      quote: "单元不是教材内容的搬运单位，而是一条完整的学习经验链。",
      experience: "我过去备课时，总是先数这一单元有几篇课文。",
      insight: "它推翻了我把单元等同于教材章节的默认假设。",
      inspiration: "可以把单元当作一次完整经验的发生器来设计。",
      meaning: "备课的第一句话从「讲哪几课」变成「让学生经历什么」。",
    },
    conceptValue: { level: "高", note: "改变了「单元=教材章节」的默认假设" },
    actionGuidance: [
      {
        action: "把下周两课时改成一个单元来设计",
        trigger: "备课时",
        metric: "能写出单元的大概念与表现性任务",
      },
    ],
    visuals: [{ kind: "mermaid", path: "assets/aha.mmd" }],
    createdAt: "2026-11-12T21:10:00+08:00",
    updatedAt: "2026-11-13T09:55:00+08:00",
    ...overrides,
  };
}

export function makePracticeCard(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: "pc-card@1",
    cardId: CARD_ID,
    kind: "practice",
    domain: { name: "课程与教学论", slug: "curriculum-theory" },
    title: "用单元视角重写一次备课",
    tags: ["实践"],
    plan: {
      goal: "把两课时的教案改成一个单元设计",
      steps: [
        { text: "提取大概念" },
        { text: "设计表现性任务" },
        { text: "写两课时的实施脚本" },
      ],
      resources: ["课程标准"],
      scheduledFor: "2026-11-20",
      successCriteria: ["能说清单元的大概念与表现性任务"],
    },
    process: [],
    linkedCards: [OTHER_CARD_ID],
    createdAt: "2026-11-12T21:10:00+08:00",
    updatedAt: "2026-11-13T09:55:00+08:00",
    ...overrides,
  };
}

export function makeArticleSummary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: "sum-article@1",
    cardId: CARD_ID,
    kind: "article_summary",
    domain: { name: "课程与教学论", slug: "curriculum-theory" },
    title: "读钟启泉《单元设计》",
    tags: ["总结"],
    source: {
      type: "literature",
      doi: "10.1234/abcd.2015.001",
      title: "单元设计：撬动课堂转型的一个支点",
      authors: ["钟启泉"],
      year: 2015,
      license: "publisher",
    },
    body: "这篇文章让我重新理解了单元……",
    overall: "单元是学习经验链，不是内容包。",
    cardIds: [OTHER_CARD_ID],
    createdAt: "2026-11-12T21:10:00+08:00",
    updatedAt: "2026-11-13T09:55:00+08:00",
    ...overrides,
  };
}

export function makeDomainSummary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: "sum-domain@1",
    cardId: CARD_ID,
    kind: "domain_summary",
    domain: { name: "课程与教学论", slug: "curriculum-theory" },
    title: "单元设计领域阅读总结",
    tags: ["领域总结"],
    scope: "reading",
    body: "读完三篇文献后，我的理解发生了三次变化……",
    index: [OTHER_CARD_ID],
    createdAt: "2026-11-12T21:10:00+08:00",
    updatedAt: "2026-11-13T09:55:00+08:00",
    ...overrides,
  };
}

export function makeComment(depth: number, id = `c-${depth}`): Record<string, unknown> {
  return {
    id,
    publicationId: "pub_01JABCDEFGHJKMNPQRSTVWXYZ0",
    parentId: depth === 0 ? null : `c-${depth - 1}`,
    depth,
    author: { handle: "zhong", displayName: "钟同学" },
    body: "这条评论有实际内容。",
    createdAt: "2026-11-13T10:00:00+08:00",
    status: "visible",
    children: [],
  };
}
