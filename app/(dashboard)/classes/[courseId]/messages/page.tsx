import { requireCurrentUser } from "@/lib/auth/session";
import { getCourse } from "@/modules/classes";
import { EmptyState, LinkButton } from "@/components/ui";
import { ServiceError } from "../../../_components/service-error";
import { load } from "../../../_lib/load";
import { CourseHub } from "../../_components/course-hub";

export const dynamic = "force-dynamic";

export default async function CourseMessagesPage(props: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await props.params;
  const user = await requireCurrentUser();
  const result = await load(() => getCourse(user, courseId));
  if (!result.ok) return <ServiceError error={result.error} />;
  const course = result.data;

  return (
    <div>
      <CourseHub course={course} tab="messages" />
      <EmptyState
        title="Class messages"
        description={`Send an announcement or message to everyone in ${course.class.name}, or review the conversation history in your inbox.`}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <LinkButton href={`/messages/new?classId=${course.classId}`} data-testid="new-class-message">
              Message the class
            </LinkButton>
            <LinkButton href="/messages" variant="outline">
              Open inbox
            </LinkButton>
          </div>
        }
      />
    </div>
  );
}
