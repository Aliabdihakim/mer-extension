export function Brand({ right }: { right?: React.ReactNode }) {
  return (
    <div className="brand">
      <div className="mark">M</div>
      <h1>Meritio</h1>
      {right && <div className="acct">{right}</div>}
    </div>
  );
}
