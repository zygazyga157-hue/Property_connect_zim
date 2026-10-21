import { sha256 } from "@/lib/audit/canonical";

export function merkleRoot(leaves: string[]): string | null {
  if (leaves.length === 0) return null;
  let level = leaves.map((leaf) => sha256(leaf));
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left;
      next.push(sha256(`${left}${right}`));
    }
    level = next;
  }
  return level[0];
}
