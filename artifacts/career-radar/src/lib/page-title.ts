const HOME_TITLE =
  "CareerRadar · Ten SDE roles worth applying to, every morning";
const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/jobs": "Jobs",
  "/applications": "Applications",
  "/profile": "Profile",
  "/settings": "Settings",
  "/tools/capture": "Capture",
  "/welcome": "Welcome",
  "/demo": "Demo",
};

/** The tab says where you are: "Jobs · CareerRadar", not "CareerRadar". */
export function titleFor(path: string): string {
  if (path === "/") return HOME_TITLE;
  if (path.startsWith("/sign-in")) return "Sign in · CareerRadar";
  if (path.startsWith("/sign-up")) return "Sign up · CareerRadar";
  const page = PAGE_TITLES[path];
  return page ? `${page} · CareerRadar` : "Page not found · CareerRadar";
}
