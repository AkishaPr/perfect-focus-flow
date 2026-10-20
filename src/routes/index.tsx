import { createFileRoute } from "@tanstack/react-router";
import { Today } from "@/components/Today";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Today — Mission UCSC" },
      { name: "description", content: "Fixed events, today's plan and your next task." },
      { property: "og:title", content: "Today — Mission UCSC" },
      { property: "og:description", content: "Fixed events, today's plan and your next task." },
    ],
  }),
  component: Today,
});
