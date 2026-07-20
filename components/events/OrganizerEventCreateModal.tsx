"use client";

import { CalendarPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import AnimatedModal from "@/components/AnimatedModal";
import OrganizerEventEditor from "@/components/events/OrganizerEventEditor";

type OrganizerEventCreateModalProps = {
  event: Record<string, unknown>;
};

export default function OrganizerEventCreateModal({
  event,
}: OrganizerEventCreateModalProps) {
  const router = useRouter();

  function closeModal() {
    router.replace("/organizer/events");
  }

  return (
    <AnimatedModal
      onClose={closeModal}
      panelClassName="max-w-5xl"
      labelledBy="create-event-modal-title"
    >
      {({ requestClose }) => (
        <>
          <div className="vaivia-modal-header flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-lime-300/20 bg-lime-300/10 text-lime-200">
                <CalendarPlus className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="vaivia-modal-eyebrow">Organizer studio</p>
                <h1 id="create-event-modal-title" className="vaivia-modal-title">
                  Add event
                </h1>
                <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-300">
                  Create the event as a draft, then add tickets and publish it when
                  everything is ready.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={requestClose}
              className="vaivia-modal-close"
              aria-label="Close add event modal"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <OrganizerEventEditor
            event={event}
            modal
            onCancel={requestClose}
          />
        </>
      )}
    </AnimatedModal>
  );
}
