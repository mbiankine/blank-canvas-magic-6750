import { Link, createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/app" });
  },
  loader: () => {
    throw redirect({ to: "/app" });
  },
  component: Index,
});

function Index() {
  return null;
}
