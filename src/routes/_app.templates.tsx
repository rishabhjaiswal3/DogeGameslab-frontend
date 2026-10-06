import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/studio/PageHeader";
import { VirtualGrid, type GridBreakpoints } from "@/components/studio/VirtualGrid";
import { templateEmoji, engineOf, getThumbnailUrl } from "@/lib/studio-meta";
import { useStudioContext } from "@/context/StudioContext";
import { useGameTemplates } from "@/hooks/useGameTemplates";
import { TemplatesGridSkeleton } from "@/components/studio/PageSkeletons";
import { clearReelSession } from "@/lib/reelFeed";
import { PixelIcon, type PixelIconName } from "@/components/term/PixelIcon";
import { Btn, EmptyState, Tag } from "@/components/term/Term";
import { categoryTone } from "@/components/term/tones";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/templates")({
  pendingComponent: TemplatesGridSkeleton,
  head: () => ({
    meta: [
      { title: "Templates — Creator Studio" },
      {
        name: "description",
        content: "Start from a ready-made game template and remix it with a prompt.",
      },
    ],
  }),
  component: Templates,
});

const engines: {
  id: "threejs" | "construct";
  label: string;
  description: string;
  icon: PixelIconName;
}[] = [
  { id: "threejs", label: "3D Games", description: "Explore immersive worlds", icon: "templates" },
  { id: "construct", label: "Quick Games", description: "Jump in and play", icon: "bolt" },
];

/** The template fields this page renders. */
type TemplateCard = { id: string; name: string; category: string; mechanic: string };

// Mirrors the Tailwind grid this page used: 2 columns, md:3, xl:4.
const TEMPLATE_COLUMNS: GridBreakpoints = [
  [0, 2],
  [768, 3],
  [1280, 4],
];

function Templates() {
  const { studio, openInStudio } = useStudioContext();
  const navigate = useNavigate();
  const { gameTemplates, loading } = useGameTemplates();
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(() => new Set());
  const list = useMemo(
    () =>
      gameTemplates.filter((t: any) => engineOf(t) === studio.engine) as unknown as TemplateCard[],
    [gameTemplates, studio.engine],
  );

  const markImageFailed = (templateId: string) => {
    setFailedImageIds((current) => {
      if (current.has(templateId)) return current;
      const next = new Set(current);
      next.add(templateId);
      return next;
    });
  };

  if (loading) return <TemplatesGridSkeleton />;

  return (
    <div className="relative">
      <PageHeader
        command="ls ~/cartridges"
        title="TEMPLATES"
        subtitle="Choose a world, make it yours, and start playing."
      />

      <div className="px-4 pb-10 pt-3 sm:px-6 lg:px-8">
        <div
          role="tablist"
          aria-label="Game style"
          className="flex w-full gap-0 border-b-2 border-line sm:w-auto"
        >
          {engines.map((e) => {
            const active = studio.engine === e.id;
            return (
              <button
                key={e.id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => studio.setEngine(e.id)}
                className={cn(
                  "-mb-[2px] flex flex-1 items-center gap-3 border-2 px-4 py-2.5 text-left transition-colors sm:flex-none",
                  active
                    ? "border-phos border-b-ink-1 bg-ink-1 text-phos"
                    : "border-transparent text-text-3 hover:text-text",
                )}
              >
                <PixelIcon name={e.icon} size={16} />
                <span>
                  <span className="block font-mono text-[12px] font-extrabold uppercase tracking-[0.1em]">
                    {e.label}
                  </span>
                  <span className="block text-[10px] text-text-3">{e.description}</span>
                </span>
              </button>
            );
          })}
          <span className="ml-auto hidden self-center font-mono text-[11px] text-text-3 sm:inline">
            {list.length} cartridges
          </span>
        </div>

        {list.length === 0 ? (
          <EmptyState className="mt-6" text="No templates for this style yet." />
        ) : (
          <VirtualGrid
            className="mt-6"
            items={list}
            breakpoints={TEMPLATE_COLUMNS}
            getKey={(t) => t.id}
            renderItem={(t, i, intro) => (
              <article
                className={cn(
                  "group flex flex-col border-2 border-line bg-ink-2 transition-colors hover:border-phos",
                  intro && "animate-rise",
                )}
                style={intro ? { animationDelay: `${Math.min(i, 12) * 40}ms` } : undefined}
              >
                <div className="scanlines relative aspect-[4/3] overflow-hidden border-b-2 border-line bg-ink-0 group-hover:border-phos">
                  {!failedImageIds.has(String(t.id)) ? (
                    <img
                      src={getThumbnailUrl(t.id)}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                      decoding="async"
                      onError={() => markImageFailed(String(t.id))}
                    />
                  ) : (
                    <span className="dither absolute inset-0 grid place-items-center bg-ink-3 text-5xl">
                      {templateEmoji[t.id] ?? "🎮"}
                    </span>
                  )}
                  <span className="absolute left-2 top-2 z-[3]">
                    <Tag tone={categoryTone(t.category)} className="bg-ink-0">
                      {t.category}
                    </Tag>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      clearReelSession();
                      navigate({ to: "/play", search: { gameId: t.id } });
                    }}
                    aria-label={`Play ${t.name}`}
                    className="px-btn absolute bottom-2 right-2 z-[3]"
                    data-variant="primary"
                    data-size="icon"
                  >
                    <PixelIcon name="play" size={12} />
                  </button>
                </div>
                <div className="flex flex-1 flex-col gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-mono text-[13px] font-extrabold text-text group-hover:text-phos">
                      {t.name}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-text-3">
                      {t.mechanic}
                    </p>
                  </div>
                  <Btn
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => openInStudio(t.id)}
                  >
                    Use template ›
                  </Btn>
                </div>
              </article>
            )}
          />
        )}
      </div>
    </div>
  );
}
