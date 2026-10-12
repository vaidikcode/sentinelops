import { useEffect, useState } from "react";
import { fetchIncidents, fetchResources, fetchSummary, runScenario } from "./api";
import { SCENARIOS, type Incident, type ResourceHealth, type Summary } from "./types";

const emptySummary: Summary = { total: 0, open: 0, critical: 0, autoRemediated: 0, failed: 0 };

export function App() {
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [resources, setResources] = useState<ResourceHealth[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("Local pipeline is seeded with a resolved bucket, a resolved security group, and an unknown alert.");
  const [running, setRunning] = useState<string | null>(null);

  async function reload(): Promise<void> {
    const [nextSummary, nextIncidents, nextResources] = await Promise.all([
      fetchSummary(),
      fetchIncidents(),
      fetchResources(),
    ]);
    setSummary(nextSummary);
    setIncidents(nextIncidents);
    setResources(nextResources);
    setSelectedId((current) => current ?? nextIncidents[0]?.incidentId ?? null);
  }

  useEffect(() => {
    let cancelled = false;
    reload().catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to reach the incident API");
    });
    const timer = window.setInterval(() => {
      reload().catch(() => undefined);
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const selected = incidents.find((incident) => incident.incidentId === selectedId) ?? null;

  async function onScenario(scenario: string): Promise<void> {
    setRunning(scenario);
    setError(null);
    try {
      const outcome = await runScenario(scenario);
      setNotes(outcome.notes.join(" "));
      await reload();
      const created = outcome.incidents[0];
      if (created) setSelectedId(created.incidentId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Scenario failed");
    } finally {
      setRunning(null);
    }
  }

  return (
    <main className="app">
      <header>
        <div className="brand">
          <div className="kicker">SentinelOps</div>
          <h1>Incident response</h1>
          <p>Detection, policy, remediation, verification, and the audit trail. This console reads the incident API. It does not change AWS by itself.</p>
        </div>
      </header>

      {error ? <div className="banner">{error}</div> : null}

      <section className="metrics">
        <Metric label="Incidents" value={summary.total} />
        <Metric label="Open" value={summary.open} />
        <Metric label="Critical open" value={summary.critical} tone="critical" />
        <Metric label="Auto-remediated" value={summary.autoRemediated} />
        <Metric label="Failed" value={summary.failed} tone="failed" />
      </section>

      <section className="layout">
        <div className="panel">
          <h2>Incidents</h2>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Resource</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Detected</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => (
                <tr
                  key={incident.incidentId}
                  className={incident.incidentId === selectedId ? "selected" : undefined}
                  onClick={() => setSelectedId(incident.incidentId)}
                >
                  <td className="id">{incident.incidentId}</td>
                  <td>{label(incident.type)}</td>
                  <td className="id">{incident.resourceId}</td>
                  <td><span className={`pill ${incident.severity}`}>{incident.severity}</span></td>
                  <td><span className={`pill ${incident.status}`}>{incident.status}</span></td>
                  <td>{incident.detectedAt.slice(11, 19)}Z</td>
                  <td>{label(incident.remediationAction)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h2>Timeline</h2>
          {selected ? <Detail incident={selected} /> : <p className="notes">Select an incident.</p>}
        </div>
      </section>

      <h2>Monitored resources</h2>
      <section className="resources">
        {resources.map((resource) => (
          <article key={resource.resourceId}>
            <strong>{resource.resourceId}</strong>
            <small>
              {resource.resourceType} · {resource.status} · {resource.openIncidents} open
            </small>
          </article>
        ))}
      </section>

      <h2>Controlled scenarios</h2>
      <p className="notes">{notes}</p>
      <section className="scenarios">
        {SCENARIOS.map(([id, title]) => (
          <button key={id} type="button" disabled={running !== null} onClick={() => void onScenario(id)}>
            {running === id ? "Running…" : title}
            <small>{id}</small>
          </button>
        ))}
      </section>
    </main>
  );
}

function Metric({ label: name, value, tone }: { label: string; value: number; tone?: "critical" | "failed" }) {
  return (
    <article className={tone ? `metric ${tone}` : "metric"}>
      <span>{name}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Detail({ incident }: { incident: Incident }) {
  return (
    <>
      <div className="detail-meta">
        <div>{label(incident.type)} · {incident.resourceType}</div>
        <div>Trigger: {incident.trigger}</div>
        <div>Attempts: {incident.attempts}</div>
        {incident.remediationResult ? <div>Action result: {incident.remediationResult.summary}</div> : null}
        {incident.verificationResult ? <div>Verification: {incident.verificationResult.detail}</div> : null}
        {incident.errorDetails ? <div className="error">{incident.errorDetails}</div> : null}
      </div>
      <ol className="timeline">
        {incident.timeline.map((entry, index) => (
          <li key={`${entry.at}-${index}`}>
            <time>{entry.at.slice(11, 19)}Z</time>
            <div>
              <span className={`pill ${entry.status}`}>{entry.status}</span>
              <div>{entry.message}</div>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

function label(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
}
