// Delta debugging for deletions. Goal: remove as many candidates as possible while the verifier
// (Kane running the user journeys) still passes. Try a whole batch at once; if Kane fails, split
// the batch and try each half. A candidate that fails on its own is "needed" and kept.
// Kane runs grow with the number of *needed* items, not with the number of candidates.

/**
 * @param {string[]} candidates   things we would like to delete
 * @param {(removeSet: string[]) => Promise<{ok: boolean, evidence?: any}>} tryRemove
 *        applies removed = accepted ∪ removeSet on a clean copy and runs the verifier
 * @param {(event: object) => void} log
 */
export async function shrink(candidates, tryRemove, log = () => {}) {
  const accepted = [], needed = [];
  let trials = 0;
  async function attempt(batch, depth) {
    if (!batch.length) return;
    trials++;
    const res = await tryRemove([...accepted, ...batch]);
    log({ type: "trial", trial: trials, depth, size: batch.length, ok: res.ok, batch, evidence: res.evidence });
    if (res.ok) { accepted.push(...batch); return; }
    if (batch.length === 1) { needed.push({ item: batch[0], evidence: res.evidence }); return; }
    const mid = Math.ceil(batch.length / 2);
    await attempt(batch.slice(0, mid), depth + 1);
    await attempt(batch.slice(mid), depth + 1);
  }
  await attempt([...candidates], 0);
  return { accepted, needed, trials };
}
