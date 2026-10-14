/** Board DS "iD" monogram. The 16 px master thickens strokes from 7 to 8 units so the D's counter stays open. */
const PATH_16 = "M13 25h8v24h-8zM13 14h8v8h-8zM25 14h10a17.5 17.5 0 0 1 0 35H25zM33 22h2a9.5 9.5 0 0 1 0 19h-2z";
const PATH = "M14 26h7v23h-7zM14 15h7v7h-7zM26 15h9a17 17 0 0 1 0 34h-9zM33 22h2a10 10 0 0 1 0 20h-2z";

export default function BrandIcon({ size }: { size: 16 | 24 | 32 | 64 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" fill="var(--brand-mark)" />
      <path fill="var(--on-brand-mark)" fillRule="evenodd" d={size === 16 ? PATH_16 : PATH} />
    </svg>
  );
}
