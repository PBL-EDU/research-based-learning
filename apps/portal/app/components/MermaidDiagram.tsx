"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 门户端的 Mermaid 渲染。
 *
 * 在客户端动态 import，避免把 mermaid 打进首屏；渲染失败时退回源码，
 * 保证内容不会因为画图失败而消失。
 */
export function MermaidDiagram({ chart }: { chart: string }) {
  const holder = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict" });
        const id = `rlc-mermaid-${Math.random().toString(36).slice(2, 9)}`;
        const { svg } = await mermaid.render(id, chart);
        if (!cancelled && holder.current) {
          holder.current.innerHTML = svg;
        }
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error) {
    return <pre className="mermaid-fallback">{chart}</pre>;
  }

  return <div ref={holder} className="mermaid-diagram" />;
}
