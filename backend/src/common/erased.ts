// An erased member keeps an empty row so old posts and votes still add up. Their email is
// replaced by an address nobody can use, which is also how a row is recognized as erased.
export const ERASED_DOMAIN = "erased.invalid";
export const isErased = (email: string) => email.endsWith(`@${ERASED_DOMAIN}`);
