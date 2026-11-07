/**
 * Demo mode: the reviewer can sign in without a real SMS gateway or e-mail inbox.
 * It shows the simulated one-time code on screen and the demo staff logins on the sign-in page.
 * Off unless DEMO_MODE=true; a real deployment leaves it off and rotates the seeded passwords.
 */
export const isDemoMode = () => process.env.DEMO_MODE === "true";
