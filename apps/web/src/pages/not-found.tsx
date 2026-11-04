import { Link } from "react-router-dom";
import { PreferencesProvider, useI18n } from "@/app/preferences";
import { Button } from "@/components/ui/button";
import { ErrorState, PageHeading } from "@/components/common";

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <main id="main" className="page">
      <PageHeading title={t("notFoundTitle")} description={t("notFoundHint")} />
      <Button asChild>
        <Link to="/">{t("home")}</Link>
      </Button>
    </main>
  );
}
export function FatalErrorPage() {
  return (
    <PreferencesProvider>
      <FatalError />
    </PreferencesProvider>
  );
}
function FatalError() {
  const { t } = useI18n();
  return (
    <main id="main" className="page">
      <PageHeading title={t("errorTitle")} />
      <ErrorState error={undefined} retry={() => window.location.reload()} />
      <Button asChild variant="outline">
        <Link to="/">{t("home")}</Link>
      </Button>
    </main>
  );
}
