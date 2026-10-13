/** §3.4 Kbd: the key printed on the control it triggers. */
export default function Kbd({ keys }: { keys: string }) {
  return <span className="kbd">{keys}</span>;
}
