"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const ProductViewer = dynamic(() => import("./product-viewer"), {
  ssr: false,
  loading: () => null,
});

/**
 * Defers downloading three.js and the GLB until the viewer scrolls into view.
 * Until then the product photo is shown as a poster.
 */
export function LazyProductViewer(props: { modelUrl: string; productId?: string; name: string; poster?: React.ReactNode; showCase?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="relative size-full">
      {!visible && props.poster}
      {visible && <ProductViewer modelUrl={props.modelUrl} productId={props.productId} name={props.name} showCase={props.showCase} />}
    </div>
  );
}
