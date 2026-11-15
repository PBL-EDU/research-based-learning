import { Modal, Notice, Setting, type App } from "obsidian";
import type RlcPlugin from "../main";
import type { ProjectData } from "../core/project-service";
import { ProjectWizardModal } from "./project-wizard-modal";
import { FieldEntryModal } from "./field-entry-modal";
import { InterviewModal } from "./interview-modal";

export class ProjectActionsModal extends Modal {
  constructor(
    app: App,
    private readonly rlc: RlcPlugin,
    private readonly project: ProjectData,
    private readonly refresh: () => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.modalEl.addClass("rlc-modal");
    this.render();
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.project.title });
    contentEl.createEl("p", {
      text: `${this.project.mode === "action" ? "行动型" : "探究型"} · 立问 / 寻域 / 求证 / 知行`,
      cls: "rlc-hint",
    });

    const list = contentEl.createDiv({ cls: "rlc-project-actions-list" });
    this.action(list, "立问向导", "搜索自己 → 问题 → 假设 → 难题", () => {
      new ProjectWizardModal(this.app, this.rlc, this.project, this.refresh).open();
      this.close();
    });
    this.action(list, "添加场域人物", "研究者 / 实践者 / 亲历者", () => {
      new FieldEntryModal(this.app, this.rlc, this.project, "person", this.refresh).open();
      this.close();
    });
    this.action(list, "添加物/组织", "关键文献、报告、机构、项目", () => {
      new FieldEntryModal(this.app, this.rlc, this.project, "object", this.refresh).open();
      this.close();
    });
    this.action(list, "新建访谈记录", "记录原话，作为寻域证据", () => {
      new InterviewModal(this.app, this.rlc, this.project, this.refresh).open();
      this.close();
    });
    this.action(list, "编辑「他们在争什么」", "一句话概括场域里的争论", () => {
      new TextPromptModal(
        this.app,
        "他们在争什么",
        this.project.debate,
        async (value) => {
          await this.rlc.projects.setDebate(this.project.file, value);
          this.refresh();
        },
      ).open();
      this.close();
    });
    this.action(list, "打开研究计划笔记", "查看四阶段与证据", () => {
      this.close();
      void this.rlc.openProject(this.project.file);
    });
  }

  private action(container: HTMLElement, title: string, desc: string, onClick: () => void): void {
    const row = container.createDiv({ cls: "rlc-project-action-row" });
    const info = row.createDiv({ cls: "rlc-project-action-info" });
    info.createDiv({ text: title, cls: "rlc-project-action-title" });
    info.createDiv({ text: desc, cls: "rlc-project-action-desc" });
    const button = row.createEl("button", { text: "打开", cls: "rlc-btn rlc-btn-small" });
    button.addEventListener("click", onClick);
  }
}

class TextPromptModal extends Modal {
  constructor(
    app: App,
    private readonly title: string,
    private readonly initial: string,
    private readonly onSave: (value: string) => Promise<void>,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.modalEl.addClass("rlc-modal");
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.title });
    let value = this.initial;
    const setting = new Setting(contentEl).setName("内容");
    setting.settingEl.addClass("rlc-field-stacked");
    setting.addTextArea((area) => {
      area.inputEl.rows = 3;
      area.setValue(this.initial).onChange((next) => { value = next; });
    });
    new Setting(contentEl)
      .addButton((button) =>
        button.setButtonText("保存").setCta().onClick(async () => {
          await this.onSave(value.trim());
          this.close();
        }),
      )
      .settingEl.addClass("rlc-actions");
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
