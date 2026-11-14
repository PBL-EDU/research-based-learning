import { describe, expect, it } from "vitest";
import {
  appendOutboxEntry,
  bumpAttempt,
  dropOutboxEntry,
  parseOutbox,
  type OutboxEntry,
} from "../src/core/outbox";

const entry: OutboxEntry = {
  cardId: "c1",
  cardPath: "领域/x/精读卡片/dr-1.md",
  queuedAt: "2026-11-13T10:00:00.000Z",
  attempts: 0,
};

describe("发布 outbox", () => {
  it("追加后能读回", () => {
    const content = appendOutboxEntry("", entry);
    const parsed = parseOutbox(content);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.cardId).toBe("c1");
  });

  it("同一个 cardId 重复入队只保留一条", () => {
    let content = appendOutboxEntry("", entry);
    content = appendOutboxEntry(content, { ...entry, queuedAt: "2026-11-13T11:00:00.000Z" });
    const parsed = parseOutbox(content);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.queuedAt).toBe("2026-11-13T11:00:00.000Z");
  });

  it("不同卡片各自保留", () => {
    let content = appendOutboxEntry("", entry);
    content = appendOutboxEntry(content, { ...entry, cardId: "c2" });
    expect(parseOutbox(content)).toHaveLength(2);
  });

  it("成功发布后删除条目，清空时不留空行", () => {
    const content = appendOutboxEntry("", entry);
    expect(dropOutboxEntry(content, "c1")).toBe("");
  });

  it("坏行被忽略，不影响其他条目", () => {
    const content = `{"cardId":"c1","cardPath":"a.md","queuedAt":"2026-11-13T10:00:00.000Z","attempts":0}\n{坏行\n`;
    expect(parseOutbox(content)).toHaveLength(1);
  });

  it("重试失败累加次数并记录错误", () => {
    const content = appendOutboxEntry("", entry);
    const bumped = bumpAttempt(content, "c1", "HTTP 500");
    const parsed = parseOutbox(bumped);
    expect(parsed[0]?.attempts).toBe(1);
    expect(parsed[0]?.lastError).toBe("HTTP 500");
  });
});
