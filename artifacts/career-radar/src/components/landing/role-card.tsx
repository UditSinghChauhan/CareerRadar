import { initials, type SampleRole } from "./sample-roles";

/** A company's monogram on a soft tint. Never a real logo. */
export function Monogram({
  role,
  size = "md",
}: {
  role: Pick<SampleRole, "company" | "tint">;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={`lp-mono-tile lp-mono-tile--${size}`}
      data-tint={role.tint}
      aria-hidden="true"
    >
      {initials(role.company)}
    </span>
  );
}

/** The rank of one of the day's ten: ink on pale lime; full lime on rank 1 only. */
export function RankTag({ rank }: { rank: number }) {
  return (
    <span
      className={rank === 1 ? "lp-rank lp-rank--top" : "lp-rank"}
      aria-label={`Rank ${rank}`}
    >
      {rank}
    </span>
  );
}

/** A small white sample job card, as it floats in the hero's field. */
export function RoleCard({ role }: { role: SampleRole }) {
  return (
    <div className="lp-card lp-rolecard">
      <Monogram role={role} />
      <div className="lp-rolecard__text">
        <p className="lp-rolecard__title">{role.title}</p>
        <p className="lp-rolecard__meta">
          {role.company}
          <span className="lp-rolecard__city"> · {role.city}</span>
        </p>
      </div>
      {role.rank > 0 && <RankTag rank={role.rank} />}
    </div>
  );
}
