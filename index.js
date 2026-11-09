/**
 * Host half of the Telescope Search bundle.
 *
 * The feature is a browser surface only: this row exists so the Client module
 * scanner discovers the package's `dsh.client` section. Keep it side-effect
 * free so the bundle activates cleanly on every profile.
 */
export function apply() {}
