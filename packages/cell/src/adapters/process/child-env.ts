const OWN_PREFIX = 'GENBA_';

/** Parent environment without genba's own variables, so no daemon or Cell secret reaches a child. */
export const childEnvOf = (
  extra: Readonly<Record<string, string>>,
): Record<string, string | undefined> => ({
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith(OWN_PREFIX)),
  ),
  ...extra,
});
