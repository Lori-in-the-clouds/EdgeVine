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
          <p className="vineyard-eyebrow">Nuova zona</p>
          <h2>Aggiungi zona al vineyard</h2>
        </div>
        <p className="vineyard-card__meta">
          Crea una zona manualmente per <strong>{vineyardName}</strong> prima che inizi a
          ricevere misure MQTT.
        </p>
      </div>

      <form className="vineyard-form" action={action} method="post">
        <div className="vineyard-form__grid vineyard-form__grid--single">
          <label className="vineyard-field">
            <span>Numero zona</span>
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
            Il numero deve essere univoco all&apos;interno del vineyard.
          </p>
          <button className="vineyard-button" type="submit">
            Crea zona
          </button>
        </div>
      </form>
    </section>
  );
}
