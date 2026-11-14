import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Research-based Learning Community",
    template: "%s · Research-based Learning Community",
  },
  description: "研究性学习社区：学生的文献精读卡片、实践记录与讨论。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="brand">
              Research-based Learning Community
            </Link>
            <nav className="nav">
              <Link href="/">全部组织</Link>
            </nav>
          </div>
        </header>
        <main className="container main">{children}</main>
        <footer className="site-footer">
          <div className="container">
            <p>研究性学习社区 · 卡片由学生在 Obsidian 中完成并发布</p>
            <p className="muted">
              内容仅用于学习交流。引用已标注来源；如涉版权问题请联系删除。
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
