import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="page-shell">
      <section className="panel empty-panel">
        <p className="eyebrow">404</p>
        <h1>Vineyard non trovato</h1>
        <p className="hero-text">
          Il record richiesto non esiste o non e ancora disponibile nel database.
        </p>
        <Link className="button-link" href="/">
          Torna alla dashboard
        </Link>
      </section>
    </main>
  );
}
