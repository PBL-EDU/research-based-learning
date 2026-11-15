import { App, TFile, normalizePath } from "obsidian";
import { projectDir, projectPath, readFrontmatter } from "@rlc/vault-core";
import type { CardSummary } from "./overview";
import { newUuid } from "./id";

export type ProjectMode = "inquiry" | "action";

export interface ProjectInput {
  domain: string;
  title: string;
  mode: ProjectMode;
  scene?: string;
  question: string;
  problem: string;
}

export interface ProjectData {
  file: TFile;
  projectId: string;
  title: string;
  mode: ProjectMode;
  scene: string;
  question: string;
  problem: string;
  people: string[];
  fieldObject: string;
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

const STAGE_LABELS = ["立问", "寻域", "求证", "知行"];
const MODE_LABELS: Record<ProjectMode, string> = { inquiry: "探究型", action: "行动型" };

/** 研究计划：笔记是人的，进度由插件维护。 */
export class ProjectService {
  constructor(private readonly app: App) {}

  async listProjects(domain: string): Promise<ProjectData[]> {
    const dir = projectDir(domain);
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(`${dir}/`));
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

    const body = markdown;
    const question = this.label(body, "立问", "我想回答的问题是");
    const problem = this.label(body, "立问", "难题是");
    const peopleRaw = this.section(body, "寻域");
    const people = peopleRaw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^[-*]\s+\S/.test(line))
      .map((line) => line.replace(/^[-*]\s+/, "").trim())
      .filter(Boolean);
    const fieldObject = this.label(body, "寻域", "1 物/组织");
    const debate = this.label(body, "寻域", "他们在争什么");
    const method = this.label(body, "求证", "方法");
    const insight = this.label(body, "求证", "洞察");
    const action = this.label(body, "知行", "行动");
    const feedback = this.label(body, "知行", "反馈");
    const reflection = this.label(body, "知行", "复盘");
    const nextQuestion = this.label(body, "知行", "下一个问题");

    return {
      file,
      projectId,
      title,
      mode,
      scene,
      question,
      problem,
      people,
      fieldObject,
      debate,
      method,
      insight,
      action,
      feedback,
      reflection,
      nextQuestion,
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
      "## 寻域",
      "",
      "**3 人**（研究者 / 实践者 / 亲历者，至少覆盖两类）：",
      "",
      "- ",
      "- ",
      "- ",
      "",
      "**1 物/组织**：",
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

  /** 只计算，不写盘；侧栏渲染用。 */
  evaluate(project: ProjectData, cards: CardSummary[]): ProjectData {
    const linked = cards.filter((card) => card.projectId === project.projectId);
    const reading = linked.filter((card) => card.path.includes("-dr-"));
    const practice = linked.filter((card) => card.path.includes("-pc-"));
    const evidence = [...reading, ...practice];

    const progress = [
      Boolean(project.question.trim() && project.problem.trim()),
      project.people.length >= 3 && Boolean(project.fieldObject.trim()),
      evidence.length >= 3 && Boolean(project.insight.trim()),
      practice.length >= 1 && Boolean(project.reflection.trim() && project.nextQuestion.trim()),
    ];

    return { ...project, progress, evidence };
  }

  /** 计算四阶段进度，并把进度/证据块写回笔记。 */
  async syncProject(project: ProjectData, cards: CardSummary[]): Promise<ProjectData> {
    const synced = this.evaluate(project, cards);
    let markdown = await this.app.vault.read(project.file);
    markdown = this.replaceBlock(markdown, "rlc-project", this.progressBlock(synced));
    markdown = this.replaceBlock(markdown, "rlc-evidence", this.evidenceBlock(synced));
    const current = await this.app.vault.read(project.file);
    if (markdown !== current) await this.app.vault.modify(project.file, markdown);
    return synced;
  }

  private progressBlock(project: ProjectData): string {
    const done = project.progress.filter(Boolean).length;
    const current = project.progress.findIndex((value) => !value);
    const stage = current < 0 ? "已完成" : STAGE_LABELS[current];
    const line = project.progress
      .map((value, index) => `${value ? "✓" : index === current ? "●" : "○"} ${STAGE_LABELS[index]}`)
      .join(" · ");
    return [
      `> 研究计划 · ${MODE_LABELS[project.mode]} · ${stage} ${done}/4`,
      `> ${line}`,
      `> 证据 ${project.evidence.length}`,
    ].join("  \n");
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

  private section(markdown: string, heading: string): string {
    const pattern = new RegExp(`^## ${escapeRegExp(heading)}\\s*$`, "m");
    const match = pattern.exec(markdown);
    if (!match) return "";
    const start = match.index + match[0].length;
    const rest = markdown.slice(start);
    const next = /\n## /.exec(rest);
    return next ? rest.slice(0, next.index) : rest;
  }

  private label(markdown: string, heading: string, label: string): string {
    const scope = this.section(markdown, heading);
    const pattern = new RegExp(`\\*\\*${escapeRegExp(label)}\\*\\*[：:]\\s*(.*)`);
    return pattern.exec(scope)?.[1]?.trim() ?? "";
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
