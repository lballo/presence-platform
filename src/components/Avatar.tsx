type Person = { name?: string; initials: string; photoUrl?: string | null };

export function Avatar({ m, size = 44, className = "" }: { m: Person; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (m.photoUrl) return <img src={m.photoUrl} alt="" className={`p-avatar ${className}`} style={style} />;
  return <span className={`p-initials ${className}`} style={style}>{m.initials}</span>;
}

/** Petite pile de visages qui se chevauchent. */
export function Faces({ list, size = 30 }: { list: Person[]; size?: number }) {
  return (
    <span className="flex pl-1.5">
      {list.map((m, i) => (
        <span key={i} className="-ml-1.5 rounded-full border-2" style={{ borderColor: "var(--p-surface)" }}>
          <Avatar m={m} size={size} />
        </span>
      ))}
    </span>
  );
}
