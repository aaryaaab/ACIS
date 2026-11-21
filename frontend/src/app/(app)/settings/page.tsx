"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { AsyncPanel, Panel } from "@/components/panels";
import { Button, Chip, EmptyState, Modal, Notice, PageHeader, TextField } from "@/components/ui";
import { ApiError, downloadJson } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { acis } from "@/lib/endpoints";
import { formatDate } from "@/lib/format";
import { useAsync } from "@/lib/useAsync";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const consent = useAsync(() => acis.research.consent(), []);
  const mentor = useAsync(() => acis.mentor.status(), []);
  const log = useAsync(() => acis.research.log(30), []);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dl, setDl] = useState(false);
  const [del, setDel] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setSaving(true); setMsg(null);
    try { const r = await acis.research.setConsent(next); consent.setData(r); setMsg({ tone: "success", text: r.research_consent ? "Thank you. Your anonymised data can now be used in the research evaluation." : "Done. Your data is no longer included in research exports." }); }
    catch (e) { setMsg({ tone: "error", text: e instanceof ApiError ? e.message : "Could not save your choice." }); }
    finally { setSaving(false); }
  }
  async function download() {
    setDl(true); setMsg(null);
    try { await downloadJson("/research/my-data", "acis-my-data.json"); setMsg({ tone: "success", text: "Your data has been downloaded." }); }
    catch (e) { setMsg({ tone: "error", text: e instanceof ApiError ? e.message : "Could not download your data." }); }
    finally { setDl(false); }
  }
  async function deleteAccount() {
    setDelBusy(true); setDelErr(null);
    try { await acis.profile.remove(); logout(); router.replace("/"); }
    catch (e) { setDelErr(e instanceof ApiError ? e.message : "Could not delete your account."); setDelBusy(false); }
  }

  return (
    <div>
      <PageHeader eyebrow="You" title="Settings" description="Your account, your privacy and your data. You decide what ACIS keeps." />
      {msg && <Notice tone={msg.tone} className="mb-5">{msg.text}</Notice>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Account">
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-sm"><dt className="text-ink-faint">Name</dt><dd className="font-medium">{user?.full_name || "Not set"}</dd><dt className="text-ink-faint">Email</dt><dd className="break-all font-medium">{user?.email}</dd></dl>
          <Button variant="secondary" className="mt-4" onClick={() => { logout(); router.replace("/"); }}>Sign out</Button>
        </Panel>

        <Panel title="AI Mentor" aside={mentor.data && <Chip tone={mentor.data.mode === "llm" ? "ok" : "neutral"}>{mentor.data.mode === "llm" ? "Language model connected" : "Built-in rules"}</Chip>}>
          <AsyncPanel state={mentor} rows={1}>{(s) => <p className="text-sm leading-relaxed text-ink-soft">{s.mode === "llm" ? "Your mentor's replies are written by a connected language model, using only your own saved data." : s.note} The mentor never needs a paid service to work.</p>}</AsyncPanel>
        </Panel>

        <Panel title="Research" aside={<ShieldCheck className="h-4 w-4 text-ok" aria-hidden />}>
          <p className="mb-4 text-sm leading-relaxed text-ink-soft">ACIS is part of an academic project. If you agree, your <strong>anonymised</strong> recommendations and feedback can be included in the evaluation. Names, emails, journals, reflections, comments and chats are never included. It is off by default and you can change your mind at any time.</p>
          <AsyncPanel state={consent} rows={1}>{(c) => (
            <label className="flex items-center gap-3 text-sm font-medium">
              <input type="checkbox" checked={c.research_consent} disabled={saving} onChange={(e) => toggle(e.target.checked)} className="h-4 w-4 accent-[#26418F]" />
              Include my anonymised data in research
            </label>
          )}</AsyncPanel>
        </Panel>

        <Panel title="Your data">
          <p className="mb-4 text-sm leading-relaxed text-ink-soft">Download everything ACIS stores about you as a single file, including your journal, memories, conversations and recommendations.</p>
          <Button variant="secondary" onClick={download} loading={dl}><Download className="h-4 w-4" aria-hidden />Download my data</Button>
          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-3 text-sm leading-relaxed text-ink-soft">Deleting your account permanently removes your profile, assessments, journal, memories, roadmaps and conversations. It cannot be undone.</p>
            <Button variant="danger" onClick={() => { setDel(true); setConfirmText(""); setDelErr(null); }}>Delete my account</Button>
          </div>
        </Panel>
      </div>

      <Panel title="Why did ACIS suggest that?" className="mt-5" aside={<span className="text-ink-faint">Your recommendation log</span>}>
        <p className="mb-4 text-sm text-ink-soft">Every suggestion ACIS makes is recorded with the reason, how confident it was, and which version of the rules produced it.</p>
        <AsyncPanel state={log} rows={2}>{(rows) => rows.length === 0 ? <EmptyState title="Nothing logged yet" description="Suggestions appear here after you complete the assessment." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">
            <thead><tr className="border-b border-line text-xs uppercase tracking-wider text-ink-faint"><th className="py-2 pr-3 font-semibold">When</th><th className="py-2 pr-3 font-semibold">Suggestion</th><th className="py-2 pr-3 font-semibold">Confidence</th><th className="py-2 pr-3 font-semibold">Reason</th><th className="py-2 font-semibold">Your feedback</th></tr></thead>
            <tbody className="divide-y divide-line align-top">{rows.map((r) => (
              <tr key={r.id}><td className="whitespace-nowrap py-2.5 pr-3 text-ink-faint">{formatDate(r.created_at)}</td>
                <td className="py-2.5 pr-3 font-medium">{r.target}<span className="block text-xs font-normal text-ink-faint">{r.kind}</span></td>
                <td className="py-2.5 pr-3 capitalize">{r.confidence || "n/a"}</td>
                <td className="max-w-md py-2.5 pr-3 text-ink-soft">{r.why}<span className="mt-1 block text-xs text-ink-faint">Rules {r.algorithm_version} · {r.model_version}</span></td>
                <td className="py-2.5 text-ink-soft">{r.feedback.length ? r.feedback.map((f) => (f.helpful ? "Helpful" : "Not helpful")).join(", ") : "None"}</td></tr>
            ))}</tbody></table></div>
        )}</AsyncPanel>
      </Panel>

      <Modal open={del} onClose={() => setDel(false)} title="Delete your account?">
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-ink-soft">This permanently deletes all your data. Type <strong className="text-ink">DELETE</strong> to confirm.</p>
          <TextField label="Confirmation" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          {delErr && <Notice tone="error">{delErr}</Notice>}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDel(false)}>Cancel</Button><Button variant="danger" disabled={confirmText !== "DELETE"} loading={delBusy} onClick={deleteAccount}>Delete everything</Button></div>
        </div>
      </Modal>
    </div>
  );
}
