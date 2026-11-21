"use client";
import { useState } from "react";
import { ExternalLink, Newspaper } from "lucide-react";
import { AsyncPanel, Panel } from "@/components/panels";
import { Card, Chip, EmptyState, PageHeader, SelectField, Tabs } from "@/components/ui";
import { acis } from "@/lib/endpoints";
import { formatDate } from "@/lib/format";
import { useAsync } from "@/lib/useAsync";

export default function IntelligencePage() {
  const [tab, setTab] = useState<"updates" | "sources">("updates");
  const [career, setCareer] = useState("");
  const careers = useAsync(() => acis.careers.list(), []);
  const updates = useAsync(() => acis.intelligence.list({ career, limit: 30 }), [career]);
  const sources = useAsync(() => acis.intelligence.sources(), []);

  return (
    <div>
      <PageHeader eyebrow="Discover" title="Career intelligence" description="Updates relevant to your directions, each with where it came from and when ACIS retrieved it. If nothing has been saved, this page says so instead of filling the gap." />
      <Tabs label="Intelligence views" value={tab} onChange={setTab} tabs={[{ id: "updates", label: "Updates" }, { id: "sources", label: "Sources" }]} />

      {tab === "updates" && (
        <div className="space-y-4">
          <SelectField label="Show updates for" value={career} onChange={(e) => setCareer(e.target.value)} placeholder="All my directions" options={(careers.data ?? []).map((c) => ({ value: c.slug, label: c.name }))} fieldClassName="max-w-sm" />
          <AsyncPanel state={updates} rows={3} label="Loading updates">
            {(d) => d.items.length === 0 ? (
              <EmptyState icon={<Newspaper className="h-8 w-8" />} title="No updates saved yet"
                description={<>{d.message || "Nothing has been saved yet."} ACIS only shows items it has actually retrieved from a named source, so this stays empty until real sources are connected.</>} />
            ) : (
              <>
                <div className="space-y-3">{d.items.map((i) => (
                  <Card as="article" key={i.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="text-lg font-semibold leading-snug">{i.title}</h3>
                      {i.stale && <Chip tone="warn">Older than 60 days</Chip>}
                    </div>
                    {i.summary && <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{i.summary}</p>}
                    <p className="mt-3 text-xs text-ink-faint"><strong className="text-ink-soft">{i.source?.name ?? "Unknown source"}</strong> · retrieved {formatDate(i.retrieved_on)}{i.source?.licence ? ` · ${i.source.licence}` : ""}</p>
                    <p className="mt-1 text-xs text-career-ink">{i.why_shown}</p>
                    <a href={i.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-career hover:underline">Read at the source <ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>
                  </Card>
                ))}</div>
                <p className="text-xs text-ink-faint">{d.note}</p>
              </>
            )}
          </AsyncPanel>
        </div>
      )}

      {tab === "sources" && (
        <Panel title="Where ACIS gets its information">
          <p className="mb-4 text-sm text-ink-soft">Every source behind the careers, skills, resources and updates, with its licence and when it was last verified. “Not verified yet” means exactly that.</p>
          <AsyncPanel state={sources} rows={3}>{(rows) => (
            <ul className="divide-y divide-line">{rows.map((s) => (
              <li key={s.name} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-career hover:underline">{s.name}</a> : s.name}</p>
                  <Chip tone={s.last_verified ? "ok" : "warn"}>{s.last_verified ? `Verified ${formatDate(s.last_verified)}` : "Not verified yet"}</Chip></div>
                <p className="mt-1 text-sm text-ink-soft">{s.attribution}</p>
                {s.licence && <p className="text-xs text-ink-faint">Licence: {s.licence}</p>}
              </li>
            ))}</ul>
          )}</AsyncPanel>
        </Panel>
      )}
    </div>
  );
}
