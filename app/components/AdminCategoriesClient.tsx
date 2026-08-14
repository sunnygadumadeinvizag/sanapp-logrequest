"use client";

import { useCallback, useEffect, useState } from "react";
import { apiPath } from "iipe-common-ui";
import { PRIMARY_ROLE_LABELS } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";

const ALL_ROLES = ["STAFF_TEACHING", "STAFF_NON_TEACHING", "STUDENT", "SCHOLAR", "GUEST"];

type Cat = {
  id: string;
  name: string;
  description: string | null;
  allowedRoles: string[];
  active: boolean;
  subCategories: { id: string; name: string; description: string | null; pocs: { id: string; name: string }[] }[];
  pocs: { id: string; name: string; username: string }[];
};

type SsoUser = { username: string; name: string; primaryRole: string };

export function AdminCategoriesClient({ initialCategories, ssoUsers }: { initialCategories: Cat[]; ssoUsers: SsoUser[] }) {
  const [cats, setCats] = useState<Cat[]>(initialCategories);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const flash = (ok: boolean, t: string) => {
    setMsg(ok ? t : null);
    setErr(ok ? null : t);
    setTimeout(() => {
      setMsg(null);
      setErr(null);
    }, 4000);
  };

  const save = useCallback(async (id: string, patch: any) => {
    setBusy(true);
    try {
      const res = await fetch(apiPath(`/api/categories/${id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(false, d?.error ?? "Save failed");
        return;
      }
      flash(true, "Saved");
      const r = await fetch(apiPath("/api/categories"), { cache: "no-store" });
      const data = await r.json();
      setCats(data.categories);
    } finally {
      setBusy(false);
    }
  }, []);

  async function addCategory() {
    const name = prompt("New category name:");
    if (!name?.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(apiPath("/api/categories"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(false, d?.error ?? "Could not create category");
        return;
      }
      const r = await fetch(apiPath("/api/categories"), { cache: "no-store" });
      setCats((await r.json()).categories);
      flash(true, "Category created");
    } finally {
      setBusy(false);
    }
  }

  async function addSub(catId: string) {
    const name = prompt("New sub-category name:");
    if (!name?.trim()) return;
    const cat = cats.find((c) => c.id === catId);
    await save(catId, { subCategories: [...(cat?.subCategories ?? []).map((s) => ({ name: s.name, description: s.description })), { name }] });
    const r = await fetch(apiPath("/api/categories"), { cache: "no-store" });
    setCats((await r.json()).categories);
  }

  async function addPoc(catId: string, subId: string | null) {
    const username = prompt("SSO username of the POC (e.g. sanyasi):");
    if (!username?.trim()) return;
    const order = prompt("Queue order (1 = first, first come first served):") ?? "1";
    setBusy(true);
    try {
      const res = await fetch(apiPath("/api/admin/pocs"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: username.trim(), categoryId: catId, subCategoryId: subId, queueOrder: Number(order) || 1 }),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(false, d?.error ?? "Could not assign POC");
        return;
      }
      flash(true, "POC assigned");
      const r = await fetch(apiPath("/api/categories"), { cache: "no-store" });
      setCats((await r.json()).categories);
    } finally {
      setBusy(false);
    }
  }

  async function removePoc(pocId: string) {
    if (!confirm("Remove this POC assignment?")) return;
    setBusy(true);
    try {
      await fetch(apiPath(`/api/admin/pocs/${pocId}`), { method: "DELETE" });
      flash(true, "POC removed");
      const r = await fetch(apiPath("/api/categories"), { cache: "no-store" });
      setCats((await r.json()).categories);
    } finally {
      setBusy(false);
    }
  }

  function toggleRole(catId: string, role: string) {
    const cat = cats.find((c) => c.id === catId);
    if (!cat) return;
    const has = cat.allowedRoles.includes(role);
    const next = has ? cat.allowedRoles.filter((r) => r !== role) : [...cat.allowedRoles, role];
    save(catId, { allowedRoles: next });
    setCats((cs) => cs.map((c) => (c.id === catId ? { ...c, allowedRoles: next } : c)));
  }

  return (
    <div className="space-y-4">
      {(msg || err) && (
        <div className={`rounded-md border px-3 py-2 text-sm ${err ? "border-red-300 bg-red-50 text-red-700" : "border-green-300 bg-green-50 text-green-700"}`}>
          {err ?? msg}
        </div>
      )}

      <Button size="sm" onClick={addCategory} disabled={busy}>
        <Plus className="mr-1 h-4 w-4" /> Add category
      </Button>

      <div className="space-y-3">
        {cats.map((c) => {
          const open = expanded[c.id];
          return (
            <div key={c.id} className="rounded-lg border bg-card">
              <div className="flex items-center justify-between p-3">
                <div>
                  <p className="font-semibold">{c.name}</p>
                  {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setExpanded((e) => ({ ...e, [c.id]: !e[c.id] }))}>
                    {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {open && (
                <div className="space-y-3 border-t p-3">
                  {/* Who may raise */}
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">Who may raise requests</p>
                    <div className="flex flex-wrap gap-1">
                      {ALL_ROLES.map((role) => {
                        const on = c.allowedRoles.includes(role);
                        return (
                          <button
                            key={role}
                            onClick={() => toggleRole(c.id, role)}
                            className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
                          >
                            {PRIMARY_ROLE_LABELS[role] ?? role}
                          </button>
                        );
                      })}
                      <span className="ml-1 self-center text-[10px] text-muted-foreground">
                        {c.allowedRoles.length === 0 ? "(none selected = everyone)" : ""}
                      </span>
                    </div>
                  </div>

                  {/* Category POCs */}
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">Category POCs (queue order)</p>
                    <div className="space-y-1">
                      {c.pocs.map((p) => (
                        <div key={p.id} className="flex items-center justify-between rounded-md border px-2 py-1 text-sm">
                          <span>{p.name} <span className="text-xs text-muted-foreground">(@{p.username})</span></span>
                          <button onClick={() => removePoc(p.id)} className="text-muted-foreground hover:text-red-600" title="Remove POC">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={() => addPoc(c.id, null)} disabled={busy}>
                        <Plus className="mr-1 h-3 w-3" /> Assign POC
                      </Button>
                    </div>
                  </div>

                  {/* Sub-categories */}
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">Sub-categories</p>
                    <div className="space-y-1">
                      {c.subCategories.map((s) => (
                        <div key={s.id} className="rounded-md border px-2 py-1 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{s.name}</span>
                            <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={() => addPoc(c.id, s.id)} disabled={busy}>
                              <Plus className="mr-1 h-3 w-3" /> POC
                            </Button>
                          </div>
                          {s.pocs.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {s.pocs.map((p) => (
                                <span key={p.id} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                                  {p.name} ×
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={() => addSub(c.id)} disabled={busy}>
                        <Plus className="mr-1 h-3 w-3" /> Add sub-category
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {ssoUsers.length > 0 && (
        <details className="rounded-lg border bg-card p-3">
          <summary className="cursor-pointer text-sm font-semibold">Known SSO users (for POC assignment)</summary>
          <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            {ssoUsers.map((u) => (
              <span key={u.username}>{u.name} — <code>{u.username}</code> ({PRIMARY_ROLE_LABELS[u.primaryRole] ?? u.primaryRole})</span>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
