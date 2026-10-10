import { CrumbHeader } from "../components/Header";
import { ComingSoon } from "../components/ui";
import { useApp } from "../state";
import { CreateCompany } from "./CreateCompany";
import { Email } from "./Email";
import { StartChoice } from "./StartChoice";
import { Welcome } from "./Welcome";

/** Route → screen. Screens not built yet show a placeholder. */
export function Screen() {
  const { route } = useApp();
  switch (route.name) {
    case "welcome":
      return <Welcome />;
    case "email":
      return <Email />;
    case "create":
      return <CreateCompany />;
    case "start":
      return <StartChoice />;
    case "comingSoon":
      return (
        <>
          <CrumbHeader title={route.title} />
          <main className="medium">
            <ComingSoon milestone={route.milestone}>{route.text}</ComingSoon>
          </main>
        </>
      );
    default:
      return (
        <main className="medium">
          <ComingSoon milestone="M3">{route.name}</ComingSoon>
        </main>
      );
  }
}
