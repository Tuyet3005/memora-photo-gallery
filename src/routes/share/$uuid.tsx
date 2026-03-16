import { useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { ImageCarousel } from "#/components/ImageCarousel";
import { useTRPC } from "#/integrations/trpc/react";

export const Route = createFileRoute("/share/$uuid")({
  component: SharePage,
});

function SharePage() {
  const { uuid } = Route.useParams();
  const trpc = useTRPC();

  const { data: shareInfo, isLoading } = useQuery({
    ...trpc.share.getShareInfo.queryOptions({ shareId: uuid }),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center">
        <img src="/loading.gif" alt="Loading…" className="w-[60%] max-w-52" />
      </div>
    );
  }

  if (!shareInfo) {
    throw notFound();
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mb-6 font-bold text-(--sea-ink) text-3xl">
        Shared gallery
      </h1>
      <ImageCarousel shareId={uuid} readOnly />
    </main>
  );
}
