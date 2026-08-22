import { cookies } from "next/headers";
import { apiPath, Footer, getPlatformNav, Header, Logo } from "sanapp-common-ui";
import { currentUser } from "@/lib/auth";
import { AppShell } from "@app/components/AppShell";

export const dynamic = "force-dynamic";

const SSO_BASE_URL = process.env.SSO_BASE_URL ?? "http://localhost:3000";
const MAIN_BASE_URL = process.env.MAIN_BASE_URL ?? "http://localhost:3001";

function NotFoundBody() {
  return (
    <div className="iipe-card">
      <h1 className="iipe-page-title">404 — Page not found</h1>
      <p className="iipe-page-sub">
        The page you are looking for does not exist or may have been moved.
      </p>
      <div className="iipe-form-actions">
        <a className="iipe-btn" href={apiPath("/")}>
          Back to Dashboard
        </a>
        <a className="iipe-btn secondary" href={MAIN_BASE_URL}>
          Open My Apps
        </a>
      </div>
    </div>
  );
}

export default async function NotFoundPage() {
  await cookies();
  const me = await currentUser();

  if (!me) {
    return (
      <>
        <Header
          appName="Log Request"
          navItems={getPlatformNav({
            mainBaseUrl: MAIN_BASE_URL,
            ssoBaseUrl: SSO_BASE_URL,
            signedOut: true,
            homeLabel: "Log Request",
          })}
        />
        <div className="iipe-center-page">
          <NotFoundBody />
        </div>
        <Footer />
      </>
    );
  }

  return (
    <AppShell
      me={{
        sub: me.ssoUserId ?? "",
        username: me.username,
        name: me.name,
        email: me.email ?? "",
        role: me.role,
        primaryRole: me.primaryRole ?? "",
      }}
      active="home"
      sidebarItems={[]}
    >
      <NotFoundBody />
    </AppShell>
  );
}
