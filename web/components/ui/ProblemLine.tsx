import { PROBLEM_REPORTED } from "@/lib/copy";
import "./ProblemLine.css";

/** §3.4 ProblemLine (D74): PROBLEM_REPORTED, right after the NOT_REVIEWED pill of a public record labelled problem. */
export default function ProblemLine() {
  return <p className="problem-line">{PROBLEM_REPORTED}</p>;
}
