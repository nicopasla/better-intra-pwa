/** Length above which a name is likely to be clipped on a phone. */
const NAME_TIP_MIN = 24;

/**
 * Tooltip text for a name that may be clipped. Short names return an empty
 * string, which the delegated `[data-tip]` layer ignores.
 */
export function nameTip(name: string | null | undefined): string {
  const value = (name ?? "").trim();
  return value.length >= NAME_TIP_MIN ? value : "";
}
