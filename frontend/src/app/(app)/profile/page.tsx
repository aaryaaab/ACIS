"use client";
import { useState } from "react";
import { MemoryManager } from "@/components/MemoryManager";
import { AsyncPanel, LearningStyleBars, Panel } from "@/components/panels";
import { ModelTag } from "@/components/domain";
import { ButtonLink, Chip, ErrorState, LoadingBlock, PageHeader, Tabs } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { acis } from "@/lib/endpoints";
import { educationLabel, humanize, STAGES } from "@/lib/format";
import { useAsync } from "@/lib/useAsync";

const LIFESTYLE: Record<string, string> = { team: "Works well with a team", solo: "Prefers working alone", mixed: "A mix of both", office: "Office or lab", remote: "Work from anywhere", field: "Out in the field",
  stability: "Values stability", growth: "Values fast growth", impact: "Values impact", creativity: "Values creative freedom" };
const MONEY: Record<string, string> = { budget_limited: "Budget is limited", moderate: "Moderate budget", flexible: "Flexible budget" };

export default function ProfilePage() {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState<"about" | "memory">("about");
  const style = useAsync(() => acis.learning.preferences(), []);
  const full = useAsync(() => acis.profile.get(), []);
  const details = full.data?.profile ?? profile;

  return (
    <div>
      <PageHeader eyebrow="You" title="Profile & memory" description="What you told ACIS, how it thinks you learn, and everything it remembers. You are always in control of it."
        actions={<ButtonLink href="/onboarding?edit=1" variant="secondary">Edit details</ButtonLink>} />
      <Tabs label="Profile sections" value={tab} onChange={setTab} tabs={[{ id: "about", label: "About you" }, { id: "memory", label: "What ACIS remembers" }]} />

      {tab === "about" && (full.loading && !details ? <LoadingBlock rows={3} /> : full.error && !details ? <ErrorState error={full.error} onRetry={full.reload} /> : details && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Your details">
            <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5 text-sm">
              <dt className="text-ink-faint">Name</dt><dd className="font-medium">{user?.full_name || "Not set"}</dd>
              <dt className="text-ink-faint">Email</dt><dd className="break-all font-medium">{user?.email}</dd>
              <dt className="text-ink-faint">Class or year</dt><dd className="font-medium">{educationLabel(details.education_level)}</dd>
              <dt className="text-ink-faint">Stage</dt><dd className="font-medium">{STAGES.find((s) => s.key === details.stage)?.label}</dd>
              {details.institution && <><dt className="text-ink-faint">School or college</dt><dd className="font-medium">{details.institution}</dd></>}
              {details.city && <><dt className="text-ink-faint">City</dt><dd className="font-medium">{details.city}</dd></>}
            </dl>
            {details.long_term_goal && <div className="mt-4 border-t border-line pt-4"><p className="eyebrow mb-1">Your long-term goal</p><p className="text-sm leading-relaxed text-ink-soft">{details.long_term_goal}</p></div>}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {Object.values(details.lifestyle ?? {}).map((v) => <Chip key={v}>{LIFESTYLE[v] ?? humanize(v)}</Chip>)}
              {details.financial_context && <Chip>{MONEY[details.financial_context] ?? humanize(details.financial_context)}</Chip>}
              {details.is_minor && <Chip tone="growth">Under 18, with guardian consent</Chip>}
            </div>
          </Panel>

          <Panel title="Your marks">
            {details.academics && details.academics.length > 0 ? (
              <ul className="divide-y divide-line text-sm">{details.academics.map((a) => <li key={a.subject} className="flex justify-between py-2"><span>{a.subject}</span><span className="font-semibold">{a.score_percent}%</span></li>)}</ul>
            ) : <p className="text-sm text-ink-soft">No marks added. They are optional, and you can add them by editing your details.</p>}
          </Panel>

          <Panel title={<ModelTag model="learning" />} className="lg:col-span-2" aside={<ButtonLink href="/resources" variant="ghost">Resources for you</ButtonLink>}>
            <p className="mb-4 text-sm text-ink-soft">This comes from what you finish, abandon and rate. It changes only how ACIS teaches you, never which careers fit you.</p>
            <AsyncPanel state={style} rows={3}>{(s) => <div className="grid gap-x-10 gap-y-3 sm:grid-cols-2"><LearningStyleBars style={s} /></div>}</AsyncPanel>
          </Panel>
        </div>
      ))}

      {tab === "memory" && <MemoryManager />}
    </div>
  );
}
