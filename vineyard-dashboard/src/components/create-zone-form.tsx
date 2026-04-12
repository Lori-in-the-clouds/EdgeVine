import type { FormHTMLAttributes } from "react";

export type CreateZoneFormProps = {
  action?: FormHTMLAttributes<HTMLFormElement>["action"];
  vineyardName: string;
  defaultNumber?: number;
  className?: string;
};

export function CreateZoneForm({
  action,
  vineyardName,
  defaultNumber = 1,
  className = ""
}: CreateZoneFormProps) {
  return (
    <section className={`vineyard-card vineyard-create-form ${className}`.trim()}>
      <div className="vineyard-card__header">
        <div>
          <p className="vineyard-eyebrow">New zone</p>
          <h2>Add zone to vineyard</h2>
        </div>
        <p className="vineyard-card__meta">
          Create a zone manually for <strong>{vineyardName}</strong> before it starts
          receiving MQTT measurements.
        </p>
      </div>

      <form className="vineyard-form" action={action} method="post">
        <div className="vineyard-form__grid vineyard-form__grid--single">
          <label className="vineyard-field">
            <span>Zone number</span>
            <input
              name="number"
              type="number"
              min="1"
              step="1"
              placeholder="1"
              defaultValue={defaultNumber}
              required
            />
          </label>
        </div>

        <div className="vineyard-form__footer">
          <p className="vineyard-form__hint">
            The number must be unique within the vineyard.
          </p>
          <button className="vineyard-button" type="submit">
            Create zone
          </button>
        </div>
      </form>
    </section>
  );
}
