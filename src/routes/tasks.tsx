import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon, PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks — A/L Command Center" },
      { name: "description", content: "Homework, papers, revision, chapters and recordings." },
      { property: "og:title", content: "Tasks — A/L Command Center" },
      { property: "og:description", content: "Homework, papers, revision, chapters and recordings." },
    ],
  }),
  component: TasksPage,
});

function TasksPage() {
  return (
    <>
      <PageHeader title="Tasks" subtitle="Homework, papers, revision, chapters and recordings." />
      <ComingSoon stage="stage 3" />
    </>
  );
}
