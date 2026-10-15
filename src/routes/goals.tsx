import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon, PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/goals")({
  head: () => ({
    meta: [
      { title: "Weekly goals — A/L Command Center" },
      { name: "description", content: "Targets for papers, revision, homework and recordings." },
      { property: "og:title", content: "Weekly goals — A/L Command Center" },
      { property: "og:description", content: "Targets for papers, revision, homework and recordings." },
    ],
  }),
  component: GoalsPage,
});

function GoalsPage() {
  return (
    <>
      <PageHeader title="Weekly goals" subtitle="Targets for papers, revision, homework and recordings." />
      <ComingSoon stage="stage 3" />
    </>
  );
}
