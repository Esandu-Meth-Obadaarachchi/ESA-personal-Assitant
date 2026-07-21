"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { authedFetch } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";
import styles from "./admin.module.css";

/**
 * Lune AI oversight — the "Batcomputer". Owner-only (allow-listed email) full-
 * screen monitor: user roster, workspace counts and Claude spend per operative.
 * Sits outside the (app) shell on purpose so it can own the whole viewport and
 * run as a standing background display. Enter fullscreen; ESC leaves it.
 *
 * Data comes from /api/admin/stats (admin-gated server-side too — the client
 * checks are UX only). Auto-refreshes every 30s so it stays live when idle.
 */

const REFRESH_MS = 30_000;

interface UserRow {
  uid: string;
  email: string | null;
  name: string | null;
  workspaces: number;
  projects: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface Stats {
  generatedAt: number;
  totals: {
    users: number;
    workspaces: number;
    projects: number;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  users: UserRow[];
}

const BatLogo = () => (
  <svg viewBox="0 0 64 28" className={styles.bat} fill="currentColor" aria-hidden>
    <path d="M32 2c-1.8 3.4-3.6 5-6 5 .8 1.8.6 4-1 6-2.4-3-6-5-11-5 2.2 2 3 4.4 2.6 7.4C14 22 8 24 2 26c8 .4 13.6-1 17-4 .2 3 1.8 5 5 6-1-2.2-1-4.4.4-6.6 1.6 2.6 4 4 7.6 4.2 3.6-.2 6-1.6 7.6-4.2C41 23.6 41 25.8 40 28c3.2-1 4.8-3 5-6 3.4 3 9 4.4 17 4-6-2-12-4-16.6-9.6-.4-3 .4-5.4 2.6-7.4-5 0-8.6 2-11 5-1.6-2-1.8-4.2-1-6-2.4 0-4.2-1.6-6-5z" />
  </svg>
);

function fmtInt(n: number): string {
  return n.toLocaleString("en-GB");
}
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}
function fmtCost(n: number): string {
  return "$" + n.toFixed(n >= 10 ? 2 : 4);
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const rootRef = useRef<HTMLDivElement>(null);

  const admin = isAdminEmail(user?.email);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch("/api/admin/stats");
      if (!res.ok) throw new Error(`SIGNAL LOST (${res.status})`);
      setStats(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "SIGNAL LOST");
    }
  }, []);

  // Poll while admin. Live clock ticks every second regardless.
  useEffect(() => {
    if (!admin) return;
    load();
    const poll = setInterval(load, REFRESH_MS);
    return () => clearInterval(poll);
  }, [admin, load]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const goFullscreen = () => {
    rootRef.current?.requestFullscreen?.().catch(() => {});
  };

  if (loading) {
    return (
      <div className={styles.root}>
        <div className={styles.center}>
          <BatLogo />
          <h2>Authenticating…</h2>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={styles.root}>
        <div className={styles.center}>
          <BatLogo />
          <h2>Identity Required</h2>
          <p>
            This terminal is sealed. <a className={styles.link} href="/login">Sign in</a> with an
            authorised account to continue.
          </p>
        </div>
      </div>
    );
  }

  if (!admin) {
    return (
      <div className={`${styles.root} ${styles.denied}`}>
        <div className={styles.center}>
          <BatLogo />
          <h2>Access Denied</h2>
          <p>{user.email} is not cleared for the oversight terminal.</p>
        </div>
      </div>
    );
  }

  const t = stats?.totals;
  const maxCost = Math.max(1e-9, ...(stats?.users ?? []).map((u) => u.costUsd));

  return (
    <div className={styles.root} ref={rootRef}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brandRow}>
            <BatLogo />
            <div className={styles.titles}>
              <h1>Lune AI · Oversight</h1>
              <p>Secure Terminal — Clearance: Owner</p>
            </div>
          </div>
          <div className={styles.headEnd}>
            <div className={styles.clock}>
              {now.toLocaleTimeString("en-GB", { hour12: false })}
            </div>
            <div className={styles.online}>
              <span className={styles.led} />
              {error ? error : `LIVE · ${now.toLocaleDateString("en-GB")}`}
            </div>
          </div>
        </header>

        <section className={styles.stats}>
          <Tile k="Operatives" v={t ? fmtInt(t.users) : "—"} sub="registered users" />
          <Tile k="Workspaces" v={t ? fmtInt(t.workspaces) : "—"} sub="active" />
          <Tile k="Projects" v={t ? fmtInt(t.projects) : "—"} sub="tracked" />
          <Tile k="Claude Credits" v={t ? fmtCost(t.costUsd) : "—"} sub="spent to date" hot />
          <Tile k="Requests" v={t ? fmtInt(t.requests) : "—"} sub="model calls" />
          <Tile
            k="Tokens"
            v={t ? fmtTokens(t.inputTokens + t.outputTokens) : "—"}
            sub="in + out"
          />
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <span>Operatives · Credit Consumption</span>
            <span>{stats ? `${stats.users.length} tracked` : "syncing…"}</span>
          </div>
          <div className={styles.rows}>
            {stats && stats.users.length === 0 && (
              <div className={styles.empty}>NO USAGE RECORDED YET — TRACKING BEGINS AT DEPLOY</div>
            )}
            {(stats?.users ?? []).map((u, i) => (
              <div className={styles.row} key={u.uid}>
                <div className={styles.rank}>{String(i + 1).padStart(2, "0")}</div>
                <div className={styles.who}>
                  <div className={styles.whoName}>{u.name || u.email || u.uid.slice(0, 8)}</div>
                  <div className={styles.whoMail}>{u.email || u.uid}</div>
                </div>
                <div className={styles.metric}>
                  <div className={styles.mv}>{fmtInt(u.workspaces)}</div>
                  <div className={styles.ml}>Workspaces</div>
                </div>
                <div className={styles.metric}>
                  <div className={styles.mv}>{fmtInt(u.requests)}</div>
                  <div className={styles.ml}>Requests</div>
                </div>
                <div className={styles.cost}>
                  <div className={styles.costRow}>
                    <div className={styles.bar}>
                      <div
                        className={styles.barFill}
                        style={{ width: `${Math.max(3, (u.costUsd / maxCost) * 100)}%` }}
                      />
                    </div>
                    <div className={styles.costNum}>{fmtCost(u.costUsd)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer className={styles.footer}>
          <span>
            {stats
              ? `LAST SYNC ${new Date(stats.generatedAt).toLocaleTimeString("en-GB", { hour12: false })} · AUTO-REFRESH 30s`
              : "ESTABLISHING UPLINK…"}
          </span>
          <button className={styles.btn} onClick={goFullscreen}>
            Engage Fullscreen · ESC to exit
          </button>
        </footer>
      </div>
    </div>
  );
}

function Tile({
  k,
  v,
  sub,
  hot,
}: {
  k: string;
  v: string;
  sub: string;
  hot?: boolean;
}) {
  return (
    <div className={`${styles.tile} ${hot ? styles.tileHot : ""}`}>
      <div className={styles.k}>{k}</div>
      <div className={styles.v}>{v}</div>
      <div className={styles.sub}>{sub}</div>
    </div>
  );
}
