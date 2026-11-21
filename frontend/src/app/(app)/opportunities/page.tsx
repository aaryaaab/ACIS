"use client";
import { useState } from "react";
import { Briefcase, ExternalLink } from "lucide-react";
import { AsyncPanel } from "@/components/panels";
import { Card, Chip, EmptyState, Notice, PageHeader, SelectField } from "@/components/ui";
import { cn } from "@/lib/cn";
import { acis } from "@/lib/endpoints";
import { formatDate, humanize } from "@/lib/format";
import type { Opportunity } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";

const KINDS = [{ value: "internship", label: "Internships" }, { value: "scholarship", label: "Scholarships" }, { value: "hackathon", label: "Hackathons" }, { value: "research", label: "Research" }];

function deadlineText(o: Opportunity) {
  if (o.status === "no_deadline_listed") return { text: "No deadline listed", tone: "neutral" as const };
  if (o.status === "closed") return { text: `Closed on ${formatDate(o.deadline)}`, tone: "danger" as const };
  const d = o.days_left ?? 0;
  return { text: `Deadline ${formatDate(o.deadline)} · ${d === 0 ? "today" : `${d} day${d === 1 ? "" : "s"} left`}`, tone: d <= 7 ? ("warn" as const) : ("ok" as const) };
}

export default function OpportunitiesPage() {
  const [kind, setKind] = useState("");
  const [career, setCareer] = useState("");
  const [closed, setClosed] = useState(false);
  const careers = useAsync(() => acis.careers.list(), []);
  const state = useAsync(() => acis.opportunities.list({ kind, career, include_closed: closed, limit: 50 }), [kind, career, closed]);

  return (
    <div>
      <PageHeader eyebrow="Discover" title="Opportunities" description="Internships, scholarships, hackathons and research openings. ACIS lists only what has a source link and a verification date, and never invents an opportunity or a deadline." />
      <Card className="mb-5 grid gap-4 p-4 sm:grid-cols-3">
        <SelectField label="Type" value={kind} onChange={(e) => setKind(e.target.value)} placeholder="All types" options={KINDS} />
        <SelectField label="Related career" value={career} onChange={(e) => setCareer(e.target.value)} placeholder="All careers" options={(careers.data ?? []).map((c) => ({ value: c.slug, label: c.name }))} />
        <label className="flex items-end gap-2.5 pb-2 text-sm font-medium"><input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} className="h-4 w-4 accent-[#26418F]" />Include closed ones</label>
      </Card>

      <AsyncPanel state={state} rows={3} label="Loading opportunities">
        {(d) => d.items.length === 0 ? (
          <EmptyState icon={<Briefcase className="h-8 w-8" />} title="No verified opportunities saved yet"
            description={<>{kind || career ? "Nothing matches these filters. Try clearing them." : d.message}{" "}Until real listings are added, the best places to look are the official websites of colleges, companies and government schemes, and your school or college counsellor.</>} />
        ) : (
          <>
            <div className="space-y-3">{d.items.map((o) => {
              const dl = deadlineText(o);
              return (
                <Card as="article" key={o.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><div className="mb-1 flex flex-wrap gap-1.5"><Chip tone="career">{humanize(o.kind)}</Chip>{o.career_slugs.slice(0, 2).map((c) => <Chip key={c}>{humanize(c)}</Chip>)}</div>
                      <h3 className="text-xl font-semibold leading-snug">{o.title}</h3><p className="text-sm text-ink-soft">{o.provider}</p></div>
                    <Chip tone={dl.tone}>{dl.text}</Chip>
                  </div>
                  <div className="mt-3 rounded-md bg-paper px-3.5 py-2.5 text-sm"><span className="font-semibold">Who can apply: </span><span className="text-ink-soft">{o.eligibility || "Not listed. Check the provider's page."}</span></div>
                  <div className={cn("mt-3 text-xs", o.needs_reverification ? "text-growth-ink" : "text-ink-faint")}>{o.verification_note}{o.needs_reverification && o.verified_on ? " It may be out of date." : ""}</div>
                  <a href={o.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-career hover:underline">Open the official page <ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>
                </Card>
              );
            })}</div>
            <Notice tone="info" className="mt-5">{d.note}</Notice>
          </>
        )}
      </AsyncPanel>
    </div>
  );
}
