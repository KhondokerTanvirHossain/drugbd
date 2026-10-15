import { execFileSync } from "node:child_process";

/* Direct database access for e2e setup and checks, through the compose `db` service (CI and local runs both start it). */
const COMPOSE = ["compose", "-f", "../deploy/docker-compose.yml", "-f", "../deploy/docker-compose.ci.yml"];
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function sql(statement: string): string {
  return execFileSync("docker", [...COMPOSE, "exec", "-T", "db", "psql", "-q", "-v", "ON_ERROR_STOP=1",
    "-U", process.env.DB_USER ?? "bddrug", "-d", "bddrug", "-At", "-c", statement], { encoding: "utf8" }).trim();
}

const item = (b: string, c: string) => `batch_id = ${lit(b)} AND concept_id = ${lit(c)}`;

export const decisions = (b: string, c: string): number =>
  Number(sql(`SELECT count(*) FROM ops.review_decision WHERE ${item(b, c)}`));

export const lastDecision = (b: string, c: string): string =>
  sql(`SELECT decision || '|' || reviewer_role || '|' || note FROM ops.review_decision WHERE ${item(b, c)} ORDER BY id DESC LIMIT 1`);

/** The pipeline re-runs one record: a new stamp and a `rerun` snapshot (append-only, so this is an insert). */
export function restamp(b: string, c: string): void {
  sql(`UPDATE ops.batch_item SET extracted_at = now() WHERE ${item(b, c)};
       INSERT INTO ops.item_snapshot (batch_id, concept_id, extracted_at, run_id, reason, payload)
       SELECT bi.batch_id, bi.concept_id, bi.extracted_at, gen_random_uuid(), 'rerun',
              (SELECT s.payload FROM ops.item_snapshot s WHERE s.batch_id = bi.batch_id AND s.concept_id = bi.concept_id
               ORDER BY s.extracted_at DESC LIMIT 1) || jsonb_build_object('extracted_at', bi.extracted_at)
       FROM ops.batch_item bi WHERE bi.batch_id = ${lit(b)} AND bi.concept_id = ${lit(c)};`);
}

export function otherReviewerApproves(b: string, c: string): void {
  sql(`INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role)
       VALUES (${lit(b)}, ${lit(c)}, 'ok', '', 'other.pharmacist@e2e.test', 'pharmacist');
       UPDATE ops.batch_item SET review = 'ok' WHERE ${item(b, c)};`);
}

export function approveAllExcept(b: string, keep: string): void {
  sql(`INSERT INTO ops.review_decision (batch_id, concept_id, decision, note, reviewer_email, reviewer_role)
       SELECT batch_id, concept_id, 'ok', '', 'other.pharmacist@e2e.test', 'pharmacist' FROM ops.batch_item
       WHERE batch_id = ${lit(b)} AND concept_id <> ${lit(keep)};
       UPDATE ops.batch_item SET review = 'ok' WHERE batch_id = ${lit(b)} AND concept_id <> ${lit(keep)};`);
}

export const insertFlag = (targetType: string, targetId: string, message: string): number =>
  Number(sql(`INSERT INTO ops.flag (target_type, target_id, message, reporter_email)
              VALUES (${lit(targetType)}, ${lit(targetId)}, ${lit(message)}, 'reader@e2e.test') RETURNING id`));

export const flagStatus = (id: number): string => sql(`SELECT status FROM ops.flag WHERE id = ${Number(id)}`);

export const auditCount = (event: string, targetId: string): number =>
  Number(sql(`SELECT count(*) FROM ops.audit_event WHERE event = ${lit(event)} AND target_id = ${lit(targetId)}`));
