import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/history")({
  component: () => <Navigate to="/" />,
});
