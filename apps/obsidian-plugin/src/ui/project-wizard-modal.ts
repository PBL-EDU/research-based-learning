import { Modal, Notice, Setting, type App } from "obsidian";
import type RlcPlugin from "../main";
import type { ProjectData } from "../core/project-service";

const STEPS = ["搜索自己", "话题变问题", "假设浮出", "确认问题"];

export class ProjectWizardModal extends Modal {
  private step = 0;
  private busy = false;
  private selfList: string;
  private candidates: string;
  private assumptions: string;
  private question: string;
  private problem: string;

  constructor(
    app: App,
    private readonly rlc: RlcPlugin,
    private readonly project: ProjectData,
    private readonly onDone: () => void,
  ) {
    super(app);
    this.selfList = project.selfList;
    this.candidates = project.candidates.join("\n");
    this.assumptions = project.assumptions.join("\n");
    this.question = project.question;
    this.problem = project.problem;
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

    contentEl.createEl("h2", { text: "立问向导" });
    contentEl.createEl("p", {
      text: `第 ${this.step + 1}/4 步 · ${STEPS[this.step] ?? ""}`,
      cls: "rlc-hint",
    });

    if (this.step === 0) {
      this.area(
        "搜索自己",
        "写 3–5 件你真正在意/困惑的事，一件一行。不要评价，先写出来。",
        this.selfList,
        (value) => { this.selfList = value; },
        5,
      );
    } else if (this.step === 1) {
      this.area(
        "话题变问题",
        "把在意的事改写成具体问题，一行一个。问题要具体、中性、可回答。",
        this.candidates,
        (value) => { this.candidates = value; },
        5,
      );
    } else if (this.step === 2) {
      this.area(
        "假设浮出",
        "你原本以为答案是什么？哪些假设支撑你的问题？一行一条。",
        this.assumptions,
        (value) => { this.assumptions = value; },
        4,
      );
    } else {
      this.area(
        "最终问题",
        "从候选问题里选一个，改成你真正想回答的那句。",
        this.question,
        (value) => { this.question = value; },
        3,
      );
      this.area(
        "难题",
        "为什么这件事难？为什么是你？用一句话说清楚。",
        this.problem,
        (value) => { this.problem = value; },
        3,
      );
    }

    const actions = contentEl.createDiv({ cls: "rlc-wizard-actions" });
    if (this.step > 0) {
      const prev = actions.createEl("button", { text: "上一步", cls: "rlc-btn" });
      prev.addEventListener("click", () => { this.step -= 1; this.render(); });
    }
    const next = actions.createEl("button", {
      text: this.step === 3 ? "保存立问" : "下一步",
      cls: "rlc-btn rlc-btn-primary",
    });
    next.addEventListener("click", () => {
      if (this.step < 3) {
        this.step += 1;
        this.render();
      } else {
        void this.save(next);
      }
    });
  }

  private area(
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
      area.setPlaceholder(desc).setValue(initial).onChange(setter);
    });
  }

  private async save(buttonEl: HTMLButtonElement): Promise<void> {
    if (this.busy) return;
    if (!this.question.trim() || !this.problem.trim()) {
      new Notice("最后一步：问题与难题都要写。");
      return;
    }
    this.busy = true;
    buttonEl.disabled = true;
    buttonEl.setText("保存中…");
    try {
      await this.rlc.projects.saveWizard(this.project.file, {
        selfList: this.selfList,
        candidates: this.candidates.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
        assumptions: this.assumptions.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
        question: this.question.trim(),
        problem: this.problem.trim(),
      });
      this.onDone();
      this.close();
    } catch (error) {
      new Notice(`保存失败：${(error as Error).message}`);
    } finally {
      this.busy = false;
      buttonEl.disabled = false;
      buttonEl.setText("保存立问");
    }
  }
}
