/** Verdict (proto L1455–1459): the call, every flag, and what's missing if steps didn't run. */
import { verdictView } from "@/lib/report/verdict";
import type { BlockProps } from "./types";

export function Verdict({ result }: BlockProps) {
  const v = verdictView(result);
  return (
    <div className={`verdict ${v.tone}`}>
      <p className="lead">{v.lead}</p>
      {v.flags.length ? (
        v.flags.map((f, i) => (
          <div key={i} className={`flag ${f.lvl}`}>
            {f.t}
          </div>
        ))
      ) : (
        <p>No flags raised.</p>
      )}
      {v.incomplete && <p className="tiny mt-2">{v.incomplete}</p>}
    </div>
  );
}
