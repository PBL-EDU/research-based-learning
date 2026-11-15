import { App, TFile, normalizePath } from "obsidian";
import { patchFrontmatter, projectDir, projectPath, readFrontmatter } from "@rlc/vault-core";
import type { CardSummary } from "./overview";
import { newUuid } from "./id";

export type ProjectMode = "inquiry" | "action";
export type FieldRole = "researcher" | "practitioner" | "affected" | "other";

export interface ProjectInput {
  domain: string;
  title: string;
  mode: ProjectMode;
  scene?: string;
  question: string;
  problem: string;
}

export interface FieldPerson {
  name: string;
  role: FieldRole;
  link?: string;
  view?: string;
}

export interface FieldObject {
  name: string;
  kind: string;
  link?: string;
  why?: string;
}

export interface InterviewRef {
  person: string;
  role: string;
  path: string;
  date: string;
}

export interface ProjectData {
  file: TFile;
  projectId: string;
  title: string;
  mode: ProjectMode;
  scene: string;
  question: string;
  problem: string;
  selfList: string;
  candidates: string[];
  assumptions: string[];
  people: FieldPerson[];
  objects: FieldObject[];
  interviews: InterviewRef[];
  debate: string;
  method: string;
  insight: string;
  action: string;
  feedback: string;
  reflection: string;
  nextQuestion: string;
  progress: boolean[];
  evidence: CardSummary[];
}

export interface WizardData {
  selfList: string;
  candidates: string[];
  assumptions: string[];
  question: string;
  problem: string;
}

export interface InterviewInput {
  person: string;
  role: string;
  date: string;
  questions: string;
  notes: string;
}

const STAGE_LABELS = ["立问", "寻域", "求证", "知行"];
const MODE_LABELS: Record<ProjectMode, string> = { inquiry: "探究型", action: "行动型" };
const ROLE_LABELS: Record<FieldRole, string> = {
  researcher: "研究者",
  practitioner: "实践者",
  affected: "亲历者",
  other: "其他",
};
const ROLE_VALUES: FieldRole[] = ["researcher", "practitioner", "affected", "other"];

export class ProjectService {
  constructor(private readonly app: App) {}

