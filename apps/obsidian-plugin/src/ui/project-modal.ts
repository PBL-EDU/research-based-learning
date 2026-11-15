import { Modal, Notice, Setting, type App } from "obsidian";
import type RlcPlugin from "../main";
import type { ProjectMode } from "../core/project-service";

export interface ProjectSeed {
  domain: string;
  questions?: string[];
  question?: string;
}

export class ProjectModal extends Modal {
  private busy = false;
  private title = "";
  private question = "";
  private problem = "";
  private mode: ProjectMode = "inquiry";
  private scene = "";

  constructor(
    app: App,
    private readonly rlc: RlcPlugin,
    private readonly seed: ProjectSeed,
    private readonly onCreated: () => void,
  ) {
    super(app);
    this.question = seed.question ?? seed.questions?.[0] ?? "";
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

    contentEl.createEl("h2", { text: "新建研究计划" });
    const context = contentEl.createDiv({ cls: "rlc-context" });
    context.createSpan({ text: this.seed.domain, cls: "rlc-chip" });
    context.createSpan({ text: "›", cls: "rlc-muted" });
    context.createSpan({ text: "研究计划", cls: "rlc-chip" });

    contentEl.createEl("p", {
      text: "从你真正关心的问题出发。先写问题，再写它为什么难；标题可以后改。",
      cls: "rlc-hint",
    });

    new Setting(contentEl)
      .setName("模式")
      .setDesc("探究型回答问题；行动型促成改变")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({ inquiry: "探究型", action: "行动型" })
          .setValue(this.mode)
          .onChange((value) => {
            this.mode = value === "action" ? "action" : "inquiry";
          }),
      )
      .settingEl.addClass("rlc-field-stacked");

    this.textRow("标题", "一句话说清这个计划", this.title, (value) => {
      this.title = value;
    });

    if (this.seed.questions && this.seed.questions.length > 0) {
      const picks = contentEl.createDiv({ cls: "rlc-project-questions" });
      for (const question of this.seed.questions) {
        const button = picks.createEl("button", {
          text: question,
          cls: "rlc-btn rlc-btn-ghost rlc-project-question",
        });
        button.addEventListener("click", () => {
          this.question = question;
          this.title = question.slice(0, 40);
          this.render();
        });
      }
    }

    this.areaRow(
      this.mode === "action" ? "我想改变什么" : "我想回答的问题是",
      "具体、中性、可回答；不要写成话题名",
      this.question,
      (value) => {
        this.question = value;
        if (!this.title.trim()) this.title = value.slice(0, 40);
      },
      3,
    );

    this.areaRow(
      "难题是",
      "为什么这件事难？为什么是你？",
      this.problem,
      (value) => {
        this.problem = value;
      },
      2,
    );

    this.textRow("场景（可选）", "学科探究 / 职业探索 / 生活观察 / 社会议题", this.scene, (value) => {
      this.scene = value;
    });

    new Setting(contentEl)
      .addButton((button) =>
        button.setButtonText("创建研究计划").setCta().onClick(async () => {
          await this.save(button.buttonEl);
        }),
      )
      .settingEl.addClass("rlc-actions");
  }

  private textRow(name: string, desc: string, initial: string, setter: (value: string) => void): void {
    const setting = new Setting(this.contentEl).setName(name);
    if (desc.length > 0) setting.setDesc(desc);
    setting.settingEl.addClass("rlc-field-stacked");
    setting.addText((text) => text.setPlaceholder(desc).setValue(initial).onChange(setter));
  }

  private areaRow(
    name: string,
    desc: string,
    initial: string,
    setter: (value: string) => void,
    rows: number,
  ): void {
    const setting = new Setting(this.contentEl).setName(name);
    if (desc.length > 0) setting.setDesc(desc);
    setting.settingEl.addClass("rlc-field-stacked");
    setting.addTextArea((area) => {
      area.inputEl.rows = rows;
      area.setPlaceholder(desc).setValue(initial).onChange((value) => setter(value));
    });
  }

  private async save(buttonEl: HTMLButtonElement): Promise<void> {
    if (this.busy) return;
    if (!this.question.trim()) {
      new Notice("先写研究问题：你想弄清楚什么？");
      return;
    }
    if (!this.problem.trim()) {
      new Notice("再写难题：为什么这件事难？为什么是你？");
      return;
    }

    this.busy = true;
    buttonEl.disabled = true;
    buttonEl.setText("创建中…");

    try {
      const title = this.title.trim() || this.question.trim().slice(0, 40);
      const file = await this.rlc.projects.createProject({
        domain: this.seed.domain,
        title,
        mode: this.mode,
        ...(this.scene.trim() ? { scene: this.scene.trim() } : {}),
        question: this.question.trim(),
        problem: this.problem.trim(),
      });
      this.onCreated();
      await this.rlc.cards.openFile(file);
      this.close();
    } catch (error) {
      new Notice(`创建失败：${(error as Error).message}`);
    } finally {
      this.busy = false;
      buttonEl.disabled = false;
      buttonEl.setText("创建研究计划");
    }
  }
}
