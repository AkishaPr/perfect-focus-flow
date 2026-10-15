import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon, PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/focus")({
  head: () => ({
    meta: [
      { title: "Focus — A/L Command Center" },
      { name: "description", content: "Study timer with actual-duration tracking." },
      { property: "og:title", content: "Focus — A/L Command Center" },
      { property: "og:description", content: "Study timer with actual-duration tracking." },
    ],
  }),
  component: FocusPage,
});

function FocusPage() {
  return (
    <>
      <PageHeader title="Focus" subtitle="Study timer with actual-duration tracking." />
      <ComingSoon stage="stage 6" />
    </>
  );
}
