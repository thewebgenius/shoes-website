"use client";

import dynamic from "next/dynamic";
import type { ShowroomItem } from "./showroom-scene";

const ShowroomScene = dynamic(() => import("./showroom-scene"), {
  ssr: false,
  loading: () => (
    <div className="flex size-full items-center justify-center text-sm text-white/60" role="status">
      Preparing the showroom…
    </div>
  ),
});

export function LazyShowroom(props: { items: ShowroomItem[]; title: string }) {
  return <ShowroomScene {...props} />;
}
