/* Injected into the app iframe by smoke.js. Classic scripts share the global lexical
   scope, so this can read `let`/`const` globals that are not window properties. */
window.__probe = {
  sb: () => sb,
  mode: () => MM_MODE,
  env: () => MM_ENV,
  user: () => currentUser,
  managerNav: () => MANAGER_NAV,
  memberNav: () => MEMBER_NAV,
};
