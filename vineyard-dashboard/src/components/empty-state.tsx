import type { ReactNode } from "react";

export type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <section className="vineyard-empty-state">
      <div className="vineyard-empty-state__orb" aria-hidden="true" />
      <div className="vineyard-empty-state__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M12 3C8.13 3 5 6.13 5 10c0 5.25 7 11 7 11s7-5.75 7-11c0-3.87-3.13-7-7-7Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M9 10.2 11.1 12.3 15.5 7.9"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="vineyard-empty-state__content">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {action ? <div className="vineyard-empty-state__action">{action}</div> : null}
    </section>
  );
}
