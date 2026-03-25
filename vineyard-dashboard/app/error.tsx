"use client";

type DashboardErrorPageProps = {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
};

export default function DashboardErrorPage({ error, reset }: DashboardErrorPageProps) {
  return (
    <main className="page-shell">
      <section className="empty-panel">
        <p className="eyebrow">Errore dashboard</p>
        <h1>Impossibile leggere i dati del database</h1>
        <p className="hero-text">
          Verifica che PostgreSQL sia raggiungibile e che le variabili d&apos;ambiente della
          dashboard siano corrette.
        </p>
        <p className="hero-text">{error.message}</p>
        <button className="vineyard-button" type="button" onClick={reset}>
          Riprova
        </button>
      </section>
    </main>
  );
}
