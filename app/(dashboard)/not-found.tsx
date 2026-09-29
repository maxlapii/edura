import { EmptyState, LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-16">
      <EmptyState title="Not found" description="The page or record you are looking for does not exist or you do not have access to it." action={<LinkButton href="/dashboard">Back to dashboard</LinkButton>} />
    </div>
  );
}
