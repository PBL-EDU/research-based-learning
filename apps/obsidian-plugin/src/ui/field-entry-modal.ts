import { Modal, Notice, Setting, type App } from "obsidian";
import type RlcPlugin from "../main";
import type { ProjectData } from "../core/project-service";

export class FieldEntryModal extends Modal {
  private busy = false;
  private kind: "person" | "object";
  private name = "";
  private role = "practitioner";
  private detail = "";
  private link = "";
  private view = "";

  constructor(
    app: App,
    private readonly rlc: RlcPlugin,
    private readonly project: ProjectData,
    kind: "person" | "object",
    private readonly onDone: () => void,
  ) {
    super(app);
    this.kind = kind;
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
    contentEl.createEl("h2", { text: this.kind === "person" ? "添加场域人物" : "添加物/组织" });
    contentEl.createEl("p", {
      text: this.kind === "person"
        ? "研究者 / 实践者 / 亲历者，至少覆盖两类。"
        : "一篇关键文献、报告、机构、项目、作品或数据集。",
      cls: "rlc-hint",
    });

    this.text("名称", this.kind === "person" ? "姓名或化名" : "名称", this.name, (value) => { this.name = value; });

    if (this.kind === "person") {
      new Setting(contentEl)
        .setName("角色")
        .addDropdown((dropdown) =>
          dropdown
            .addOptions({ researcher: "研究者", practitioner: "实践者", affected: "亲历者", other: "其他" })
            .setValue(this.role)
            .onChange((value) => { this.role = value; }),
        )
        .settingEl.addClass("rlc-field-stacked");
    } else {
      this.text("类型", "文献 / 报告 / 机构 / 项目 / 作品 / 数据集", this.detail, (value) => { this.detail = value; });
    }

    this.text("链接（可选）", "网址或 DOI", this.link, (value) => { this.link = value; });
    this.area(
      this.kind === "person" ? "他的观点（可选）" : "为什么关键（可选）",
      "一句话：他们怎么定义这个问题",
      this.view,
      (value) => { this.view = value; },
    );

    new Setting(contentEl)
      .addButton((button) =>
        button.setButtonText("保存").setCta().onClick(async () => {
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

  private area(name: string, desc: string, initial: string, setter: (value: string) => void): void {
    const setting = new Setting(this.contentEl).setName(name);
    if (desc.length > 0) setting.setDesc(desc);
    setting.settingEl.addClass("rlc-field-stacked");
    setting.addTextArea((area) => area.setPlaceholder(desc).setValue(initial).onChange(setter));
  }

  private async save(buttonEl: HTMLButtonElement): Promise<void> {
    if (this.busy) return;
    if (!this.name.trim()) {
      new Notice("先写名称。");
      return;
    }
    this.busy = true;
    buttonEl.disabled = true;
    buttonEl.setText("保存中…");
    try {
      if (this.kind === "person") {
        await this.rlc.projects.addPerson(this.project.file, {
          name: this.name.trim(),
          role: this.role as "researcher" | "practitioner" | "affected" | "other",
          ...(this.link.trim() ? { link: this.link.trim() } : {}),
          ...(this.view.trim() ? { view: this.view.trim() } : {}),
        });
      } else {
        await this.rlc.projects.addObject(this.project.file, {
          name: this.name.trim(),
          kind: this.detail.trim(),
          ...(this.link.trim() ? { link: this.link.trim() } : {}),
          ...(this.view.trim() ? { why: this.view.trim() } : {}),
        });
      }
      this.onDone();
      this.close();
    } catch (error) {
      new Notice(`保存失败：${(error as Error).message}`);
    } finally {
      this.busy = false;
      buttonEl.disabled = false;
      buttonEl.setText("保存");
    }
  }
}
