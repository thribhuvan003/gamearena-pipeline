// Card.tsx: one box with a label and a big number.

export default function Card({ label, value, note }: { label: string; value: string; note: string }) {   // Shows one total. Called by SummaryCards for each number at the top of the page
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className="card-value">{value}</div>
      <div className="card-note">{note}</div>
    </div>
  );
}
