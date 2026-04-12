import type { FormHTMLAttributes } from "react";

export type CreateVineyardFormProps = {
  action?: FormHTMLAttributes<HTMLFormElement>["action"];
  submitLabel?: string;
  defaultValues?: {
    name?: string;
    owner?: string;
    altitude?: string | number;
    latitude?: string | number;
    longitude?: string | number;
  };
  className?: string;
};

export function CreateVineyardForm({
  action,
  submitLabel = "Create vineyard",
  defaultValues,
  className = "",
}: CreateVineyardFormProps) {
  return (
    <section className={`vineyard-card vineyard-create-form ${className}`.trim()}>
      <div className="vineyard-card__header">
        <div>
          <p className="vineyard-eyebrow">New vineyard</p>
          <h2>Create a vineyard record</h2>
        </div>
        <p className="vineyard-card__meta">
          Register vineyard metadata before zones start publishing measurements.
        </p>
      </div>

      <form className="vineyard-form" action={action} method="post">
        <div className="vineyard-form__grid">
          <label className="vineyard-field">
            <span>Name</span>
            <input
              name="name"
              type="text"
              placeholder="Collina Sud"
              defaultValue={defaultValues?.name}
              required
            />
          </label>
          <label className="vineyard-field">
            <span>Owner</span>
            <input
              name="owner"
              type="text"
              placeholder="Azienda Agricola Rossi"
              defaultValue={defaultValues?.owner}
              required
            />
          </label>
          <label className="vineyard-field">
            <span>Altitude</span>
            <input
              name="altitude"
              type="number"
              step="0.1"
              placeholder="210"
              defaultValue={defaultValues?.altitude}
              required
            />
          </label>
          <label className="vineyard-field">
            <span>Latitude</span>
            <input
              name="latitude"
              type="number"
              step="0.000001"
              placeholder="45.123456"
              defaultValue={defaultValues?.latitude}
              required
            />
          </label>
          <label className="vineyard-field vineyard-field--full">
            <span>Longitude</span>
            <input
              name="longitude"
              type="number"
              step="0.000001"
              placeholder="11.123456"
              defaultValue={defaultValues?.longitude}
              required
            />
          </label>
        </div>

        <div className="vineyard-form__footer">
          <p className="vineyard-form__hint">
            Keep precise coordinates to correctly associate zone data.
          </p>
          <button className="vineyard-button" type="submit">
            {submitLabel}
          </button>
        </div>
      </form>
    </section>
  );
}
