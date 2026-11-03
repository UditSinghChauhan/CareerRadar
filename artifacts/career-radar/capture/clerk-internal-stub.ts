/** Stand-in for @clerk/react/internal in capture builds. */
export const publishableKeyFromHost = (_host: string, key?: string) =>
  key ?? "pk_test_Y2FwdHVyZS5leGFtcGxlLnRlc3Qk";
