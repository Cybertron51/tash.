/**
 * Hotfix URLs for catalog rows whose `cards.image_url` is wrong in the database.
 * Place the matching file under `public/` (path must start with `/`).
 *
 * After Supabase is corrected, remove the matching rule here.
 */
const PSYDUCK_OLD_MAID_PUBLIC = "/cards/psyduck-2019-pokemon-old-maid-psa10.png";

export function catalogImageUrlOverride(params: {
  name: string;
  setName: string;
  category: string;
}): string | undefined {
  const { name, setName, category } = params;
  if (category !== "pokemon") return undefined;
  if (!/psyduck/i.test(name.trim())) return undefined;
  const set = (setName ?? "").replace(/_/g, " ");
  if (!/old\s*maid/i.test(set)) return undefined;
  return PSYDUCK_OLD_MAID_PUBLIC;
}
