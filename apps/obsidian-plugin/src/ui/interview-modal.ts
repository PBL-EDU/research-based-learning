import { Modal, Notice, Setting, type App } from "obsidian";
import type RlcPlugin from "../main";
import type { ProjectData } from "../core/project-service";

export class InterviewModal extends Modal {
  private busy = false;
  private person = "";
  private role = "";
  private date: string;
  private questions = "";
  private notes = "";

  constructor(
    app: App,
    private readonly rlc: RlcPlugin,
    private readonly project: ProjectData,
    private readonly onDone: () => void,
  ) {
    super(app);
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    this.date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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
    contentEl.createEl("h2", { text: "新建访谈记录" });
    contentEl.createEl("p", {
      text: "访谈是寻域的证据：记录原话，不只写结论。",
      cls: "rlc-hint",
    });

    this.text("对象", "姓名或化名", this.person, (value) => { this.person = value; });
    this.text("身份", "研究者 / 实践者 / 亲历者 / 其他", this.role, (value) => { this.role = value; });
    this.text("日期", "YYYY-MM-DD", this.date, (value) => { this.date = value; });
    this.area("问题与回答", "问了什么、对方怎么回答；尽量记原话", this.questions, (value) => { this.questions = value; }, 5);
    this.area("我的理解", "这次访谈让你改变了什么看法？", this.notes, (value) => { this.notes = value; }, 3);

    new Setting(contentEl)
      .addButton((button) =>
        button.setButtonText("保存并打开记录").setCta().onClick(async () => {
          await this.save(button.buttonEl);
        }),
      )
      .settingEl.addClass("rlc-actions");
  }

  private text(name: string, desc: string, initial: string, setter: (value: string) => void): void {
    const setting = new Setting(this.contentEl).setName(name);
    if (desc.length > 0) setting.setDesc(desc);
    setting.settingEl.addClass("rlc-field-stacked");
    setting.addText((text) => text.setPlaceholder(desc).setValue(initial).onChange(setter));
  }

  private area(name: string, desc: string, initial: string, setter: (value: string) => void, rows: number): void {
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
    if (!this.person.trim()) {
      new Notice("先写访谈对象。");
      return;
    }
    this.busy = true;
    buttonEl.disabled = true;
    buttonEl.setText("保存中…");
    try {
      const note = await this.rlc.projects.createInterview(this.project.file, {
        person: this.person.trim(),
        role: this.role.trim(),
        date: this.date.trim(),
        questions: this.questions,
        notes: this.notes,
      });
      this.onDone();
      this.close();
      await this.rlc.cards.openFile(note);
    } catch (error) {
      new Notice(`保存失败：${(error as Error).message}`);
    } finally {
      this.busy = false;
      buttonEl.disabled = false;
      buttonEl.setText("保存并打开记录");
    }
  }
}
