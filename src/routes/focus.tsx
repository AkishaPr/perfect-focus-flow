import { createFileRoute } from "@tanstack/react-router";
import { Focus } from "@/components/Focus";

export const Route = createFileRoute("/focus")({
  head: () => ({
    meta: [
      { title: "Focus — Mission UCSC" },
      { name: "description", content: "Study timer with actual-duration tracking." },
      { property: "og:title", content: "Focus — Mission UCSC" },
      { property: "og:description", content: "Study timer with actual-duration tracking." },
    ],
  }),
  component: Focus,
});