  async listProjects(domain: string): Promise<ProjectData[]> {
    const dir = projectDir(domain);
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(`${dir}/`) && !file.path.includes("/访谈-"));
    const projects: ProjectData[] = [];
    for (const file of files) {
      const project = await this.readProject(file);
      if (project) projects.push(project);
    }
    return projects.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);
  }

  async readProject(file: TFile): Promise<ProjectData | null> {
    const markdown = await this.app.vault.read(file);
    const frontmatter = readFrontmatter(markdown);
    if (!frontmatter || frontmatter.schema !== "project@1") return null;

    const projectId = typeof frontmatter.projectId === "string" ? frontmatter.projectId : "";
    if (!projectId) return null;
    const mode: ProjectMode = frontmatter.mode === "action" ? "action" : "inquiry";
    const title = typeof frontmatter.title === "string" ? frontmatter.title : file.basename;
    const scene = typeof frontmatter.scene === "string" ? frontmatter.scene : "";

    return {
      file,
      projectId,
      title,
      mode,
      scene,
      question: this.label(markdown, "立问", "我想回答的问题是"),
      problem: this.label(markdown, "立问", "难题是"),
      selfList: this.label(markdown, "立问", "我关心的是"),
      candidates: this.labelList(markdown, "立问", "候选问题"),
      assumptions: this.labelList(markdown, "立问", "我的假设"),
      people: this.readPeople(frontmatter.people),
      objects: this.readObjects(frontmatter.objects),
      interviews: this.readInterviews(frontmatter.interviews),
      debate: this.label(markdown, "寻域", "他们在争什么"),
      method: this.label(markdown, "求证", "方法"),
      insight: this.label(markdown, "求证", "洞察"),
      action: this.label(markdown, "知行", "行动"),
      feedback: this.label(markdown, "知行", "反馈"),
      reflection: this.label(markdown, "知行", "复盘"),
      nextQuestion: this.label(markdown, "知行", "下一个问题"),
      progress: [],
      evidence: [],
    };
  }

  async createProject(input: ProjectInput): Promise<TFile> {
    const projectId = newUuid();
    const slug = `${input.title.replace(/[\\/:*?"<>|#^[\]]/g, " ").trim().slice(0, 32)}-${projectId.slice(0, 6)}`;
    const path = normalizePath(projectPath(input.domain, slug));
    await this.ensureFolder(projectDir(input.domain));

    const now = new Date().toISOString();
    const content = [
      "---",
      "schema: project@1",
      `projectId: ${projectId}`,
      `title: ${JSON.stringify(input.title)}`,
      `mode: ${input.mode}`,
      ...(input.scene ? [`scene: ${JSON.stringify(input.scene)}`] : []),
      "people: []",
      "objects: []",
      "interviews: []",
      `createdAt: ${now}`,
      `updatedAt: ${now}`,
      "---",
      "",
      "<!-- rlc-project:start -->",
      "> 研究计划 · 待同步",
      "<!-- rlc-project:end -->",
      "",
      "## 立问",
      "",
      "**我关心的是**：",
      "",
      `**我想回答的问题是**：${input.question}`,
      "",
      `**难题是**：${input.problem}`,
      "",
      "**候选问题**：",
      "",
      "**我的假设**：",
      "",
      "## 寻域",
      "",
      "<!-- rlc-field:start -->",
      "（还没有场域条目）",
      "<!-- rlc-field:end -->",
      "",
      "**他们在争什么**：",
      "",
      "## 求证",
      "",
      "**方法**：",
      "",
      "**洞察**：",
      "",
      "<!-- rlc-evidence:start -->",
      "（还没有挂接证据卡片）",
      "<!-- rlc-evidence:end -->",
      "",
      "## 知行",
      "",
      "**行动**：",
      "",
      "**反馈**：",
      "",
      "**复盘**：",
      "",
      "**下一个问题**：",
      "",
    ].join("\n");

    return this.app.vault.create(path, content);
  }

  evaluate(project: ProjectData, cards: CardSummary[]): ProjectData {
    const linked = cards.filter((card) => card.projectId === project.projectId);
    const reading = linked.filter((card) => card.path.includes("-dr-"));
    const practice = linked.filter((card) => card.path.includes("-pc-"));
    const evidence = [...reading, ...practice];
    const roles = new Set(project.people.map((person) => person.role).filter(Boolean));

    const progress = [
      Boolean(project.question.trim() && project.problem.trim()),
      project.people.length >= 3 &&
        roles.size >= 2 &&
        project.objects.length >= 1 &&
        project.interviews.length >= 1 &&
        Boolean(project.debate.trim()),
      evidence.length >= 3 && Boolean(project.insight.trim()),
      practice.length >= 1 && Boolean(project.reflection.trim() && project.nextQuestion.trim()),
    ];

    return { ...project, progress, evidence };
  }

  async syncProject(project: ProjectData, cards: CardSummary[]): Promise<ProjectData> {
    const synced = this.evaluate(project, cards);
    let markdown = await this.app.vault.read(project.file);
    markdown = this.replaceBlock(markdown, "rlc-project", this.progressBlock(synced));
    markdown = this.replaceBlock(markdown, "rlc-evidence", this.evidenceBlock(synced));
    markdown = this.replaceBlock(markdown, "rlc-field", this.fieldBlock(synced));
    await this.writeIfChanged(project.file, markdown);
    return synced;
  }

  async saveWizard(file: TFile, data: WizardData): Promise<void> {
    let markdown = await this.app.vault.read(file);
    const section = [
      `**我关心的是**：${data.selfList.trim()}`,
      "",
      `**我想回答的问题是**：${data.question.trim()}`,
      "",
      `**难题是**：${data.problem.trim()}`,
      "",
      "**候选问题**：",
      "",
      ...data.candidates.map((item) => `- ${item}`),
      "",
      "**我的假设**：",
      "",
      ...data.assumptions.map((item) => `- ${item}`),
      "",
    ].join("\n");
    markdown = this.replaceSection(markdown, "立问", section);
    markdown = patchFrontmatter(markdown, { updatedAt: new Date().toISOString() });
    await this.app.vault.modify(file, markdown);
  }

  async addPerson(file: TFile, person: FieldPerson): Promise<void> {
    const project = await this.readProject(file);
    if (!project) return;
    await this.patchArray(file, "people", [...project.people, person]);
  }

  async addObject(file: TFile, object: FieldObject): Promise<void> {
    const project = await this.readProject(file);
    if (!project) return;
    await this.patchArray(file, "objects", [...project.objects, object]);
  }

  async setDebate(file: TFile, debate: string): Promise<void> {
    let markdown = await this.app.vault.read(file);
    const section = this.section(markdown, "寻域");
    const replaced = section.replace(/\*\*他们在争什么\*\*[：:][\s\S]*$/, `**他们在争什么**：${debate.trim()}\n`);
    markdown = this.replaceSection(markdown, "寻域", replaced);
    await this.app.vault.modify(file, markdown);
  }

  async createInterview(file: TFile, input: InterviewInput): Promise<TFile> {
    const project = await this.readProject(file);
    if (!project) throw new Error("研究计划不存在");
    const folder = file.path.replace(/\.md$/, "");
    await this.ensureFolder(folder);
    const safeName = input.person.replace(/[\\/:*?"<>|]/g, " ").trim().slice(0, 24) || "访谈";
    const notePath = normalizePath(`${folder}/访谈-${safeName}.md`);
    const content = [
      "---",
      "schema: interview@1",
      `projectId: ${project.projectId}`,
      `person: ${JSON.stringify(input.person)}`,
      `role: ${JSON.stringify(input.role)}`,
      `date: ${input.date}`,
      "---",
      "",
      `# 访谈：${input.person}`,
      "",
      "## 基本信息",
      "",
      `- 对象：${input.person}`,
      `- 身份：${input.role}`,
      `- 日期：${input.date}`,
      "",
      "## 问题与回答",
      "",
      input.questions.trim() || "（访谈提纲与回答）",
      "",
      "## 我的理解",
      "",
      input.notes.trim() || "（这次访谈让我改变了什么看法？）",
      "",
    ].join("\n");
    const note = await this.app.vault.create(notePath, content);
    await this.patchArray(file, "interviews", [
      ...project.interviews,
      { person: input.person, role: input.role, path: note.path, date: input.date },
    ]);
    return note;
  }

  private async patchArray(file: TFile, key: string, value: unknown[]): Promise<void> {
    const markdown = await this.app.vault.read(file);
    const next = patchFrontmatter(markdown, { [key]: value, updatedAt: new Date().toISOString() });
    await this.app.vault.modify(file, next);
  }

  private progressBlock(project: ProjectData): string {
    const done = project.progress.filter(Boolean).length;
    const current = project.progress.findIndex((value) => !value);
    const stage = current < 0 ? "已完成" : STAGE_LABELS[current] ?? "";
    const line = project.progress
      .map((value, index) => `${value ? "✓" : index === current ? "●" : "○"} ${STAGE_LABELS[index] ?? ""}`)
      .join(" · ");
    return [
      `> 研究计划 · ${MODE_LABELS[project.mode]} · ${stage} ${done}/4`,
      `> ${line}`,
      `> 证据 ${project.evidence.length}`,
    ].join("  \n");
  }

  private fieldBlock(project: ProjectData): string {
    const lines: string[] = [];
    lines.push("**3 人**");
    if (project.people.length === 0) lines.push("- （还没有人物）");
    for (const person of project.people) {
      const meta = [ROLE_LABELS[person.role], person.link, person.view].filter(Boolean).join(" · ");
      lines.push(`- ${person.name}${meta ? ` · ${meta}` : ""}`);
    }
    lines.push("", "**1 物/组织**");
    if (project.objects.length === 0) lines.push("- （还没有物/组织）");
    for (const object of project.objects) {
      const meta = [object.kind, object.link, object.why].filter(Boolean).join(" · ");
      lines.push(`- ${object.name}${meta ? ` · ${meta}` : ""}`);
    }
    lines.push("", "**访谈**");
    if (project.interviews.length === 0) lines.push("- （还没有访谈记录）");
    for (const interview of project.interviews) {
      lines.push(
        `- ${interview.person} · ${interview.role} · ${interview.date} · [[${interview.path}|查看记录]]`,
      );
    }
    return lines.join("\n");
  }

  private evidenceBlock(project: ProjectData): string {
    if (project.evidence.length === 0) return "（还没有挂接证据卡片）";
    return project.evidence
      .map((card) => {
        const kind = card.path.includes("-pc-") ? "实践" : "精读";
        return `- [[${card.path}|${card.title}]] · ${kind}`;
      })
      .join("\n");
  }

  private replaceBlock(markdown: string, name: string, content: string): string {
    const start = `<!-- ${name}:start -->`;
    const end = `<!-- ${name}:end -->`;
    const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`);
    if (pattern.test(markdown)) {
      return markdown.replace(pattern, `${start}\n${content}\n${end}`);
    }
    return markdown;
  }

  private replaceSection(markdown: string, heading: string, content: string): string {
    const pattern = new RegExp(`^## ${escapeRegExp(heading)}\\s*$`, "m");
    const match = pattern.exec(markdown);
    if (!match) return markdown;
    const start = match.index + match[0].length;
    const rest = markdown.slice(start);
    const next = /\n## /.exec(rest);
    const end = next ? start + next.index : markdown.length;
    return `${markdown.slice(0, start)}\n${content}\n${markdown.slice(end)}`;
  }

  private section(markdown: string, heading: string): string {
    const pattern = new RegExp(`^## ${escapeRegExp(heading)}\\s*$`, "m");
    const match = pattern.exec(markdown);
    if (!match) return "";
    const start = match.index + match[0].length;
    const rest = markdown.slice(start);
    const next = /\n## /.exec(rest);
    return next ? rest.slice(0, next.index) : rest;
  }

  private labelList(markdown: string, heading: string, label: string): string[] {
    const scope = this.section(markdown, heading);
    const pattern = new RegExp(`\\*\\*${escapeRegExp(label)}\\*\\*[：:]\\s*([\\s\\S]*?)(?=\\n\\*\\*|$)`);
    const block = pattern.exec(scope)?.[1] ?? "";
    return block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^[-*]\s+\S/.test(line))
      .map((line) => line.replace(/^[-*]\s+/, "").trim());
  }

  private label(markdown: string, heading: string, label: string): string {
    const scope = this.section(markdown, heading);
    const pattern = new RegExp(`\\*\\*${escapeRegExp(label)}\\*\\*[：:]\\s*(.*)`);
    return pattern.exec(scope)?.[1]?.trim() ?? "";
  }

  private readPeople(value: unknown): FieldPerson[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const record = item as Record<string, unknown>;
        const role = typeof record.role === "string" && ROLE_VALUES.includes(record.role as FieldRole)
          ? (record.role as FieldRole)
          : "other";
        return {
          name: typeof record.name === "string" ? record.name : "",
          role,
          ...(typeof record.link === "string" ? { link: record.link } : {}),
          ...(typeof record.view === "string" ? { view: record.view } : {}),
        };
      })
      .filter((person) => person.name.trim().length > 0);
  }

  private readObjects(value: unknown): FieldObject[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const record = item as Record<string, unknown>;
        return {
          name: typeof record.name === "string" ? record.name : "",
          kind: typeof record.kind === "string" ? record.kind : "",
          ...(typeof record.link === "string" ? { link: record.link } : {}),
          ...(typeof record.why === "string" ? { why: record.why } : {}),
        };
      })
      .filter((object) => object.name.trim().length > 0);
  }

  private readInterviews(value: unknown): InterviewRef[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const record = item as Record<string, unknown>;
        return {
          person: typeof record.person === "string" ? record.person : "",
          role: typeof record.role === "string" ? record.role : "",
          path: typeof record.path === "string" ? record.path : "",
          date: typeof record.date === "string" ? record.date : "",
        };
      })
      .filter((interview) => interview.path.length > 0);
  }

  private async writeIfChanged(file: TFile, markdown: string): Promise<void> {
    const current = await this.app.vault.read(file);
    if (markdown !== current) await this.app.vault.modify(file, markdown);
  }

  private async ensureFolder(folder: string): Promise<void> {
    let current = "";
    for (const part of folder.split("/").filter(Boolean)) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
